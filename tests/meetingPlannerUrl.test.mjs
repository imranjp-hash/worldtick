import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import vm from "node:vm";
import test from "node:test";
import { Temporal } from "@js-temporal/polyfill";
import { cities } from "../src/data/cities.js";
import { generateMeetingPlan } from "../src/utils/meetingPlanner.js";
import { buildCanonicalMeetingPlannerPath as build, parseMeetingPlannerSearch as parse,
  plannerUrlParameters } from "../src/utils/meetingPlannerUrl.js";

const windows = (slugs, start = "09:00", end = "17:00") => Object.fromEntries(slugs.map((slug) => [slug, { start, end }]));
const base = { citySlugs: ["toronto", "london"], referenceCitySlug: "toronto",
  referenceDate: "2027-03-27", cityPreferences: windows(["toronto", "london"]) };
const legacy = "/meeting-planner?v=1&cities=toronto%2Clondon&reference=toronto&date=2027-03-27&hoursStart=09%3A00&hoursEnd=17%3A00";
const canonical = "/meeting-planner?v=2&cities=toronto%2Clondon&reference=toronto&date=2027-03-27&hours=toronto%3A09%3A00-17%3A00%2Clondon%3A09%3A00-17%3A00";
const query = (path) => new URL(path, "https://www.youhora.com").search;
function changed(name, value, path = legacy) {
  const params = new URLSearchParams(query(path));
  if (value === null) params.delete(name); else params.set(name, value);
  return `?${params}`;
}

test("two-city canonical URL explicitly includes reference, default hours, order and encoding", () => {
  assert.equal(build(base), canonical);
  assert.deepEqual([...new URLSearchParams(query(build(base))).keys()], plannerUrlParameters.slice(0, -1));
  assert.equal(build(base), build(structuredClone(base)));
  assert.deepEqual(parse(query(build(base))).inputs, base);
});

test("five-city URLs preserve exact display order, same-zone cities and non-default minute endpoints", () => {
  const inputs = { ...base, citySlugs: ["tokyo", "montreal", "toronto", "kathmandu", "london"],
    referenceCitySlug: "montreal", cityPreferences: windows(["tokyo", "montreal", "toronto", "kathmandu", "london"], "08:15", "18:45") };
  const path = build(inputs);
  assert.match(path, /cities=tokyo%2Cmontreal%2Ctoronto%2Ckathmandu%2Clondon&reference=montreal/);
  assert.match(path, /hours=tokyo%3A08%3A15-18%3A45.*london%3A08%3A15-18%3A45$/);
  assert.deepEqual(parse(query(path)).inputs, inputs);
  assert.deepEqual(inputs.citySlugs, ["tokyo", "montreal", "toronto", "kathmandu", "london"]);
});

test("no recognized planner parameters gives ordinary defaults, not an incomplete shared plan", () => {
  for (const search of ["", "?", "?campaign=a&campaign=b", "?from=toronto&to=london"]) {
    assert.deepEqual(parse(search), { status: "default" });
  }
});

test("every historical v1 required parameter rejects missing, empty and duplicate values", () => {
  for (const name of ["v", "cities", "reference", "date", "hoursStart", "hoursEnd"]) {
    for (const value of [null, ""]) assert.equal(parse(changed(name, value)).status, "invalid", name);
    const params = new URLSearchParams(query(legacy));
    assert.equal(parse(`${query(legacy)}&${name}=${encodeURIComponent(params.get(name))}`).status, "invalid", name);
    const encodedName = `%${name.charCodeAt(0).toString(16)}${name.slice(1)}`;
    assert.equal(parse(`${query(legacy)}&${encodedName}=${encodeURIComponent(params.get(name))}`).status, "invalid", name);
    assert.equal(parse(`?${name}=${encodeURIComponent(params.get(name))}`).status, "invalid", name);
  }
});

test("versions reject repair and v2 cannot reinterpret the legacy shared shape", () => {
  for (const version of ["2", "3", "01", "1.0", " 1", "1\n", "v1", "%31"]) {
    assert.equal(parse(changed("v", version)).status, "invalid", version);
  }
});

test("city lists reject malformed entries, duplicates, unknowns and normalization traps", () => {
  for (const list of ["toronto", "toronto,london,paris,tokyo,sydney,mumbai", "toronto,toronto",
    "toronto,unknown", ",toronto,london", "toronto,london,", "toronto,,london", "Toronto,london",
    "toronto, london", "toronto,london\n", "toronto;london", "toronto%2Clondon", "toronto+london"]) {
    assert.equal(parse(changed("cities", list)).status, "invalid", list);
  }
  assert.equal(parse(changed("cities", "toronto,montreal")).status, "success");
});

test("single encoded commas work; double encoded commas and malformed escapes do not", () => {
  assert.equal(parse(query(canonical).replace("%2C", ",")).status, "success");
  assert.equal(parse(query(canonical).replace("%2C", "%2c")).status, "success");
  for (const separator of ["%252C", "%2", "%ZZ"]) {
    assert.equal(parse(query(canonical).replace("%2C", separator)).status, "invalid");
  }
});

test("reference must be an exact selected slug", () => {
  for (const reference of ["paris", "unknown", "Toronto", " toronto", "toronto\n"]) {
    assert.equal(parse(changed("reference", reference)).status, "invalid");
  }
  assert.equal(parse(changed("reference", "london")).inputs.referenceCitySlug, "london");
});

test("date validation reuses strict Gregorian and supported-range policy", () => {
  for (const date of ["2027-3-27", "2027-03-27T00:00Z", "2027-02-29", "2027-02-30", "2100-02-29",
    "2019-12-31", "9999-12-31", "2027-03-27\n", "0000-01-01"]) {
    assert.equal(parse(changed("date", date)).status, "invalid", date);
  }
  for (const date of ["2020-01-01", "2020-02-29", "2400-02-29", "9999-12-30"]) {
    assert.equal(parse(changed("date", date)).status, "success", date);
  }
});

test("preferred windows reject malformed, equal and overnight endpoints, including trailing newlines", () => {
  for (const name of ["hoursStart", "hoursEnd"]) {
    for (const value of ["9:00", "24:00", "09:00:00", "09:60", " 09:00", "09:00\n", "09:00\r"]) {
      assert.equal(parse(changed(name, value)).status, "invalid", `${name}=${value}`);
    }
  }
  assert.equal(parse(changed("hoursEnd", "09:00")).status, "invalid");
  assert.equal(parse(changed("hoursStart", "18:00")).status, "invalid");
  assert.equal(parse(changed("hoursStart", "22:00")).status, "invalid");
});

test("canonical copies strip extras and hash, accept input parameter reordering, and leave source untouched", () => {
  const source = new URL(`https://example.test${canonical}&tag=a&tag=b#meeting`);
  const reversed = new URLSearchParams([...source.searchParams].reverse());
  const state = parse(`?${reversed}`);
  assert.equal(state.status, "success");
  assert.equal(build(state.inputs), canonical);
  assert.equal(source.hash, "#meeting");
  assert.equal(source.searchParams.getAll("tag").length, 2);
});

test("complete selected link round trip restores exact candidate, with start last", () => {
  const epoch = 1806152400000;
  assert.equal(build(base, epoch), `${canonical}&start=${epoch}`);
  const parsed = parse(query(build(base, epoch)));
  assert.equal(parsed.selectedStartEpochMilliseconds, epoch);
  assert.equal(parsed.selectionIssue, null);
  assert.deepEqual(parsed.inputs, base);
});

test("malformed and noncanonical epochs clear only selection", () => {
  for (const epoch of ["", "-1", "+1", "1.0", "1e12", " 1806152400000", "1806152400000 ",
    "1806152400000\n", "1806152400000\r", "01806152400000", "00", "9007199254740992", "Infinity", "NaN", "0"]) {
    const state = parse(changed("start", epoch));
    assert.equal(state.status, "success", epoch);
    assert.deepEqual(state.inputs, base);
    assert.equal(state.selectedStartEpochMilliseconds, null);
    assert.equal(state.selectionIssue, "INVALID_SELECTION");
  }
  for (const suffix of ["&start=1806152400000&start=1806152400000", "&start=1806152400000&%73tart=1806154200000"]) {
    assert.equal(parse(`${query(canonical)}${suffix}`).selectionIssue, "INVALID_SELECTION");
  }
});

test("wrong date, wrong sampling grid and nearby epochs never choose another candidate", () => {
  for (const epoch of [Date.parse("2027-03-28T13:00Z"), 1806152400001, 1806152401000, 1806152460000]) {
    const state = parse(changed("start", String(epoch)));
    assert.equal(state.status, "success");
    assert.equal(state.selectedStartEpochMilliseconds, null);
  }
  const params = new URLSearchParams(query(legacy));
  params.set("cities", "kathmandu,london"); params.set("reference", "kathmandu"); params.set("start", "1806152400000");
  assert.equal(parse(`?${params}`).selectionIssue, "INVALID_SELECTION");
});

test("Toronto first and second 1 AM are distinct exact candidates despite identical clock labels", () => {
  const inputs = { ...base, referenceDate: "2027-11-07", cityPreferences: windows(base.citySlugs, "01:00", "07:00") };
  const plan = generateMeetingPlan(inputs);
  const epochs = [1825563600000, 1825567200000];
  const candidates = epochs.map((epoch) => plan.candidates.find((candidate) => candidate.startEpochMilliseconds === epoch));
  assert.equal(plan.candidates.length, 50);
  assert.deepEqual(candidates.map((candidate) => candidate.locations[0].start.time), ["01:00:00", "01:00:00"]);
  assert.deepEqual(candidates.map((candidate) => candidate.locations[0].start.offset), ["-04:00", "-05:00"]);
  for (const epoch of epochs) assert.equal(parse(query(build(inputs, epoch))).selectedStartEpochMilliseconds, epoch);
  assert.notEqual(build(inputs, epochs[0]), build(inputs, epochs[1]));
});

test("valid alternatives, past candidates and epochs shared by different configurations remain shareable", () => {
  const alternative = generateMeetingPlan(base).candidates[0];
  assert.equal(alternative.allWithinPreferredHours, false);
  assert.equal(parse(query(build(base, alternative.startEpochMilliseconds))).selectedStartEpochMilliseconds, alternative.startEpochMilliseconds);
  const past = { ...base, referenceDate: "2020-01-01" };
  assert.equal(parse(query(build(past, generateMeetingPlan(past).candidates[0].startEpochMilliseconds))).status, "success");
  for (const inputs of [base, { ...base, citySlugs: ["toronto", "paris"], cityPreferences: windows(["toronto", "paris"]) },
    { ...base, cityPreferences: windows(base.citySlugs, "12:00", "13:00") }]) {
    assert.equal(parse(query(build(inputs, 1806152400000))).selectedStartEpochMilliseconds, 1806152400000);
  }
});

test("serializer refuses incomplete inputs, invalid windows and unvalidated selections", () => {
  for (const inputs of [null, {}, { ...base, cityPreferences: undefined }, { ...base, referenceDate: "" },
    { ...base, citySlugs: ["toronto"] }, { ...base, cityPreferences: windows(base.citySlugs, "09:00\n", "17:00") }]) {
    assert.equal(build(inputs), null);
  }
  for (const selection of ["1806152400000", 1806152400001, NaN, Infinity, -1]) assert.equal(build(base, selection), null);
});

test("fractional reference offsets and spring-forward membership survive URL round trips", () => {
  const fractional = { ...base, citySlugs: ["kathmandu", "mumbai"], referenceCitySlug: "kathmandu", cityPreferences: windows(["kathmandu", "mumbai"]) };
  const first = generateMeetingPlan(fractional).candidates[0];
  assert.equal(first.locations[0].start.offset, "+05:45");
  assert.equal(parse(query(build(fractional, first.startEpochMilliseconds))).selectedStartEpochMilliseconds, first.startEpochMilliseconds);
  const spring = { ...base, referenceDate: "2027-03-14" };
  const plan = generateMeetingPlan(spring);
  assert.equal(plan.candidates.length, 46);
  assert.ok(plan.candidates.every((candidate) => !candidate.locations[0].start.time.startsWith("02:")));
  const last = plan.candidates.at(-1).startEpochMilliseconds;
  assert.equal(parse(query(build(spring, last))).selectedStartEpochMilliseconds, last);
});

test("fixture catalogs exercise Lord Howe, date-line extremes and timezone-rule membership drift", async () => {
  const engineSource = await readFile(new URL("../src/utils/meetingPlanner.js", import.meta.url), "utf8");
  const urlSource = await readFile(new URL("../src/utils/meetingPlannerUrl.js", import.meta.url), "utf8");
  const context = vm.createContext({ Temporal, cities: [...cities,
    { slug: "lord-howe", timezone: "Australia/Lord_Howe" },
    { slug: "west", timezone: "Etc/GMT+12" }, { slug: "east", timezone: "Pacific/Kiritimati" }],
    Map, Set, RangeError, URLSearchParams });
  const executable = (source) => source.replace(/^import[^\n]*\n/gm, "").replaceAll("export const", "const").replaceAll("export function", "function");
  vm.runInContext(executable(engineSource), context);
  vm.runInContext(executable(urlSource), context);
  for (const [referenceDate, count] of [["2027-04-04", 49], ["2027-10-03", 47]]) {
    const inputs = { ...base, citySlugs: ["lord-howe", "sydney"], referenceCitySlug: "lord-howe", referenceDate, cityPreferences: windows(["lord-howe", "sydney"]) };
    const plan = context.generateMeetingPlan(inputs);
    assert.equal(plan.candidates.length, count);
    const epoch = plan.candidates[3].startEpochMilliseconds;
    assert.equal(context.parseMeetingPlannerSearch(query(context.buildCanonicalMeetingPlannerPath(inputs, epoch))).selectedStartEpochMilliseconds, epoch);
  }
  for (const [citySlugs, referenceDate, iso, difference] of [
    [["west", "east"], "2027-01-01", "2027-01-02T11:30Z", 2],
    [["east", "west"], "2027-01-03", "2027-01-02T10:30Z", -2],
  ]) {
    const inputs = { ...base, citySlugs, referenceCitySlug: citySlugs[0], referenceDate, cityPreferences: windows(citySlugs) };
    const epoch = Date.parse(iso);
    const plan = context.generateMeetingPlan(inputs);
    assert.equal(plan.candidates.find((candidate) => candidate.startEpochMilliseconds === epoch).locations[1].dayDifference, difference);
    assert.equal(context.parseMeetingPlannerSearch(query(context.buildCanonicalMeetingPlannerPath(inputs, epoch))).selectedStartEpochMilliseconds, epoch);
  }
  assert.equal(parse(changed("cities", "lord-howe,sydney")).status, "invalid");
  const original = context.generateMeetingPlan;
  context.generateMeetingPlan = (inputs) => {
    const plan = original(inputs);
    return { ...plan, candidates: plan.candidates.filter((candidate) => candidate.startEpochMilliseconds !== 1806152400000) };
  };
  const drifted = context.parseMeetingPlannerSearch(`${query(canonical)}&start=1806152400000`);
  assert.equal(drifted.status, "success");
  assert.equal(drifted.selectedStartEpochMilliseconds, null);
  assert.equal(drifted.selectionIssue, "INVALID_SELECTION");
});

test("URL hydration and serialization are host-timezone and clock independent", () => {
  const moduleUrl = new URL("../src/utils/meetingPlannerUrl.js", import.meta.url).href;
  const script = `const {parseMeetingPlannerSearch,buildCanonicalMeetingPlannerPath}=await import(${JSON.stringify(moduleUrl)}); Date.now=()=>{throw Error('Implicit clock')}; const result=parseMeetingPlannerSearch(${JSON.stringify(query(canonical) + "&start=1806152400000")}); console.log(JSON.stringify({result,path:buildCanonicalMeetingPlannerPath(result.inputs,result.selectedStartEpochMilliseconds)}));`;
  let expected;
  for (const TZ of ["UTC", "America/Los_Angeles", "Asia/Kathmandu"]) {
    const child = spawnSync(process.execPath, ["--input-type=module", "-e", script], { env: { ...process.env, TZ }, encoding: "utf8" });
    assert.equal(child.status, 0, child.stderr);
    expected ??= child.stdout;
    assert.equal(child.stdout, expected);
  }
});

test("five longest catalog slugs retain a bounded canonical URL at the upper date limit", () => {
  const longest = [...cities].sort((a, b) => b.slug.length - a.slug.length || (a.slug < b.slug ? -1 : 1)).slice(0, 5);
  const inputs = { ...base, citySlugs: longest.map((city) => city.slug), referenceCitySlug: longest[0].slug, referenceDate: "9999-12-30", cityPreferences: windows(longest.map((city) => city.slug)) };
  const epoch = generateMeetingPlan(inputs).candidates.at(-1).startEpochMilliseconds;
  assert.equal(`https://www.youhora.com${build(inputs)}`.length, 355);
  assert.equal(`https://www.youhora.com${build(inputs, epoch)}`.length, 377);
  assert.equal(parse(query(build(inputs, epoch))).selectedStartEpochMilliseconds, epoch);
});

test("historical v1 shared semantics expand independently and all copies upgrade to v2", () => {
  const parsed = parse(`${query(legacy)}&hours=ignored&hours=also-ignored&start=1806152400000`);
  assert.deepEqual(parsed.inputs, base);
  assert.notEqual(parsed.inputs.cityPreferences.toronto, parsed.inputs.cityPreferences.london);
  assert.equal(build(parsed.inputs), canonical);
  assert.equal(build(parsed.inputs, parsed.selectedStartEpochMilliseconds), `${canonical}&start=1806152400000`);
  const custom = parse(changed("hoursStart", "08:15"));
  assert.deepEqual(custom.inputs.cityPreferences, windows(base.citySlugs, "08:15", "17:00"));
});

test("v2 canonicalizes independent windows by city order rather than map insertion order", () => {
  const inputs = { ...base, cityPreferences: { london: { start: "09:30", end: "17:30" }, toronto: { start: "08:00", end: "16:00" } } };
  const expected = "/meeting-planner?v=2&cities=toronto%2Clondon&reference=toronto&date=2027-03-27&hours=toronto%3A08%3A00-16%3A00%2Clondon%3A09%3A30-17%3A30";
  assert.equal(build(inputs), expected);
  const parsed = parse(changed("hours", "london:09:30-17:30,toronto:08:00-16:00", canonical));
  assert.deepEqual(parsed.inputs, inputs);
  assert.equal(build(parsed.inputs), expected);
  assert.deepEqual(parse(query(build(inputs, 1806152400000))).inputs, inputs);
  const reordered = { ...inputs, citySlugs: ["london", "toronto"] };
  assert.match(build(reordered), /cities=london%2Ctoronto.*hours=london%3A09%3A30-17%3A30%2Ctoronto%3A08%3A00-16%3A00$/);
});

test("v2 required fields and encoded-name duplicates fail as invalid plans", () => {
  for (const name of plannerUrlParameters.slice(0, -1)) {
    for (const value of [null, ""]) assert.equal(parse(changed(name, value, canonical)).status, "invalid");
    const value = new URLSearchParams(query(canonical)).get(name);
    for (const key of [name, `%${name.charCodeAt(0).toString(16)}${name.slice(1)}`]) {
      assert.equal(parse(`${query(canonical)}&${key}=${encodeURIComponent(value)}`).status, "invalid");
    }
  }
  for (const field of ["hoursStart", "hoursEnd", "%68oursStart"]) {
    assert.equal(parse(`${query(canonical)}&${field}=09%3A00`).status, "invalid");
  }
  assert.equal(parse("?hours=toronto:09:00-17:00").status, "invalid");
  assert.equal(parse(changed("v", "3", canonical)).status, "invalid");
});

test("v2 rejects incomplete, duplicate, unselected and malformed preference entries without repair", () => {
  const valid = "toronto:09:00-17:00,london:09:00-17:00";
  for (const hours of ["toronto:09:00-17:00", `${valid},paris:09:00-17:00`, `${valid},london:09:00-17:00`,
    "toronto:09:00-17:00,toronto:08:00-16:00", "toronto:09:00-17:00,unknown:09:00-17:00",
    "Toronto:09:00-17:00,london:09:00-17:00", ` ${valid}`, `${valid}\n`, `${valid},`,
    "toronto=09:00-17:00,london:09:00-17:00", "__proto__:09:00-17:00,london:09:00-17:00"]) {
    assert.equal(parse(changed("hours", hours, canonical)).status, "invalid", hours);
  }
  for (const [start, end] of [["9:00", "17:00"], ["24:00", "17:00"], ["09:60", "17:00"], ["09:00:00", "17:00"],
    [" 09:00", "17:00"], ["09:00", "17:00\r"], ["09:00", "09:00"], ["22:00", "06:00"]]) {
    assert.equal(parse(changed("hours", `toronto:${start}-${end},london:09:00-17:00`, canonical)).status, "invalid");
  }
  for (const cityList of ["toronto,toronto", "toronto,unknown", "Toronto,london", "toronto,london,paris"]) {
    assert.equal(parse(changed("cities", cityList, canonical)).status, "invalid");
  }
});

test("v2 decodes delimiters exactly once and strips unrelated extras", () => {
  assert.equal(parse(query(canonical).replaceAll("%3A", ":").replaceAll("%2C", ",")).status, "success");
  assert.equal(parse(query(canonical).toLowerCase()).status, "success");
  for (const token of ["%253A", "%3", "%ZZ", "%FF"]) {
    assert.equal(parse(query(canonical).replace("toronto%3A", `toronto${token}`)).status, "invalid");
  }
  const reordered = new URLSearchParams([...new URLSearchParams(`${query(canonical)}&tag=a&tag=b`)].reverse());
  assert.equal(build(parse(`?${reordered}`).inputs), canonical);
});

test("v2 malformed selection preserves the independent plan and alternatives remain selectable", () => {
  for (const start of ["", "-1", "+1", "1.5", "1e12", "01806152400000", "9007199254740992", "1806152400001", "1806152400000\n"]) {
    const parsed = parse(changed("start", start, canonical));
    assert.equal(parsed.status, "success");
    assert.deepEqual(parsed.inputs, base);
    assert.equal(parsed.selectedStartEpochMilliseconds, null);
    assert.equal(parsed.selectionIssue, "INVALID_SELECTION");
  }
  assert.equal(parse(`${query(canonical)}&start=1806152400000&%73tart=1806152400000`).selectionIssue, "INVALID_SELECTION");
  const alternative = generateMeetingPlan(base).candidates[0];
  assert.equal(parse(query(build(base, alternative.startEpochMilliseconds))).selectedStartEpochMilliseconds, alternative.startEpochMilliseconds);
});
