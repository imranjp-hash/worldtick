import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import test from "node:test";
import React from "react";
import { transformWithOxc } from "vite";
import { ClockContext } from "../src/context/clockContext.js";
import { cities } from "../src/data/cities.js";
import * as planner from "../src/utils/meetingPlanner.js";
import * as dateTime from "../src/utils/dateTime.js";
import * as calendarEvent from "../src/utils/calendarEvent.js";
import * as ics from "../src/utils/ics.js";
import * as plannerUrl from "../src/utils/meetingPlannerUrl.js";

// A minimal in-memory DOM host for the installed React DOM renderer. It supplies
// node operations, not React scheduling, hooks, context, memoization or effects.
// Layout and native browser event behavior are deliberately outside this test.
function memoryDom() {
  const descendants = (node) => node.childNodes.flatMap((child) => [child, ...descendants(child)]);
  class HostNode {
    constructor(nodeType, nodeName, ownerDocument) {
      Object.assign(this, { nodeType, nodeName, ownerDocument, parentNode: null, childNodes: [],
        tagName: nodeType === 1 ? nodeName : undefined, namespaceURI: "http://www.w3.org/1999/xhtml",
        attributes: new Map(), style: { setProperty() {}, removeProperty() {} }, value: "", checked: false });
      this.text = "";
    }
    get firstChild() { return this.childNodes[0] ?? null; }
    get nextSibling() { return this.parentNode?.childNodes[this.parentNode.childNodes.indexOf(this) + 1] ?? null; }
    get options() { return descendants(this).filter((node) => node.nodeName === "OPTION"); }
    get textContent() { return this.nodeType === 3 ? this.nodeValue : this.text + this.childNodes.map((node) => node.textContent).join(""); }
    set textContent(value) {
      this.text = String(value);
      this.childNodes.forEach((node) => { node.parentNode = null; }); this.childNodes = [];
      if (this.nodeType === 3) this.nodeValue = this.text;
    }
    appendChild(node) {
      node.parentNode?.removeChild(node); node.parentNode = this; this.childNodes.push(node); return node;
    }
    insertBefore(node, before) {
      node.parentNode?.removeChild(node); node.parentNode = this;
      const index = this.childNodes.indexOf(before);
      this.childNodes.splice(index < 0 ? this.childNodes.length : index, 0, node); return node;
    }
    removeChild(node) { this.childNodes.splice(this.childNodes.indexOf(node), 1); node.parentNode = null; return node; }
    setAttribute(name, value) { this.attributes.set(name, String(value)); }
    getAttribute(name) { return this.attributes.get(name) ?? null; }
    removeAttribute(name) { this.attributes.delete(name); }
    addEventListener() {}
    removeEventListener() {}
    getRootNode() { let node = this; while (node.parentNode) node = node.parentNode; return node; }
    querySelectorAll() { return []; }
    focus() { this.ownerDocument.activeElement = this; }
  }
  const document = new HostNode(9, "#document", null);
  document.createElement = (name) => new HostNode(1, name.toUpperCase(), document);
  document.createElementNS = (namespace, name) => Object.assign(document.createElement(name), { namespaceURI: namespace });
  document.createTextNode = (text) => Object.assign(new HostNode(3, "#text", document), { nodeValue: String(text) });
  document.documentElement = document.createElement("html"); document.appendChild(document.documentElement);
  document.body = document.createElement("body"); document.documentElement.appendChild(document.body);
  document.activeElement = document.body;
  const intervals = new Map(); let nextInterval = 0;
  const timers = new Map(); let nextTimer = 0;
  const window = { document, HTMLIFrameElement: class {},
    setTimeout(callback) { timers.set(++nextTimer, callback); return nextTimer; },
    clearTimeout(id) { timers.delete(id); },
    setInterval(callback) { intervals.set(++nextInterval, callback); return nextInterval; },
    clearInterval(id) { intervals.delete(id); } };
  document.defaultView = window;
  return { document, window, intervals, timers };
}

async function loadComponent(file, dependencies) {
  const source = await readFile(new URL(`../${file}`, import.meta.url), "utf8");
  const { code } = await transformWithOxc(source, file, {
    jsx: { runtime: "classic", pragma: "createElement", pragmaFrag: "React.Fragment" },
  });
  const context = vm.createContext({ React, ...React, ...dependencies });
  vm.runInContext(code.replace(/^import[\s\S]*?;\r?\n/gm, "").replace("export default ", "const component = "), context);
  return vm.runInContext("component", context);
}

test("real React clock updates bypass the planner memo body, engine and city formatting", async (t) => {
  const dom = memoryDom();
  const globalKeys = ["document", "window", "IS_REACT_ACT_ENVIRONMENT"];
  const originals = globalKeys.map((key) => Object.getOwnPropertyDescriptor(globalThis, key));
  Object.assign(globalThis, { document: dom.document, window: dom.window, IS_REACT_ACT_ENVIRONMENT: true });
  let root;
  t.after(async () => {
    if (root) await React.act(async () => root.unmount());
    globalKeys.forEach((key, index) => {
      if (originals[index]) Object.defineProperty(globalThis, key, originals[index]);
      else delete globalThis[key];
    });
  });
  const { createRoot } = await import("react-dom/client");
  const router = await import("react-router-dom");
  const clock = { epoch: Date.UTC(2026, 0, 1) };
  class ClockDate extends Date {
    constructor(...args) { super(...(args.length ? args : [clock.epoch])); }
  }
  const counts = { parent: 0, page: 0, control: 0, engine: 0, cityFormatting: 0 };
  const actions = {};
  // Capture declared input callbacks while delegating element creation to React.
  // act() then commits real state updates; no private DOM/fiber API is inspected.
  const createElement = (type, props, ...children) => {
    if (props?.id === "meeting-date") actions.date = props.onChange;
    if (props?.type === "radio" && !actions.select) actions.select = props.onChange;
    return React.createElement(type, props, ...children);
  };
  const common = { createElement, ClockContext, Date: ClockDate, window: dom.window };
  const useNow = await loadComponent("src/hooks/useNow.js", common);
  const control = await loadComponent("src/components/PlannerCalendarDownloadControl.jsx", {
    ...common, ...calendarEvent, ...ics,
    useNow() { counts.control++; return useNow(); },
  });
  const usePlannerSharing = await loadComponent("src/hooks/usePlannerSharing.js", {
    ...common, ...plannerUrl, getSiteUrl: (path) => `https://www.youhora.com${path}`,
  });
  const page = await loadComponent("src/pages/MeetingPlannerPage.jsx", {
    ...common, ...router, ...planner, ...dateTime, ...plannerUrl, cities, useNow, usePlannerSharing,
    PlannerCalendarDownloadControl: control,
    generateMeetingPlan(input) { counts.engine++; return planner.generateMeetingPlan(input); },
    ...Object.fromEntries(["formatDateInZone", "formatTimeInZone", "getTimeZoneDisplay"].map((name) => [name, (...args) => {
      counts.cityFormatting++; return dateTime[name](...args);
    }])),
  });
  // Keep the production-exported memo wrapper and comparator. Count its actual
  // function body without adding a substitute memo boundary to the test tree.
  assert.equal(page.$$typeof, Symbol.for("react.memo"));
  const pageBody = page.type;
  page.type = (props) => { counts.page++; return pageBody(props); };
  const provider = await loadComponent("src/context/ClockProvider.jsx", common);
  function ClockSubscribedParent() {
    React.useContext(ClockContext); counts.parent++;
    // Mirrors App's clock subscription and freshly created, unchanged page props.
    return React.createElement(page);
  }
  const renderHost = dom.document.createElement("div"); dom.document.body.appendChild(renderHost);
  root = createRoot(renderHost);
  await React.act(async () => root.render(React.createElement(React.StrictMode, null,
    React.createElement(router.MemoryRouter, null, React.createElement(provider, null,
      React.createElement(ClockSubscribedParent))))));
  await React.act(async () => actions.date({ target: { value: "2027-03-27" } }));
  await React.act(async () => actions.select());
  assert.match(renderHost.textContent, /Selected meeting/);
  assert.match(renderHost.textContent, /Download calendar event/);
  assert.ok(counts.engine > 0); assert.ok(counts.cityFormatting > 0); assert.ok(counts.control > 0);
  assert.equal(dom.intervals.size, 1, "StrictMode leaves one live ClockProvider timer");
  const before = { ...counts };
  for (let tick = 0; tick < 6; tick++) {
    clock.epoch += 1000;
    await React.act(async () => { for (const callback of dom.intervals.values()) callback(); });
  }
  assert.ok(counts.parent > before.parent, "the clock-subscribing parent really rerendered");
  assert.ok(counts.control > before.control, "context updates reached the isolated control");
  assert.equal(counts.page, before.page, "production memo skipped the planner function body");
  assert.equal(counts.engine, before.engine);
  assert.equal(counts.cityFormatting, before.cityFormatting);
  // Exercise expiry through the same context/scheduler path, not a control-only render.
  clock.epoch = Date.UTC(2027, 2, 27, 13);
  await React.act(async () => { for (const callback of dom.intervals.values()) callback(); });
  assert.match(renderHost.textContent, /This meeting time has already passed/);
  assert.match(renderHost.textContent, /Selected meeting/);
  assert.equal(counts.page, before.page); assert.equal(counts.engine, before.engine);
  assert.equal(counts.cityFormatting, before.cityFormatting);
});

const inputsA = { citySlugs: ["toronto", "london"], referenceCitySlug: "toronto", referenceDate: "2027-03-27",
  cityPreferences: { toronto: { start: "09:00", end: "17:00" }, london: { start: "09:00", end: "17:00" } } };
const pathA = plannerUrl.buildCanonicalMeetingPlannerPath(inputsA);
const pathB = plannerUrl.buildCanonicalMeetingPlannerPath({ ...inputsA, referenceDate: "2027-03-28" });
const selectedA = plannerUrl.buildCanonicalMeetingPlannerPath(inputsA, 1806152400000);
const selectedB = plannerUrl.buildCanonicalMeetingPlannerPath(inputsA, 1806154200000);

// Actual React scheduling, StrictMode, layout effects and MemoryRouter history.
// Only DOM operations and clipboard/timer browser boundaries are supplied here.
async function navigationHarness(t, initial = "/meeting-planner", options = {}) {
  const dom = memoryDom();
  const globalKeys = ["document", "window", "IS_REACT_ACT_ENVIRONMENT"];
  const originals = globalKeys.map((key) => Object.getOwnPropertyDescriptor(globalThis, key));
  Object.assign(globalThis, { document: dom.document, window: dom.window, IS_REACT_ACT_ENVIRONMENT: true });
  const { createRoot } = await import("react-dom/client");
  const router = await import("react-router-dom");
  const writes = [];
  const navigator = options.navigator ?? { clipboard: { writeText: async (url) => { writes.push(url); } } };
  const captured = { inputs: new Map(), buttons: new Map(), radios: new Map() };
  const createElement = (type, props, ...children) => {
    if (type === "h1") for (const values of Object.values(captured)) values.clear();
    if (props?.id) captured.inputs.set(props.id, props);
    if (type === "button") {
      captured.buttons.set(children.flat(Infinity)
        .filter((child) => typeof child === "string" || typeof child === "number").join(""), props);
      if (props?.["aria-label"]) captured.buttons.set(props["aria-label"], props);
    }
    if (props?.type === "radio") captured.radios.set(props.value, props);
    return React.createElement(type, props, ...children);
  };
  const common = { createElement, window: dom.window, navigator };
  const control = await loadComponent("src/components/PlannerCalendarDownloadControl.jsx", {
    ...common, ...calendarEvent, ...ics, useNow: () => new Date(options.now ?? "2026-01-01T00:00Z"),
    getCurrentEpochMilliseconds: () => Date.parse(options.now ?? "2026-01-01T00:00Z"),
    downloadIcsFile: options.downloadIcsFile ?? (() => {}),
  });
  const sharing = await loadComponent("src/hooks/usePlannerSharing.js", {
    ...common, ...plannerUrl, getSiteUrl: (path) => `https://www.youhora.com${path}`,
  });
  // Observe the public hook input after commit; keep production React state/effects.
  let committedPlanner = null;
  const page = await loadComponent("src/pages/MeetingPlannerPage.jsx", {
    ...common, ...router, ...planner, ...dateTime, ...plannerUrl, cities,
    generateMeetingPlan: options.generateMeetingPlan ?? planner.generateMeetingPlan,
    PlannerCalendarDownloadControl: control,
    usePlannerSharing(state) {
      const actions = sharing(state);
      React.useLayoutEffect(() => {
        committedPlanner = state;
        return () => { if (committedPlanner === state) committedPlanner = null; };
      }, [state]);
      return actions;
    },
    useNavigate() {
      const navigate = router.useNavigate();
      return options.onRecoveryNavigate ? (...args) => {
        options.onRecoveryNavigate(...args);
        return navigate(...args);
      } : navigate;
    },
  });
  let location, navigate;
  function Probe() {
    const current = router.useLocation();
    const currentNavigate = router.useNavigate();
    React.useLayoutEffect(() => { location = current; navigate = currentNavigate; }, [current, currentNavigate]);
    return null;
  }
  const renderHost = dom.document.createElement("div"); dom.document.body.appendChild(renderHost);
  let root = createRoot(renderHost);
  const mount = async (entry) => React.act(async () => root.render(React.createElement(React.StrictMode, null,
    React.createElement(router.MemoryRouter, { initialEntries: [entry] },
      React.createElement(Probe), React.createElement(page)))));
  await mount(initial);
  t.after(async () => {
    if (root) await React.act(async () => root.unmount());
    globalKeys.forEach((key, index) => {
      if (originals[index]) Object.defineProperty(globalThis, key, originals[index]);
      else delete globalThis[key];
    });
  });
  return {
    dom, writes, navigator, captured,
    state: () => committedPlanner,
    text: () => renderHost.textContent,
    location: () => location,
    input: (id) => captured.inputs.get(id),
    button: (label) => captured.buttons.get(label),
    radio: (epoch) => captured.radios.get(epoch),
    async go(destination) { await React.act(async () => { await navigate(destination); }); },
    async change(id, value) { await React.act(async () => captured.inputs.get(id).onChange({ target: { value } })); },
    async select(epoch) { await React.act(async () => captured.radios.get(epoch).onChange()); },
    async click(label) { await React.act(async () => { await captured.buttons.get(label).onClick(); }); },
    async invoke(handler) { await React.act(async () => { await handler(); }); },
    async refresh() {
      const entry = location.pathname + location.search + location.hash;
      await React.act(async () => root.unmount());
      root = createRoot(renderHost);
      await mount(entry);
    },
    async unmount() { await React.act(async () => root.unmount()); root = null; },
    async resetFeedback() { await React.act(async () => {
      for (const [id, callback] of dom.timers) { dom.timers.delete(id); callback(); }
    }); },
  };
}

test("real router default to A to B Back Forward and refresh replace the local draft atomically", async (t) => {
  const page = await navigationHarness(t);
  assert.equal(page.input("meeting-date").value, "");
  await page.go(pathA); assert.equal(page.input("meeting-date").value, "2027-03-27");
  await page.change("meeting-date", "2027-04-10");
  assert.equal(page.location().search, new URL(pathA, "https://example.test").search);
  await page.go(pathB); assert.equal(page.input("meeting-date").value, "2027-03-28");
  await page.go(-1); assert.equal(page.input("meeting-date").value, "2027-03-27");
  await page.go(1); assert.equal(page.input("meeting-date").value, "2027-03-28");
  await page.change("meeting-hours-toronto-end", "18:30");
  await page.refresh();
  assert.equal(page.input("meeting-hours-toronto-end").value, "17:00");
  await page.go(pathA); await page.go(pathB); await page.go(pathA);
  assert.equal(page.input("meeting-date").value, "2027-03-27");
});

test("real router plan/selection history restores exact identities and cleans retained scope handlers", async (t) => {
  const page = await navigationHarness(t, pathA);
  assert.equal(page.button("Copy selected meeting link"), undefined);
  await page.go(selectedA);
  assert.equal(page.radio(1806152400000).checked, true);
  const oldRadio = page.radio(1806152400000).onChange;
  const oldCopy = page.button("Copy selected meeting link").onClick;
  const oldExport = page.button("Download calendar event (.ics)").onClick;
  await page.go(selectedB);
  assert.equal(page.radio(1806154200000).checked, true);
  await page.invoke(oldRadio); await page.invoke(oldCopy); await page.invoke(oldExport);
  assert.equal(page.radio(1806154200000).checked, true);
  assert.equal(page.writes.length, 0);
  await page.go(-1); assert.equal(page.radio(1806152400000).checked, true);
  await page.go(1); assert.equal(page.radio(1806154200000).checked, true);
  await page.go(pathA);
  assert.equal(page.button("Copy selected meeting link"), undefined);
  assert.ok([...page.captured.radios.values()].every((radio) => !radio.checked));
});

test("real router malformed navigation rejects previous state and Start a new plan removes query and hash", async (t) => {
  const page = await navigationHarness(t, selectedA);
  await page.click("Copy selected meeting link");
  await page.go("/meeting-planner?v=2&cities=toronto,london#bad");
  assert.match(page.text(), /This shared plan link is incomplete or invalid\./);
  assert.equal(page.input("meeting-date"), undefined);
  assert.equal(page.button("Copy selected meeting link"), undefined);
  await page.go(-1);
  assert.equal(page.radio(1806152400000).checked, true);
  assert.doesNotMatch(page.text(), /link copied/);
  await page.go(1); await page.click("Start a new plan");
  assert.equal(page.location().pathname, "/meeting-planner");
  assert.equal(page.location().search, ""); assert.equal(page.location().hash, "");
  assert.equal(page.input("meeting-date").value, "");
});

test("real router preserves reordered cities, reference and hours and clears stale selection", async (t) => {
  const page = await navigationHarness(t, selectedA);
  for (const inputs of [
    { ...inputsA, citySlugs: ["london", "toronto"] },
    { ...inputsA, referenceCitySlug: "london" },
    { ...inputsA, cityPreferences: { ...inputsA.cityPreferences, toronto: { start: "08:15", end: "18:45" } } },
  ]) {
    await page.go(plannerUrl.buildCanonicalMeetingPlannerPath(inputs));
    assert.equal(page.input("meeting-date").value, inputs.referenceDate);
    assert.equal(page.input("meeting-hours-toronto-start").value, inputs.cityPreferences.toronto.start);
    assert.equal(page.input("meeting-hours-toronto-end").value, inputs.cityPreferences.toronto.end);
    assert.ok(page.text().includes(`Meeting date in ${inputs.referenceCitySlug === "london" ? "London" : "Toronto"}`));
    const list = page.text().slice(page.text().indexOf("Meeting cities"), page.text().indexOf("Add a city"));
    assert.ok(list.indexOf(inputs.citySlugs[0] === "london" ? "London" : "Toronto")
      < list.indexOf(inputs.citySlugs[1] === "london" ? "London" : "Toronto"));
    assert.equal(page.button("Copy selected meeting link"), undefined);
  }
  await page.go(`${pathA}&start=1806152400001`);
  assert.match(page.text(), /The plan loaded, but the linked meeting time could not be restored/);
  assert.equal(page.input("meeting-date").value, "2027-03-27");
  assert.ok([...page.captured.radios.values()].every((radio) => !radio.checked));
});

test("real router repeated 1 AM URLs restore distinct EDT/EST occurrences on Back and Forward", async (t) => {
  const fall = { ...inputsA, referenceDate: "2027-11-07", cityPreferences: {
    toronto: { start: "01:00", end: "07:00" }, london: { start: "01:00", end: "07:00" },
  } };
  const first = plannerUrl.buildCanonicalMeetingPlannerPath(fall, 1825563600000);
  const second = plannerUrl.buildCanonicalMeetingPlannerPath(fall, 1825567200000);
  const page = await navigationHarness(t, first);
  assert.equal(page.radio(1825563600000).checked, true);
  await page.click("Copy selected meeting link"); assert.equal(page.writes.at(-1), `https://www.youhora.com${first}`);
  await page.go(second); assert.equal(page.radio(1825567200000).checked, true);
  await page.click("Copy selected meeting link"); assert.equal(page.writes.at(-1), `https://www.youhora.com${second}`);
  await page.go(-1); assert.equal(page.radio(1825563600000).checked, true);
  await page.go(1); assert.equal(page.radio(1825567200000).checked, true);
});

test("real React plan copying excludes selection and retained handlers read latest committed edits", async (t) => {
  const page = await navigationHarness(t, `${pathA}&utm_source=test#fragment`);
  const retainedPlan = page.button("Copy plan link").onClick;
  await page.invoke(retainedPlan);
  assert.equal(page.writes.at(-1), `https://www.youhora.com${pathA}`);
  assert.match(page.text(), /Plan link copied/);
  assert.equal(page.dom.timers.size, 1);
  await page.select(1806152400000);
  assert.doesNotMatch(page.text(), /Plan link copied/);
  const retainedSelected = page.button("Copy selected meeting link").onClick;
  await page.invoke(retainedPlan); assert.equal(page.writes.at(-1), `https://www.youhora.com${pathA}`);
  await page.select(1806154200000); await page.invoke(retainedSelected);
  assert.equal(page.writes.at(-1), `https://www.youhora.com${selectedB}`);
  await page.change("meeting-hours-toronto-start", "08:15");
  const count = page.writes.length;
  const editedInputs = { ...inputsA, cityPreferences: { ...inputsA.cityPreferences, toronto: { start: "08:15", end: "17:00" } } };
  await page.invoke(retainedSelected); assert.equal(page.writes.length, count + 1);
  assert.equal(page.writes.at(-1), `https://www.youhora.com${plannerUrl.buildCanonicalMeetingPlannerPath(editedInputs, 1806154200000)}`);
  await page.invoke(retainedPlan);
  assert.equal(page.writes.at(-1), `https://www.youhora.com${plannerUrl.buildCanonicalMeetingPlannerPath(editedInputs)}`);
  await page.change("meeting-date", ""); await page.invoke(retainedPlan);
  assert.equal(page.writes.length, count + 2);
  assert.match(page.location().search, /date=2027-03-27/);
});

test("real React copy targets ignore pending city/alternatives changes and past selection remains shareable", async (t) => {
  const inputs = { ...inputsA, citySlugs: ["toronto", "london", "tokyo"],
    cityPreferences: { ...inputsA.cityPreferences, tokyo: { start: "09:00", end: "17:00" } } };
  const selected = plannerUrl.buildCanonicalMeetingPlannerPath(inputs, 1806152400000);
  const page = await navigationHarness(t, selected, { now: "2028-01-01T00:00Z" });
  assert.match(page.text(), /outside preferred hours for: Tokyo/);
  assert.equal(page.button("Download calendar event (.ics)").disabled, true);
  await page.change("meeting-add-city", "paris");
  await page.click("Hide alternatives"); await page.click("Show alternatives");
  await page.click("Copy selected meeting link");
  assert.equal(page.writes.at(-1), `https://www.youhora.com${selected}`);
  assert.match(page.text(), /Selected meeting link copied/);
  await page.resetFeedback(); assert.doesNotMatch(page.text(), /link copied/);
  assert.equal(page.dom.timers.size, 0);
});

test("real React local change-away-and-back cannot revive old radios or copy feedback", async (t) => {
  const page = await navigationHarness(t, selectedA);
  const oldRadio = page.radio(1806152400000).onChange;
  await page.click("Copy plan link");
  await page.change("meeting-date", "2027-03-28"); await page.change("meeting-date", "2027-03-27");
  await page.invoke(oldRadio);
  assert.equal(page.button("Copy selected meeting link"), undefined);
  assert.doesNotMatch(page.text(), /link copied/);
  assert.equal(page.dom.timers.size, 0);
});

test("real React clipboard rejection, missing API, thrown getter and retry have accessible feedback", async (t) => {
  const navigator = { clipboard: { writeText: async () => { throw Error("blocked"); } } };
  const page = await navigationHarness(t, pathA, { navigator });
  await page.click("Copy plan link"); assert.match(page.text(), /Copy failed\. Please try again\./);
  assert.equal(page.input("meeting-plan-copy-status").role, "status");
  navigator.clipboard = undefined;
  await page.click("Copy plan link"); assert.match(page.text(), /Copy failed/);
  Object.defineProperty(navigator, "clipboard", { configurable: true, get() { throw Error("unavailable"); } });
  await page.click("Copy plan link"); assert.match(page.text(), /Copy failed/);
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: () => { throw Error("synchronous"); } } });
  await page.click("Copy plan link"); assert.match(page.text(), /Copy failed/);
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async () => {} } });
  await page.click("Copy plan link"); assert.match(page.text(), /Plan link copied/);
  assert.equal(page.dom.timers.size, 1);
  await page.change("meeting-hours-toronto-end", "18:00");
  assert.doesNotMatch(page.text(), /copied|Copy failed/); assert.equal(page.dom.timers.size, 0);
});

test("real React deferred A to B to A completion cannot revive feedback and one lock covers both actions", async (t) => {
  let finish, writes = 0;
  const navigator = { clipboard: { writeText: () => { writes++; return new Promise((resolve) => { finish = resolve; }); } } };
  const page = await navigationHarness(t, selectedA, { navigator });
  let pending;
  await React.act(async () => { pending = page.button("Copy plan link").onClick(); });
  await page.click("Copy selected meeting link"); await page.click("Copy plan link");
  assert.equal(writes, 1);
  await page.select(1806154200000); await page.select(1806152400000);
  await page.click("Copy selected meeting link"); assert.equal(writes, 1);
  await React.act(async () => { finish(); await pending; });
  assert.doesNotMatch(page.text(), /link copied/); assert.equal(page.dom.timers.size, 0);
  navigator.clipboard.writeText = async () => { writes++; };
  await page.click("Copy selected meeting link"); assert.equal(writes, 2);
  assert.match(page.text(), /Selected meeting link copied/);
});

test("real React deferred results after navigation or unmount cannot update feedback or copy old state", async (t) => {
  let finish, writes = 0;
  const navigator = { clipboard: { writeText: () => { writes++; return new Promise((resolve, reject) => { finish = { resolve, reject }; }); } } };
  const page = await navigationHarness(t, selectedA, { navigator });
  const oldCopy = page.button("Copy selected meeting link").onClick;
  let pending;
  await React.act(async () => { pending = oldCopy(); });
  await page.go(selectedB);
  await page.click("Copy plan link"); assert.equal(writes, 1, "navigation cannot race an outstanding clipboard write");
  await page.go(-1);
  await page.invoke(oldCopy); // The original editor was unmounted, even on return to A.
  await React.act(async () => { finish.reject(Error("late failure")); await pending; });
  assert.doesNotMatch(page.text(), /copied|Copy failed/); assert.equal(page.dom.timers.size, 0);
  await React.act(async () => { pending = page.button("Copy plan link").onClick(); });
  await page.unmount();
  await React.act(async () => { finish.resolve(); await pending; });
  assert.equal(page.dom.timers.size, 0);
  await page.invoke(oldCopy);
});

test("real React navigation clears pending add-city and local notices even for same search with a new visit", async (t) => {
  const page = await navigationHarness(t, pathA);
  await page.change("meeting-add-city", "paris");
  await page.click("Add city"); await page.click("Make Paris reference");
  assert.match(page.text(), /Paris is now the reference city/);
  await page.change("meeting-add-city", "tokyo");
  await page.click("Copy plan link");
  await page.go(pathA);
  assert.equal(page.input("meeting-add-city").value, "");
  assert.match(page.text(), /Meeting date in Toronto/);
  assert.doesNotMatch(page.text(), /Paris is now|Plan link copied/);
  assert.equal(page.dom.timers.size, 0);
});

test("real React hydrated outside-hours selection remains visible when preferred candidates exist", async (t) => {
  const epoch = Date.parse("2027-03-27T04:00Z");
  const page = await navigationHarness(t, plannerUrl.buildCanonicalMeetingPlannerPath(inputsA, epoch));
  assert.equal(page.captured.radios.has(epoch), false, "preferred result list stays unchanged");
  assert.match(page.text(), /Selected meeting/);
  assert.match(page.text(), /This selected meeting is outside preferred hours for: Toronto, London/);
  assert.ok(page.button("Copy selected meeting link"));
  await page.click("Copy selected meeting link");
  assert.match(page.writes.at(-1), new RegExp(`&start=${epoch}$`));
});

test("real React refresh restores URL selection rather than local selection, draft or clipboard feedback", async (t) => {
  const page = await navigationHarness(t, selectedA);
  await page.select(1806154200000);
  await page.click("Copy selected meeting link");
  assert.match(page.writes.at(-1), /start=1806154200000$/);
  await page.refresh();
  assert.equal(page.radio(1806152400000).checked, true);
  assert.equal(page.radio(1806154200000).checked, false);
  assert.doesNotMatch(page.text(), /link copied/);
  assert.equal(page.dom.timers.size, 0);
});

test("a queued old feedback timer cannot take ownership of a newer timer or survive unmount", async (t) => {
  const page = await navigationHarness(t, pathA);
  await page.click("Copy plan link");
  const queued = [...page.dom.timers.values()][0];
  await page.change("meeting-hours-toronto-end", "18:00");
  await page.click("Copy plan link");
  assert.equal(page.dom.timers.size, 1);
  await React.act(async () => queued());
  assert.match(page.text(), /Plan link copied/);
  await page.unmount();
  assert.equal(page.dom.timers.size, 0);
});

const invalidRecoveryPath = "/meeting-planner?v=2&cities=toronto,london#bad";
function committedNodes(page) {
  const walk = (node) => [node, ...node.childNodes.flatMap(walk)];
  return walk(page.dom.document.body);
}

test("retained recovery after normal recovery cannot navigate or erase a committed clean draft", async (t) => {
  const page = await navigationHarness(t, invalidRecoveryPath);
  const retained = page.button("Start a new plan").onClick;
  await page.click("Start a new plan");
  await page.change("meeting-date", "2028-02-29");
  const before = page.location();
  await page.invoke(retained);
  assert.equal(page.location(), before, "no committed router navigation");
  assert.equal(page.location().key, before.key);
  assert.equal(page.location().pathname, "/meeting-planner");
  assert.equal(page.location().search, "");
  assert.equal(page.location().hash, "");
  assert.equal(committedNodes(page).find((node) => node.getAttribute?.("id") === "meeting-date").value, "2028-02-29");
  assert.match(page.text(), /Meeting candidates|All cities within their preferred hours/);
});

test("retained recovery cannot erase a later committed shared URL or exact selected meeting", async (t) => {
  const page = await navigationHarness(t, invalidRecoveryPath);
  const retained = page.button("Start a new plan").onClick;
  const selectedPath = "/meeting-planner?v=1&cities=toronto%2Clondon&reference=toronto&date=2027-03-27&hoursStart=09%3A00&hoursEnd=17%3A00&start=1806152400000";
  await page.go(selectedPath);
  const before = page.location();
  await page.invoke(retained);
  assert.equal(page.location(), before);
  assert.equal(page.location().key, before.key);
  assert.equal(page.location().search, selectedPath.slice(selectedPath.indexOf("?")));
  assert.deepEqual(committedNodes(page).filter((node) => node.nodeName === "INPUT" && node.checked).map((node) => node.value), ["1806152400000"]);
  assert.match(page.text(), /Selected meeting/);
});

test("retained recovery from A1 stays inert on a new A2 visit and current recovery preserves push history", async (t) => {
  const page = await navigationHarness(t, invalidRecoveryPath);
  const firstVisit = page.location();
  const retained = page.button("Start a new plan").onClick;
  await page.go(pathA);
  await page.go(invalidRecoveryPath);
  const currentVisit = page.location();
  assert.notEqual(currentVisit.key, firstVisit.key);
  await page.invoke(retained);
  assert.equal(page.location(), currentVisit);
  assert.match(page.text(), /This shared plan link is incomplete or invalid\./);
  assert.ok(!committedNodes(page).some((node) => node.getAttribute?.("id") === "meeting-date"));
  await page.click("Start a new plan");
  const cleanVisit = page.location();
  assert.equal(cleanVisit.pathname, "/meeting-planner");
  assert.equal(cleanVisit.search, ""); assert.equal(cleanVisit.hash, "");
  await page.go(-1);
  assert.equal(page.location().key, currentVisit.key, "recovery pushed rather than replaced the malformed visit");
  assert.equal(page.location().hash, "#bad");
  assert.match(page.text(), /This shared plan link is incomplete or invalid\./);
  await page.go(1);
  assert.equal(page.location().key, cleanVisit.key);
  assert.equal(committedNodes(page).find((node) => node.getAttribute?.("id") === "meeting-date").value, "");
});

test("retained recovery cannot revive on Back even when the router reuses its original history key", async (t) => {
  const page = await navigationHarness(t, invalidRecoveryPath);
  const firstVisit = page.location();
  const retained = page.button("Start a new plan").onClick;
  await page.go(selectedA);
  await page.go(-1);
  const returnedVisit = page.location();
  assert.equal(returnedVisit.key, firstVisit.key);
  assert.notEqual(returnedVisit, firstVisit);
  await page.invoke(retained);
  assert.equal(page.location(), returnedVisit);
  assert.match(page.text(), /This shared plan link is incomplete or invalid\./);
  await page.click("Start a new plan");
  assert.equal(page.location().search, ""); assert.equal(page.location().hash, "");
});

test("retained recovery stays inert when the identical invalid URL is pushed as a new history entry", async (t) => {
  const page = await navigationHarness(t, invalidRecoveryPath);
  const retained = page.button("Start a new plan").onClick;
  const firstKey = page.location().key;
  await page.go(invalidRecoveryPath);
  const newVisit = page.location();
  assert.notEqual(newVisit.key, firstKey);
  await page.invoke(retained);
  assert.equal(page.location(), newVisit);
  assert.match(page.text(), /This shared plan link is incomplete or invalid\./);
  await page.click("Start a new plan");
  assert.equal(page.location().search, ""); assert.equal(page.location().hash, "");
});

test("retained recovery is inert after route unmount and does not request navigation", async (t) => {
  const requests = [];
  const page = await navigationHarness(t, invalidRecoveryPath, { onRecoveryNavigate: (...args) => requests.push(args) });
  const retained = page.button("Start a new plan").onClick;
  const before = page.location();
  await page.unmount();
  await page.invoke(retained);
  assert.deepEqual(requests, []);
  assert.equal(page.location(), before);
  assert.equal(page.text(), "");
});

const v1Path = "/meeting-planner?v=1&cities=toronto%2Clondon&reference=toronto&date=2027-03-27&hoursStart=09%3A00&hoursEnd=17%3A00";

test("real router v1 to independent v2 Back Forward and malformed return hydrate each visit atomically", async (t) => {
  const inputs = { ...inputsA, cityPreferences: { toronto: { start: "08:00", end: "16:00" }, london: { start: "09:30", end: "17:30" } } };
  const v2 = plannerUrl.buildCanonicalMeetingPlannerPath(inputs, 1806152400000);
  const page = await navigationHarness(t, `${v1Path}&start=1806152400000`);
  assert.equal(page.input("meeting-hours-london-start").value, "09:00");
  assert.match(page.location().search, /v=1/);
  await page.go(v2);
  assert.equal(page.input("meeting-hours-toronto-start").value, "08:00");
  assert.equal(page.input("meeting-hours-london-start").value, "09:30");
  assert.ok(page.button("Copy selected meeting link"));
  await page.go(-1);
  assert.equal(page.input("meeting-hours-toronto-start").value, "09:00");
  assert.equal(page.input("meeting-hours-london-start").value, "09:00");
  await page.go(1);
  assert.equal(page.input("meeting-hours-london-start").value, "09:30");
  await page.go(plannerUrl.buildCanonicalMeetingPlannerPath(inputs));
  assert.equal(page.button("Copy selected meeting link"), undefined);
  await page.go(v1Path);
  await page.go("/meeting-planner?v=2&cities=toronto,london&reference=toronto&date=2027-03-27&hours=toronto:09:00-17:00");
  assert.match(page.text(), /This shared plan link is incomplete or invalid/);
  assert.equal(page.input("meeting-hours-toronto-start"), undefined);
  await page.go(-1);
  assert.equal(page.input("meeting-hours-london-end").value, "17:00");
  assert.match(page.location().search, /v=1/);
});

test("real router one-window v2 history and city reordering retain slug ownership", async (t) => {
  const changed = { ...inputsA, cityPreferences: { ...inputsA.cityPreferences, london: { start: "10:15", end: "18:45" } } };
  const page = await navigationHarness(t, pathA);
  const v2B = plannerUrl.buildCanonicalMeetingPlannerPath(changed);
  await page.go(v2B);
  assert.equal(page.input("meeting-hours-london-start").value, "10:15");
  await page.change("meeting-hours-toronto-end", "16:00");
  await page.go(-1);
  assert.equal(page.input("meeting-hours-london-start").value, "09:00");
  assert.equal(page.input("meeting-hours-toronto-end").value, "17:00");
  await page.go(1);
  assert.equal(page.input("meeting-hours-london-start").value, "10:15");
  assert.equal(page.input("meeting-hours-toronto-end").value, "17:00");
  await page.go(plannerUrl.buildCanonicalMeetingPlannerPath({ ...changed, citySlugs: ["london", "toronto"] }));
  const list = page.text().slice(page.text().indexOf("Meeting cities"), page.text().indexOf("Add a city"));
  assert.ok(list.indexOf("London") < list.indexOf("Toronto"));
  assert.equal(page.input("meeting-hours-london-end").value, "18:45");
  assert.equal(page.input("meeting-hours-toronto-end").value, "17:00");
});

test("real React v1 drafts never rewrite location, copy v2, and disappear on history or refresh", async (t) => {
  const page = await navigationHarness(t, `${v1Path}&start=1806152400000`);
  const location = page.location();
  await page.click("Copy plan link");
  assert.equal(page.writes.at(-1), `https://www.youhora.com${pathA}`);
  const retained = page.input("meeting-hours-london-start").onChange;
  await page.change("meeting-hours-london-start", "14:00");
  assert.equal(page.location(), location);
  assert.match(page.text(), /1 of 2 cities within their preferred hours/);
  await page.click("Copy selected meeting link");
  const copied = new URL(page.writes.at(-1));
  assert.equal(copied.searchParams.get("v"), "2");
  assert.equal(copied.searchParams.get("start"), "1806152400000");
  assert.equal(copied.searchParams.get("hours"), "toronto:09:00-17:00,london:14:00-17:00");
  await page.go(pathB); await page.go(-1);
  await page.invoke(() => retained({ target: { value: "15:00" } }));
  assert.equal(page.input("meeting-hours-london-start").value, "09:00");
  await page.change("meeting-hours-london-end", "18:00"); await page.refresh();
  assert.equal(page.input("meeting-hours-london-end").value, "17:00");
  assert.match(page.location().search, /v=1/);
  assert.equal(page.radio(1806152400000).checked, true);
});

test("real React preference edits preserve exact five-city selection, update fit, and scope old radios and feedback", async (t) => {
  const citySlugs = ["toronto", "montreal", "new-york", "london", "paris"];
  const inputs = { ...inputsA, citySlugs, cityPreferences: Object.fromEntries(citySlugs.map((slug) => [slug, { start: "09:00", end: "17:00" }])) };
  const epoch = 1806152400000;
  const page = await navigationHarness(t, plannerUrl.buildCanonicalMeetingPlannerPath(inputs, epoch));
  const retainedCopy = page.button("Copy selected meeting link").onClick;
  const oldRadio = page.radio(epoch + 1800000).onChange;
  await page.click("Copy selected meeting link");
  assert.match(page.text(), /5 of 5 cities within their preferred hours/);
  const opening = page.input("meeting-hours-london-start").onChange;
  const closing = page.input("meeting-hours-london-end").onChange;
  const otherCity = page.input("meeting-hours-toronto-start").onChange;
  await React.act(async () => {
    opening({ target: { value: "14:00" } }); closing({ target: { value: "18:00" } }); otherCity({ target: { value: "08:00" } });
  });
  assert.match(page.text(), /4 of 5 cities within their preferred hours/);
  assert.match(page.text(), /This selected meeting is outside preferred hours for: London\./);
  assert.doesNotMatch(page.text(), /link copied/);
  assert.equal(page.input("meeting-hours-london-end").value, "18:00");
  await page.invoke(oldRadio);
  await page.invoke(retainedCopy);
  const copied = new URL(page.writes.at(-1));
  assert.equal(copied.searchParams.get("start"), String(epoch));
  assert.match(copied.searchParams.get("hours"), /london:14:00-18:00/);
  assert.equal(page.radio(epoch), undefined, "a retained selection may sit outside the preferred radio list");
  await page.change("meeting-hours-london-start", "09:00");
  await page.invoke(oldRadio);
  assert.equal(page.radio(epoch).checked, true);
  assert.equal(page.radio(epoch + 1800000).checked, false);
  await page.change("meeting-hours-london-start", "");
  assert.equal(page.button("Copy selected meeting link"), undefined);
  assert.equal(page.button("Copy plan link"), undefined);
  const count = page.writes.length; await page.invoke(retainedCopy);
  assert.equal(page.writes.length, count);
  await page.change("meeting-hours-london-start", "09:00");
  assert.ok(page.button("Copy selected meeting link"));
  assert.equal(page.radio(epoch).checked, true);
});

test("real React removed and re-added city callbacks stay inert and add focus survives the five-city limit", async (t) => {
  const page = await navigationHarness(t, pathA);
  for (const slug of ["paris", "montreal", "new-york"]) {
    await page.change("meeting-add-city", slug); await page.click("Add city");
    assert.equal(page.dom.document.activeElement.getAttribute("id"), `meeting-hours-${slug}-start`);
  }
  const retained = page.input("meeting-hours-paris-start").onChange;
  await page.change("meeting-hours-paris-start", "10:00");
  await page.click("Remove Toronto");
  await page.change("meeting-add-city", "toronto"); await page.click("Add city");
  await page.invoke(() => retained({ target: { value: "11:00" } }));
  assert.equal(page.input("meeting-hours-paris-start").value, "10:00", "membership changes invalidate retained preference callbacks");
  await page.click("Remove Paris");
  await page.change("meeting-add-city", "paris"); await page.click("Add city");
  await page.invoke(() => retained({ target: { value: "12:00" } }));
  assert.equal(page.input("meeting-hours-paris-start").value, "09:00");
});

test("real React clears a retained epoch if regenerated membership fails and cannot revive it", async (t) => {
  let removeMember = false;
  const epoch = 1806152400000;
  const page = await navigationHarness(t, selectedA, {
    generateMeetingPlan(inputs) {
      const result = planner.generateMeetingPlan(inputs);
      return removeMember && result.status === "success"
        ? { ...result, candidates: result.candidates.filter((candidate) => candidate.startEpochMilliseconds !== epoch) } : result;
    },
  });
  assert.ok(page.button("Copy selected meeting link"));
  removeMember = true;
  await page.change("meeting-hours-london-end", "18:00");
  assert.equal(page.button("Copy selected meeting link"), undefined);
  removeMember = false;
  await page.change("meeting-hours-london-end", "17:00");
  assert.equal(page.button("Copy selected meeting link"), undefined);
});

const browserQaInputs = {
  citySlugs: ["toronto", "london", "paris"], referenceCitySlug: "toronto", referenceDate: "2027-10-27",
  cityPreferences: { toronto: { start: "08:00", end: "16:00" }, london: { start: "10:00", end: "18:00" },
    paris: { start: "14:00", end: "17:00" } },
};
const browserQaEpoch = 1824638400000;
const parisOpening = "meeting-hours-paris-start";

function assertDormantPreference(page, errorField = "start") {
  assert.equal(page.state().selectedStartEpochMilliseconds, browserQaEpoch);
  assert.equal(page.state().selectedCandidate, null);
  assert.equal(page.state().plan.status, "invalid");
  assert.equal(page.input(`meeting-hours-paris-${errorField}`)["aria-invalid"], true);
  assert.match(page.input(`meeting-hours-paris-${errorField}`)["aria-describedby"], /meeting-hours-error-paris/);
  const error = committedNodes(page).find((node) => node.getAttribute?.("id") === "meeting-hours-error-paris");
  assert.equal(error.getAttribute("role"), "alert");
  assert.ok(error.textContent);
  assert.doesNotMatch(page.text(), /Selected meeting|\d of 3 cities|Outside preferred hours|This selected meeting/);
  assert.equal(page.captured.radios.size, 0);
  assert.ok(!committedNodes(page).some((node) => node.getAttribute?.("aria-label") === "Meeting candidates"));
  for (const label of ["Copy plan link", "Copy selected meeting link", "Download calendar event (.ics)"]) {
    assert.equal(page.button(label), undefined);
  }
}

function assertBrowserQaSelection(page, fit) {
  const state = page.state();
  assert.equal(state.selectedStartEpochMilliseconds, browserQaEpoch);
  assert.equal(state.selectedCandidate, state.plan.candidates.find((candidate) => candidate.startEpochMilliseconds === browserQaEpoch));
  assert.equal(state.selectedCandidate.endEpochMilliseconds, browserQaEpoch + 1800000);
  const summary = committedNodes(page).find((node) => node.getAttribute?.("aria-labelledby") === "meeting-selected-title");
  assert.ok(summary);
  assert.match(summary.textContent, new RegExp(`${fit} of 3 cities within their preferred hours`));
  const articles = committedNodes(page).filter((node) => node.nodeName === "ARTICLE");
  for (const [index, city, time] of [[0, "Toronto", "8:00 AM–8:30 AM"], [1, "London", "1:00 PM–1:30 PM"], [2, "Paris", "2:00 PM–2:30 PM"]]) {
    assert.ok(articles[index].textContent.startsWith(city));
    assert.ok(articles[index].textContent.includes(time));
  }
  if (fit === 2) {
    assert.match(summary.textContent, /This selected meeting is outside preferred hours for: Paris\./);
    assert.deepEqual(Array.from(state.plan.preferredCandidates[0].locations, (location) => location.start.time),
      ["09:00:00", "14:00:00", "15:00:00"]);
    assert.equal(page.radio(browserQaEpoch), undefined, "selection is independent of the preferred radio list");
  }
}

for (const [draft, errorField] of [["", "start"], ["17:00", "end"], ["18:00", "end"]]) {
  test(`real React browser QA preference draft ${JSON.stringify(draft)} suspends and restores the exact current meeting`, async (t) => {
    const downloads = [];
    const page = await navigationHarness(t, plannerUrl.buildCanonicalMeetingPlannerPath(browserQaInputs), {
      downloadIcsFile: (payload) => downloads.push(payload),
    });
    await page.select(browserQaEpoch);
    assertBrowserQaSelection(page, 3);
    const before = page.state().selectedCandidate;
    const revision = page.state().planRevision;
    const location = page.location();
    const retained = [page.button("Copy plan link").onClick, page.button("Copy selected meeting link").onClick,
      page.button("Download calendar event (.ics)").onClick, page.radio(browserQaEpoch + 1800000).onChange];
    await page.click("Download calendar event (.ics)");
    await page.change(parisOpening, draft); // Separate act/commit: the invalid draft must really render.
    assertDormantPreference(page, errorField);
    assert.equal(page.state().planRevision, revision + 1);
    for (const handler of retained) await page.invoke(handler);
    assert.equal(page.writes.length, 0);
    assert.equal(downloads.length, 1);
    assertDormantPreference(page, errorField);

    await page.change(parisOpening, "15:00");
    assertBrowserQaSelection(page, 2);
    assert.notEqual(page.state().selectedCandidate, before, "derive a new candidate; never reuse cached classification");
    assert.equal(page.state().planRevision, revision + 2);
    assert.equal(page.location(), location, "local drafts never rewrite history");
    await page.invoke(retained[3]);
    assert.equal(page.state().selectedStartEpochMilliseconds, browserQaEpoch);
    await page.invoke(retained[2]);
    assert.equal(downloads.length, 1, "unmounted calendar closure stays inert after repair");
    for (const label of ["Copy plan link", "Copy selected meeting link"]) {
      await page.click(label);
      const copied = new URL(page.writes.at(-1));
      assert.equal(copied.searchParams.get("hours"), "toronto:08:00-16:00,london:10:00-18:00,paris:15:00-17:00");
      assert.equal(copied.searchParams.get("start"), label === "Copy plan link" ? null : String(browserQaEpoch));
    }
    await page.click("Download calendar event (.ics)");
    assert.deepEqual(downloads[1], downloads[0], "preferences do not change ICS content or identity");
    assert.match(downloads[1].ics, /DTSTART:20271027T120000Z/);
    assert.match(downloads[1].ics, /DTEND:20271027T123000Z/);
    await page.change(parisOpening, "14:00");
    await page.invoke(retained[3]);
    assert.equal(page.radio(browserQaEpoch).checked, true);
    assert.equal(page.radio(browserQaEpoch + 1800000).checked, false, "change-away/back cannot revive an old radio");
  });
}

for (const batched of [false, true]) {
  test(`real React browser QA ${batched ? "batched invalid/final" : "atomic valid"} preference edit preserves selection`, async (t) => {
    const page = await navigationHarness(t, plannerUrl.buildCanonicalMeetingPlannerPath(browserQaInputs));
    await page.select(browserQaEpoch);
    assertBrowserQaSelection(page, 3);
    if (batched) {
      const change = page.input(parisOpening).onChange;
      await React.act(async () => { change({ target: { value: "" } }); change({ target: { value: "15:00" } }); });
    } else await page.change(parisOpening, "15:00");
    assertBrowserQaSelection(page, 2);
    assert.ok(page.button("Copy selected meeting link"));
    assert.ok(page.button("Download calendar event (.ics)"));
  });
}

test("real React closing-time preference drafts also suspend exact selection", async (t) => {
  const page = await navigationHarness(t, plannerUrl.buildCanonicalMeetingPlannerPath(browserQaInputs));
  await page.select(browserQaEpoch);
  for (const draft of ["", "14:00", "13:00"]) {
    await page.change("meeting-hours-paris-end", draft);
    assertDormantPreference(page, "end");
    await page.change("meeting-hours-paris-end", "17:00");
    assertBrowserQaSelection(page, 3);
  }
});

for (const [name, mutate, reset] of [
  ["date change", (page) => page.change("meeting-date", "2027-10-28"), (page) => page.change("meeting-date", "2027-10-27")],
  ["reference change", (page) => page.click("Make London reference"), (page) => page.click("Make Toronto reference")],
  ["city addition", async (page) => { await page.change("meeting-add-city", "montreal"); await page.click("Add city"); }, (page) => page.click("Remove Montreal")],
  ["city removal", (page) => page.click("Remove London"), async (page) => { await page.change("meeting-add-city", "london"); await page.click("Add city"); }],
  ["remove/re-add same slug", async (page) => {
    await page.click("Remove Paris"); await page.change("meeting-add-city", "paris"); await page.click("Add city");
  }, async () => {}],
]) {
  test(`real React dormant preference selection is permanently cleared by ${name}`, async (t) => {
    const page = await navigationHarness(t, plannerUrl.buildCanonicalMeetingPlannerPath(browserQaInputs));
    await page.select(browserQaEpoch);
    const oldRadio = page.radio(browserQaEpoch + 1800000).onChange;
    await page.change(parisOpening, "");
    assertDormantPreference(page);
    await mutate(page);
    assert.equal(page.state().selectedStartEpochMilliseconds, null);
    await reset(page);
    await page.change(parisOpening, "15:00");
    await page.invoke(oldRadio);
    assert.equal(page.state().plan.status, "success");
    assert.equal(page.state().selectedStartEpochMilliseconds, null);
    assert.equal(page.button("Copy selected meeting link"), undefined);
    assert.equal(page.button("Download calendar event (.ics)"), undefined);
  });
}

test("real React repaired preference draft clears permanently when successful candidate membership is lost", async (t) => {
  let removeMember = false;
  const page = await navigationHarness(t, plannerUrl.buildCanonicalMeetingPlannerPath(browserQaInputs), {
    generateMeetingPlan(inputs) {
      const result = planner.generateMeetingPlan(inputs);
      return removeMember && result.status === "success"
        ? { ...result, candidates: result.candidates.filter((candidate) => candidate.startEpochMilliseconds !== browserQaEpoch) }
        : result;
    },
  });
  await page.select(browserQaEpoch);
  await page.change(parisOpening, "");
  assertDormantPreference(page);
  removeMember = true;
  await page.change(parisOpening, "15:00");
  assert.equal(page.state().plan.status, "success");
  assert.equal(page.state().selectedStartEpochMilliseconds, null);
  removeMember = false;
  await page.change(parisOpening, "14:00");
  assert.equal(page.state().selectedStartEpochMilliseconds, null);
  assert.equal(page.button("Copy selected meeting link"), undefined);
});

test("real React navigation during an invalid preference draft stays URL-authoritative through Back/Forward", async (t) => {
  const path = plannerUrl.buildCanonicalMeetingPlannerPath(browserQaInputs);
  const page = await navigationHarness(t, path);
  await page.select(browserQaEpoch);
  const oldCopy = page.button("Copy selected meeting link").onClick;
  await page.change(parisOpening, "");
  assertDormantPreference(page);
  await page.go(plannerUrl.buildCanonicalMeetingPlannerPath({ ...browserQaInputs, citySlugs: ["paris", "london", "toronto"] }));
  assert.equal(page.state().selectedStartEpochMilliseconds, null, "reordered URL cannot inherit dormant identity");
  await page.go(-1);
  assert.equal(page.input(parisOpening).value, "14:00");
  assert.equal(page.state().selectedStartEpochMilliseconds, null, "Back restores URL, not prior local selection");
  await page.go(1);
  assert.equal(page.state().citySlugs[0], "paris");
  assert.equal(page.state().selectedStartEpochMilliseconds, null);
  await page.go(plannerUrl.buildCanonicalMeetingPlannerPath(browserQaInputs, browserQaEpoch + 1800000));
  assert.equal(page.state().selectedStartEpochMilliseconds, browserQaEpoch + 1800000, "new URL selection wins");
  await page.invoke(oldCopy);
  assert.equal(page.writes.length, 0);
  await page.change(parisOpening, "");
  await page.go(`${path}&start=broken`);
  assert.equal(page.state().selectedStartEpochMilliseconds, null);
  assert.match(page.text(), /linked meeting time could not be restored/);
  await page.select(browserQaEpoch);
  await page.change(parisOpening, "");
  await page.go(invalidRecoveryPath);
  assert.equal(page.state(), null, "invalid shared plan unmounts the dormant editor");
  assert.match(page.text(), /This shared plan link is incomplete or invalid/);
  assert.equal(page.input(parisOpening), undefined);
  await page.click("Start a new plan");
  assert.equal(page.state().selectedStartEpochMilliseconds, null);
  await page.go(path);
  await page.change(parisOpening, "15:00");
  assert.equal(page.state().selectedStartEpochMilliseconds, null);
});
