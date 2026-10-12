import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import test from "node:test";
import postcss from "postcss";
import { transformWithOxc } from "vite";
import { cities } from "../src/data/cities.js";
import * as planner from "../src/utils/meetingPlanner.js";
import * as dateTime from "../src/utils/dateTime.js";

const source = await readFile(new URL("../src/pages/MeetingPlannerPage.jsx", import.meta.url), "utf8");
const { code } = await transformWithOxc(source, "MeetingPlannerPage.jsx", {
  jsx: { runtime: "classic", pragma: "createElement" },
});
const withoutImports = (value) => value.replace(/^import[\s\S]*?;\r?\n/gm, "");
const text = (node) => node == null || typeof node === "boolean" ? "" : Array.isArray(node)
  ? node.map(text).join("") : typeof node === "object" ? node.children.map(text).join("") : String(node);

// Matches the repository's JSX/hooks handler harness: tests interactions and
// retained handlers without adding a DOM package. Real layout needs browser QA.
function pageHarness() {
  const slots = [];
  let index = 0, tree, focused = 0;
  const context = vm.createContext({
    ...planner, ...dateTime, cities, Date, Map, Link: "Link", React: { Fragment: "Fragment" },
    useMemo: (fn) => fn(),
    useState(initial) {
      const slot = index++;
      if (!(slot in slots)) slots[slot] = initial;
      return [slots[slot], (value) => { slots[slot] = typeof value === "function" ? value(slots[slot]) : value; }];
    },
    useRef(initial) {
      const slot = index++;
      if (!(slot in slots)) slots[slot] = { current: initial };
      return slots[slot];
    },
    createElement(type, props, ...children) {
      if (props?.ref) props.ref.current = { focus: () => { focused++; } };
      return { type, props: props || {}, children };
    },
  });
  vm.runInContext(withoutImports(code).replace("export default function", "function"), context);
  function render() { index = 0; tree = context.MeetingPlannerPage(); }
  function nodes(type, root = tree) {
    const result = [];
    function visit(node) {
      if (Array.isArray(node)) return node.forEach(visit);
      if (!node || typeof node !== "object") return;
      if (node.type === type) result.push(node);
      node.children.forEach(visit);
    }
    visit(root);
    return result;
  }
  const input = (id) => nodes("input").find((node) => node.props.id === id);
  const button = (label) => nodes("button").find((node) => text(node) === label || node.props["aria-label"] === label);
  render();
  return {
    render, nodes, input, button, text: () => text(tree), focused: () => focused,
    state: () => slots[0],
    change(id, value) { input(id).props.onChange({ target: { value } }); render(); },
    click(label) { const node = button(label); assert.ok(node, label); assert.ok(!node.props.disabled, label); node.props.onClick(); render(); },
    add(slug) { nodes("select")[0].props.onChange({ target: { value: slug } }); render(); button("Add city").props.onClick(); render(); },
    select() { const radio = nodes("input").find((node) => node.props.type === "radio"); assert.ok(radio); radio.props.onChange(); render(); return radio; },
  };
}

test("date semantics, labels, native controls and selected exact-instant summary", () => {
  const page = pageHarness();
  assert.match(page.text(), /Meeting date in Toronto/);
  assert.match(page.text(), /Other cities may be on a different date/);
  assert.equal(page.nodes("input").filter((node) => node.props.type === "radio").length, 0);
  page.change("meeting-date", "2027-03-27");
  assert.equal(page.nodes("input").filter((node) => node.props.type === "radio").length, 8);
  const radio = page.select();
  assert.equal(page.state().selectedStartEpochMilliseconds, Number(radio.props.value));
  assert.match(page.text(), /Selected meeting · 30 minutes/);
  assert.match(page.text(), /Eastern Daylight Time/);
  assert.match(page.text(), /UTC−4/);
  assert.match(page.text(), /Greenwich Mean Time/);
  assert.ok(page.nodes("input").some((node) => node.props.type === "radio" && node.props.checked));
  const candidate = planner.generateMeetingPlan(page.state()).candidates.find((value) => value.startEpochMilliseconds === page.state().selectedStartEpochMilliseconds);
  assert.equal(candidate.endEpochMilliseconds - candidate.startEpochMilliseconds, 1_800_000);
});

test("reference change preserves ISO date, recalculates and clears selection", () => {
  const page = pageHarness();
  page.change("meeting-date", "2027-03-27"); page.select();
  page.click("Make London reference");
  assert.equal(page.state().referenceCitySlug, "london");
  assert.equal(page.state().referenceDate, "2027-03-27");
  assert.equal(page.state().selectedStartEpochMilliseconds, null);
  assert.match(page.text(), /Meeting date in London/);
  assert.doesNotMatch(page.text(), /Selected meeting ·/);
  assert.equal(planner.generateMeetingPlan(page.state()).referenceDay.startEpochMilliseconds, Date.parse("2027-03-27T00:00Z"));
});

test("removing reference promotes first remaining city and recovers focus", () => {
  const page = pageHarness();
  page.add("paris"); page.change("meeting-date", "2027-03-27"); page.select();
  page.click("Remove Toronto");
  assert.equal(page.state().referenceCitySlug, "london");
  assert.deepEqual(Array.from(page.state().citySlugs), ["london", "paris"]);
  assert.equal(page.state().selectedStartEpochMilliseconds, null);
  assert.match(page.text(), /London is now the reference city/);
  assert.equal(page.focused(), 1);
  assert.ok(page.button("Remove London").props.disabled);
});

test("city/date/window edits clear selected identity, including rapid edits and stale radios", () => {
  for (const edit of [
    (page) => page.add("paris"),
    (page) => page.change("meeting-date", "2027-03-28"),
    (page) => page.change("meeting-hours-start", "08:00"),
    (page) => page.change("meeting-hours-end", "18:00"),
    (page) => page.click("Remove Paris"),
  ]) {
    const page = pageHarness(); page.add("paris"); page.change("meeting-date", "2027-03-27");
    // Add a fourth distinct city when testing addition.
    const originalAdd = page.add;
    page.add = (slug) => originalAdd(slug === "paris" ? "berlin" : slug);
    const oldRadio = page.select(); edit(page);
    assert.equal(page.state().selectedStartEpochMilliseconds, null);
    oldRadio.props.onChange(); page.render();
    assert.equal(page.state().selectedStartEpochMilliseconds, null);
    assert.doesNotMatch(page.text(), /Selected meeting ·/);
  }
  const page = pageHarness();
  const startHandler = page.input("meeting-hours-start").props.onChange;
  const endHandler = page.input("meeting-hours-end").props.onChange;
  startHandler({ target: { value: "08:15" } }); endHandler({ target: { value: "18:45" } }); page.render();
  assert.equal(page.state().preferredWindow.start, "08:15");
  assert.equal(page.state().preferredWindow.end, "18:45");
});

test("candidate revisions reject retained radios after inputs change away and back", () => {
  for (const roundTrip of [
    (page) => { page.change("meeting-date", "2027-03-28"); page.change("meeting-date", "2027-03-27"); },
    (page) => { page.click("Make London reference"); page.click("Make Toronto reference"); },
    (page) => { page.change("meeting-hours-start", "08:00"); page.change("meeting-hours-start", "09:00"); },
    (page) => { page.change("meeting-hours-end", "18:00"); page.change("meeting-hours-end", "17:00"); },
    (page) => { page.add("paris"); page.click("Remove Paris"); },
  ]) {
    const page = pageHarness(); page.change("meeting-date", "2027-03-27");
    const oldRadio = page.select(), oldState = page.state();
    roundTrip(page);
    assert.equal(page.state().planRevision, oldState.planRevision + 2);
    assert.deepEqual(Array.from(page.state().citySlugs), Array.from(oldState.citySlugs));
    assert.equal(page.state().referenceCitySlug, oldState.referenceCitySlug);
    assert.equal(page.state().referenceDate, oldState.referenceDate);
    assert.equal(page.state().preferredWindow.start, oldState.preferredWindow.start);
    assert.equal(page.state().preferredWindow.end, oldState.preferredWindow.end);
    assert.equal(page.state().selectedStartEpochMilliseconds, null);
    const current = page.state();
    oldRadio.props.onChange(); page.render();
    assert.equal(page.state(), current, "a previous revision must be a complete no-op");
    assert.doesNotMatch(page.text(), /Selected meeting ·/);
    const freshRadio = page.select();
    assert.equal(page.state().selectedStartEpochMilliseconds, freshRadio.props.value);
    assert.equal(page.state().planRevision, current.planRevision);
  }
});

test("reference changes and reference removal both invalidate retained candidate callbacks", () => {
  for (const action of [(page) => page.click("Make London reference"), (page) => page.click("Remove Toronto")]) {
    const page = pageHarness(); page.add("paris"); page.change("meeting-date", "2027-03-27");
    const oldRadio = page.select(), revision = page.state().planRevision;
    action(page);
    assert.equal(page.state().referenceCitySlug, "london");
    assert.equal(page.state().referenceDate, "2027-03-27");
    assert.equal(page.state().planRevision, revision + 1);
    assert.equal(page.state().selectedStartEpochMilliseconds, null);
    oldRadio.props.onChange(); page.render();
    assert.equal(page.state().selectedStartEpochMilliseconds, null);
  }
});

test("retained reference handlers ignore removed cities and an already-current reference", () => {
  const page = pageHarness(); page.add("paris"); page.add("tokyo"); page.change("meeting-date", "2027-03-27");
  const retainedReference = page.button("Make London reference").props.onClick;
  retainedReference(); page.render();
  assert.equal(page.state().referenceCitySlug, "london");
  page.click("Show alternatives"); page.select();
  const alreadyReference = page.state();
  retainedReference(); page.render();
  assert.equal(page.state(), alreadyReference);
  page.click("Remove London");
  assert.equal(page.state().referenceCitySlug, "toronto");
  assert.ok(!page.state().citySlugs.includes("london"));
  page.click("Show alternatives"); page.select();
  const afterRemoval = page.state();
  retainedReference(); page.render();
  assert.equal(page.state(), afterRemoval, "removed-city callback must preserve selection, revision, notices and alternatives");
  assert.equal(planner.generateMeetingPlan(page.state()).status, "success");
  assert.ok(page.state().citySlugs.includes(page.state().referenceCitySlug));
});

test("unrelated UI actions and unchanged inputs preserve candidate revision", () => {
  const page = pageHarness(); page.add("tokyo"); page.change("meeting-date", "2027-03-27");
  page.click("Show alternatives");
  const radio = page.select(), revision = page.state().planRevision;
  page.click("Hide alternatives"); page.click("Show alternatives");
  page.nodes("select")[0].props.onChange({ target: { value: "paris" } }); page.render();
  page.change("meeting-date", "2027-03-27");
  page.change("meeting-hours-start", "09:00"); page.change("meeting-hours-end", "17:00");
  assert.equal(page.state().planRevision, revision);
  assert.equal(page.state().selectedStartEpochMilliseconds, radio.props.value);
  radio.props.onChange(); page.render();
  assert.equal(page.state().selectedStartEpochMilliseconds, radio.props.value);
});

test("city additions prevent duplicates and enforce maximum five without zone deduplication", () => {
  const page = pageHarness();
  assert.ok(!page.nodes("option").some((node) => node.props.value === "toronto"));
  page.add("montreal"); page.add("paris"); page.add("tokyo");
  assert.equal(page.state().citySlugs.length, 5);
  assert.ok(page.nodes("select")[0].props.disabled);
  assert.match(page.text(), /Maximum 5 cities/);
  page.add("toronto"); page.add("sydney");
  assert.equal(page.state().citySlugs.length, 5);
  assert.ok(page.state().citySlugs.includes("montreal"));
});

test("nonfirst reference survives other removals, promotes deterministically and restores Add city", () => {
  const page = pageHarness(); page.add("paris"); page.add("montreal"); page.add("berlin");
  page.change("meeting-date", "2027-03-27"); page.click("Make Paris reference"); page.select();
  const revision = page.state().planRevision;
  page.click("Remove Toronto");
  assert.equal(page.state().referenceCitySlug, "paris");
  assert.equal(page.state().planRevision, revision + 1);
  assert.equal(page.state().selectedStartEpochMilliseconds, null);
  assert.equal(page.nodes("select")[0].props.disabled, false);
  assert.ok(page.nodes("option").some((node) => node.props.value === "toronto"));
  page.add("toronto");
  assert.equal(page.state().citySlugs.length, 5);
  assert.equal(page.state().referenceCitySlug, "paris");
  page.click("Remove Paris");
  assert.equal(page.state().referenceCitySlug, "london");
  assert.equal(page.state().referenceDate, "2027-03-27");
  assert.match(page.text(), /London is now the reference city/);
});

test("native date limits share the engine policy, including exact range and leap-year validation", () => {
  for (const [referenceDate, expected] of [
    ["2019-12-31", "UNSUPPORTED_DATE"], ["2020-01-01", "success"], ["2020-02-29", "success"],
    ["2100-02-29", "INVALID_DATE"], ["2400-02-29", "success"],
    ["9999-12-30", "success"], ["9999-12-31", "UNSUPPORTED_DATE"],
  ]) {
    const page = pageHarness(); page.change("meeting-date", referenceDate);
    const result = planner.generateMeetingPlan(page.state());
    assert.equal(result.error?.code || result.status, expected);
    assert.equal(page.input("meeting-date").props.min, planner.MIN_PLANNER_DATE);
    assert.equal(page.input("meeting-date").props.max, planner.MAX_PLANNER_DATE);
    assert.equal(page.state().selectedStartEpochMilliseconds, null);
    if (expected === "success") {
      assert.ok(page.nodes("input").some((node) => node.props.type === "radio"));
      assert.equal(page.nodes("p").filter((node) => node.props.role === "alert").length, 0);
    } else {
      assert.equal(page.input("meeting-date").props["aria-invalid"], true);
      assert.match(page.input("meeting-date").props["aria-describedby"], /meeting-error/);
      assert.equal(page.nodes("p").filter((node) => node.props.role === "alert").length, 1);
    }
  }
});

test("no-overlap alternatives identify cities outside preferred hours", () => {
  const page = pageHarness(); page.add("tokyo"); page.change("meeting-date", "2027-03-27");
  assert.match(page.text(), /No common preferred-hours overlap at the sampled 30-minute start times/);
  assert.equal(page.nodes("input").filter((node) => node.props.type === "radio").length, 0);
  page.click("Show alternatives");
  assert.match(page.text(), /Most cities within preferred hours/);
  assert.match(page.text(), /Outside preferred hours:/);
  assert.equal(page.nodes("input").filter((node) => node.props.type === "radio").length, 48);
  page.select();
  assert.match(page.text(), /Selected meeting/);
});

test("validation associates errors with native fields and removes stale summary", () => {
  const page = pageHarness(); page.change("meeting-date", "2027-03-27"); page.select();
  page.change("meeting-hours-start", "22:00"); page.change("meeting-hours-end", "02:00");
  assert.match(page.text(), /Overnight hours are not supported yet/);
  assert.equal(page.input("meeting-hours-end").props["aria-invalid"], true);
  assert.match(page.input("meeting-hours-end").props["aria-describedby"], /meeting-error/);
  assert.equal(page.nodes("p").filter((node) => node.props.role === "alert").length, 1);
  assert.doesNotMatch(page.text(), /Selected meeting ·/);
  page.change("meeting-date", "2009-11-01");
  assert.equal(page.input("meeting-date").props["aria-invalid"], true);
});

test("selected interval changing offset shows both exact-instant timezone labels", () => {
  const page = pageHarness(); page.change("meeting-date", "2027-03-14");
  page.change("meeting-hours-start", "01:00"); page.change("meeting-hours-end", "03:30");
  page.click("Show alternatives");
  const radio = page.nodes("input").find((node) => node.props.type === "radio" &&
    Number(node.props.value) === Date.parse("2027-03-14T06:30Z"));
  radio.props.onChange(); page.render();
  assert.match(page.text(), /Eastern Standard Time · UTC−5 → Eastern Daylight Time · UTC−4/);
});

test("five-city candidates expose separate location rows, dates and outside-hours explanations without changing radios", () => {
  const page = pageHarness();
  page.add("hong-kong"); page.add("ho-chi-minh-city"); page.add("amsterdam");
  page.click("Remove Toronto"); page.add("zurich");
  page.change("meeting-date", "2027-03-27"); page.click("Show alternatives");
  const cards = page.nodes("label").filter((node) => node.props.className === "meeting-candidate");
  const epoch = Date.parse("2027-03-27T21:00Z");
  const card = cards.find((node) => page.nodes("input", node).some((input) => input.props.value === epoch));
  assert.ok(card);
  const radio = page.nodes("input", card)[0];
  assert.equal(radio.props.type, "radio");
  assert.equal(radio.props.name, "meeting-candidate");
  assert.equal(radio.props.checked, false);
  assert.equal(typeof radio.props.onChange, "function");
  const locations = page.nodes("small", card).find((node) => node.props.className === "meeting-candidate-locations");
  const rows = page.nodes("span", locations).filter((node) => node.props.className === "meeting-candidate-location");
  assert.equal(rows.length, 5);
  for (const [index, [name, times, date]] of [
    ["London", "9:00 PM–9:30 PM", "Sat, Mar 27, 2027"],
    ["Hong Kong", "5:00 AM–5:30 AM", "Sun, Mar 28, 2027"],
    ["Ho Chi Minh City", "4:00 AM–4:30 AM", "Sun, Mar 28, 2027"],
    ["Amsterdam", "10:00 PM–10:30 PM", "Sat, Mar 27, 2027"],
    ["Zurich", "10:00 PM–10:30 PM", "Sat, Mar 27, 2027"],
  ].entries()) {
    const heading = page.nodes("span", rows[index]).find((node) => node.props.className === "meeting-candidate-location-heading");
    const dateElement = page.nodes("span", rows[index]).find((node) => node.props.className === "meeting-candidate-location-date");
    assert.equal(text(heading), `${name} — ${times}`);
    assert.equal(text(dateElement), `(${date})`);
    assert.doesNotMatch(text(rows[index]), /Outside preferred hours:/);
  }
  const outside = page.nodes("small", card).find((node) => node.props.className === "meeting-candidate-outside-hours");
  assert.equal(text(outside), "Outside preferred hours: London, Hong Kong, Ho Chi Minh City, Amsterdam, Zurich");
  const content = card.children.find((node) => node?.type === "span");
  assert.ok(content.children.indexOf(outside) > content.children.indexOf(locations));
  assert.match(text(card), /London: 9:00 PM–9:30 PM/);
  assert.match(page.text(), /Meeting date in London/);
  assert.equal(page.nodes("input").filter((node) => node.props.type === "radio").length, 48);

  const midnightCard = cards.find((node) => page.nodes("input", node).some((input) => input.props.value === Date.parse("2027-03-27T15:30Z")));
  const hongKongRow = page.nodes("span", midnightCard).find((node) => node.props.className === "meeting-candidate-location"
    && text(node).includes("Hong Kong"));
  assert.match(text(hongKongRow), /11:30 PM–12:00 AM/);
  assert.match(text(hongKongRow), /Sat, Mar 27, 2027 → Sun, Mar 28, 2027/);
  radio.props.onChange(); page.render();
  assert.equal(page.state().selectedStartEpochMilliseconds, epoch);
  assert.equal(page.nodes("article").length, 5);
  assert.match(page.text(), /Selected meeting · 30 minutes/);
  assert.match(page.text(), /London · Reference/);
  assert.match(page.text(), /Hong Kong Standard Time · UTC\+8/);
});

test("mobile candidate rows form a single flexible column while dates, summaries and radio focus remain readable", async () => {
  const css = postcss.parse(await readFile(new URL("../src/App.css", import.meta.url), "utf8"));
  function declarations(selector, mobile = false) {
    let found;
    css.walkRules(selector, (rule) => {
      const inMobile = rule.parent.type === "atrule" && /max-width:\s*600px/.test(rule.parent.params);
      if (inMobile === mobile) found = rule;
    });
    assert.ok(found, selector);
    return Object.fromEntries(found.nodes.filter((node) => node.type === "decl").map((node) => [node.prop, node.value]));
  }
  const locations = declarations(".meeting-candidate .meeting-candidate-locations", true);
  assert.equal(locations.display, "grid");
  assert.equal(locations["grid-template-columns"], "minmax(0, 1fr)");
  assert.equal(locations.gap, "10px");
  assert.equal(declarations(".meeting-candidate-location", true).display, "block");
  assert.equal(declarations(".meeting-candidate-location", true)["min-width"], "0");
  assert.equal(declarations(".meeting-candidate-location")["overflow-wrap"], "anywhere");
  assert.equal(declarations(".meeting-candidate-location-heading", true).display, "block");
  assert.equal(declarations(".meeting-candidate-location-date", true).display, "block");
  assert.equal(declarations(".meeting-candidate-location-divider", true).display, "none");
  const outside = declarations(".meeting-candidate .meeting-candidate-outside-hours");
  assert.equal(outside["margin-top"], "10px");
  assert.equal(outside["padding-top"], "8px");
  assert.match(outside["border-top"], /^1px solid/);
  assert.equal(declarations(".meeting-candidate > span")["min-width"], "0");
  assert.equal(declarations(".meeting-selected-cities article")["overflow-wrap"], "anywhere");
  const focus = declarations(".meeting-planner-page :is(button, input, select, a):focus-visible");
  assert.equal(focus.outline, "3px solid white");
  assert.equal(focus["outline-offset"], "3px");
});

test("mobile structure stacks cards, uses native radios and has no wide tables or deferred features", async () => {
  const page = pageHarness(); page.change("meeting-date", "2027-03-27"); page.select();
  assert.equal(page.nodes("table").length, 0);
  assert.equal(page.nodes("article").length, 2);
  assert.ok(page.nodes("label").some((node) => node.props.htmlFor === "meeting-add-city"));
  assert.ok(page.nodes("fieldset").length >= 3);
  const css = await readFile(new URL("../src/App.css", import.meta.url), "utf8");
  assert.match(css, /@media \(max-width: 600px\)[\s\S]*\.meeting-controls \{ grid-template-columns: 1fr; \}/);
  assert.match(css, /\.meeting-city-row \{ align-items: stretch; flex-direction: column; \}/);
  assert.match(css, /overflow-wrap: anywhere/);
  assert.doesNotMatch(source, /analytics|ics|calendarEvent|URLSearchParams|useNow/);
});

test("route, discovery, sitemap and static canonical metadata are wired", async () => {
  const read = (file) => readFile(new URL(`../${file}`, import.meta.url), "utf8");
  const [app, home, footer, sitemap, metadata] = await Promise.all([
    read("src/App.jsx"), read("src/pages/HomePage.jsx"), read("src/components/Footer.jsx"),
    read("public/sitemap.xml"), read("src/utils/routeMetadata.js"),
  ]);
  assert.match(app, /path="\/meeting-planner" element=\{<MeetingPlannerPage/);
  assert.match(home, /to="\/meeting-planner"/);
  assert.match(footer, /to="\/meeting-planner"/);
  assert.match(sitemap, /https:\/\/www.youhora.com\/meeting-planner/);
  const context = vm.createContext({ siteConfig: { publicSiteName: "YouHora" }, Object });
  vm.runInContext(withoutImports(metadata).replace("export function", "function"), context);
  const result = context.resolveRouteMetadata("/meeting-planner");
  assert.equal(result.canonicalPath, "/meeting-planner");
  assert.match(result.title, /Meeting Planner/);
});
