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
  const window = { document, HTMLIFrameElement: class {},
    setInterval(callback) { intervals.set(++nextInterval, callback); return nextInterval; },
    clearInterval(id) { intervals.delete(id); } };
  document.defaultView = window;
  return { document, window, intervals };
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
  const page = await loadComponent("src/pages/MeetingPlannerPage.jsx", {
    ...common, ...router, ...planner, ...dateTime, cities, useNow,
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
