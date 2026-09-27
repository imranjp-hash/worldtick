import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import { transformWithOxc } from "vite";
import { cities } from "../src/data/cities.js";
import * as dateTime from "../src/utils/dateTime.js";
import * as timeComparisonUrl from "../src/utils/timeComparisonUrl.js";

const analyticsSource = await readFile(new URL("../src/utils/analytics.js", import.meta.url), "utf8");
const pageSource = await readFile(new URL("../src/pages/TimeDifferencePage.jsx", import.meta.url), "utf8");
const siteSource = await readFile(new URL("../src/config/site.js", import.meta.url), "utf8");
const { code: pageCode } = await transformWithOxc(pageSource, "TimeDifferencePage.jsx", {
  jsx: { runtime: "classic", pragma: "createElement" },
});
const withoutImports = (source) => source.replace(/^import[\s\S]*?;\r?\n/gm, "");
const siteContext = vm.createContext({ URL, youHoraLogo: "test-logo" });
vm.runInContext(withoutImports(siteSource)
  .replaceAll("export const", "const")
  .replaceAll("export function", "function"), siteContext);

function analyticsHarness(production = true) {
  const scripts = [];
  const window = {};
  const context = vm.createContext({
    window, URL, Date,
    siteConfig: { analytics: { measurementId: "G-TEST" }, productionOrigin: "https://example.test" },
    document: {
      getElementById: (id) => scripts.find((script) => script.id === id),
      createElement: () => ({
        dataset: {}, listeners: {},
        addEventListener(type, listener) {
          (this.listeners[type] ||= []).push(listener);
        },
      }),
      head: { appendChild: (script) => scripts.push(script) },
    },
  });
  vm.runInContext(withoutImports(analyticsSource)
    .replaceAll("export function", "function")
    .replaceAll("export async function", "async function")
    .replaceAll("import.meta.env.PROD", String(production)), context);
  context.initializeConsentDefaults();
  const calls = () => Array.from(window.dataLayer || [], (args) => Array.from(args));
  return {
    context, scripts, window, calls,
    events: () => calls().filter((call) => call[0] === "event" && call[1] === "time_comparison_completed"),
    copyEvents: () => calls().filter((call) => call[0] === "event" && call[1] === "comparison_link_copied"),
    finishLoad(type = "load") {
      for (const listener of scripts[0].listeners[type] || []) listener(new Error("test load failure"));
    },
  };
}

// Isolate real JSX handlers with a small router/hooks harness, without a DOM dependency.
// Navigation commits on render; repeated renders retain the same location object.
// This exercises side-effect isolation and stale handlers, not a real React renderer.
function pageHarness(analytics, calculate = dateTime.getTimeDifferenceMinutes, initialLocation = {}, options = {}) {
  const slots = [];
  const effects = new Map();
  const pendingEffects = new Map();
  const timers = new Map();
  const clipboardWrites = [];
  const navigator = options.navigator ?? {
    clipboard: { writeText: async (text) => { clipboardWrites.push(text); } },
  };
  const pending = [];
  const navigations = [];
  const history = [{ pathname: "/time-difference", search: "", hash: "", state: null, key: "initial", ...initialLocation }];
  let historyIndex = 0;
  let nextKey = 0;
  let renderedEntry;
  let location;
  let index = 0;
  let tree;
  let renderAgain = false;
  let mounted = true;
  let elapsed = 0;
  let nextTimer = 0;
  let now = new Date("2026-09-07T12:00:00Z");
  const context = vm.createContext({
    ...dateTime,
    React: { Fragment: "Fragment" },
    URLSearchParams,
    navigator,
    window: {
      location: { origin: "http://localhost:5173" },
      setTimeout(callback, delay) {
        const id = ++nextTimer;
        timers.set(id, { callback, due: elapsed + delay });
        return id;
      },
      clearTimeout(id) { timers.delete(id); },
    },
    getTimeDifferenceMinutes: calculate,
    convertLocalDateTime: options.convertLocalDateTime ?? dateTime.convertLocalDateTime,
    ...timeComparisonUrl,
    cities,
    siteConfig: { publicSiteName: "Test" },
    getSiteUrl: options.getSiteUrl ?? ((path) => `https://example.test${path}`),
    Link: "Link", StructuredData: "StructuredData",
    createElement: (type, props, ...children) => ({ type, props: props || {}, children }),
    useNow: () => now,
    useLocation: () => location,
    useNavigate: () => (destination, options) => {
      navigations.push({ destination, options });
      const entry = { ...destination, state: options.state, key: String(++nextKey) };
      if (options.replace) history[historyIndex] = entry;
      else history.splice(++historyIndex, history.length, entry);
    },
    useRef(initial) {
      const slot = index++;
      if (!(slot in slots)) slots[slot] = { current: initial };
      return slots[slot];
    },
    useState(initial) {
      const slot = index++;
      if (!(slot in slots)) slots[slot] = typeof initial === "function" ? initial() : initial;
      return [slots[slot], (value) => {
        assert.ok(mounted, "state must not update after unmount");
        const next = typeof value === "function" ? value(slots[slot]) : value;
        if (!Object.is(slots[slot], next)) {
          slots[slot] = next;
          renderAgain = true;
        }
      }];
    },
    useLayoutEffect(setup, deps) {
      const slot = index++;
      const previous = effects.get(slot);
      if (!previous || deps.some((dep, i) => !Object.is(dep, previous.deps[i]))) {
        pendingEffects.set(slot, { setup, deps });
      }
    },
    useMemo(factory, deps) {
      const slot = index++;
      const previous = slots[slot];
      if (!previous || deps.some((dep, i) => !Object.is(dep, previous.deps[i]))) {
        slots[slot] = { value: factory(), deps };
      }
      return slots[slot].value;
    },
    trackTimeComparisonCompleted(params) {
      pending.push(analytics.context.trackTimeComparisonCompleted(params));
    },
    trackComparisonLinkCopied(params) {
      pending.push(analytics.context.trackComparisonLinkCopied(params));
    },
  });
  vm.runInContext(withoutImports(pageCode).replace("export default function", "function"), context);
  function nodes(type, node = tree) {
    if (!node || typeof node !== "object") return [];
    if (Array.isArray(node)) return node.flatMap((child) => nodes(type, child));
    return [...(node.type === type ? [node] : []), ...nodes(type, node.children)];
  }
  function nodeText(node) {
    if (node === null || node === undefined || typeof node === "boolean") return "";
    if (typeof node !== "object") return String(node);
    if (Array.isArray(node)) return node.map(nodeText).join("");
    return node.children.map(nodeText).join("");
  }
  function render() {
    if (renderedEntry !== history[historyIndex]) {
      renderedEntry = history[historyIndex];
      location = { ...renderedEntry };
    }
    let passes = 0;
    do {
      assert.ok(++passes < 25, "render must settle");
      renderAgain = false;
      index = 0;
      tree = context.TimeDifferencePage();
    } while (renderAgain);
    for (const [slot, effect] of pendingEffects) {
      effects.get(slot)?.cleanup?.();
      effects.set(slot, { ...effect, cleanup: effect.setup() });
    }
    pendingEffects.clear();
  }
  render();
  return {
    render,
    navigator,
    clipboardWrites,
    copy: () => nodes("button").find((node) => node.props.className === "time-difference-copy-button").props.onClick(),
    copyButton: () => nodes("button").find((node) => node.props.className === "time-difference-copy-button"),
    copyLabel: () => nodes("button").find((node) => node.props.className === "time-difference-copy-button").children.join(""),
    status: () => nodes("span").find((node) => node.props.role === "status"),
    timerCount: () => timers.size,
    advance(milliseconds) {
      const end = elapsed + milliseconds;
      while (timers.size) {
        const [id, timer] = [...timers].sort((a, b) => a[1].due - b[1].due)[0];
        if (timer.due > end) break;
        elapsed = timer.due;
        timers.delete(id);
        timer.callback();
      }
      elapsed = end;
      render();
    },
    replayEffects() {
      for (const effect of effects.values()) effect.cleanup?.();
      for (const effect of effects.values()) effect.cleanup = effect.setup();
    },
    unmount() {
      for (const effect of effects.values()) effect.cleanup?.();
      mounted = false;
    },
    tick() { now = new Date(now.getTime() + 1000); render(); },
    select(field, value) { nodes("select")[field].props.onChange({ target: { value } }); },
    swap() { nodes("button").find((node) => node.props.className === "time-difference-swap-button").props.onClick(); },
    setMode(value) {
      const label = value === "specific" ? "Specific date & time" : "Current time";
      nodes("button").find((node) => nodeText(node) === label).props.onClick();
      render();
    },
    mode: () => nodes("button")
      .filter((node) => node.props["aria-pressed"] === true)
      .map(nodeText)[0],
    setInput(type, value) {
      nodes("input").find((node) => node.props.type === type).props.onChange({ target: { value } });
      render();
    },
    input: (type) => nodes("input").find((node) => node.props.type === type),
    chooseOccurrence(value) {
      nodes("input").find((node) => node.props.type === "radio" && node.props.value === value).props.onChange();
      render();
    },
    radios: () => nodes("input").filter((node) => node.props.type === "radio"),
    labels: () => nodes("label"),
    text: () => nodeText(tree),
    pair: () => nodes("select").map((node) => node.props.value),
    links: () => nodes("Link"),
    structuredData: () => nodes("StructuredData")[0].props.data,
    location: () => location,
    navigations,
    historyLength: () => history.length,
    visit(search, extra = {}) {
      history.splice(++historyIndex, history.length, {
        pathname: "/time-difference", search, hash: "", state: null, key: String(++nextKey), ...extra,
      });
      render();
    },
    back() { if (historyIndex > 0) historyIndex--; render(); },
    forward() { if (historyIndex < history.length - 1) historyIndex++; render(); },
    settle: () => Promise.all(pending),
  };
}

async function readyAnalytics() {
  const analytics = analyticsHarness();
  analytics.context.setAnalyticsConsent(true);
  const loading = analytics.context.loadAnalytics();
  analytics.finishLoad();
  await loading;
  return analytics;
}

test("specific-date mode is opt-in, retains values, waits for complete input and copies full state", async () => {
  const analytics = await readyAnalytics();
  let conversions = 0;
  const disambiguations = [];
  const page = pageHarness(analytics, dateTime.getTimeDifferenceMinutes, {}, {
    convertLocalDateTime(input) {
      conversions += 1;
      disambiguations.push(input.disambiguation);
      return dateTime.convertLocalDateTime(input);
    },
  });

  assert.equal(page.mode(), "Current time");
  assert.equal(page.input("date"), undefined);
  assert.equal(conversions, 0);

  page.setMode("specific");
  assert.equal(page.mode(), "Specific date & time");
  assert.equal(page.copyLabel(), "Copy comparison link");
  assert.equal(page.copyButton().props.disabled, true);
  assert.equal(conversions, 0);
  page.setInput("date", "2020-01-15");
  assert.equal(conversions, 0);
  page.setInput("time", "09:00");
  assert.equal(conversions, 1);
  assert.equal(page.copyButton().props.disabled, false);

  page.setMode("current");
  assert.equal(page.copyLabel(), "Copy comparison link");
  page.setMode("specific");
  assert.equal(page.input("date").props.value, "2020-01-15");
  assert.equal(page.input("time").props.value, "09:00");
  assert.equal(analytics.events().length, 0);

  const labels = page.labels();
  assert.equal(labels.find((label) => label.props.htmlFor === "time-difference-from-city") !== undefined, true);
  assert.equal(labels.find((label) => label.props.htmlFor === "time-difference-to-city") !== undefined, true);
});

test("specific conversion uses the selected instant and renders complete same-, next- and previous-day output", async () => {
  const analytics = await readyAnalytics();
  const sameDay = pageHarness(analytics, dateTime.getTimeDifferenceMinutes, {
    search: "?from=toronto&to=london",
  });
  sameDay.setMode("specific");
  sameDay.setInput("date", "2027-03-15");
  sameDay.setInput("time", "09:00");
  assert.match(sameDay.text(), /London is ahead of Toronto at this time/);
  assert.match(sameDay.text(), /4h 0m/);
  assert.match(sameDay.text(), /Monday, March 15, 2027/);
  assert.match(sameDay.text(), /9:00 AM/);
  assert.match(sameDay.text(), /1:00 PM/);
  assert.match(sameDay.text(), /Same day/);

  const nextDay = pageHarness(analytics, dateTime.getTimeDifferenceMinutes, {
    search: "?from=toronto&to=tokyo",
  });
  nextDay.setMode("specific");
  nextDay.setInput("date", "2027-12-31");
  nextDay.setInput("time", "23:30");
  assert.match(nextDay.text(), /Friday, December 31, 2027/);
  assert.match(nextDay.text(), /Saturday, January 1, 2028/);
  assert.match(nextDay.text(), /Next day/);

  const previousDay = pageHarness(analytics, dateTime.getTimeDifferenceMinutes, {
    search: "?from=tokyo&to=toronto",
  });
  previousDay.setMode("specific");
  previousDay.setInput("date", "2027-01-15");
  previousDay.setInput("time", "00:15");
  assert.match(previousDay.text(), /Thursday, January 14, 2027/);
  assert.match(previousDay.text(), /Previous day/);
});

test("ordinary shared specific URLs hydrate exactly without analytics or initial rewriting", async () => {
  const analytics = await readyAnalytics();
  const search = "?from=toronto&to=london&mode=specific&date=2027-01-15&time=09%3A00&utm_source=shared";
  const page = pageHarness(analytics, dateTime.getTimeDifferenceMinutes, {
    search, hash: "#calculator", state: { source: "shared" },
  });
  assert.equal(page.mode(), "Specific date & time");
  assert.deepEqual(page.pair(), ["toronto", "london"]);
  assert.equal(page.input("date").props.value, "2027-01-15");
  assert.equal(page.input("time").props.value, "09:00");
  assert.match(page.text(), /London is ahead of Toronto at this time/);
  assert.equal(page.copyButton().props.disabled, false);
  assert.equal(page.location().search, search);
  assert.equal(page.location().hash, "#calculator");
  assert.deepEqual(page.location().state, { source: "shared" });
  assert.equal(page.navigations.length, 0);
  assert.equal(analytics.events().length, 0);
  assert.equal(analytics.copyEvents().length, 0);
});

test("shared ambiguous URLs restore either occurrence by interpretation", async () => {
  for (const [occurrence, destinationTime] of [["earlier", "5:30 AM"], ["later", "6:30 AM"]]) {
    const analytics = await readyAnalytics();
    const page = pageHarness(analytics, dateTime.getTimeDifferenceMinutes, {
      search: `?from=toronto&to=london&mode=specific&date=2027-11-07&time=01%3A30&occurrence=${occurrence}`,
    });
    assert.equal(page.radios().find((radio) => radio.props.value === occurrence).props.checked, true);
    assert.match(page.text(), new RegExp(destinationTime));
    assert.equal(page.copyButton().props.disabled, false);
    assert.equal(analytics.events().length, 0);
    assert.equal(analytics.copyEvents().length, 0);
  }
});

test("unresolved, invalid, incomplete and nonexistent shared state cannot copy a conversion", async () => {
  for (const [search, message] of [
    ["?from=toronto&to=london&mode=specific&date=2027-11-07&time=01%3A30", /Choose the first or second occurrence/],
    ["?from=toronto&to=london&mode=specific&date=2027-01-15", /incomplete/],
    ["?from=toronto&to=london&mode=specific&date=2027-02-30&time=09%3A00", /valid calendar date/],
    ["?from=toronto&to=london&mode=specific&date=2027-03-14&time=02%3A30", /doesn't occur/],
    ["?from=unknown&to=london&mode=specific&date=2027-01-15&time=09%3A00", /unknown or missing city/],
    ["?from=toronto&to=london&date=2027-01-15&time=09%3A00", /invalid/],
    ["?from=toronto&to=london&mode=specific&date=2027-01-15&time=09%3A00&occurrence=later", /happens only once/],
  ]) {
    const analytics = await readyAnalytics();
    const page = pageHarness(analytics, dateTime.getTimeDifferenceMinutes, { search });
    assert.equal(page.mode(), "Specific date & time", search);
    assert.equal(page.copyButton().props.disabled, true, search);
    assert.match(page.text(), message, search);
    assert.doesNotMatch(page.text(), /currently have the same UTC offset|currently.*ahead|currently.*behind/, search);
    await page.copy();
    await page.settle();
    assert.deepEqual(page.clipboardWrites, [], search);
    assert.equal(analytics.copyEvents().length, 0, search);
    assert.equal(page.navigations.length, 0, search);
  }
});

test("mode uses push while specific edits and occurrence use replace", async () => {
  const page = pageHarness(await readyAnalytics(), dateTime.getTimeDifferenceMinutes, {
    search: "?from=toronto&to=london&campaign=test",
    hash: "#calculator",
    state: { returnTo: "/cities" },
  });
  page.setMode("specific");
  assert.equal(page.navigations.at(-1).options.replace, false);
  assert.equal(page.historyLength(), 2);
  page.setInput("date", "2027-11-07");
  assert.equal(page.navigations.at(-1).options.replace, true);
  assert.equal(page.historyLength(), 2);
  page.setInput("time", "01:30");
  assert.equal(page.navigations.at(-1).options.replace, true);
  page.chooseOccurrence("later");
  assert.equal(page.navigations.at(-1).options.replace, true);
  assert.equal(page.historyLength(), 2);
  assert.equal(page.location().search, "?from=toronto&to=london&mode=specific&date=2027-11-07&time=01%3A30&occurrence=later&campaign=test");
  assert.equal(page.location().hash, "#calculator");
  assert.deepEqual(page.location().state, { returnTo: "/cities" });
  page.setMode("current");
  assert.equal(page.navigations.at(-1).options.replace, false);
  assert.equal(page.historyLength(), 3);
  assert.equal(page.location().search, "?from=toronto&to=london&campaign=test");
});

test("back and forward restore exact current and specific URL state without stale occurrence", async () => {
  const analytics = await readyAnalytics();
  const page = pageHarness(analytics, dateTime.getTimeDifferenceMinutes, {
    search: "?from=toronto&to=london",
  });
  page.setMode("specific");
  page.setInput("date", "2027-11-07");
  page.setInput("time", "01:30");
  page.chooseOccurrence("later");
  page.setMode("current");
  assert.equal(page.mode(), "Current time");

  page.back();
  assert.equal(page.mode(), "Specific date & time");
  assert.deepEqual(page.pair(), ["toronto", "london"]);
  assert.equal(page.input("date").props.value, "2027-11-07");
  assert.equal(page.input("time").props.value, "01:30");
  assert.equal(page.radios().find((radio) => radio.props.value === "later").props.checked, true);

  page.back();
  assert.equal(page.mode(), "Current time");
  page.forward();
  assert.equal(page.mode(), "Specific date & time");
  assert.equal(page.radios().find((radio) => radio.props.value === "later").props.checked, true);
  page.select(0, "new-york");
  page.render();
  await page.settle();
  assert.equal(page.radios().length, 2);
  assert.equal(page.radios().some((radio) => radio.props.checked), false);
  assert.equal(page.location().search.includes("occurrence="), false);
  assert.equal(analytics.events().length, 1);
  assert.equal(analytics.copyEvents().length, 0);
});

test("current-mode source changes retain wall fields but invalidate the saved occurrence context", async () => {
  const page = pageHarness(await readyAnalytics(), dateTime.getTimeDifferenceMinutes, {
    search: "?from=toronto&to=london&mode=specific&date=2027-11-07&time=01%3A30&occurrence=later",
  });

  page.setMode("current");
  page.select(0, "new-york");
  page.render();
  page.setMode("specific");

  assert.deepEqual(page.pair(), ["new-york", "london"]);
  assert.equal(page.input("date").props.value, "2027-11-07");
  assert.equal(page.input("time").props.value, "01:30");
  assert.equal(page.radios().length, 2);
  assert.equal(page.radios().some((radio) => radio.props.checked), false);
  assert.equal(page.location().search.includes("occurrence="), false);
  assert.match(page.text(), /Choose the first or second occurrence above/);
});

test("current-mode Swap retains wall fields but invalidates the saved occurrence context", async () => {
  const page = pageHarness(await readyAnalytics(), dateTime.getTimeDifferenceMinutes, {
    search: "?from=toronto&to=london&mode=specific&date=2027-11-07&time=01%3A30&occurrence=later",
  });

  page.setMode("current");
  page.swap();
  page.render();
  page.setMode("specific");

  assert.deepEqual(page.pair(), ["london", "toronto"]);
  assert.equal(page.input("date").props.value, "2027-11-07");
  assert.equal(page.input("time").props.value, "01:30");
  assert.equal(page.location().search.includes("occurrence="), false);
  assert.equal(page.radios().length, 0);
  assert.equal(page.copyButton().props.disabled, false);
});

test("an unchanged source restores its context-bound occurrence, while a fresh Current mount has no hidden draft", async () => {
  const page = pageHarness(await readyAnalytics(), dateTime.getTimeDifferenceMinutes, {
    search: "?from=toronto&to=london&mode=specific&date=2027-11-07&time=01%3A30&occurrence=later",
  });
  page.setMode("current");
  page.setMode("specific");
  assert.equal(page.input("date").props.value, "2027-11-07");
  assert.equal(page.input("time").props.value, "01:30");
  assert.equal(page.radios().find((radio) => radio.props.value === "later").props.checked, true);

  const freshPage = pageHarness(await readyAnalytics(), dateTime.getTimeDifferenceMinutes, {
    search: "?from=toronto&to=london",
  });
  freshPage.setMode("specific");
  assert.equal(freshPage.input("date").props.value, "");
  assert.equal(freshPage.input("time").props.value, "");
  assert.equal(freshPage.radios().length, 0);
});

test("history around a Current source change never applies the old occurrence to the new source", async () => {
  const page = pageHarness(await readyAnalytics(), dateTime.getTimeDifferenceMinutes, {
    search: "?from=toronto&to=london&mode=specific&date=2027-11-07&time=01%3A30&occurrence=later",
  });
  page.setMode("current");
  page.select(0, "new-york");
  page.render();
  page.setMode("specific");

  page.back();
  assert.equal(page.mode(), "Current time");
  assert.deepEqual(page.pair(), ["new-york", "london"]);
  page.back();
  assert.equal(page.mode(), "Specific date & time");
  assert.deepEqual(page.pair(), ["toronto", "london"]);
  assert.equal(page.radios().find((radio) => radio.props.value === "later").props.checked, true);
  page.forward();
  assert.equal(page.mode(), "Current time");
  page.forward();
  assert.deepEqual(page.pair(), ["new-york", "london"]);
  assert.equal(page.radios().length, 2);
  assert.equal(page.radios().some((radio) => radio.props.checked), false);
  assert.equal(page.location().search.includes("occurrence="), false);
});

test("an invalid specific city is explicit, has no fallback comparison link and recovers by selection", async () => {
  const page = pageHarness(await readyAnalytics(), dateTime.getTimeDifferenceMinutes, {
    search: "?from=unknown&to=london&mode=specific&date=2027-01-15&time=09%3A00",
  });

  assert.deepEqual(page.pair(), ["", "london"]);
  assert.match(page.text(), /Choose a valid source city/);
  assert.match(page.text(), /unknown or missing city/);
  assert.doesNotMatch(page.text(), /London is ahead of Toronto at this time/);
  assert.equal(page.links().some((link) => String(link.props.to).startsWith("/compare/")), false);
  assert.equal(page.copyButton().props.disabled, true);

  page.select(0, "toronto");
  page.render();
  assert.deepEqual(page.pair(), ["toronto", "london"]);
  assert.match(page.text(), /London is ahead of Toronto at this time/);
  assert.equal(page.links().some((link) => link.props.to === "/compare/toronto/london"), true);
  assert.equal(page.copyButton().props.disabled, false);

  const incompleteInvalid = pageHarness(await readyAnalytics(), dateTime.getTimeDifferenceMinutes, {
    search: "?from=unknown&to=also-unknown&mode=specific",
  });
  assert.match(incompleteInvalid.text(), /in the source city to see the time in the destination city/);
  assert.equal(incompleteInvalid.links().some(
    (link) => String(link.props.to).startsWith("/compare/"),
  ), false);
});

test("nonexistent local time remains entered, is accessible and has no destination conversion", async () => {
  const page = pageHarness(await readyAnalytics(), dateTime.getTimeDifferenceMinutes, {
    search: "?from=toronto&to=london",
  });
  page.setMode("specific");
  page.setInput("date", "2027-03-14");
  page.setInput("time", "02:30");

  assert.equal(page.input("time").props.value, "02:30");
  assert.equal(page.input("time").props["aria-invalid"], true);
  assert.equal(page.input("time").props["aria-describedby"], "specific-time-error");
  assert.match(page.text(), /This time doesn't occur in Toronto/);
  assert.match(page.text(), /clocks move forward/);
  assert.doesNotMatch(page.text(), /London is ahead of Toronto at this time/);

  page.setInput("time", "03:30");
  assert.equal(page.input("time").props["aria-invalid"], undefined);
  assert.doesNotMatch(page.text(), /doesn't occur/);
  assert.match(page.text(), /London is ahead of Toronto at this time/);
});

test("ambiguous local time offers exactly two occurrences and resets the choice on relevant changes", async () => {
  const page = pageHarness(await readyAnalytics(), dateTime.getTimeDifferenceMinutes, {
    search: "?from=toronto&to=london",
  });
  page.setMode("specific");
  page.setInput("date", "2027-11-07");
  page.setInput("time", "01:30");

  assert.match(page.text(), /This local time happens twice in Toronto/);
  assert.equal(page.radios().length, 2);
  assert.deepEqual(page.radios().map((radio) => radio.props.value), ["earlier", "later"]);
  assert.match(page.text(), /First occurrence/);
  assert.match(page.text(), /Second occurrence/);

  page.chooseOccurrence("earlier");
  assert.equal(page.radios().find((radio) => radio.props.value === "earlier").props.checked, true);
  assert.match(page.text(), /5:30 AM/);
  page.chooseOccurrence("later");
  assert.equal(page.radios().find((radio) => radio.props.value === "later").props.checked, true);
  assert.match(page.text(), /6:30 AM/);

  page.setInput("time", "01:31");
  assert.equal(page.radios().some((radio) => radio.props.checked), false);
  page.chooseOccurrence("earlier");
  page.setInput("date", "2027-11-08");
  assert.equal(page.radios().length, 0);

  page.setInput("date", "2027-11-07");
  page.setInput("time", "01:30");
  page.chooseOccurrence("later");
  page.select(0, "montreal");
  page.render();
  assert.equal(page.radios().some((radio) => radio.props.checked), false);
});

test("ambiguous occurrence is context-bound, uses one engine evaluation and radio changes do not track", async () => {
  const analytics = await readyAnalytics();
  let conversions = 0;
  const disambiguations = [];
  const page = pageHarness(analytics, dateTime.getTimeDifferenceMinutes, {
    search: "?from=toronto&to=london",
  }, {
    convertLocalDateTime(input) {
      conversions += 1;
      disambiguations.push(input.disambiguation);
      return dateTime.convertLocalDateTime(input);
    },
  });
  page.setMode("specific");
  page.setInput("date", "2027-11-07");
  page.setInput("time", "01:30");
  assert.equal(conversions, 1);
  assert.deepEqual(disambiguations, ["reject"]);

  page.chooseOccurrence("earlier");
  assert.equal(conversions, 1);
  assert.match(page.text(), /5:30 AM/);
  page.chooseOccurrence("later");
  assert.equal(conversions, 1);
  assert.deepEqual(disambiguations, ["reject"]);
  assert.match(page.text(), /6:30 AM/);
  assert.equal(analytics.events().length, 0);

  page.select(0, "new-york");
  page.render();
  assert.equal(conversions, 2);
  assert.equal(page.radios().some((radio) => radio.props.checked), false);

  page.chooseOccurrence("later");
  assert.equal(conversions, 2);
  page.setInput("date", "2027-11-08");
  assert.equal(conversions, 3);
  page.setInput("date", "2027-11-07");
  assert.equal(conversions, 4);
  page.chooseOccurrence("later");
  page.setInput("time", "01:31");
  assert.equal(conversions, 5);
  assert.equal(page.radios().some((radio) => radio.props.checked), false);
});

test("browser forward navigation restores the occurrence encoded by each specific URL", async () => {
  const analytics = await readyAnalytics();
  let conversions = 0;
  const page = pageHarness(analytics, dateTime.getTimeDifferenceMinutes, {
    search: "?from=toronto&to=london&mode=specific&date=2027-11-07&time=01%3A30&occurrence=later",
  }, {
    convertLocalDateTime(input) {
      conversions += 1;
      return dateTime.convertLocalDateTime(input);
    },
  });
  page.visit("?from=new-york&to=london&mode=specific&date=2027-11-07&time=01%3A30");
  page.back();
  assert.match(page.text(), /London is ahead of Toronto at this time/);
  assert.equal(conversions, 3);

  page.forward();
  assert.equal(page.input("date").props.value, "2027-11-07");
  assert.equal(page.input("time").props.value, "01:30");
  assert.match(page.text(), /This local time happens twice in New York/);
  assert.equal(page.radios().some((radio) => radio.props.checked), false);
  assert.match(page.text(), /Choose the first or second occurrence above/);
  assert.doesNotMatch(page.text(), /London is ahead of New York at this time/);
  assert.equal(conversions, 4);
  assert.equal(analytics.events().length, 0);

  const conversionsBeforeChoice = conversions;
  page.chooseOccurrence("earlier");
  assert.match(page.text(), /London is ahead of New York at this time/);
  assert.equal(conversions, conversionsBeforeChoice);
  assert.equal(analytics.events().length, 0);
});

test("specific swap preserves wall time, resets occurrence and keeps URL, analytics and copy semantics", async () => {
  const analytics = await readyAnalytics();
  const page = pageHarness(analytics, dateTime.getTimeDifferenceMinutes, {
    search: "?campaign=spring&from=toronto&to=london",
    hash: "#calculator",
    state: { returnTo: "/cities" },
  });
  page.setMode("specific");
  page.setInput("date", "2027-11-07");
  page.setInput("time", "01:30");
  page.chooseOccurrence("later");
  const eventsBeforeSwap = analytics.events().length;

  page.swap();
  page.render();
  assert.deepEqual(page.pair(), ["london", "toronto"]);
  assert.equal(page.input("date").props.value, "2027-11-07");
  assert.equal(page.input("time").props.value, "01:30");
  assert.equal(page.mode(), "Specific date & time");
  assert.equal(page.radios().length, 0);
  assert.equal(analytics.events().length, eventsBeforeSwap);
  assert.equal(page.location().hash, "#calculator");
  assert.deepEqual(page.location().state, { returnTo: "/cities" });
  assert.equal(page.location().search.includes("campaign=spring"), true);
  assert.equal(page.location().search.includes("date=2027-11-07"), true);
  assert.equal(page.location().search.includes("time=01%3A30"), true);
  assert.equal(page.location().search.includes("occurrence="), false);
  assert.equal(page.copyLabel(), "Copy comparison link");
  await page.copy();
  assert.deepEqual(page.clipboardWrites, [
    "https://example.test/time-difference?from=london&to=toronto&mode=specific&date=2027-11-07&time=01%3A30",
  ]);
});

test("specific conversion supports fractional offsets and identical source and destination zones", async () => {
  const fractional = pageHarness(await readyAnalytics(), dateTime.getTimeDifferenceMinutes, {
    search: "?from=london&to=kathmandu",
  });
  fractional.setMode("specific");
  fractional.setInput("date", "2027-01-15");
  fractional.setInput("time", "09:00");
  assert.match(fractional.text(), /5h 45m/);
  assert.match(fractional.text(), /2:45 PM/);

  const sameZone = pageHarness(await readyAnalytics(), dateTime.getTimeDifferenceMinutes, {
    search: "?from=toronto&to=montreal",
  });
  sameZone.setMode("specific");
  sameZone.setInput("date", "2027-01-15");
  sameZone.setInput("time", "09:00");
  assert.match(sameZone.text(), /have the same UTC offset at this time/);
  assert.match(sameZone.text(), /0h 0m/);
  assert.match(sameZone.text(), /Same day/);

  const sameCity = pageHarness(await readyAnalytics(), dateTime.getTimeDifferenceMinutes, {
    search: "?from=toronto&to=toronto",
  });
  sameCity.setMode("specific");
  sameCity.setInput("date", "2027-01-15");
  sameCity.setInput("time", "09:00");
  assert.match(sameCity.text(), /Toronto and Toronto have the same UTC offset at this time/);
  assert.match(sameCity.text(), /0h 0m/);
  assert.match(sameCity.text(), /Same day/);
});

test("specific result labels multi-day relationships returned by the conversion engine", async () => {
  for (const [dayDifference, label] of [[2, "2 days later"], [-2, "2 days earlier"]]) {
    const page = pageHarness(await readyAnalytics(), dateTime.getTimeDifferenceMinutes, {}, {
      convertLocalDateTime(input) {
        const result = dateTime.convertLocalDateTime(input);
        return result.status === "success" ? { ...result, dayDifference } : result;
      },
    });
    page.setMode("specific");
    page.setInput("date", "2027-01-15");
    page.setInput("time", "09:00");
    assert.match(page.text(), new RegExp(label));
  }
});

test("default load, repeated renders, clock ticks and fresh mounts never count", async () => {
  const analytics = await readyAnalytics();
  const page = pageHarness(analytics);
  page.render();
  page.render();
  page.tick();
  pageHarness(analytics);
  assert.deepEqual(page.pair(), ["toronto", "vancouver"]);
  assert.equal(analytics.events().length, 0);
  assert.equal(page.links()[0].props.onClick, undefined);
});

test("a valid selection counts once with only canonical slug parameters", async () => {
  const analytics = await readyAnalytics();
  const page = pageHarness(analytics);
  page.select(0, "london");
  page.select(0, "london"); // Same handler invoked again before a rerender.
  page.render();
  page.tick();
  page.select(0, "london");
  await page.settle();
  assert.equal(analytics.events().length, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(analytics.events()[0][2])), {
    from_city_slug: "london", to_city_slug: "vancouver",
  });
  assert.deepEqual(page.pair(), ["london", "vancouver"]);
});

test("different comparisons and intentional returns can count again", async () => {
  const analytics = await readyAnalytics();
  const page = pageHarness(analytics);
  page.select(0, "london");
  page.select(1, "paris");
  page.select(1, "vancouver");
  await page.settle();
  assert.deepEqual(analytics.events().map((event) => [event[2].from_city_slug, event[2].to_city_slug]), [
    ["london", "vancouver"], ["london", "paris"], ["london", "vancouver"],
  ]);
});

test("swap never counts, including rapid swaps; later selections use the swapped pair", async () => {
  const analytics = await readyAnalytics();
  const page = pageHarness(analytics);
  page.swap();
  page.swap();
  page.swap();
  page.select(0, "vancouver");
  await page.settle();
  assert.equal(analytics.events().length, 0);
  page.select(1, "london");
  page.render();
  await page.settle();
  assert.deepEqual(page.pair(), ["vancouver", "london"]);
  assert.equal(analytics.events().length, 1);
});

test("invalid, incomplete, unchanged and same-city selections do not count", async () => {
  const analytics = await readyAnalytics();
  const page = pageHarness(analytics);
  for (const slug of ["", "unknown", undefined, "Toronto", "toronto"]) page.select(0, slug);
  page.render();
  assert.deepEqual(page.pair(), ["toronto", "vancouver"]);
  page.select(1, "toronto");
  page.render();
  await page.settle();
  assert.deepEqual(page.pair(), ["toronto", "toronto"]);
  assert.equal(analytics.events().length, 0);
  page.select(1, "ottawa"); // Different cities with zero time difference are valid.
  await page.settle();
  assert.equal(analytics.events().length, 1);
});

test("failed and non-finite calculations retain the previous result without counting", async () => {
  const analytics = await readyAnalytics();
  for (const fail of [() => NaN, () => { throw new RangeError("invalid timezone"); }]) {
    const page = pageHarness(analytics, (from, to, now) => from === "Europe/London"
      ? fail() : dateTime.getTimeDifferenceMinutes(from, to, now));
    page.select(0, "london");
    page.render();
    await page.settle();
    assert.deepEqual(page.pair(), ["toronto", "vancouver"]);
  }
  assert.equal(analytics.events().length, 0);
});

test("absent or denied consent never loads analytics or replays earlier selections", async () => {
  for (const reject of [false, true]) {
    const analytics = analyticsHarness();
    if (reject) analytics.context.setAnalyticsConsent(false);
    const page = pageHarness(analytics);
    page.select(0, "london");
    await page.settle();
    assert.equal(analytics.scripts.length, 0);
    assert.equal(analytics.events().length, 0);
    analytics.context.setAnalyticsConsent(true);
    const loading = analytics.context.loadAnalytics();
    analytics.finishLoad();
    await loading;
    page.render();
    page.tick();
    page.select(0, "london");
    await page.settle();
    assert.equal(analytics.events().length, 0);
    page.select(0, "paris");
    await page.settle();
    assert.equal(analytics.events().length, 1);
  }
});

test("loading is shared and a pending selection is sent exactly once after load", async () => {
  const analytics = analyticsHarness();
  analytics.context.setAnalyticsConsent(true);
  const page = pageHarness(analytics);
  page.select(0, "london");
  page.select(0, "london");
  assert.equal(analytics.scripts.length, 1);
  assert.equal(analytics.events().length, 0);
  analytics.finishLoad();
  await page.settle();
  assert.equal(analytics.events().length, 1);
});

test("withdrawal cancels pending events even after reacceptance, but repeated grants do not", async () => {
  for (const choice of ["withdraw", "reaccept", "repeat-grant"]) {
    const analytics = analyticsHarness();
    analytics.context.setAnalyticsConsent(true);
    const page = pageHarness(analytics);
    page.select(0, "london");
    if (choice !== "repeat-grant") analytics.context.setAnalyticsConsent(false);
    if (choice !== "withdraw") analytics.context.setAnalyticsConsent(true);
    analytics.finishLoad();
    await page.settle();
    assert.equal(analytics.events().length, choice === "repeat-grant" ? 1 : 0);
  }
});

test("script failure is contained and development never loads or dispatches", async () => {
  for (const production of [true, false]) {
    const analytics = analyticsHarness(production);
    analytics.context.setAnalyticsConsent(true);
    const page = pageHarness(analytics);
    page.select(0, "london");
    if (production) analytics.finishLoad("error");
    else assert.equal(analytics.scripts.length, 0);
    await page.settle();
    page.render();
    assert.deepEqual(page.pair(), ["london", "vancouver"]);
    assert.equal(analytics.events().length, 0);
  }
});

test("custom events leave page-view deduplication and advertising denial intact", async () => {
  const analytics = await readyAnalytics();
  const trackPage = (path) => analytics.context.trackPageView({ path, title: "Test" });
  trackPage("/time-difference");
  const page = pageHarness(analytics);
  page.select(0, "london");
  await page.settle();
  trackPage("/time-difference");
  trackPage("/compare/london/vancouver");
  trackPage("/compare/london/vancouver");
  trackPage("/time-difference");
  assert.equal(analytics.calls().filter((call) => call[1] === "page_view").length, 3);
  assert.equal(analytics.events().length, 1);
  for (const call of analytics.calls().filter((entry) => entry[0] === "consent")) {
    for (const key of ["ad_storage", "ad_user_data", "ad_personalization"]) {
      assert.equal(call[2][key], "denied");
    }
  }
});

test("valid shared URLs initialize both cities, allow same-city pairs, and never count", async () => {
  const analytics = await readyAnalytics();
  for (const [search, pair] of [
    ["?from=toronto&to=london", ["toronto", "london"]],
    ["?to=paris&from=london", ["london", "paris"]],
    ["?from=london&to=london", ["london", "london"]],
    ["?from=%6Condon&to=paris", ["london", "paris"]],
    ["?from=london&to=paris&utm_source=shared&extra=%ZZ", ["london", "paris"]],
  ]) {
    const page = pageHarness(analytics, undefined, { search });
    assert.deepEqual(page.pair(), pair);
    assert.equal(page.links()[0].props.to, `/compare/${pair[0]}/${pair[1]}`);
    page.render();
    page.tick();
    const refreshed = pageHarness(analytics, undefined, page.location());
    assert.deepEqual(refreshed.pair(), pair);
    assert.equal(page.location().search, search);
    assert.equal(page.navigations.length, 0);
    assert.equal(refreshed.navigations.length, 0);
  }
  assert.equal(analytics.events().length, 0);
});

test("partial, empty, duplicated, malformed or invalid parameters default the entire pair without rewriting", async () => {
  const analytics = await readyAnalytics();
  for (const search of [
    "", "?from=london", "?to=paris", "?utm_source=shared",
    "?from=&to=paris", "?from=london&to=", "?from&to=paris",
    "?from=unknown&to=paris", "?from=london&to=unknown", "?from=unknown&to=unknown",
    "?from=london&from=london&to=paris", "?from=london&from=toronto&to=paris",
    "?from=london&to=paris&to=paris", "?from=london&to=paris&to=unknown",
    "?from=london&%66rom=toronto&to=paris",
    "?from=%&to=paris", "?from=london&to=%ZZ", "?from=%E0%A4%A&to=paris",
    "?from=London&to=paris", "?from=london&to=PARIS", "?from=+london&to=paris",
    "?from=london%00&to=paris", "?from=%256Condon&to=paris",
    "?from[]=london&to=paris", "?from=london;to=paris",
  ]) {
    const page = pageHarness(analytics, undefined, { search });
    page.render();
    page.tick();
    assert.deepEqual(page.pair(), ["toronto", "vancouver"], search);
    assert.equal(page.location().search, search);
    assert.equal(page.navigations.length, 0, search);
  }
  assert.equal(analytics.events().length, 0);
});

test("a later selection writes both slugs and preserves other parameters, hash and router state", async () => {
  const analytics = await readyAnalytics();
  const routerState = { returnTo: "/cities" };
  const page = pageHarness(analytics, undefined, {
    search: "?from=london&to=paris&utm_source=shared&tag=one&tag=two&note=hello%20world",
    hash: "#comparison", state: routerState,
  });
  page.select(0, "toronto");
  page.select(0, "toronto");
  page.render();
  await page.settle();
  const params = new URLSearchParams(page.location().search);
  assert.deepEqual(page.pair(), ["toronto", "paris"]);
  assert.deepEqual(params.getAll("from"), ["toronto"]);
  assert.deepEqual(params.getAll("to"), ["paris"]);
  assert.equal(params.get("utm_source"), "shared");
  assert.deepEqual(params.getAll("tag"), ["one", "two"]);
  assert.equal(params.get("note"), "hello world");
  assert.equal(page.location().hash, "#comparison");
  assert.equal(page.location().state, routerState);
  assert.equal(page.location().pathname, "/time-difference");
  assert.equal(page.historyLength(), 1);
  assert.equal(page.navigations.length, 1);
  assert.equal(page.navigations[0].options.replace, true);
  assert.equal(analytics.events().length, 1);
  assert.equal(analytics.events()[0][2].to_city_slug, "paris");
});

test("an action after a partial or duplicated URL starts from the full fallback pair", async () => {
  const analytics = await readyAnalytics();
  for (const search of ["?from=london&utm_source=shared", "?from=london&from=paris&to=paris&utm_source=shared"]) {
    const page = pageHarness(analytics, undefined, { search });
    page.select(0, "toronto"); // Unchanged fallback selection must not normalize the URL.
    assert.equal(page.navigations.length, 0);
    page.select(1, "london");
    page.render();
    await page.settle();
    assert.deepEqual(page.pair(), ["toronto", "london"]);
    const params = new URLSearchParams(page.location().search);
    assert.deepEqual(params.getAll("from"), ["toronto"]);
    assert.deepEqual(params.getAll("to"), ["london"]);
    assert.equal(params.get("utm_source"), "shared");
  }
  assert.equal(analytics.events().length, 2);
});

test("swap serializes the reversed shared pair and preserves extras without counting", async () => {
  const analytics = await readyAnalytics();
  const page = pageHarness(analytics, undefined, {
    search: "?from=london&to=paris&utm_source=shared", hash: "#comparison", state: { saved: true },
  });
  page.swap();
  page.render();
  assert.deepEqual(page.pair(), ["paris", "london"]);
  assert.equal(page.location().search, "?from=paris&to=london&utm_source=shared");
  assert.equal(page.location().hash, "#comparison");
  assert.deepEqual(page.location().state, { saved: true });
  page.select(0, "paris");
  assert.equal(page.navigations.length, 1);
  await page.settle();
  assert.equal(analytics.events().length, 0);
  page.select(1, "toronto");
  page.render();
  await page.settle();
  assert.deepEqual(page.pair(), ["paris", "toronto"]);
  assert.equal(analytics.events().length, 1);
  assert.equal(page.historyLength(), 1);
});

test("rapid changes before router commit retain the latest opposite city and replace one entry", async () => {
  const analytics = await readyAnalytics();
  const page = pageHarness(analytics, undefined, { search: "?from=london&to=paris" });
  page.select(0, "toronto");
  page.select(1, "vancouver");
  page.select(1, "vancouver");
  page.render();
  page.tick();
  await page.settle();
  assert.deepEqual(page.pair(), ["toronto", "vancouver"]);
  assert.equal(page.location().search, "?from=toronto&to=vancouver");
  assert.equal(page.navigations.length, 2);
  assert.equal(page.historyLength(), 1);
  assert.deepEqual(analytics.events().map((event) => [event[2].from_city_slug, event[2].to_city_slug]), [
    ["toronto", "paris"], ["toronto", "vancouver"],
  ]);
});

test("back and forward restore URL pairs without events or stale opposite cities", async () => {
  const analytics = await readyAnalytics();
  const page = pageHarness(analytics, undefined, { search: "?from=london&to=paris" });
  page.select(0, "toronto");
  page.render();
  await page.settle();
  page.visit("?from=tokyo&to=sydney");
  page.back();
  assert.deepEqual(page.pair(), ["toronto", "paris"]);
  page.forward();
  assert.deepEqual(page.pair(), ["tokyo", "sydney"]);
  assert.equal(analytics.events().length, 1);
  page.select(0, "london");
  page.render();
  await page.settle();
  assert.deepEqual(page.pair(), ["london", "sydney"]);
  assert.equal(analytics.events().length, 2);
  assert.equal(analytics.events()[1][2].to_city_slug, "sydney");
  page.back();
  page.select(1, "london");
  page.render();
  await page.settle();
  assert.deepEqual(page.pair(), ["toronto", "london"]);
  assert.equal(analytics.events().length, 3);
  assert.equal(page.historyLength(), 2);
});

test("revisiting the same history key cannot reuse a pair pending from an earlier render", async () => {
  const analytics = await readyAnalytics();
  const page = pageHarness(analytics, undefined, { search: "?from=london&to=paris", key: "revisited" });
  page.select(0, "toronto");
  page.render();
  await page.settle();
  page.visit("?from=tokyo&to=sydney");
  page.visit("?from=london&to=paris", { key: "revisited" });
  page.select(1, "vancouver");
  page.render();
  await page.settle();
  assert.deepEqual(page.pair(), ["london", "vancouver"]);
  assert.equal(analytics.events().length, 2);
  assert.equal(analytics.events()[1][2].from_city_slug, "london");
});

test("navigation to a partial URL discards the old pair, including for a subsequent swap", async () => {
  const analytics = await readyAnalytics();
  const page = pageHarness(analytics, undefined, { search: "?from=london&to=paris" });
  page.select(0, "tokyo");
  page.render();
  await page.settle();
  page.visit("?to=london&campaign=test");
  assert.deepEqual(page.pair(), ["toronto", "vancouver"]);
  page.swap();
  page.render();
  assert.deepEqual(page.pair(), ["vancouver", "toronto"]);
  assert.equal(page.location().search, "?to=toronto&campaign=test&from=vancouver");
  assert.equal(analytics.events().length, 1);
});

test("URL hydration and pre-consent URL updates never replay after acceptance", async () => {
  const analytics = analyticsHarness();
  const page = pageHarness(analytics, undefined, { search: "?from=london&to=paris" });
  page.select(0, "toronto");
  page.render();
  await page.settle();
  assert.equal(analytics.scripts.length, 0);
  analytics.context.setAnalyticsConsent(true);
  const loading = analytics.context.loadAnalytics();
  analytics.finishLoad();
  await loading;
  page.tick();
  page.visit("?from=tokyo&to=sydney");
  page.back();
  page.select(0, "toronto");
  await page.settle();
  assert.equal(analytics.events().length, 0);
  page.select(1, "london");
  page.render();
  await page.settle();
  assert.equal(analytics.events().length, 1);
});

test("query changes leave the calculator structured-data URL unchanged", () => {
  const page = pageHarness(analyticsHarness(), undefined, { search: "?from=london&to=paris" });
  assert.equal(page.structuredData().url, "https://example.test/time-difference");
  page.swap();
  page.render();
  assert.equal(page.structuredData().url, "https://example.test/time-difference");
});

test("copy uses the production utility and tracks exactly the canonical slugs without navigation", async () => {
  for (const [search, expected] of [
    ["?from=toronto&to=london&utm_source=test&tag=one&tag=two", "from=toronto&to=london"],
    ["?to=paris&from=%6Condon", "from=london&to=paris"],
    ["", "from=toronto&to=vancouver"],
    ["?from=london", "from=toronto&to=vancouver"],
    ["?from=unknown&to=paris", "from=toronto&to=vancouver"],
    ["?from=london&from=toronto&to=paris", "from=toronto&to=vancouver"],
    ["?from=%ZZ&to=paris", "from=toronto&to=vancouver"],
    ["?from=london&to=london", "from=london&to=london"],
  ]) {
    const analytics = await readyAnalytics();
    const page = pageHarness(analytics, undefined, {
      search, hash: "#calculator", state: { source: "private-router-state" },
    }, { getSiteUrl: siteContext.getSiteUrl });
    const location = page.location();
    const fullComparisonLink = page.links()[0].props.to;
    assert.equal(page.copyLabel(), "Copy comparison link");
    assert.equal(page.status().children.join(""), "");
    await page.copy();
    await page.settle();
    page.render();
    assert.deepEqual(page.clipboardWrites, [`https://www.youhora.com/time-difference?${expected}`]);
    const expectedParams = new URLSearchParams(expected);
    assert.deepEqual(JSON.parse(JSON.stringify(analytics.copyEvents())), [[
      "event", "comparison_link_copied", {
        from_city_slug: expectedParams.get("from"),
        to_city_slug: expectedParams.get("to"),
      },
    ]]);
    assert.equal(analytics.events().length, 0);
    assert.equal(page.location(), location);
    assert.equal(page.historyLength(), 1);
    assert.equal(page.navigations.length, 0);
    assert.equal(page.links()[0].props.to, fullComparisonLink);
    assert.equal(page.copyButton().props.type, "button");
    assert.equal(page.copyButton().props.disabled, undefined);
    assert.equal(page.copyButton().props.key, undefined);
    assert.equal(page.status().props["aria-atomic"], "true");
  }
});

test("specific copy is canonical, strips extras and preserves the analytics contract", async () => {
  for (const [search, expected] of [
    [
      "?campaign=test&from=toronto&to=london&mode=specific&date=2027-01-15&time=09%3A00&tag=one&tag=two",
      "https://www.youhora.com/time-difference?from=toronto&to=london&mode=specific&date=2027-01-15&time=09%3A00",
    ],
    [
      "?from=toronto&to=london&mode=specific&date=2027-11-07&time=01%3A30&occurrence=later&utm_source=shared",
      "https://www.youhora.com/time-difference?from=toronto&to=london&mode=specific&date=2027-11-07&time=01%3A30&occurrence=later",
    ],
  ]) {
    const analytics = await readyAnalytics();
    const page = pageHarness(analytics, undefined, {
      search, hash: "#private", state: { private: true },
    }, { getSiteUrl: siteContext.getSiteUrl });
    const location = page.location();
    await page.copy();
    await page.settle();
    page.render();
    assert.deepEqual(page.clipboardWrites, [expected]);
    assert.deepEqual(JSON.parse(JSON.stringify(analytics.copyEvents())), [[
      "event", "comparison_link_copied", {
        from_city_slug: "toronto",
        to_city_slug: "london",
      },
    ]]);
    assert.equal(analytics.events().length, 0);
    assert.equal(page.location(), location);
    assert.equal(page.historyLength(), 1);
    assert.equal(page.navigations.length, 0);
  }
});

test("specific date, time and occurrence changes invalidate stale copy feedback by full target", async () => {
  const page = pageHarness(analyticsHarness(), undefined, {
    search: "?from=toronto&to=london&mode=specific&date=2027-01-15&time=09%3A00",
  });
  await page.copy();
  page.render();
  assert.equal(page.copyLabel(), "Link copied");
  assert.equal(page.timerCount(), 1);

  page.setInput("time", "10:00");
  assert.equal(page.copyLabel(), "Copy comparison link");
  assert.equal(page.timerCount(), 0);
  await page.copy();
  page.render();
  assert.equal(page.copyLabel(), "Link copied");

  page.setInput("date", "2027-11-07");
  page.setInput("time", "01:30");
  assert.equal(page.copyButton().props.disabled, true);
  assert.equal(page.copyLabel(), "Copy comparison link");
  page.chooseOccurrence("earlier");
  assert.equal(page.copyButton().props.disabled, false);
  await page.copy();
  assert.deepEqual(page.clipboardWrites, [
    "https://example.test/time-difference?from=toronto&to=london&mode=specific&date=2027-01-15&time=09%3A00",
    "https://example.test/time-difference?from=toronto&to=london&mode=specific&date=2027-01-15&time=10%3A00",
    "https://example.test/time-difference?from=toronto&to=london&mode=specific&date=2027-11-07&time=01%3A30&occurrence=earlier",
  ]);
});

test("copy tracks dropdown, swap and history results without changing other analytics calls", async () => {
  const analytics = await readyAnalytics();
  const page = pageHarness(analytics, undefined, { search: "?from=toronto&to=london" }, {
    getSiteUrl: siteContext.getSiteUrl,
  });
  page.select(1, "paris");
  page.render();
  await page.settle();
  assert.equal(analytics.events().length, 1);
  const beforeCopy = analytics.calls();
  await page.copy();
  page.swap();
  page.render();
  await page.copy();
  page.visit("?from=tokyo&to=sydney");
  await page.copy();
  page.back();
  await page.copy();
  page.forward();
  await page.copy();
  await page.settle();
  assert.deepEqual(page.clipboardWrites, [
    "https://www.youhora.com/time-difference?from=toronto&to=paris",
    "https://www.youhora.com/time-difference?from=paris&to=toronto",
    "https://www.youhora.com/time-difference?from=tokyo&to=sydney",
    "https://www.youhora.com/time-difference?from=paris&to=toronto",
    "https://www.youhora.com/time-difference?from=tokyo&to=sydney",
  ]);
  assert.deepEqual(analytics.copyEvents().map((event) => [event[2].from_city_slug, event[2].to_city_slug]), [
    ["toronto", "paris"], ["paris", "toronto"], ["tokyo", "sydney"],
    ["paris", "toronto"], ["tokyo", "sydney"],
  ]);
  assert.deepEqual(analytics.calls().filter((call) => call[1] !== "comparison_link_copied"), beforeCopy);
  assert.equal(page.navigations.length, 2); // Dropdown and Swap only.
});

test("copy success announces and resets after two seconds, with one timer across repeat clicks and ticks", async () => {
  const analytics = await readyAnalytics();
  const page = pageHarness(analytics);
  page.replayEffects(); // Development Strict Mode cleanup/setup must leave copying usable.
  await page.copy();
  await page.settle();
  page.render();
  assert.equal(page.copyLabel(), "Link copied");
  assert.equal(analytics.copyEvents().length, 1);
  assert.equal(page.status().children.join(""), "Link copied");
  assert.equal(page.timerCount(), 1);
  page.advance(1500);
  page.tick();
  assert.equal(page.copyLabel(), "Link copied");
  await page.copy();
  await page.settle();
  page.render();
  assert.equal(analytics.copyEvents().length, 2);
  assert.equal(page.timerCount(), 1);
  page.advance(500); // The original reset must have been cancelled.
  assert.equal(page.copyLabel(), "Link copied");
  page.advance(1499);
  assert.equal(page.copyLabel(), "Link copied");
  page.advance(1);
  assert.equal(page.copyLabel(), "Copy comparison link");
  assert.equal(page.status().children.join(""), "");
  assert.equal(page.timerCount(), 0);
  await page.settle();
  assert.equal(analytics.copyEvents().length, 2);
});

test("unavailable clipboard, synchronous exceptions and rejections briefly announce failure and allow retry", async () => {
  for (const navigator of [
    {},
    { clipboard: {} },
    { clipboard: { writeText: () => { throw new Error("clipboard blocked"); } } },
    { clipboard: { writeText: () => Promise.reject(new Error("permission denied")) } },
    { get clipboard() { throw new Error("clipboard unavailable"); } },
  ]) {
    const analytics = await readyAnalytics();
    const page = pageHarness(analytics, undefined, {}, { navigator });
    await page.copy();
    await page.settle();
    page.render();
    assert.equal(analytics.copyEvents().length, 0);
    assert.equal(page.copyLabel(), "Copy failed");
    assert.equal(page.status().children.join(""), "Copy failed");
    page.advance(1999);
    assert.equal(page.copyLabel(), "Copy failed");
    page.advance(1);
    assert.equal(page.copyLabel(), "Copy comparison link");
    assert.equal(page.status().children.join(""), "");
    await page.settle();
    assert.equal(analytics.copyEvents().length, 0);
    Object.defineProperty(navigator, "clipboard", { value: { writeText: async () => {} } });
    await page.copy();
    await page.settle();
    page.render();
    assert.equal(page.copyLabel(), "Link copied");
    assert.equal(analytics.copyEvents().length, 1);
  }
});

test("rapid clicks and re-renders track once only after clipboard success, never on the two-second reset", async () => {
  let finish;
  let writes = 0;
  const clipboardPromise = new Promise((resolve) => { finish = resolve; });
  const analytics = await readyAnalytics();
  const page = pageHarness(analytics, undefined, {}, {
    navigator: { clipboard: { writeText: () => { writes++; return clipboardPromise; } } },
  });
  page.replayEffects(); // Exercise the Strict Mode cleanup/setup sequence.
  page.render();
  await page.settle();
  assert.equal(analytics.copyEvents().length, 0);
  const first = page.copy();
  await Promise.all([page.copy(), page.copy(), page.copy()]);
  page.render();
  page.tick();
  await page.settle();
  assert.equal(analytics.copyEvents().length, 0);
  assert.equal(writes, 1);
  assert.equal(page.copyLabel(), "Copy comparison link");
  assert.equal(page.timerCount(), 0);
  finish();
  await first;
  await page.settle();
  page.render();
  assert.equal(page.copyLabel(), "Link copied");
  assert.equal(page.timerCount(), 1);
  assert.equal(analytics.copyEvents().length, 1);
  page.render();
  page.render();
  page.tick();
  await page.settle();
  assert.equal(analytics.copyEvents().length, 1);
  page.advance(1999);
  assert.equal(page.copyLabel(), "Link copied");
  page.advance(1);
  assert.equal(page.copyLabel(), "Copy comparison link");
  assert.equal(page.timerCount(), 0);
  page.replayEffects();
  page.render();
  await page.settle();
  assert.equal(analytics.copyEvents().length, 1);
});

test("late clipboard results leave feedback untouched after pair changes and track only the successfully copied pair", async () => {
  for (const outcome of ["resolve", "reject"]) {
    for (const returnToOriginal of [false, true]) {
      let finish;
      let writes = 0;
      const clipboardPromise = new Promise((resolve, reject) => {
        finish = outcome === "resolve" ? resolve : () => reject(new Error("late failure"));
      });
      const analytics = await readyAnalytics();
      const page = pageHarness(analytics, undefined, {}, {
        navigator: { clipboard: { writeText: () => { writes++; return clipboardPromise; } } },
      });
      const pendingCopy = page.copy();
      page.select(1, "london");
      page.render();
      if (returnToOriginal) {
        page.select(1, "vancouver");
        page.render();
      }
      await page.copy(); // A comparison change must not unlock an outstanding write.
      assert.equal(writes, 1);
      finish();
      await pendingCopy;
      await page.settle();
      page.render();
      assert.deepEqual(JSON.parse(JSON.stringify(analytics.copyEvents())), outcome === "resolve" ? [[
        "event", "comparison_link_copied", { from_city_slug: "toronto", to_city_slug: "vancouver" },
      ]] : []);
      assert.equal(page.copyLabel(), "Copy comparison link");
      assert.equal(page.status().children.join(""), "");
      assert.equal(page.timerCount(), 0);
      page.navigator.clipboard.writeText = async () => {};
      await page.copy();
      page.render();
      assert.equal(page.copyLabel(), "Link copied");
    }
  }
});

test("comparison changes clear feedback and reset timers without resurrecting an old message", async () => {
  const page = pageHarness(analyticsHarness());
  await page.copy();
  page.render();
  page.advance(1000);
  page.swap();
  page.render();
  assert.equal(page.copyLabel(), "Copy comparison link");
  assert.equal(page.status().children.join(""), "");
  assert.equal(page.timerCount(), 0);
  page.swap();
  page.render();
  assert.equal(page.copyLabel(), "Copy comparison link");
  await page.copy();
  page.render();
  page.advance(1000);
  assert.equal(page.copyLabel(), "Link copied");
  page.advance(1000);
  assert.equal(page.copyLabel(), "Copy comparison link");
});

test("unmount clears the reset timer and prevents pending success or failure from updating state", async () => {
  const page = pageHarness(analyticsHarness());
  await page.copy();
  assert.equal(page.timerCount(), 1);
  page.unmount();
  assert.equal(page.timerCount(), 0);
  for (const outcome of ["resolve", "reject"]) {
    let finish;
    const clipboardPromise = new Promise((resolve, reject) => {
      finish = outcome === "resolve" ? resolve : () => reject(new Error("late failure"));
    });
    const pendingPage = pageHarness(analyticsHarness(), undefined, {}, {
      navigator: { clipboard: { writeText: () => clipboardPromise } },
    });
    const operation = pendingPage.copy();
    pendingPage.unmount();
    finish();
    await operation;
    assert.equal(pendingPage.timerCount(), 0);
  }
});

test("copy tracks only with granted consent and leaves other analytics and consent calls untouched", async () => {
  for (const consent of ["absent", "denied", "granted"]) {
    const analytics = consent === "granted" ? await readyAnalytics() : analyticsHarness();
    if (consent === "denied") analytics.context.setAnalyticsConsent(false);
    analytics.context.trackPageView({ path: "/time-difference", title: "Calculator" });
    const page = pageHarness(analytics);
    const before = analytics.calls();
    const scripts = analytics.scripts.length;
    const disabled = analytics.window["ga-disable-G-TEST"];
    await page.copy();
    await page.settle();
    page.advance(2000);
    page.navigator.clipboard.writeText = () => Promise.reject(new Error("denied"));
    await page.copy();
    page.advance(2000);
    await page.settle();
    assert.equal(analytics.copyEvents().length, consent === "granted" ? 1 : 0);
    assert.deepEqual(analytics.calls().filter((call) => call[1] !== "comparison_link_copied"), before);
    assert.equal(analytics.scripts.length, scripts);
    assert.equal(analytics.window["ga-disable-G-TEST"], disabled);
    assert.equal(page.navigations.length, 0);
    assert.equal(page.historyLength(), 1);
    if (consent !== "granted") {
      assert.equal(scripts, 0);
      analytics.context.setAnalyticsConsent(true);
      const loading = analytics.context.loadAnalytics();
      analytics.finishLoad();
      await loading;
      page.render();
      page.tick();
      page.replayEffects();
      await page.settle();
      assert.equal(analytics.copyEvents().length, 0); // Acceptance must not replay earlier copies.
    }
  }
});

test("copy analytics shares the pending loader and sends once without delaying success feedback", async () => {
  const analytics = analyticsHarness();
  analytics.context.setAnalyticsConsent(true);
  const loading = analytics.context.loadAnalytics();
  const page = pageHarness(analytics);
  await page.copy();
  page.render();
  assert.equal(page.copyLabel(), "Link copied");
  assert.equal(analytics.scripts.length, 1);
  assert.equal(analytics.copyEvents().length, 0);
  page.advance(2000);
  page.tick();
  assert.equal(page.copyLabel(), "Copy comparison link");
  assert.equal(analytics.copyEvents().length, 0);
  analytics.finishLoad();
  await loading;
  await page.settle();
  assert.equal(analytics.copyEvents().length, 1);
  page.render();
  await page.settle();
  assert.equal(analytics.copyEvents().length, 1);
});

test("withdrawal cancels pending copy events even after reacceptance, but repeated grants do not", async () => {
  for (const choice of ["withdraw", "reaccept", "repeat-grant"]) {
    const analytics = analyticsHarness();
    analytics.context.setAnalyticsConsent(true);
    const page = pageHarness(analytics);
    await page.copy();
    assert.equal(analytics.copyEvents().length, 0);
    if (choice !== "repeat-grant") analytics.context.setAnalyticsConsent(false);
    if (choice !== "withdraw") analytics.context.setAnalyticsConsent(true);
    analytics.finishLoad();
    await page.settle();
    page.render();
    assert.equal(page.copyLabel(), "Link copied");
    assert.equal(analytics.copyEvents().length, choice === "repeat-grant" ? 1 : 0);
  }
});

test("consent withdrawn during a pending clipboard write prevents copy tracking and loading", async () => {
  let finish;
  const clipboardPromise = new Promise((resolve) => { finish = resolve; });
  const analytics = analyticsHarness();
  analytics.context.setAnalyticsConsent(true);
  const page = pageHarness(analytics, undefined, {}, {
    navigator: { clipboard: { writeText: () => clipboardPromise } },
  });
  const operation = page.copy();
  assert.equal(analytics.scripts.length, 0);
  analytics.context.setAnalyticsConsent(false);
  finish();
  await operation;
  await page.settle();
  page.render();
  assert.equal(page.copyLabel(), "Link copied");
  assert.equal(analytics.scripts.length, 0);
  assert.equal(analytics.copyEvents().length, 0);
});

test("analytics load or dispatch failures and development preserve successful copy feedback without events", async () => {
  for (const mode of ["load-failure", "dispatch-failure", "development"]) {
    const analytics = mode === "dispatch-failure" ? await readyAnalytics() : analyticsHarness(mode !== "development");
    analytics.context.setAnalyticsConsent(true);
    if (mode === "dispatch-failure") {
      analytics.window.gtag = () => { throw new Error("analytics unavailable"); };
    }
    const page = pageHarness(analytics);
    await page.copy();
    if (mode === "load-failure") analytics.finishLoad("error");
    await page.settle();
    page.render();
    assert.equal(page.clipboardWrites.length, 1);
    assert.equal(page.copyLabel(), "Link copied");
    assert.equal(analytics.copyEvents().length, 0);
    if (mode === "development") assert.equal(analytics.scripts.length, 0);
    page.advance(2000);
    assert.equal(page.copyLabel(), "Copy comparison link");
  }
});
