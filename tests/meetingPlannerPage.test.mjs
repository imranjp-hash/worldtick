import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import test from "node:test";
import postcss from "postcss";
import { transformWithOxc } from "vite";
import { memo } from "react";
import { cities } from "../src/data/cities.js";
import * as planner from "../src/utils/meetingPlanner.js";
import * as dateTime from "../src/utils/dateTime.js";
import * as calendarEvent from "../src/utils/calendarEvent.js";
import * as ics from "../src/utils/ics.js";
import { parseMeetingPlannerSearch } from "../src/utils/meetingPlannerUrl.js";

const source = await readFile(new URL("../src/pages/MeetingPlannerPage.jsx", import.meta.url), "utf8");
const { code } = await transformWithOxc(source, "MeetingPlannerPage.jsx", {
  jsx: { runtime: "classic", pragma: "createElement" },
});
const controlSource = await readFile(new URL("../src/components/PlannerCalendarDownloadControl.jsx", import.meta.url), "utf8");
const { code: controlCode } = await transformWithOxc(controlSource, "PlannerCalendarDownloadControl.jsx", {
  jsx: { runtime: "classic", pragma: "createElement" },
});
const withoutImports = (value) => value.replace(/^import[\s\S]*?;\r?\n/gm, "");
const text = (node) => node == null || typeof node === "boolean" ? "" : Array.isArray(node)
  ? node.map(text).join("") : typeof node === "object" ? node.children.map(text).join("") : String(node);

// Matches the repository's JSX/hooks handler harness: tests interactions and
// retained handlers without adding a DOM package. Real layout needs browser QA.
function pageHarness(options = {}) {
  const slots = [];
  let index = 0, tree, focused = 0, focusedId = null;
  let control = null, mounted = true;
  const effects = new Map(), pendingEffects = new Map();
  let now = new Date("2026-01-01T00:00Z"), systemNow = now.getTime();
  const downloads = [];
  function mountControl() {
    const controlSlots = [], effects = new Map(), pendingEffects = new Map();
    let controlIndex = 0, props, wrapper;
    const controlContext = vm.createContext({
      ...calendarEvent, ...ics, React: { Fragment: "Fragment" },
      useNow: () => now,
      getCurrentEpochMilliseconds: () => systemNow,
      downloadIcsFile: options.downloadIcsFile ?? ((payload) => downloads.push(payload)),
      serializeCalendarEventToIcs: options.serializeCalendarEventToIcs ?? ics.serializeCalendarEventToIcs,
      useState(initial) {
        const slot = controlIndex++;
        if (!(slot in controlSlots)) controlSlots[slot] = initial;
        return [controlSlots[slot], (value) => {
          controlSlots[slot] = typeof value === "function" ? value(controlSlots[slot]) : value;
        }];
      },
      useRef(initial) {
        const slot = controlIndex++;
        if (!(slot in controlSlots)) controlSlots[slot] = { current: initial };
        return controlSlots[slot];
      },
      useLayoutEffect(setup, deps) {
        const slot = controlIndex++;
        const prior = effects.get(slot);
        if (!prior || deps.some((value, key) => !Object.is(value, prior.deps[key]))) pendingEffects.set(slot, { setup, deps });
      },
      createElement: (type, nodeProps, ...children) => ({ type, props: nodeProps || {}, children }),
    });
    vm.runInContext(withoutImports(controlCode).replace("export default function", "function"), controlContext);
    function renderControl() {
      controlIndex = 0;
      wrapper.children = [controlContext.PlannerCalendarDownloadControl(props)];
      for (const [slot, effect] of pendingEffects) {
        effects.get(slot)?.cleanup?.();
        effects.set(slot, { ...effect, cleanup: effect.setup() });
      }
      pendingEffects.clear();
    }
    return {
      render: renderControl,
      update(node) { wrapper = node; props = node.props; renderControl(); },
      unmount() { for (const effect of effects.values()) effect.cleanup?.(); },
      replayEffects() {
        for (const [slot, effect] of effects) {
          effect.cleanup?.(); effects.set(slot, { ...effect, cleanup: effect.setup() });
        }
      },
    };
  }
  const context = vm.createContext({
    ...planner, ...dateTime, cities, Date, Map, Link: "Link", React: { Fragment: "Fragment" },
    PlannerCalendarDownloadControl: "PlannerCalendarDownloadControl",
    usePlannerSharing: () => ({ copyPlan() {}, copySelected() {}, planMessage: "", selectedMessage: "" }),
    memo,
    useMemo(fn, deps) {
      const slot = index++;
      const prior = slots[slot];
      if (!prior || deps.some((value, key) => !Object.is(value, prior.deps[key]))) slots[slot] = { deps, value: fn() };
      return slots[slot].value;
    },
    useState(initial) {
      const slot = index++;
      if (!(slot in slots)) slots[slot] = typeof initial === "function" ? initial() : initial;
      return [slots[slot], (value) => { slots[slot] = typeof value === "function" ? value(slots[slot]) : value; }];
    },
    useRef(initial) {
      const slot = index++;
      if (!(slot in slots)) slots[slot] = { current: initial };
      return slots[slot];
    },
    useLayoutEffect(setup, deps) {
      const slot = index++;
      const prior = effects.get(slot);
      if (!prior || deps.some((value, key) => !Object.is(value, prior.deps[key]))) pendingEffects.set(slot, { setup, deps });
    },
    createElement(type, props, ...children) {
      if (props?.ref) {
        const node = { focus: () => { focused++; focusedId = props.id; } };
        if (typeof props.ref === "function") props.ref(node); else props.ref.current = node;
      }
      return { type, props: props || {}, children };
    },
  });
  vm.runInContext(withoutImports(code).replace("export default memo(MeetingPlannerRoute)", "const memoizedPage = memo(MeetingPlannerPage)"), context);
  const memoizedPage = vm.runInContext("memoizedPage", context);
  assert.equal(memoizedPage.$$typeof, Symbol.for("react.memo"));
  assert.equal(memoizedPage.type, context.MeetingPlannerPage);
  function render() {
    if (!mounted) return;
    index = 0; tree = context.MeetingPlannerPage({ initialization: parseMeetingPlannerSearch(options.search ?? "") });
    for (const [slot, effect] of pendingEffects) {
      effects.get(slot)?.cleanup?.(); effects.set(slot, { ...effect, cleanup: effect.setup() });
    }
    pendingEffects.clear();
    const wrapper = nodes("PlannerCalendarDownloadControl")[0];
    if (wrapper) {
      control ??= mountControl(); control.update(wrapper);
    } else {
      control?.unmount(); control = null;
    }
  }
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
    render, nodes, input, button, text: () => text(tree), focused: () => focused, focusedId: () => focusedId,
    downloads,
    calendarButton: () => button("Download calendar event (.ics)"),
    calendarHandler: () => button("Download calendar event (.ics)")?.props.onClick,
    download() { button("Download calendar event (.ics)").props.onClick(); control?.render(); },
    setNow(value) { now = new Date(value); control?.render(); },
    setSystemNow(value) { systemNow = value; },
    unmount() { mounted = false; control?.unmount(); control = null; },
    replayControlEffects() { control?.replayEffects(); },
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
  const focusBeforeRemoval = page.focused();
  page.click("Remove Toronto");
  assert.equal(page.state().referenceCitySlug, "london");
  assert.deepEqual(Array.from(page.state().citySlugs), ["london", "paris"]);
  assert.equal(page.state().selectedStartEpochMilliseconds, null);
  assert.match(page.text(), /London is now the reference city/);
  assert.equal(page.focused(), focusBeforeRemoval + 1);
  assert.ok(page.button("Remove London").props.disabled);
});

test("city/date edits clear selected identity, including stale radios", () => {
  for (const edit of [
    (page) => page.add("paris"),
    (page) => page.change("meeting-date", "2027-03-28"),
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
  const startHandler = page.input("meeting-hours-toronto-start").props.onChange;
  const endHandler = page.input("meeting-hours-toronto-end").props.onChange;
  startHandler({ target: { value: "08:15" } }); endHandler({ target: { value: "18:45" } }); page.render();
  assert.equal(page.state().cityPreferences.toronto.start, "08:15");
  assert.equal(page.state().cityPreferences.toronto.end, "18:45");
});

test("candidate revisions reject retained radios after inputs change away and back", () => {
  for (const roundTrip of [
    (page) => { page.change("meeting-date", "2027-03-28"); page.change("meeting-date", "2027-03-27"); },
    (page) => { page.click("Make London reference"); page.click("Make Toronto reference"); },
    (page) => { page.add("paris"); page.click("Remove Paris"); },
  ]) {
    const page = pageHarness(); page.change("meeting-date", "2027-03-27");
    const oldRadio = page.select(), oldState = page.state();
    roundTrip(page);
    assert.equal(page.state().planRevision, oldState.planRevision + 2);
    assert.deepEqual(Array.from(page.state().citySlugs), Array.from(oldState.citySlugs));
    assert.equal(page.state().referenceCitySlug, oldState.referenceCitySlug);
    assert.equal(page.state().referenceDate, oldState.referenceDate);
    assert.equal(page.state().cityPreferences.toronto.start, oldState.cityPreferences.toronto.start);
    assert.equal(page.state().cityPreferences.toronto.end, oldState.cityPreferences.toronto.end);
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
  page.change("meeting-hours-toronto-start", "09:00"); page.change("meeting-hours-toronto-end", "17:00");
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
  page.change("meeting-hours-toronto-start", "22:00"); page.change("meeting-hours-toronto-end", "02:00");
  assert.match(page.text(), /Choose a closing time later than the opening time\. Overnight hours are not supported\./);
  assert.equal(page.input("meeting-hours-toronto-end").props["aria-invalid"], true);
  assert.match(page.input("meeting-hours-toronto-end").props["aria-describedby"], /meeting-hours-error-toronto/);
  assert.equal(page.nodes("p").filter((node) => node.props.role === "alert").length, 1);
  assert.doesNotMatch(page.text(), /Selected meeting ·/);
  page.change("meeting-date", "2009-11-01");
  assert.equal(page.input("meeting-date").props["aria-invalid"], true);
});

test("selected interval changing offset shows both exact-instant timezone labels", () => {
  const page = pageHarness(); page.change("meeting-date", "2027-03-14");
  page.change("meeting-hours-toronto-start", "01:00"); page.change("meeting-hours-toronto-end", "03:30");
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
  assert.doesNotMatch(source, /analytics|URLSearchParams|useNow/);
  assert.doesNotMatch(controlSource, /analytics|URLSearchParams|comparisonUrl/);
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

test("calendar action appears only in the selected summary after all city details and exports exact epochs", () => {
  const page = pageHarness();
  assert.equal(page.calendarButton(), undefined);
  page.change("meeting-date", "2027-03-27");
  assert.equal(page.calendarButton(), undefined);
  const radio = page.select();
  const section = page.nodes("section").find((node) => node.props["aria-labelledby"] === "meeting-selected-title");
  assert.equal(page.nodes("button", section).length, 2);
  assert.equal(section.children.at(-1).props.className, "meeting-selected-actions");
  assert.equal(section.children.at(-1).children.at(-1).type, "PlannerCalendarDownloadControl");
  assert.equal(page.calendarButton().props.type, "button");
  assert.equal(page.calendarButton().props.disabled, false);
  page.download();
  const logical = page.downloads[0].ics.replace(/\r\n[ \t]/g, "");
  assert.match(logical, /DTSTART:20270327T130000Z\r\n/);
  assert.match(logical, /DTEND:20270327T133000Z\r\n/);
  assert.equal(page.state().selectedStartEpochMilliseconds, radio.props.value);
  assert.equal(page.downloads[0].filename, "youhora-planner-toronto-london-20270327T130000Z.ics");
});

test("live expiry keeps the summary and button, disables exact-now/past and associates status text", () => {
  const page = pageHarness(); page.change("meeting-date", "2027-03-27");
  const radio = page.select(), start = radio.props.value;
  page.setNow(start - 1); assert.equal(page.calendarButton().props.disabled, false);
  page.setNow(start);
  assert.equal(page.calendarButton().props.disabled, true);
  assert.equal(page.calendarButton().props["aria-describedby"], "meeting-calendar-past-help");
  const status = page.nodes("p").find((node) => node.props.id === "meeting-calendar-past-help");
  assert.equal(status.props.role, "status"); assert.equal(status.props["aria-live"], "polite");
  assert.equal(text(status), "This meeting time has already passed.");
  assert.match(page.text(), /Selected meeting · 30 minutes/);
  page.setNow(start + 1); assert.equal(page.calendarButton().props.disabled, true);
  page.setSystemNow(start + 1); page.download(); assert.equal(page.downloads.length, 0);
});

test("click-time recheck rejects expiry and invalid current time without waiting for a clock render", () => {
  for (const delta of [0, 1, NaN, Infinity]) {
    const page = pageHarness(); page.change("meeting-date", "2027-03-27");
    const radio = page.select(); page.setNow(radio.props.value - 1);
    assert.equal(page.calendarButton().props.disabled, false);
    page.setSystemNow(radio.props.value + delta); page.download();
    assert.equal(page.downloads.length, 0);
  }
  const page = pageHarness(); page.change("meeting-date", "2027-03-27"); page.select();
  page.setNow(NaN); assert.equal(page.calendarButton().props.disabled, true);
});

test("candidate-defining edits invalidate retained export handlers, including reference removal", () => {
  for (const edit of [
    (page) => page.change("meeting-date", "2027-03-28"),
    (page) => page.click("Make London reference"),
    (page) => page.add("berlin"),
    (page) => page.click("Remove Paris"),
    (page) => page.click("Remove Toronto"),
  ]) {
    const page = pageHarness(); page.add("paris"); page.change("meeting-date", "2027-03-27"); page.select();
    const oldHandler = page.calendarHandler(); edit(page);
    assert.equal(page.state().selectedStartEpochMilliseconds, null);
    assert.equal(page.calendarButton(), undefined);
    oldHandler(); assert.equal(page.downloads.length, 0);
    page.select(); oldHandler(); assert.equal(page.downloads.length, 0, "unmounted control must stay inactive after a fresh selection");
    page.download(); assert.equal(page.downloads.length, 1);
  }
});

test("change-away-and-back cannot revive the old export identity even after reselecting its epoch", () => {
  for (const roundTrip of [
    (page) => { page.change("meeting-date", "2027-03-28"); page.change("meeting-date", "2027-03-27"); },
    (page) => { page.click("Make London reference"); page.click("Make Toronto reference"); },
    (page) => { page.add("paris"); page.click("Remove Paris"); },
  ]) {
    const page = pageHarness(); page.change("meeting-date", "2027-03-27"); page.select();
    const handler = page.calendarHandler(); roundTrip(page);
    handler(); assert.equal(page.downloads.length, 0);
    page.select(); handler(); assert.equal(page.downloads.length, 0);
    page.download(); assert.equal(page.downloads.length, 1);
  }
});

test("retained export handler uses only the latest committed candidate and unmount clears it", () => {
  const page = pageHarness(); page.change("meeting-date", "2027-03-27"); page.select();
  const retained = page.calendarHandler();
  const next = page.nodes("input").filter((node) => node.props.type === "radio")[1];
  next.props.onChange(); page.render(); retained();
  assert.equal(page.downloads.length, 1);
  const logical = page.downloads[0].ics.replace(/\r\n[ \t]/g, "");
  assert.match(logical, /DTSTART:20270327T133000Z\r\n/);
  assert.match(logical, /DTEND:20270327T140000Z\r\n/);
  page.replayControlEffects(); retained(); assert.equal(page.downloads.length, 2);
  page.unmount(); retained(); assert.equal(page.downloads.length, 2);
});

test("selected alternatives export despite no common overlap and pending dropdown/UI changes preserve identity", () => {
  const page = pageHarness(); page.add("tokyo"); page.change("meeting-date", "2027-03-27");
  page.click("Show alternatives"); page.select();
  const handler = page.calendarHandler(), revision = page.state().planRevision;
  page.nodes("select")[0].props.onChange({ target: { value: "paris" } }); page.render();
  page.click("Hide alternatives"); page.click("Show alternatives");
  page.change("meeting-date", "2027-03-27"); page.change("meeting-hours-toronto-start", "09:00");
  assert.equal(page.state().planRevision, revision);
  handler(); assert.equal(page.downloads.length, 1);
  assert.match(page.downloads[0].ics.replace(/\r\n[ \t]/g, ""), /Tokyo:/);
});

test("download/serializer failure announces a retryable message scoped to the current selection", () => {
  for (const failure of ["downloadIcsFile", "serializeCalendarEventToIcs"]) {
    let attempts = 0;
    const page = pageHarness({ [failure]: (...args) => {
      if ([0, 2].includes(attempts++)) throw Error("Test failure");
      if (failure === "serializeCalendarEventToIcs") return ics.serializeCalendarEventToIcs(...args);
    } });
    page.change("meeting-date", "2027-03-27"); page.select(); page.download();
    assert.match(page.text(), /Unable to download the calendar event. Please try again./);
    page.download(); assert.doesNotMatch(page.text(), /Unable to download/);
    assert.equal(text(page.nodes("p").find((node) => node.props.id === "meeting-calendar-past-help")), "",
      "a successful retry clears feedback without inventing a success announcement");
    page.download(); assert.match(page.text(), /Unable to download/);
    const next = page.nodes("input").filter((node) => node.props.type === "radio")[1];
    next.props.onChange(); page.render();
    assert.doesNotMatch(page.text(), /Unable to download/);
  }
});

test("download failure survives eligible clock ticks but expiry replaces it without clearing selection", () => {
  const page = pageHarness({ downloadIcsFile() { throw Error("Download failed"); } });
  page.change("meeting-date", "2027-03-27");
  const selected = page.select(), start = selected.props.value;
  page.setNow(start - 2000); page.download();
  assert.match(page.text(), /Unable to download the calendar event. Please try again./);
  const control = page.nodes("PlannerCalendarDownloadControl")[0];
  assert.equal(page.nodes("p", control).filter((node) => node.props.role === "status").length, 1);
  assert.equal(page.nodes("span", control).filter((node) => node.props.role === "status").length, 0);
  for (const now of [start - 1000, start - 1]) {
    page.setNow(now);
    assert.equal(page.calendarButton().props.disabled, false);
    assert.match(page.text(), /Unable to download/);
  }
  page.setSystemNow(start); page.setNow(start);
  assert.equal(page.calendarButton().props.disabled, true);
  assert.match(page.text(), /This meeting time has already passed./);
  assert.doesNotMatch(page.text(), /Unable to download|Please try again/);
  assert.equal(page.state().selectedStartEpochMilliseconds, start);
  assert.match(page.text(), /Selected meeting · 30 minutes/);
  assert.equal(page.calendarButton().props["aria-describedby"], "meeting-calendar-past-help");
  // A later clock correction must not resurrect feedback invalidated by expiry.
  page.setNow(start - 1);
  assert.doesNotMatch(page.text(), /Unable to download|Please try again/);
});

test("A to B to A never resurrects a prior selection's failed download feedback", () => {
  for (const stage of ["downloadIcsFile", "serializeCalendarEventToIcs"]) {
    const page = pageHarness({ [stage]() { throw Error("Attempt failed"); } });
    page.change("meeting-date", "2027-03-27");
    const a = page.select(); page.download();
    assert.match(page.text(), /Unable to download/);
    const b = page.nodes("input").filter((node) => node.props.type === "radio")[1];
    b.props.onChange(); page.render();
    assert.equal(page.state().selectedStartEpochMilliseconds, b.props.value);
    assert.doesNotMatch(page.text(), /Unable to download|Please try again/);
    a.props.onChange(); page.render();
    assert.equal(page.state().selectedStartEpochMilliseconds, a.props.value);
    assert.doesNotMatch(page.text(), /Unable to download|Please try again/);
    page.download();
    assert.match(page.text(), /Unable to download/, "a new failed attempt can show its own feedback");
  }
});

test("download action wraps within its panel, stacks on mobile and keeps existing focus styling", async () => {
  const css = postcss.parse(await readFile(new URL("../src/App.css", import.meta.url), "utf8"));
  const rules = [];
  css.walkRules(".meeting-calendar-download button", (rule) => rules.push(rule));
  assert.equal(rules.length, 2);
  assert.ok(rules[0].nodes.some((node) => node.prop === "max-width" && node.value === "100%"));
  assert.ok(rules[0].nodes.some((node) => node.prop === "overflow-wrap" && node.value === "anywhere"));
  assert.match(rules[1].parent.params, /max-width: 600px/);
  assert.ok(rules[1].nodes.some((node) => node.prop === "width" && node.value === "100%"));
});

const sharedSearch = "?v=1&cities=toronto%2Clondon&reference=toronto&date=2027-03-27&hoursStart=09%3A00&hoursEnd=17%3A00";

test("shared plan and selected links expose distinct native sharing actions", () => {
  const page = pageHarness({ search: sharedSearch });
  assert.ok(page.button("Copy plan link"));
  assert.equal(page.button("Copy selected meeting link"), undefined);
  page.select();
  assert.equal(page.button("Copy plan link").props.type, "button");
  assert.equal(page.button("Copy selected meeting link").props.type, "button");
  assert.equal(page.button("Copy plan link").props["aria-describedby"], "meeting-plan-copy-status");
  assert.equal(page.button("Copy selected meeting link").props["aria-describedby"], "meeting-selected-copy-status");
  assert.ok(page.nodes("p").some((node) => node.props.id === "meeting-selected-copy-status"
    && node.props.role === "status" && node.props["aria-live"] === "polite"));
});

test("hydrated hidden alternative stays selected and explicitly explains outside-hours cities", () => {
  const epoch = Date.parse("2027-03-27T04:00Z");
  const page = pageHarness({ search: `${sharedSearch}&start=${epoch}` });
  assert.equal(page.state().selectedStartEpochMilliseconds, epoch);
  assert.match(page.text(), /This selected meeting is outside preferred hours for: Toronto, London/);
  assert.match(page.text(), /Selected meeting/);
  assert.ok(page.button("Copy selected meeting link"));
  assert.ok(page.nodes("input").some((node) => node.props.type === "radio"));
});

test("hydrated alternative opens no-overlap alternatives and input edits clear restored identity", () => {
  const page = pageHarness({ search: `${sharedSearch.replace("toronto%2Clondon", "toronto%2Clondon%2Ctokyo")}&start=1806152400000` });
  assert.equal(page.state().showAlternatives, true);
  assert.ok(page.nodes("input").some((node) => node.props.checked && node.props.value === 1806152400000));
  assert.match(page.text(), /outside preferred hours for: Tokyo/);
  const retained = page.nodes("input").find((node) => node.props.checked).props.onChange;
  page.change("meeting-date", "2027-03-28"); page.change("meeting-date", "2027-03-27");
  retained(); page.render();
  assert.equal(page.state().selectedStartEpochMilliseconds, null);
  assert.equal(page.button("Copy selected meeting link"), undefined);
});

test("invalid selected epoch keeps inputs and clears its notice on edit or fresh selection", () => {
  const page = pageHarness({ search: `${sharedSearch}&start=1806152400001` });
  assert.equal(page.state().referenceDate, "2027-03-27");
  assert.equal(page.state().selectedStartEpochMilliseconds, null);
  assert.match(page.text(), /The plan loaded, but the linked meeting time could not be restored/);
  page.select();
  assert.doesNotMatch(page.text(), /linked meeting time could not be restored/);
  const edited = pageHarness({ search: `${sharedSearch}&start=bad` });
  edited.change("meeting-hours-toronto-end", "18:00");
  assert.doesNotMatch(edited.text(), /linked meeting time could not be restored/);
});

test("sharing actions wrap, stack below 600px and retain the existing native focus rule", async () => {
  const css = postcss.parse(await readFile(new URL("../src/App.css", import.meta.url), "utf8"));
  const declarations = (selector, mobile = false) => {
    const result = {};
    css.walkRules((rule) => {
      const isMobile = rule.parent.type === "atrule" && /max-width:\s*600px/.test(rule.parent.params);
      if (rule.selector === selector && Boolean(isMobile) === mobile) rule.walkDecls((decl) => { result[decl.prop] = decl.value; });
    });
    return result;
  };
  assert.equal(declarations(".meeting-share-action button")["max-width"], "100%");
  assert.equal(declarations(".meeting-share-action button")["overflow-wrap"], "anywhere");
  assert.equal(declarations(".meeting-selected-actions")["flex-wrap"], "wrap");
  assert.equal(declarations(".meeting-selected-actions", true)["flex-direction"], "column");
  assert.equal(declarations(".meeting-share-action button", true).width, "100%");
});

test("per-city defaults, pending membership, reference preservation and remove/re-add resets", () => {
  const page = pageHarness();
  assert.equal(Object.hasOwn(page.state(), "preferredWindow"), false);
  assert.deepEqual(JSON.parse(JSON.stringify(page.state().cityPreferences)), {
    toronto: { start: "09:00", end: "17:00" }, london: { start: "09:00", end: "17:00" },
  });
  assert.notEqual(page.state().cityPreferences.toronto, page.state().cityPreferences.london);
  page.change("meeting-hours-toronto-start", "08:00");
  page.change("meeting-hours-london-end", "18:00");
  const before = page.state();
  page.nodes("select")[0].props.onChange({ target: { value: "paris" } }); page.render();
  assert.equal(page.state(), before);
  assert.equal(Object.hasOwn(page.state().cityPreferences, "paris"), false);
  page.click("Add city");
  assert.equal(page.input("meeting-hours-paris-start").props.value, "09:00");
  assert.equal(page.focusedId(), "meeting-hours-paris-start");
  assert.equal(page.input("meeting-hours-toronto-start").props.value, "08:00");
  assert.equal(page.input("meeting-hours-london-end").props.value, "18:00");
  page.change("meeting-hours-paris-start", "10:00");
  page.change("meeting-date", "2027-03-27");
  const preferences = page.state().cityPreferences;
  page.click("Make Paris reference");
  assert.equal(page.state().cityPreferences, preferences);
  assert.equal(page.state().referenceDate, "2027-03-27");
  const stale = page.input("meeting-hours-paris-start").props.onChange;
  page.click("Remove Paris");
  assert.equal(Object.hasOwn(page.state().cityPreferences, "paris"), false);
  assert.equal(page.focusedId(), "meeting-date");
  page.add("paris");
  const reset = page.state();
  stale({ target: { value: "11:00" } }); page.render();
  assert.equal(page.state(), reset);
  assert.equal(page.input("meeting-hours-paris-start").props.value, "09:00");
  page.add("montreal"); page.add("new-york");
  assert.equal(page.focusedId(), "meeting-hours-new-york-start");
  assert.equal(page.nodes("select")[0].props.disabled, true);
  assert.deepEqual(Object.keys(page.state().cityPreferences).sort(), Array.from(page.state().citySlugs).sort());
});

test("rapid per-city edits merge while the exact selected meeting updates from five fits to four", () => {
  const page = pageHarness(); page.add("montreal"); page.add("new-york"); page.add("paris");
  page.change("meeting-date", "2027-03-27");
  const selected = page.select().props.value;
  const oldOtherRadio = page.nodes("input").filter((node) => node.props.type === "radio")[1];
  assert.match(page.text(), /5 of 5 cities within their preferred hours/);
  const opening = page.input("meeting-hours-london-start").props.onChange;
  const closing = page.input("meeting-hours-london-end").props.onChange;
  const toronto = page.input("meeting-hours-toronto-start").props.onChange;
  const revision = page.state().planRevision;
  opening({ target: { value: "14:00" } }); closing({ target: { value: "18:00" } }); toronto({ target: { value: "08:00" } }); page.render();
  assert.equal(page.state().planRevision, revision + 3);
  assert.equal(page.state().selectedStartEpochMilliseconds, selected);
  assert.match(page.text(), /4 of 5 cities within their preferred hours/);
  assert.match(page.text(), /This selected meeting is outside preferred hours for: London\./);
  assert.equal(page.input("meeting-hours-london-start").props.value, "14:00");
  assert.equal(page.input("meeting-hours-london-end").props.value, "18:00");
  oldOtherRadio.props.onChange(); page.render();
  assert.equal(page.state().selectedStartEpochMilliseconds, selected);
  const current = page.state();
  page.change("meeting-hours-london-start", "14:00");
  assert.equal(page.state(), current);
  page.change("meeting-hours-london-start", "09:00");
  oldOtherRadio.props.onChange(); page.render();
  assert.equal(page.state().selectedStartEpochMilliseconds, selected);
  assert.match(page.text(), /5 of 5 cities within their preferred hours/);
});

test("invalid city drafts show associated errors and suspend selection until valid repair", () => {
  const page = pageHarness(); page.change("meeting-date", "2027-03-27");
  const epoch = page.select().props.value;
  const retainedDownload = page.calendarHandler();
  page.change("meeting-hours-london-start", "");
  assert.equal(page.input("meeting-hours-london-start").props.value, "");
  assert.equal(page.input("meeting-hours-london-start").props["aria-invalid"], true);
  assert.match(page.input("meeting-hours-london-start").props["aria-describedby"], /meeting-hours-error-london/);
  assert.ok(page.nodes("p").some((node) => node.props.id === "meeting-hours-error-london" && node.props.role === "alert"));
  assert.equal(page.button("Copy plan link"), undefined);
  assert.equal(page.button("Copy selected meeting link"), undefined);
  assert.equal(page.state().selectedStartEpochMilliseconds, epoch);
  assert.doesNotMatch(page.text(), /Selected meeting|cities within their preferred hours/);
  assert.equal(page.nodes("input").filter((node) => node.props.type === "radio").length, 0);
  assert.equal(page.calendarButton(), undefined);
  retainedDownload();
  assert.equal(page.downloads.length, 0);
  page.change("meeting-hours-london-start", "09:00");
  assert.equal(page.state().selectedStartEpochMilliseconds, epoch);
  assert.match(page.text(), /Selected meeting/);
  assert.ok(page.calendarButton());
  assert.ok(page.button("Copy plan link"));
});

test("city controls have unique visible city labels, minute inputs and mobile stacking", async () => {
  const page = pageHarness(); page.add("montreal"); page.add("paris"); page.add("tokyo");
  const ids = page.nodes("input").map((node) => node.props.id).filter(Boolean);
  assert.equal(ids.length, new Set(ids).size);
  assert.equal(page.nodes("input").filter((node) => node.props.type === "time").length, 10);
  assert.equal(page.nodes("table").length, 0);
  for (const [slug, name] of [["toronto", "Toronto"], ["london", "London"], ["montreal", "Montreal"], ["paris", "Paris"], ["tokyo", "Tokyo"]]) {
    for (const [field, label] of [["start", "opening"], ["end", "closing"]]) {
      const id = `meeting-hours-${slug}-${field}`;
      assert.equal(page.input(id).props.type, "time");
      assert.equal(page.input(id).props.step, "60");
      assert.ok(page.nodes("label").some((node) => node.props.htmlFor === id && text(node) === `Preferred ${label} time in ${name}`));
      assert.match(page.input(id).props["aria-describedby"], /meeting-hours-help/);
    }
  }
  const css = await readFile(new URL("../src/App.css", import.meta.url), "utf8");
  assert.match(css, /\.meeting-controls \{[^}]*minmax\(0, 1fr\)/);
  assert.match(css, /@media \(max-width: 600px\)[\s\S]*\.meeting-controls \{ grid-template-columns: 1fr; \}/);
  assert.match(page.text(), /These are preferences, not calendar availability/);
});

test("retained calendar handler exports the same event after preference-only classification changes", () => {
  const page = pageHarness(); page.change("meeting-date", "2027-03-27");
  const epoch = page.select().props.value;
  const retained = page.calendarHandler(); retained();
  const before = page.downloads[0];
  page.change("meeting-hours-london-start", "14:00");
  assert.equal(page.state().selectedStartEpochMilliseconds, epoch);
  assert.match(page.text(), /outside preferred hours for: London/);
  retained();
  assert.equal(page.downloads.length, 2);
  assert.deepEqual(page.downloads[1], before);
  assert.doesNotMatch(before.ics, /preferred|hours=/);
});

test("v1 and v2 manual planner page views remain canonical, query-free and deduplicated", async () => {
  const read = (file) => readFile(new URL(`../${file}`, import.meta.url), "utf8");
  const [site, metadata, analytics, component] = await Promise.all([
    read("src/config/site.js"), read("src/utils/routeMetadata.js"), read("src/utils/analytics.js"), read("src/components/Analytics.jsx"),
  ]);
  const effects = [];
  const context = vm.createContext({ URL, Date, window: {}, youHoraLogo: "test-logo",
    useLocation: () => context.location,
    useConsent: () => ({ analyticsConsent: "granted" }),
    useEffect(setup, deps) { assert.deepEqual(Array.from(deps), ["granted", "/meeting-planner"]); effects.push(setup); },
  });
  const executable = (value) => withoutImports(value).replaceAll("export const", "const")
    .replaceAll("export async function", "async function").replaceAll("export function", "function");
  vm.runInContext(executable(site), context);
  vm.runInContext(executable(metadata), context);
  vm.runInContext(executable(analytics).replaceAll("import.meta.env.PROD", "true"), context);
  context.setAnalyticsConsent(true);
  context.loadAnalytics = async () => true;
  vm.runInContext(executable(component).replace("export default function", "function"), context);
  for (const search of [sharedSearch, "?v=2&hours=toronto%3A08%3A00-16%3A00&date=2027-03-27&start=1806152400000", "?v=2&hours=private"]) {
    context.location = { pathname: "/meeting-planner", search, hash: "#private" };
    context.Analytics(); effects.pop()(); await Promise.resolve(); await Promise.resolve();
  }
  const views = Array.from(context.window.dataLayer, (args) => Array.from(args)).filter((args) => args[1] === "page_view");
  assert.equal(views.length, 1);
  assert.equal(views[0][2].page_path, "/meeting-planner");
  assert.equal(views[0][2].page_location, "https://www.youhora.com/meeting-planner");
  assert.equal(context.resolveRouteMetadata("/meeting-planner").canonicalPath, "/meeting-planner");
});
