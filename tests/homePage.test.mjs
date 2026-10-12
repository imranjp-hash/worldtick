import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import test from "node:test";
import { createElement, Fragment, isValidElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Link, MemoryRouter } from "react-router-dom";
import postcss from "postcss";
import { transformWithOxc } from "vite";

const source = await readFile(new URL("../src/pages/HomePage.jsx", import.meta.url), "utf8");
const { code } = await transformWithOxc(source, "HomePage.jsx", {
  jsx: { runtime: "classic", pragma: "createElement" },
});
const context = vm.createContext({ createElement, Link, React: { Fragment } });
vm.runInContext(code.replace(/^import[^\n]*\n/gm, "").replace("export default function", "function"), context);
const text = (node) => node == null || typeof node === "boolean" ? "" : Array.isArray(node)
  ? node.map(text).join("") : isValidElement(node) ? text(node.props.children) : String(node);
function nodes(root, type) {
  const result = [];
  function visit(node) {
    if (Array.isArray(node)) return node.forEach(visit);
    if (!isValidElement(node)) return;
    if (node.type === type) result.push(node);
    visit(node.props.children);
  }
  visit(root);
  return result;
}

test("Home offers a native secondary planner link beside the unchanged primary tool action", () => {
  const navigations = [];
  const tree = context.HomePage({
    cities: [], search: "", suggestions: [], selectedCities: [], styles: {},
    getTime: () => "9:00 AM", getDate: () => "Saturday, March 27", now: new Date("2027-03-27T13:00Z"),
    navigate: (path) => navigations.push(path),
  });
  const primary = nodes(tree, "button").find((node) => text(node) === "Open Time Difference Calculator");
  const secondary = nodes(tree, Link).find((node) => text(node) === "Open Meeting Planner");
  assert.ok(primary);
  assert.ok(secondary);
  assert.equal(primary.props.type, "button");
  assert.match(primary.props.className, /\bhome-tool-button-primary\b/);
  assert.equal(primary.props.style.background, "#67e8f9");
  assert.equal(secondary.props.to, "/meeting-planner");
  assert.match(secondary.props.className, /\bhome-tool-button-secondary\b/);
  const actions = nodes(tree, "div").find((node) => node.props.className === "home-tool-actions");
  assert.ok(nodes(actions, "button").includes(primary));
  assert.ok(nodes(actions, Link).includes(secondary));
  const comparisonCard = nodes(tree, "section").find((node) => nodes(node, "button").includes(primary));
  assert.ok(nodes(comparisonCard, Link).includes(secondary));
  primary.props.onClick();
  assert.deepEqual(navigations, ["/time-difference"]);

  const html = renderToStaticMarkup(createElement(MemoryRouter, null, tree));
  const plannerAnchor = html.match(/<a\b([^>]*)>Open Meeting Planner<\/a>/);
  assert.ok(plannerAnchor, "the styled control must render as a real navigation link");
  assert.match(plannerAnchor[1], /href="\/meeting-planner"/);
  assert.match(plannerAnchor[1], /class="home-tool-button home-tool-button-secondary"/);
  assert.doesNotMatch(plannerAnchor[1], /tabindex="-1"|role="button"/i);
});

test("Home tool buttons stack at mobile widths with wrapping text and visible focus", async () => {
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
  const button = declarations(".home-tool-button");
  assert.equal(button.display, "inline-flex");
  assert.equal(button["max-width"], "100%");
  assert.equal(button["min-width"], "0");
  assert.equal(button["white-space"], "normal");
  assert.equal(button["overflow-wrap"], "anywhere");
  assert.equal(button.padding, "14px 24px");
  const secondary = declarations(".home-tool-button-secondary");
  assert.match(secondary.border, /^1px solid/);
  assert.notEqual(secondary.background, "#67e8f9");
  assert.equal(declarations(".home-tool-actions")["flex-wrap"], "wrap");
  assert.equal(declarations(".home-tool-actions", true)["flex-direction"], "column");
  assert.equal(declarations(".home-tool-actions", true)["align-items"], "stretch");
  assert.equal(declarations(".home-tool-actions > .home-tool-button", true).width, "100%");
  const focus = declarations(".home-tool-button:focus-visible");
  assert.equal(focus.outline, "3px solid white");
  assert.equal(focus["outline-offset"], "3px");
});
