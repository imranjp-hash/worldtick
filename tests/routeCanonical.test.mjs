import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { matchPath } from "react-router-dom";
import { build } from "vite";
import React from "react";
import { cities } from "../src/data/cities.js";
import { getCountryBySlug } from "../src/data/countries.js";

const root = fileURLToPath(new URL("..", import.meta.url));
const read = (file) => readFile(new URL(`../${file}`, import.meta.url), "utf8");
const canonicalTag = /<link\b[^>]*\brel\s*=\s*["']canonical["']/i;
const stripImports = (source) => source.replace(/^import[^\n]*\n/gm, "");

test("source and production HTML have no static canonical", async () => {
  assert.doesNotMatch(await read("index.html"), canonicalTag);

  const outDir = await mkdtemp(path.join(tmpdir(), "youhora-canonical-"));
  const nodeEnv = process.env.NODE_ENV;
  try {
    await build({ root, logLevel: "silent", build: { outDir } });
    assert.doesNotMatch(await readFile(path.join(outDir, "index.html"), "utf8"), canonicalTag);
  } finally {
    if (nodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = nodeEnv;
    await rm(outDir, { recursive: true, force: true });
  }
});

async function createHarness() {
  const elements = [];
  const document = {
    head: {
      querySelector(selector) {
        const [, tagName, attribute, value] = selector.match(/^(\w+)\[(\w+)="([^"]+)"\]$/);
        return elements.find((element) =>
          element.tagName === tagName && element.attributes[attribute] === value) ?? null;
      },
      appendChild(element) { elements.push(element); },
    },
    createElement(tagName) {
      return {
        tagName,
        attributes: {},
        setAttribute(name, value) { this.attributes[name] = value; },
      };
    },
  };
  let currentUrl = new URL("https://www.youhora.com/");
  let previousPathname;
  const context = vm.createContext({
    document,
    matchPath,
    cities,
    getCountryBySlug,
    siteConfig: { publicSiteName: "YouHora" },
    getSiteUrl: (pathname) => new URL(pathname, "https://www.youhora.com").toString(),
    useLocation: () => ({ pathname: currentUrl.pathname, search: currentUrl.search }),
    useEffect(effect, [pathname]) {
      if (pathname !== previousPathname) {
        previousPathname = pathname;
        effect();
      }
    },
  });
  vm.runInContext(stripImports(await read("src/utils/routeMetadata.js"))
    .replace("export function resolveRouteMetadata", "function resolveRouteMetadata"), context);
  vm.runInContext(stripImports(await read("src/components/RouteMetadata.jsx"))
    .replace("export default function RouteMetadata", "function RouteMetadata"), context);

  function render(url) {
    currentUrl = new URL(url, "https://www.youhora.com");
    context.RouteMetadata();
    const canonicals = elements.filter((element) => element.attributes.rel === "canonical");
    assert.equal(canonicals.length, 1, `canonical count at ${currentUrl}`);
    return {
      href: canonicals[0].attributes.href,
      robots: document.head.querySelector('meta[name="robots"]').attributes.content,
    };
  }
  return { render };
}

test("one route-aware canonical covers homepage, city, country, comparison, calculator and planner", async () => {
  const { render } = await createHarness();
  for (const [route, canonical] of [
    ["/", "/"],
    ["/city/toronto", "/city/toronto"],
    ["/country/canada", "/country/canada"],
    ["/compare/toronto/london", "/compare/toronto/london"],
    ["/time-difference", "/time-difference"],
    ["/meeting-planner", "/meeting-planner"],
    ["/time-in/toronto", "/city/toronto"],
  ]) {
    assert.deepEqual(render(route), {
      href: `https://www.youhora.com${canonical}`,
      robots: "index, follow",
    }, route);
  }
});

test("query strings and trailing slashes normalize without duplicating the canonical", async () => {
  const { render } = await createHarness();
  assert.equal(render("/city/toronto/?from=search").href, "https://www.youhora.com/city/toronto");
  assert.equal(render("/city/toronto/?from=share").href, "https://www.youhora.com/city/toronto");
  assert.equal(render("/meeting-planner/?v=2&cities=toronto,london").href,
    "https://www.youhora.com/meeting-planner");
  assert.equal(render("/time-difference/?from=toronto&to=london").href,
    "https://www.youhora.com/time-difference");
});

test("React Router navigation and history update the single canonical", async (t) => {
  class HostNode {
    constructor(nodeType, nodeName, ownerDocument) {
      Object.assign(this, { nodeType, nodeName, ownerDocument, parentNode: null, childNodes: [],
        tagName: nodeType === 1 ? nodeName : undefined, namespaceURI: "http://www.w3.org/1999/xhtml",
        attributes: new Map(), style: { setProperty() {}, removeProperty() {} } });
    }
    get nextSibling() { return this.parentNode?.childNodes[this.parentNode.childNodes.indexOf(this) + 1] ?? null; }
    get firstChild() { return this.childNodes[0] ?? null; }
    appendChild(node) { node.parentNode?.removeChild(node); node.parentNode = this; this.childNodes.push(node); return node; }
    insertBefore(node, before) {
      node.parentNode?.removeChild(node); node.parentNode = this;
      const index = this.childNodes.indexOf(before);
      this.childNodes.splice(index < 0 ? this.childNodes.length : index, 0, node); return node;
    }
    removeChild(node) { this.childNodes.splice(this.childNodes.indexOf(node), 1); node.parentNode = null; return node; }
    setAttribute(name, value) { this.attributes.set(name, String(value)); }
    getAttribute(name) { return this.attributes.get(name) ?? null; }
    addEventListener() {}
    removeEventListener() {}
    getRootNode() { let node = this; while (node.parentNode) node = node.parentNode; return node; }
    querySelector(selector) {
      const [, tagName, attribute, value] = selector.match(/^(\w+)\[(\w+)="([^"]+)"\]$/);
      return this.childNodes.find((node) =>
        node.nodeName === tagName.toUpperCase() && node.getAttribute(attribute) === value) ?? null;
    }
  }
  const document = new HostNode(9, "#document", null);
  document.createElement = (name) => new HostNode(1, name.toUpperCase(), document);
  document.createElementNS = (namespace, name) =>
    Object.assign(document.createElement(name), { namespaceURI: namespace });
  document.createTextNode = (value) =>
    Object.assign(new HostNode(3, "#text", document), { nodeValue: String(value) });
  document.documentElement = document.createElement("html");
  document.appendChild(document.documentElement);
  document.head = document.createElement("head");
  document.documentElement.appendChild(document.head);
  document.body = document.createElement("body");
  document.documentElement.appendChild(document.body);
  document.activeElement = document.body;
  const window = { document, HTMLIFrameElement: class {} };
  document.defaultView = window;
  const keys = ["document", "window", "IS_REACT_ACT_ENVIRONMENT"];
  const originals = keys.map((key) => Object.getOwnPropertyDescriptor(globalThis, key));
  Object.assign(globalThis, { document, window, IS_REACT_ACT_ENVIRONMENT: true });
  let root;
  t.after(async () => {
    if (root) await React.act(async () => root.unmount());
    keys.forEach((key, index) => {
      if (originals[index]) Object.defineProperty(globalThis, key, originals[index]);
      else delete globalThis[key];
    });
  });
  const { createRoot } = await import("react-dom/client");
  const router = await import("react-router-dom");
  const context = vm.createContext({
    document, matchPath, cities, getCountryBySlug,
    siteConfig: { publicSiteName: "YouHora" },
    getSiteUrl: (pathname) => new URL(pathname, "https://www.youhora.com").toString(),
    useEffect: React.useEffect,
    useLocation: router.useLocation,
  });
  vm.runInContext(stripImports(await read("src/utils/routeMetadata.js"))
    .replace("export function resolveRouteMetadata", "function resolveRouteMetadata"), context);
  vm.runInContext(stripImports(await read("src/components/RouteMetadata.jsx"))
    .replace("export default function RouteMetadata", "function RouteMetadata"), context);
  let navigate;
  function Probe() {
    navigate = router.useNavigate();
    return React.createElement(context.RouteMetadata);
  }
  const host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  const canonical = () => {
    const links = document.head.childNodes.filter((node) => node.getAttribute("rel") === "canonical");
    assert.equal(links.length, 1);
    return links[0].getAttribute("href");
  };
  await React.act(async () => root.render(React.createElement(router.MemoryRouter, null,
    React.createElement(Probe))));
  assert.equal(canonical(), "https://www.youhora.com/");
  await React.act(async () => navigate("/city/toronto?from=search"));
  assert.equal(canonical(), "https://www.youhora.com/city/toronto");
  await React.act(async () => navigate("/country/canada/"));
  assert.equal(canonical(), "https://www.youhora.com/country/canada");
  await React.act(async () => navigate(-1));
  assert.equal(canonical(), "https://www.youhora.com/city/toronto");
  await React.act(async () => navigate(-1));
  assert.equal(canonical(), "https://www.youhora.com/");
  await React.act(async () => navigate(1));
  assert.equal(canonical(), "https://www.youhora.com/city/toronto");
});

test("invalid routes retain noindex and their own canonical", async () => {
  const { render } = await createHarness();
  assert.deepEqual(render("/city/not-a-city/?source=broken"), {
    href: "https://www.youhora.com/city/not-a-city",
    robots: "noindex, follow",
  });
  assert.deepEqual(render("/not-a-route/"), {
    href: "https://www.youhora.com/not-a-route",
    robots: "noindex, follow",
  });
});
