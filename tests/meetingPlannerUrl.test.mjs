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

const base = { citySlugs: ["toronto", "london"], referenceCitySlug: "toronto",
  referenceDate: "2027-03-27", preferredWindow: { start: "09:00", end: "17:00" } };
const canonical = "/meeting-planner?v=1&cities=toronto%2Clondon&reference=toronto&date=2027-03-27&hoursStart=09%3A00&hoursEnd=17%3A00";
const query = (path) => new URL(path, "https://www.youhora.com").search;
function changed(name, value) {
  const params = new URLSearchParams(query(canonical));
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
    referenceCitySlug: "montreal", preferredWindow: { start: "08:15", end: "18:45" } };
  const path = build(inputs);
  assert.match(path, /cities=tokyo%2Cmontreal%2Ctoronto%2Ckathmandu%2Clondon&reference=montreal/);
  assert.match(path, /hoursStart=08%3A15&hoursEnd=18%3A45$/);
  assert.deepEqual(parse(query(path)).inputs, inputs);
  assert.deepEqual(inputs.citySlugs, ["tokyo", "montreal", "toronto", "kathmandu", "london"]);
});

test("no recognized planner parameters gives ordinary defaults, not an incomplete shared plan", () => {
  for (const search of ["", "?", "?campaign=a&campaign=b", "?from=toronto&to=london"]) {
    assert.deepEqual(parse(search), { status: "default" });
  }
});

test("every required parameter rejects missing, empty, identical duplicate and encoded-name duplicate", () => {
  for (const name of plannerUrlParameters.slice(0, -1)) {
    for (const value of [null, ""]) assert.equal(parse(changed(name, value)).status, "invalid", name);
    const params = new URLSearchParams(query(canonical));
    assert.equal(parse(`${query(canonical)}&${name}=${encodeURIComponent(params.get(name))}`).status, "invalid", name);
    const encodedName = `%${name.charCodeAt(0).toString(16)}${name.slice(1)}`;
    assert.equal(parse(`${query(canonical)}&${encodedName}=${encodeURIComponent(params.get(name))}`).status, "invalid", name);
    assert.equal(parse(`?${name}=${encodeURIComponent(params.get(name))}`).status, "invalid", name);
  }
});

test("versions require exactly v=1 without trimming or repair", () => {
  for (const version of ["2", "01", "1.0", " 1", "1\n", "v1", "%31"]) {
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
  const params = new URLSearchParams(query(canonical));
  params.set("cities", "kathmandu,london"); params.set("reference", "kathmandu"); params.set("start", "1806152400000");
  assert.equal(parse(`?${params}`).selectionIssue, "INVALID_SELECTION");
});

test("Toronto first and second 1 AM are distinct exact candidates despite identical clock labels", () => {
  const inputs = { ...base, referenceDate: "2027-11-07", preferredWindow: { start: "01:00", end: "07:00" } };
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
  for (const inputs of [base, { ...base, citySlugs: ["toronto", "paris"] },
    { ...base, preferredWindow: { start: "12:00", end: "13:00" } }]) {
    assert.equal(parse(query(build(inputs, 1806152400000))).selectedStartEpochMilliseconds, 1806152400000);
  }
});

test("serializer refuses incomplete inputs, invalid windows and unvalidated selections", () => {
  for (const inputs of [null, {}, { ...base, preferredWindow: undefined }, { ...base, referenceDate: "" },
    { ...base, citySlugs: ["toronto"] }, { ...base, preferredWindow: { start: "09:00\n", end: "17:00" } }]) {
    assert.equal(build(inputs), null);
  }
  for (const selection of ["1806152400000", 1806152400001, NaN, Infinity, -1]) assert.equal(build(base, selection), null);
});

test("fractional reference offsets and spring-forward membership survive URL round trips", () => {
  const fractional = { ...base, citySlugs: ["kathmandu", "mumbai"], referenceCitySlug: "kathmandu" };
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
    const inputs = { ...base, citySlugs: ["lord-howe", "sydney"], referenceCitySlug: "lord-howe", referenceDate };
    const plan = context.generateMeetingPlan(inputs);
    assert.equal(plan.candidates.length, count);
    const epoch = plan.candidates[3].startEpochMilliseconds;
    assert.equal(context.parseMeetingPlannerSearch(query(context.buildCanonicalMeetingPlannerPath(inputs, epoch))).selectedStartEpochMilliseconds, epoch);
  }
  for (const [citySlugs, referenceDate, iso, difference] of [
    [["west", "east"], "2027-01-01", "2027-01-02T11:30Z", 2],
    [["east", "west"], "2027-01-03", "2027-01-02T10:30Z", -2],
  ]) {
    const inputs = { ...base, citySlugs, referenceCitySlug: citySlugs[0], referenceDate };
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
  const inputs = { ...base, citySlugs: longest.map((city) => city.slug), referenceCitySlug: longest[0].slug, referenceDate: "9999-12-30" };
  const epoch = generateMeetingPlan(inputs).candidates.at(-1).startEpochMilliseconds;
  assert.equal(`https://www.youhora.com${build(inputs)}`.length, 212);
  assert.equal(`https://www.youhora.com${build(inputs, epoch)}`.length, 234);
  assert.equal(parse(query(build(inputs, epoch))).selectedStartEpochMilliseconds, epoch);
});
