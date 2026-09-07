import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import { transformWithOxc } from "vite";
import { cities } from "../src/data/cities.js";
import * as dateTime from "../src/utils/dateTime.js";

const analyticsSource = await readFile(new URL("../src/utils/analytics.js", import.meta.url), "utf8");
const pageSource = await readFile(new URL("../src/pages/TimeDifferencePage.jsx", import.meta.url), "utf8");
const { code: pageCode } = await transformWithOxc(pageSource, "TimeDifferencePage.jsx", {
  jsx: { runtime: "classic", pragma: "createElement" },
});
const withoutImports = (source) => source.replace(/^import[\s\S]*?;\r?\n/gm, "");

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

// Isolate real JSX handlers with a small state/ref harness, without a DOM dependency.
// Repeated render calls exercise side-effect isolation; this is not a React renderer.
function pageHarness(analytics, calculate = dateTime.getTimeDifferenceMinutes) {
  const slots = [];
  const pending = [];
  let index = 0;
  let tree;
  let now = new Date("2026-09-07T12:00:00Z");
  const context = vm.createContext({
    ...dateTime,
    getTimeDifferenceMinutes: calculate,
    cities,
    siteConfig: { publicSiteName: "Test" },
    getSiteUrl: (path) => `https://example.test${path}`,
    Link: "Link", StructuredData: "StructuredData",
    createElement: (type, props, ...children) => ({ type, props: props || {}, children }),
    useNow: () => now,
    useState(initial) {
      const slot = index++;
      if (!(slot in slots)) slots[slot] = initial;
      return [slots[slot], (value) => { slots[slot] = value; }];
    },
    useRef(initial) {
      const slot = index++;
      if (!(slot in slots)) slots[slot] = { current: initial };
      return slots[slot];
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
    index = 0;
    tree = context.TimeDifferencePage();
  }
  render();
  return {
    render,
    tick() { now = new Date(now.getTime() + 1000); render(); },
    select(field, value) { nodes("select")[field].props.onChange({ target: { value } }); },
    swap() { nodes("button")[0].props.onClick(); },
    pair: () => nodes("select").map((node) => node.props.value),
    links: () => nodes("Link"),
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
