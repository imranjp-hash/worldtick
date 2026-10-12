import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import vm from "node:vm";
import test from "node:test";
import { Temporal } from "@js-temporal/polyfill";
import { cities } from "../src/data/cities.js";
import { generateMeetingPlan, MEETING_DURATION_MILLISECONDS, MIN_PLANNER_DATE, MAX_PLANNER_DATE } from "../src/utils/meetingPlanner.js";

const base = { citySlugs: ["toronto", "london"], referenceCitySlug: "toronto", referenceDate: "2027-03-27" };
const plan = (changes = {}) => generateMeetingPlan({ ...base, ...changes });
const location = (candidate, slug) => candidate.locations.find((row) => row.citySlug === slug);
const at = (result, iso) => result.candidates.find((candidate) => candidate.startEpochMilliseconds === Date.parse(iso));

// Fixed UTC expectations independently identify the boundaries, including days
// whose midnight is skipped or repeated. The following boundary matters too.
const dayFixtures = [
  ["toronto", "2027-03-27", "2027-03-27T04:00Z", "2027-03-28T04:00Z", "00:00:00", 48],
  ["toronto", "2027-03-14", "2027-03-14T05:00Z", "2027-03-15T04:00Z", "00:00:00", 46],
  ["toronto", "2027-11-07", "2027-11-07T04:00Z", "2027-11-08T05:00Z", "00:00:00", 50],
  ["santiago", "2027-09-05", "2027-09-05T04:00Z", "2027-09-06T03:00Z", "01:00:00", 46],
  ["santiago", "2027-09-04", "2027-09-04T04:00Z", "2027-09-05T04:00Z", "00:00:00", 48],
  ["cairo", "2027-04-30", "2027-04-29T22:00Z", "2027-04-30T21:00Z", "01:00:00", 46],
  ["amman", "2021-03-26", "2021-03-25T22:00Z", "2021-03-26T21:00Z", "01:00:00", 46],
  ["amman", "2021-10-29", "2021-10-28T21:00Z", "2021-10-29T22:00Z", "00:00:00", 50],
  ["asuncion", "2024-10-06", "2024-10-06T04:00Z", "2024-10-07T03:00Z", "01:00:00", 46],
];
const dayInput = ([referenceCitySlug, referenceDate]) => ({ citySlugs: [referenceCitySlug, "london"], referenceCitySlug, referenceDate });

async function plannerWithFixtures(fixtures) {
  const source = await readFile(new URL("../src/utils/meetingPlanner.js", import.meta.url), "utf8");
  const context = vm.createContext({ Temporal, cities: [...cities, ...fixtures], Map, Set, RangeError });
  vm.runInContext(source.replace(/^import[^\n]*\n/gm, "").replaceAll("export const", "const").replaceAll("export function", "function"), context);
  return context.generateMeetingPlan;
}

test("ordinary two-, three- and five-city overlaps preserve every city", () => {
  for (const [citySlugs, count] of [
    [["toronto", "london"], 8],
    [["toronto", "london", "paris"], 6],
    [["toronto", "montreal", "new-york", "london", "paris"], 6],
  ]) {
    const result = plan({ citySlugs });
    assert.equal(result.status, "success");
    assert.equal(result.preferredCandidates.length, count);
    assert.equal(result.preferredCandidates[0].startEpochMilliseconds, Date.parse("2027-03-27T13:00Z"));
    assert.equal(result.candidates[0].locations.length, citySlugs.length);
  }
});

test("no overlap and alternatives have transparent deterministic ordering", () => {
  const result = plan({ citySlugs: ["toronto", "london", "tokyo"] });
  assert.equal(result.preferredCandidates.length, 0);
  assert.equal(result.alternatives.length, 48);
  for (let index = 1; index < result.alternatives.length; index++) {
    const a = result.alternatives[index - 1], b = result.alternatives[index];
    assert.ok(a.withinPreferredCount > b.withinPreferredCount ||
      a.withinPreferredCount === b.withinPreferredCount && a.startEpochMilliseconds < b.startEpochMilliseconds);
  }
  for (const candidate of result.candidates) {
    assert.equal(candidate.withinPreferredCount, candidate.locations.filter((row) => row.isWithinPreferredHours).length);
  }
});

test("exactly one candidate and opening/closing boundaries are inclusive for the meeting", () => {
  const result = plan({ citySlugs: ["toronto", "montreal"], preferredWindow: { start: "09:00", end: "09:30" } });
  assert.equal(result.preferredCandidates.length, 1);
  assert.equal(result.preferredCandidates[0].locations[0].start.time, "09:00:00");
  assert.equal(result.preferredCandidates[0].locations[0].end.time, "09:30:00");
  const ordinary = plan({ citySlugs: ["toronto", "montreal"] });
  assert.equal(at(ordinary, "2027-03-27T20:30Z").allWithinPreferredHours, true);
  assert.equal(at(ordinary, "2027-03-27T21:00Z").allWithinPreferredHours, false);
});

test("meeting extending past closing is rejected, including :45 local starts", () => {
  const result = plan({ citySlugs: ["toronto", "kathmandu"] });
  const candidate = result.candidates.find((value) => location(value, "kathmandu").start.time === "16:45:00");
  assert.equal(location(candidate, "kathmandu").end.time, "17:15:00");
  assert.equal(location(candidate, "kathmandu").isWithinPreferredHours, false);
});

test("fractional offsets preserve Kolkata and Kathmandu projections", () => {
  const candidate = at(plan({ citySlugs: ["toronto", "mumbai", "kathmandu"] }), "2027-03-27T13:00Z");
  assert.deepEqual(location(candidate, "mumbai").start, { date: "2027-03-27", time: "18:30:00", offset: "+05:30" });
  assert.deepEqual(location(candidate, "kathmandu").start, { date: "2027-03-27", time: "18:45:00", offset: "+05:45" });
});

test("Toronto spring and autumn dates scan elapsed instants and retain repeated occurrences", () => {
  for (const [referenceDate, count, hours] of [["2027-03-14", 46, 23], ["2027-11-07", 50, 25]]) {
    const result = plan({ referenceDate });
    assert.equal(result.candidates.length, count);
    assert.equal(result.referenceDay.endEpochMilliseconds - result.referenceDay.startEpochMilliseconds, hours * 3600000);
    assert.ok(result.candidates.every((candidate) => location(candidate, "toronto").start.date === referenceDate));
  }
  const spring = plan({ referenceDate: "2027-03-14" });
  assert.ok(spring.candidates.every((candidate) => !location(candidate, "toronto").start.time.startsWith("02:")));
  const autumn = plan({ referenceDate: "2027-11-07" });
  const repeated = autumn.candidates.filter((candidate) => location(candidate, "toronto").start.time === "01:30:00");
  assert.equal(repeated.length, 2);
  assert.equal(repeated[1].startEpochMilliseconds - repeated[0].startEpochMilliseconds, 3600000);
  assert.notEqual(location(repeated[0], "toronto").start.offset, location(repeated[1], "toronto").start.offset);
});

test("Lord Howe 30-minute transitions use the same engine with a catalog fixture", async () => {
  // Lord Howe is not in the product catalog. Inject only a test catalog entry;
  // production still accepts catalog slugs exclusively, without an override API.
  const generate = await plannerWithFixtures([{ slug: "lord-howe", timezone: "Australia/Lord_Howe" }]);
  const originalNow = Date.now;
  Date.now = () => { throw Error("Implicit clock"); };
  try {
    for (const [referenceDate, count, start, end] of [
      ["2027-04-04", 49, "2027-04-03T13:00Z", "2027-04-04T13:30Z"],
      ["2027-10-03", 47, "2027-10-02T13:30Z", "2027-10-03T13:00Z"],
    ]) {
      const result = generate({ citySlugs: ["lord-howe", "sydney"], referenceCitySlug: "lord-howe", referenceDate });
      assert.equal(result.status, "success");
      assert.equal(result.candidates.length, count);
      assert.equal(result.referenceDay.startEpochMilliseconds, Date.parse(start));
      assert.equal(result.referenceDay.endEpochMilliseconds, Date.parse(end));
    }
  } finally {
    Date.now = originalNow;
  }
});

test("Lord Howe full intervals retain the pre-transition occupancy, not just endpoint clocks", async () => {
  const generate = await plannerWithFixtures([{ slug: "lord-howe", timezone: "Australia/Lord_Howe" }]);
  for (const [referenceDate, iso, closing, startTime, endTime, expected] of [
    ["2027-04-03", "2027-04-03T14:45Z", "01:50", "01:45:00", "01:45:00", false],
    ["2027-04-03", "2027-04-03T14:45Z", "02:00", "01:45:00", "01:45:00", true],
    ["2027-10-02", "2027-10-02T15:15Z", "02:50", "01:45:00", "02:45:00", true],
    ["2027-10-02", "2027-10-02T15:15Z", "02:40", "01:45:00", "02:45:00", false],
  ]) {
    const result = generate({ citySlugs: ["kathmandu", "lord-howe"], referenceCitySlug: "kathmandu", referenceDate,
      preferredWindow: { start: "01:30", end: closing } });
    assert.equal(result.status, "success");
    const candidate = at(result, iso), row = location(candidate, "lord-howe");
    assert.equal(candidate.endEpochMilliseconds - candidate.startEpochMilliseconds, 1_800_000);
    assert.equal(row.start.time, startTime);
    assert.equal(row.end.time, endTime);
    assert.notEqual(row.start.offset, row.end.offset);
    assert.equal(row.isWithinPreferredHours, expected);
  }
});

test("explicit day boundaries are clock-free for missing and repeated midnight", () => {
  const originalNow = Date.now;
  Date.now = () => { throw Error("Implicit clock"); };
  try {
    for (const fixture of dayFixtures) {
      const [slug, date, start, end, firstTime, count] = fixture;
      const result = generateMeetingPlan(dayInput(fixture));
      assert.equal(result.status, "success", `${slug} ${date}`);
      assert.deepEqual(result.referenceDay, { startEpochMilliseconds: Date.parse(start), endEpochMilliseconds: Date.parse(end) });
      assert.equal(result.candidates.length, count);
      assert.equal(location(result.candidates[0], slug).start.time, firstTime);
      const zone = cities.find((city) => city.slug === slug).timezone;
      const beforeStart = Temporal.Instant.fromEpochMilliseconds(Date.parse(start) - 1).toZonedDateTimeISO(zone);
      assert.equal(beforeStart.toPlainDate().toString(), Temporal.PlainDate.from(date).subtract({ days: 1 }).toString());
      const beforeEnd = Temporal.Instant.fromEpochMilliseconds(Date.parse(end) - 1).toZonedDateTimeISO(zone);
      assert.equal(beforeEnd.toPlainDate().toString(), date);
      const afterEnd = Temporal.Instant.fromEpochMilliseconds(Date.parse(end)).toZonedDateTimeISO(zone);
      assert.equal(afterEnd.toPlainDate().toString(), Temporal.PlainDate.from(date).add({ days: 1 }).toString());
      const epochs = result.candidates.map((candidate) => candidate.startEpochMilliseconds);
      assert.equal(new Set(epochs).size, count);
      result.candidates.forEach((candidate, index) => {
        assert.equal(candidate.startEpochMilliseconds, Date.parse(start) + index * 1_800_000);
        assert.equal(candidate.endEpochMilliseconds, candidate.startEpochMilliseconds + 1_800_000);
        assert.equal(location(candidate, slug).start.date, date);
      });
    }
  } finally {
    Date.now = originalNow;
  }
});

test("cross-midnight, previous-day and next-day projections retain actual dates", () => {
  const result = plan({ citySlugs: ["toronto", "tokyo", "honolulu", "kathmandu"], referenceCitySlug: "kathmandu" });
  assert.ok(result.candidates.some((candidate) => location(candidate, "honolulu").dayDifference === -1));
  const midnight = result.candidates.find((candidate) => location(candidate, "tokyo").start.time === "23:45:00");
  assert.notEqual(location(midnight, "tokyo").start.date, location(midnight, "tokyo").end.date);
  assert.equal(location(midnight, "tokyo").isWithinPreferredHours, false);
  assert.ok(plan({ citySlugs: ["toronto", "tokyo"] }).candidates.some((candidate) => location(candidate, "tokyo").dayDifference === 1));
});

test("same-zone cities stay separate and equal offsets do not erase seasonal rules", () => {
  const same = plan({ citySlugs: ["toronto", "montreal"] }).candidates[0];
  assert.equal(same.locations.length, 2);
  assert.deepEqual(same.locations.map((row) => row.citySlug), ["toronto", "montreal"]);
  assert.deepEqual(same.locations[0].start, same.locations[1].start);
  for (const [referenceDate, equal] of [["2027-01-15", true], ["2027-07-15", false]]) {
    const candidate = plan({ citySlugs: ["toronto", "kingston"], referenceDate }).candidates[0];
    assert.equal(candidate.locations[0].start.offset === candidate.locations[1].start.offset, equal);
  }
});

test("northern/southern seasons and Toronto/London mismatch weeks use IANA rules", () => {
  for (const [referenceDate, offset] of [["2027-01-15", "+11:00"], ["2027-07-15", "+10:00"]]) {
    assert.equal(location(plan({ citySlugs: ["toronto", "sydney"], referenceDate }).candidates[0], "sydney").start.offset, offset);
  }
  for (const [referenceDate, offset] of [["2027-03-15", "+00:00"], ["2027-04-15", "+01:00"], ["2027-11-03", "+00:00"]]) {
    assert.equal(location(plan({ referenceDate }).candidates[0], "london").start.offset, offset);
  }
});

test("transition at meeting start/end and crossing a repeated hour evaluates full interval", () => {
  const exact = plan({ referenceDate: "2027-11-07", preferredWindow: { start: "01:00", end: "02:00" } });
  assert.equal(location(at(exact, "2027-11-07T05:30Z"), "toronto").isWithinPreferredHours, true);
  assert.equal(location(at(exact, "2027-11-07T06:00Z"), "toronto").isWithinPreferredHours, true);
  const crossing = plan({ citySlugs: ["kathmandu", "toronto"], referenceCitySlug: "kathmandu", referenceDate: "2027-11-07",
    preferredWindow: { start: "01:00", end: "01:50" } });
  const row = location(at(crossing, "2027-11-07T05:45Z"), "toronto");
  assert.equal(row.start.time, "01:45:00");
  assert.equal(row.end.time, "01:15:00");
  assert.equal(row.isWithinPreferredHours, false, "both endpoints fit but the pre-transition segment exceeds closing");
  const spring = plan({ citySlugs: ["kathmandu", "toronto"], referenceCitySlug: "kathmandu", referenceDate: "2027-03-14",
    preferredWindow: { start: "01:30", end: "03:30" } });
  assert.equal(location(at(spring, "2027-03-14T06:45Z"), "toronto").isWithinPreferredHours, true);
});

test("all candidates retain exact start/end and deterministic order without mutating input", () => {
  const input = structuredClone(base);
  const first = generateMeetingPlan(input);
  assert.deepEqual(generateMeetingPlan(input), first);
  assert.deepEqual(input, base);
  first.candidates.forEach((candidate, index) => {
    assert.equal(candidate.endEpochMilliseconds - candidate.startEpochMilliseconds, MEETING_DURATION_MILLISECONDS);
    assert.equal(candidate.startEpochMilliseconds % 1000, 0);
    assert.equal(candidate.endEpochMilliseconds % 1000, 0);
    if (index) assert.equal(candidate.startEpochMilliseconds - first.candidates[index - 1].startEpochMilliseconds, MEETING_DURATION_MILLISECONDS);
  });
});

test("exceptional-midnight and supported-limit planner candidates retain ICS whole-second precision", () => {
  for (const input of [...dayFixtures.map(dayInput), { ...base, referenceDate: MIN_PLANNER_DATE },
    { ...base, referenceDate: MAX_PLANNER_DATE }, { ...base, citySlugs: ["kathmandu", "toronto"], referenceCitySlug: "kathmandu" }]) {
    const result = generateMeetingPlan(input);
    assert.equal(result.status, "success");
    for (const candidate of result.candidates) {
      assert.equal(candidate.startEpochMilliseconds % 1000, 0);
      assert.equal(candidate.endEpochMilliseconds % 1000, 0);
    }
  }
});

test("invalid counts, duplicate/unknown cities and reference are explicit", () => {
  for (const citySlugs of [null, [], ["toronto"], ["toronto", "london", "paris", "tokyo", "sydney", "mumbai"]]) {
    assert.equal(plan({ citySlugs }).error.code, "INVALID_CITY_COUNT");
  }
  assert.equal(plan({ citySlugs: ["toronto", "toronto"] }).error.code, "DUPLICATE_CITY");
  assert.equal(plan({ citySlugs: ["toronto", "unknown"] }).error.code, "INVALID_CITY");
  assert.equal(plan({ referenceCitySlug: "tokyo" }).error.code, "INVALID_REFERENCE");
  assert.equal(generateMeetingPlan(null).status, "invalid");
});

test("city inputs must be dense lists of non-empty string catalog slugs", () => {
  const trailingHole = ["toronto"]; trailingHole.length = 2;
  const leadingHole = [, "toronto"];
  const middleHole = ["toronto", , "london"];
  const inheritedEntry = ["toronto"]; inheritedEntry.length = 2;
  Object.setPrototypeOf(inheritedEntry, Object.assign(Object.create(Array.prototype), { 1: "london" }));
  for (const citySlugs of [trailingHole, leadingHole, middleHole, new Array(2), inheritedEntry,
    ...[undefined, null, 0, false, {}, ["london"], "", " ", "unknown"].map((slug) => ["toronto", slug])]) {
    const result = plan({ citySlugs });
    assert.equal(result.status, "invalid");
    assert.equal(result.error.field, "citySlugs");
    assert.equal(result.error.code, "INVALID_CITY");
    assert.equal(typeof result.error.message, "string");
  }
});

test("strict dates, supported range, minute times and overnight errors", () => {
  for (const referenceDate of ["", "2027-02-29", "2027-13-01", "2027-3-27", "2027-03-27T00:00Z", null]) {
    assert.equal(plan({ referenceDate }).error.code, "INVALID_DATE");
  }
  for (const referenceDate of ["1972-01-07", "2009-11-01", "2011-12-30", "9999-12-31"]) {
    assert.equal(plan({ referenceDate }).error.code, "UNSUPPORTED_DATE");
  }
  assert.equal(plan({ referenceDate: "2028-02-29" }).status, "success");
  for (const start of ["9:00", "24:00", "09:00:00", "09:60", null]) {
    assert.equal(plan({ preferredWindow: { start, end: "17:00" } }).error.code, "INVALID_TIME");
  }
  assert.equal(plan({ preferredWindow: { start: "09:00", end: "09:00" } }).error.code, "EQUAL_HOURS");
  assert.equal(plan({ preferredWindow: { start: "22:00", end: "02:00" } }).error.message, "Overnight hours are not supported yet.");
});

test("supported date policy explicitly validates limits and Gregorian century leap years", () => {
  assert.equal(MIN_PLANNER_DATE, "2020-01-01");
  assert.equal(MAX_PLANNER_DATE, "9999-12-30");
  for (const referenceDate of ["2020-01-01", "2020-02-29", "2400-02-29", "9999-12-30"]) {
    const result = plan({ referenceDate });
    assert.equal(result.status, "success", referenceDate);
    assert.equal(result.candidates.length, 48);
    assert.equal(result.candidates[0].locations[0].start.date, referenceDate);
  }
  for (const referenceDate of ["2019-12-31", "9999-12-31"]) {
    assert.deepEqual(plan({ referenceDate }), { status: "invalid", error: {
      field: "referenceDate", code: "UNSUPPORTED_DATE", message: "Choose a planning date from 2020-01-01 through 9999-12-30.",
    } });
  }
  assert.equal(plan({ referenceDate: "2100-02-29" }).error.code, "INVALID_DATE");
  const extreme = plan({ citySlugs: ["honolulu", "auckland", "kathmandu", "london", "adelaide"],
    referenceCitySlug: "honolulu", referenceDate: MAX_PLANNER_DATE });
  assert.equal(extreme.status, "success");
  assert.equal(location(extreme.candidates.at(-1), "auckland").end.date, "9999-12-31");
  for (const candidate of extreme.candidates) {
    for (const row of candidate.locations) {
      assert.match(row.start.date, /^\d{4}-\d{2}-\d{2}$/);
      assert.match(row.end.date, /^\d{4}-\d{2}-\d{2}$/);
    }
  }
});

test("output is independent of host timezone and implicit clock", () => {
  const moduleUrl = new URL("../src/utils/meetingPlanner.js", import.meta.url).href;
  const inputs = [base, ...dayFixtures.map(dayInput), { ...base, referenceDate: MIN_PLANNER_DATE }, { ...base, referenceDate: MAX_PLANNER_DATE }];
  const expected = inputs.map(generateMeetingPlan);
  for (const TZ of ["UTC", "America/Los_Angeles", "Asia/Kathmandu"]) {
    // The polyfill initializes its Temporal.Now clock at import. Vary that
    // clock, then prohibit clock reads during actual planner computation.
    const script = `const originalNow = Date.now; try { Date.now = () => ${TZ === "UTC" ? 0 : 2_000_000_000_000}; const {generateMeetingPlan} = await import(${JSON.stringify(moduleUrl)}); Date.now = () => { throw Error('Implicit clock'); }; process.stdout.write(JSON.stringify(${JSON.stringify(inputs)}.map(generateMeetingPlan))); } finally { Date.now = originalNow; }`;
    const child = spawnSync(process.execPath, ["--input-type=module", "-e", script], { env: { ...process.env, TZ }, encoding: "utf8" });
    assert.equal(child.status, 0, child.stderr);
    assert.deepEqual(JSON.parse(child.stdout), expected);
  }
});
