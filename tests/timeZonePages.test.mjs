import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import { transformWithOxc } from "vite";
import { cities } from "../src/data/cities.js";
import { countrySlug, getCountryBySlug } from "../src/data/countries.js";
import * as dateTime from "../src/utils/dateTime.js";

const withoutImports = (source) => source.replace(/^import[\s\S]*?;\r?\n/gm, "");

function nodeText(node) {
  if (node === null || node === undefined || typeof node === "boolean") return "";
  if (typeof node !== "object") return String(node);
  if (Array.isArray(node)) return node.map(nodeText).join("");
  return node.children.map(nodeText).join("");
}

async function renderPage(fileName, functionName, params, now) {
  const source = await readFile(new URL(`../src/pages/${fileName}`, import.meta.url), "utf8");
  const { code } = await transformWithOxc(source, fileName, {
    jsx: { runtime: "classic", pragma: "createElement" },
  });
  const context = vm.createContext({
    ...dateTime,
    React: { Fragment: "Fragment" },
    cities,
    countrySlug,
    getCountryBySlug,
    getSiteUrl: (path) => `https://example.test${path}`,
    Link: "Link",
    NotFoundPage: "NotFoundPage",
    StructuredData: "StructuredData",
    useNow: () => now,
    useParams: () => params,
    createElement: (type, props, ...children) => ({ type, props: props || {}, children }),
  });
  vm.runInContext(withoutImports(code).replace("export default function", "function"), context);
  return nodeText(context[functionName]());
}

test("ComparisonPage shows exact-instant clarity without exposing IANA identifiers", async () => {
  const text = await renderPage(
    "ComparisonPage.jsx",
    "ComparisonPage",
    { fromCity: "toronto", toCity: "london" },
    new Date("2027-03-15T12:00:00Z"),
  );

  assert.match(text, /Eastern Daylight Time · UTC−4/);
  assert.match(text, /Greenwich Mean Time · UTC\+0/);
  assert.doesNotMatch(text, /America\/Toronto|Europe\/London/);
});

test("CityPage replaces its visible IANA identifier with exact-instant clarity", async () => {
  const text = await renderPage(
    "CityPage.jsx",
    "CityPage",
    { city: "toronto" },
    new Date("2027-01-15T12:00:00Z"),
  );

  assert.match(text, /Eastern Standard Time · UTC−5/);
  assert.doesNotMatch(text, /America\/Toronto/);
});
