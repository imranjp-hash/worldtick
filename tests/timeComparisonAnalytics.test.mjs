import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import { transformWithOxc } from "vite";
import { cities } from "../src/data/cities.js";
import * as dateTime from "../src/utils/dateTime.js";

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
    trackTimeComparisonCompleted(params) {
      pending.push(analytics.context.trackTimeComparisonCompleted(params));
    },
  });
  vm.runInContext(withoutImports(pageCode).replace("export default function", "function"), context);
  function nodes(type, node = tree) {
    if (!node || typeof node !== "object") return [];
    if (Array.isArray(node)) return node.flatMap((child) => nodes(type, child));
    return [...(node.type === type ? [node] : []), ...nodes(type, node.children)];
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
    copy: () => nodes("button").find((node) => node.props.type === "button").props.onClick(),
    copyButton: () => nodes("button").find((node) => node.props.type === "button"),
    copyLabel: () => nodes("button").find((node) => node.props.type === "button").children.join(""),
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
    swap() { nodes("button")[0].props.onClick(); },
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

test("copy uses the production utility and only the canonical displayed pair without navigation", async () => {
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
    const page = pageHarness(analyticsHarness(), undefined, {
      search, hash: "#calculator", state: { source: "private-router-state" },
    }, { getSiteUrl: siteContext.getSiteUrl });
    const location = page.location();
    const fullComparisonLink = page.links()[0].props.to;
    assert.equal(page.copyLabel(), "Copy comparison link");
    assert.equal(page.status().children.join(""), "");
    await page.copy();
    page.render();
    assert.deepEqual(page.clipboardWrites, [`https://www.youhora.com/time-difference?${expected}`]);
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

test("copy follows dropdown, swap and history results without adding analytics calls", async () => {
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
  assert.deepEqual(page.clipboardWrites, [
    "https://www.youhora.com/time-difference?from=toronto&to=paris",
    "https://www.youhora.com/time-difference?from=paris&to=toronto",
    "https://www.youhora.com/time-difference?from=tokyo&to=sydney",
    "https://www.youhora.com/time-difference?from=paris&to=toronto",
    "https://www.youhora.com/time-difference?from=tokyo&to=sydney",
  ]);
  assert.deepEqual(analytics.calls(), beforeCopy);
  assert.equal(page.navigations.length, 2); // Dropdown and Swap only.
});

test("copy success announces and resets after two seconds, with one timer across repeat clicks and ticks", async () => {
  const page = pageHarness(analyticsHarness());
  page.replayEffects(); // Development Strict Mode cleanup/setup must leave copying usable.
  await page.copy();
  page.render();
  assert.equal(page.copyLabel(), "Link copied");
  assert.equal(page.status().children.join(""), "Link copied");
  assert.equal(page.timerCount(), 1);
  page.advance(1500);
  page.tick();
  assert.equal(page.copyLabel(), "Link copied");
  await page.copy();
  page.render();
  assert.equal(page.timerCount(), 1);
  page.advance(500); // The original reset must have been cancelled.
  assert.equal(page.copyLabel(), "Link copied");
  page.advance(1499);
  assert.equal(page.copyLabel(), "Link copied");
  page.advance(1);
  assert.equal(page.copyLabel(), "Copy comparison link");
  assert.equal(page.status().children.join(""), "");
  assert.equal(page.timerCount(), 0);
});

test("unavailable clipboard, synchronous exceptions and rejections briefly announce failure and allow retry", async () => {
  for (const navigator of [
    {},
    { clipboard: {} },
    { clipboard: { writeText: () => { throw new Error("clipboard blocked"); } } },
    { clipboard: { writeText: () => Promise.reject(new Error("permission denied")) } },
    { get clipboard() { throw new Error("clipboard unavailable"); } },
  ]) {
    const page = pageHarness(analyticsHarness(), undefined, {}, { navigator });
    await page.copy();
    page.render();
    assert.equal(page.copyLabel(), "Copy failed");
    assert.equal(page.status().children.join(""), "Copy failed");
    page.advance(1999);
    assert.equal(page.copyLabel(), "Copy failed");
    page.advance(1);
    assert.equal(page.copyLabel(), "Copy comparison link");
    assert.equal(page.status().children.join(""), "");
    Object.defineProperty(navigator, "clipboard", { value: { writeText: async () => {} } });
    await page.copy();
    page.render();
    assert.equal(page.copyLabel(), "Link copied");
  }
});

test("rapid clicks start only one pending clipboard write", async () => {
  let finish;
  let writes = 0;
  const clipboardPromise = new Promise((resolve) => { finish = resolve; });
  const page = pageHarness(analyticsHarness(), undefined, {}, {
    navigator: { clipboard: { writeText: () => { writes++; return clipboardPromise; } } },
  });
  const first = page.copy();
  await Promise.all([page.copy(), page.copy(), page.copy()]);
  page.render();
  assert.equal(writes, 1);
  assert.equal(page.copyLabel(), "Copy comparison link");
  assert.equal(page.timerCount(), 0);
  finish();
  await first;
  page.render();
  assert.equal(page.copyLabel(), "Link copied");
  assert.equal(page.timerCount(), 1);
});

test("old clipboard success or failure is ignored after a pair change, including a return to the old pair", async () => {
  for (const outcome of ["resolve", "reject"]) {
    for (const returnToOriginal of [false, true]) {
      let finish;
      let writes = 0;
      const clipboardPromise = new Promise((resolve, reject) => {
        finish = outcome === "resolve" ? resolve : () => reject(new Error("late failure"));
      });
      const page = pageHarness(analyticsHarness(), undefined, {}, {
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
      page.render();
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

test("copy success, reset and failure leave all analytics and consent calls untouched", async () => {
  for (const consent of ["absent", "denied", "granted"]) {
    const analytics = consent === "granted" ? await readyAnalytics() : analyticsHarness();
    if (consent === "denied") analytics.context.setAnalyticsConsent(false);
    analytics.context.trackPageView({ path: "/time-difference", title: "Calculator" });
    const page = pageHarness(analytics);
    const before = analytics.calls();
    const scripts = analytics.scripts.length;
    const disabled = analytics.window["ga-disable-G-TEST"];
    await page.copy();
    page.advance(2000);
    page.navigator.clipboard.writeText = () => Promise.reject(new Error("denied"));
    await page.copy();
    page.advance(2000);
    assert.deepEqual(analytics.calls(), before);
    assert.equal(analytics.scripts.length, scripts);
    assert.equal(analytics.window["ga-disable-G-TEST"], disabled);
    assert.equal(page.navigations.length, 0);
    assert.equal(page.historyLength(), 1);
    if (consent !== "granted") assert.equal(scripts, 0);
  }
});
