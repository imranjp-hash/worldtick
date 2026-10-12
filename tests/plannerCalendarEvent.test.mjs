import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import vm from "node:vm";
import test from "node:test";
import { cities } from "../src/data/cities.js";
import * as dateTime from "../src/utils/dateTime.js";
import * as ics from "../src/utils/ics.js";
import {
  buildPlannerCalendarEvent,
  buildPlannerCalendarFilename,
  getPlannerCalendarExportEligibility,
} from "../src/utils/calendarEvent.js";
import { generateMeetingPlan } from "../src/utils/meetingPlanner.js";

const start = Date.parse("2027-03-27T13:00:00Z");
const generatedAtEpochMilliseconds = Date.parse("2026-10-12T12:00:00Z");
function candidate({ citySlugs = ["toronto", "london"], startEpochMilliseconds = start,
  endEpochMilliseconds = startEpochMilliseconds + 1_800_000 } = {}) {
  return { startEpochMilliseconds, endEpochMilliseconds, locations: citySlugs.map((citySlug) => ({ citySlug })) };
}
const eventFor = (selectedCandidate) => buildPlannerCalendarEvent({ selectedCandidate });
const fileFor = (selectedCandidate) => buildPlannerCalendarFilename({ selectedCandidate });
const serialize = (selectedCandidate, stamp = generatedAtEpochMilliseconds) => ics.serializeCalendarEventToIcs(
  eventFor(selectedCandidate), { generatedAtEpochMilliseconds: stamp },
);
const unfold = (value) => value.replace(/\r\n[ \t]/g, "");
const identityLines = (value) => unfold(value).split("\r\n").filter((line) => /^(?:UID|DTSTART|DTEND):/.test(line));
const decodeText = (value) => value.replace(/\\([\\,;nN])/g, (_, escaped) => /[nN]/.test(escaped) ? "\n" : escaped);

// Fixtures are confined to the VM catalog. Production has no catalog override API.
async function calendarWithCatalog(catalog) {
  const source = await readFile(new URL("../src/utils/calendarEvent.js", import.meta.url), "utf8");
  const context = vm.createContext({ ...dateTime, ...ics, cities: catalog, Date, Map, Set, TypeError, RangeError });
  vm.runInContext(source.replace(/^import[^\n]*\n/gm, "").replaceAll("export const", "const")
    .replaceAll("export function", "function"), context);
  return context;
}

test("two-city planner event copies exact epochs and supplied sentinel end, not a duration constant", () => {
  const selectedCandidate = candidate({ endEpochMilliseconds: start + 2_123_000 });
  const event = eventFor(selectedCandidate);
  assert.deepEqual(Object.keys(event), ["uid", "title", "description", "startEpochMilliseconds", "endEpochMilliseconds"]);
  assert.equal(event.startEpochMilliseconds, start);
  assert.equal(event.endEpochMilliseconds, start + 2_123_000);
  assert.notEqual(event.endEpochMilliseconds, start + 1_800_000);
  const logical = unfold(serialize(selectedCandidate));
  assert.match(logical, /DTSTART:20270327T130000Z\r\n/);
  assert.match(logical, /DTEND:20270327T133523Z\r\n/);
  assert.equal(event.title, "Toronto · London meeting");
  assert.match(event.description, /9:00:00 AM → 9:35:23 AM/);
  assert.ok(event.description.endsWith("Created with YouHora"));
  assert.doesNotMatch(event.description, /Comparison:|https?:|reference|preferred/i);
});

test("two-, three- and five-city events retain each location including same-timezone cities", () => {
  for (const citySlugs of [["toronto", "london"], ["toronto", "london", "paris"],
    ["toronto", "montreal", "new-york", "london", "paris"]]) {
    const selectedCandidate = candidate({ citySlugs });
    const description = eventFor(selectedCandidate).description;
    const sections = description.split("\n\n");
    assert.equal(sections.length, citySlugs.length + 1);
    citySlugs.forEach((slug, index) => assert.ok(sections[index].startsWith(`${cities.find((city) => city.slug === slug).name}:`)));
    assert.equal(sections.at(-1), "Created with YouHora");
  }
});

test("presentation order is preserved while UID canonicalizes city membership without mutating input", () => {
  const selectedCandidate = candidate({ citySlugs: ["tokyo", "toronto", "london"] });
  const before = structuredClone(selectedCandidate);
  const event = eventFor(selectedCandidate);
  assert.equal(event.title, "Tokyo · Toronto · London meeting");
  assert.ok(event.description.indexOf("Tokyo:") < event.description.indexOf("Toronto:"));
  assert.ok(event.description.indexOf("Toronto:") < event.description.indexOf("London:"));
  assert.equal(event.uid, `youhora-planner-v1-${start}-${start + 1_800_000}-london.tokyo.toronto@youhora.com`);
  const reordered = candidate({ citySlugs: ["london", "tokyo", "toronto"] });
  assert.equal(event.uid, eventFor(reordered).uid);
  assert.notEqual(event.title, eventFor(reordered).title);
  assert.notEqual(fileFor(selectedCandidate), fileFor(reordered));
  assert.deepEqual(selectedCandidate, before);
});

test("stable planner UID distinguishes start, end and city-set changes but ignores planning metadata", () => {
  const selectedCandidate = candidate();
  const uid = eventFor(selectedCandidate).uid;
  assert.equal(uid, eventFor(structuredClone(selectedCandidate)).uid);
  for (const changed of [candidate({ startEpochMilliseconds: start + 1000 }),
    candidate({ endEpochMilliseconds: start + 1_801_000 }), candidate({ citySlugs: ["toronto", "paris"] }),
    candidate({ citySlugs: ["toronto", "london", "paris"] })]) assert.notEqual(eventFor(changed).uid, uid);
  for (const metadata of [{ planRevision: 10 }, { referenceCitySlug: "london" },
    { referenceDate: "2027-03-28" }, { preferredWindow: { start: "00:00", end: "23:59" } }]) {
    assert.equal(eventFor({ ...selectedCandidate, ...metadata }).uid, uid);
  }
  const longest = [...cities].sort((a, b) => b.slug.length - a.slug.length).slice(0, 5);
  const bounded = eventFor(candidate({ citySlugs: longest.map((city) => city.slug),
    startEpochMilliseconds: Date.parse("9999-12-30T13:00Z") })).uid;
  assert.match(bounded, /^[a-z0-9.@-]+$/);
  assert.ok(bounded.length < 160);
});

test("reselecting the same instant after reference/date/window changes retains UID", () => {
  const target = Date.parse("2027-03-27T00:00Z");
  const plans = [
    { referenceCitySlug: "toronto", referenceDate: "2027-03-26" },
    { referenceCitySlug: "tokyo", referenceDate: "2027-03-27" },
    { referenceCitySlug: "tokyo", referenceDate: "2027-03-27", preferredWindow: { start: "01:00", end: "23:00" } },
  ].map((input) => generateMeetingPlan({ citySlugs: ["toronto", "tokyo"], ...input }));
  const uids = plans.map((plan) => eventFor(plan.candidates.find((value) => value.startEpochMilliseconds === target)).uid);
  assert.equal(new Set(uids).size, 1);
});

test("descriptions show actual previous/next dates and fractional Kathmandu offsets", () => {
  const previous = eventFor(candidate({ citySlugs: ["toronto", "tokyo"], startEpochMilliseconds: Date.parse("2027-03-27T00:00Z") }));
  assert.match(previous.description, /Toronto: Fri, Mar 26, 2027/);
  assert.match(previous.description, /Tokyo: Sat, Mar 27, 2027/);
  const next = eventFor(candidate({ citySlugs: ["toronto", "tokyo"], startEpochMilliseconds: Date.parse("2027-03-27T20:00Z") }));
  assert.match(next.description, /Tokyo: Sun, Mar 28, 2027/);
  const fractional = eventFor(candidate({ citySlugs: ["toronto", "kathmandu"] }));
  assert.match(fractional.description, /Kathmandu: Sat, Mar 27, 2027 · 6:45:00 PM → 7:15:00 PM/);
  assert.match(fractional.description, /UTC\+5:45/);
});

test("date-line ±2-day fixtures keep exact local dates without expanding the catalog", async () => {
  const fixture = await calendarWithCatalog([...cities, { slug: "west-fixture", name: "West", timezone: "Etc/GMT+12" },
    { slug: "east-fixture", name: "East", timezone: "Pacific/Kiritimati" }]);
  for (const [citySlugs, instant, first, second] of [
    [["west-fixture", "east-fixture"], "2027-01-02T11:30Z", "West: Fri, Jan 1, 2027", "East: Sun, Jan 3, 2027"],
    [["east-fixture", "west-fixture"], "2027-01-02T10:30Z", "East: Sun, Jan 3, 2027", "West: Fri, Jan 1, 2027"],
  ]) {
    const event = fixture.buildPlannerCalendarEvent({ selectedCandidate: candidate({ citySlugs, startEpochMilliseconds: Date.parse(instant) }) });
    assert.ok(event.description.includes(first)); assert.ok(event.description.includes(second));
    assert.ok(event.description.indexOf(first) < event.description.indexOf(second));
  }
  assert.throws(() => eventFor(candidate({ citySlugs: ["west-fixture", "east-fixture"] })), /catalog cities/);
});

test("repeated-hour planner candidates export distinct exact DTSTART and UID values", () => {
  const plan = generateMeetingPlan({ citySlugs: ["toronto", "london"], referenceCitySlug: "toronto", referenceDate: "2027-11-07" });
  const repeated = plan.candidates.filter((value) => value.locations[0].start.time === "01:30:00");
  assert.equal(repeated.length, 2);
  assert.notEqual(eventFor(repeated[0]).uid, eventFor(repeated[1]).uid);
  assert.match(unfold(serialize(repeated[0])), /DTSTART:20271107T053000Z/);
  assert.match(unfold(serialize(repeated[1])), /DTSTART:20271107T063000Z/);
});

test("forward/backward transitions and exact endpoints print both exact endpoint identities", () => {
  for (const [instant, expected] of [
    ["2027-11-07T05:45Z", ["1:45:00 AM · Eastern Daylight Time · UTC−4", "1:15:00 AM · Eastern Standard Time · UTC−5"]],
    ["2027-03-14T06:45Z", ["1:45:00 AM · Eastern Standard Time · UTC−5", "3:15:00 AM · Eastern Daylight Time · UTC−4"]],
    ["2027-11-07T05:30Z", ["1:30:00 AM · Eastern Daylight Time · UTC−4", "1:00:00 AM · Eastern Standard Time · UTC−5"]],
  ]) {
    const selectedCandidate = candidate({ startEpochMilliseconds: Date.parse(instant) });
    const event = eventFor(selectedCandidate);
    expected.forEach((value) => assert.ok(event.description.includes(value), value));
    assert.match(event.description, /Toronto:\nStart:.*\nEnd:/);
    assert.equal(event.endEpochMilliseconds, selectedCandidate.endEpochMilliseconds);
  }
  const atStart = eventFor(candidate({ startEpochMilliseconds: Date.parse("2027-11-07T06:00Z") }));
  assert.match(atStart.description, /Eastern Standard Time · UTC−5/);
  assert.doesNotMatch(atStart.description, /Eastern Daylight Time/);
});

test("Lord Howe test-only fixture formats a 30-minute change without assuming one-hour DST", async () => {
  const fixture = await calendarWithCatalog([...cities, { slug: "lord-howe-fixture", name: "Lord Howe", timezone: "Australia/Lord_Howe" }]);
  const selectedCandidate = candidate({ citySlugs: ["kathmandu", "lord-howe-fixture"], startEpochMilliseconds: Date.parse("2027-04-03T14:45Z") });
  const event = fixture.buildPlannerCalendarEvent({ selectedCandidate });
  assert.match(event.description, /Start: Sun, Apr 4, 2027 at 1:45:00 AM/);
  assert.match(event.description, /End: Sun, Apr 4, 2027 at 1:45:00 AM/);
  assert.match(event.description, /UTC\+11/); assert.match(event.description, /UTC\+10:30/);
  assert.equal(event.endEpochMilliseconds - event.startEpochMilliseconds, 1_800_000);
});

test("cross-midnight and year-end descriptions include the actual local end date", () => {
  const event = eventFor(candidate({ citySlugs: ["london", "tokyo"], startEpochMilliseconds: Date.parse("2027-12-31T23:45Z") }));
  assert.match(event.description, /London: Fri, Dec 31, 2027 · 11:45:00 PM → Sat, Jan 1, 2028 · 12:15:00 AM/);
  assert.match(event.description, /Tokyo: Sat, Jan 1, 2028/);
});

test("tampered projection dates, clocks, offsets and timezone strings cannot change any event field", () => {
  const selectedCandidate = candidate();
  const expected = eventFor(selectedCandidate);
  selectedCandidate.locations.forEach((location) => Object.assign(location, {
    start: { date: "1900-01-01", time: "nonsense", offset: "+14:00", timezone: "invented" },
    end: { date: "1800-01-01", time: "DTEND:evil", offset: "-12:00" },
  }));
  assert.deepEqual(eventFor(selectedCandidate), expected);
  assert.match(unfold(serialize(selectedCandidate)), /DTSTART:20270327T130000Z\r\nDTEND:20270327T133000Z/);
});

test("invalid endpoints and malformed location lists fail before producing events or filenames", () => {
  const selectedCandidate = candidate();
  const invalid = [null, {}, ...[NaN, Infinity, "1806152400000", 1.5, Number.MAX_SAFE_INTEGER + 1,
    8_640_000_000_001_000, Date.parse("+010000-01-01T00:00Z"), Date.parse("-000001-12-31T00:00Z"), start + 1]
    .flatMap((epoch) => [{ ...selectedCandidate, startEpochMilliseconds: epoch }, { ...selectedCandidate, endEpochMilliseconds: epoch }]),
    { ...selectedCandidate, endEpochMilliseconds: start }, { ...selectedCandidate, endEpochMilliseconds: start - 1000 }];
  const inherited = [{ citySlug: "toronto" }]; inherited.length = 2;
  Object.setPrototypeOf(inherited, Object.assign(Object.create(Array.prototype), { 1: { citySlug: "london" } }));
  const sparse = [{ citySlug: "toronto" }]; sparse.length = 2;
  for (const locations of [null, {}, [], [{ citySlug: "toronto" }], new Array(2), sparse, inherited,
    [{ citySlug: "toronto" }, null], [{ citySlug: "toronto" }, { citySlug: "unknown" }],
    [{ citySlug: "toronto" }, { citySlug: "toronto" }], ...[0, {}, ["london"], "", " "].map((citySlug) => [{ citySlug: "toronto" }, { citySlug }]),
    cities.slice(0, 6).map((city) => ({ citySlug: city.slug }))]) invalid.push({ ...selectedCandidate, locations });
  for (const value of invalid) {
    assert.throws(() => eventFor(value), (error) => error instanceof TypeError || error instanceof RangeError);
    assert.throws(() => fileFor(value), (error) => error instanceof TypeError || error instanceof RangeError);
    assert.equal(getPlannerCalendarExportEligibility({ selectedCandidate: value, nowEpochMilliseconds: 0 }).eligible, false);
  }
});

test("planner eligibility uses a strict injected future boundary and rejects invalid current times", () => {
  const selectedCandidate = candidate();
  for (const [nowEpochMilliseconds, eligible, reason] of [[start - 1, true, null], [start, false, "past"], [start + 1, false, "past"]]) {
    assert.deepEqual(getPlannerCalendarExportEligibility({ selectedCandidate, nowEpochMilliseconds }), { eligible, reason, startEpochMilliseconds: start });
  }
  for (const nowEpochMilliseconds of [undefined, null, NaN, Infinity, -Infinity, "0"]) {
    assert.deepEqual(getPlannerCalendarExportEligibility({ selectedCandidate, nowEpochMilliseconds }), { eligible: false, reason: "invalid-now" });
  }
  assert.equal(getPlannerCalendarExportEligibility().reason, "unresolved");
});

test("planner filenames are deterministic, ordered and keep the intact UTC timestamp and extension", () => {
  const selectedCandidate = candidate();
  assert.equal(fileFor(selectedCandidate), "youhora-planner-toronto-london-20270327T130000Z.ics");
  assert.equal(fileFor(selectedCandidate), fileFor(structuredClone(selectedCandidate)));
});

test("five long, accented, punctuated or empty-safe filename segments remain bounded without truncating UID", async () => {
  const slugs = [" São///Paulo;;;\r\n\0 ", "---", "x".repeat(200), "ab--".repeat(60), "東🌍".repeat(80)];
  const fixture = await calendarWithCatalog(slugs.map((slug, index) => ({ slug, name: `City ${index}`, timezone: "UTC" })));
  const selectedCandidate = candidate({ citySlugs: slugs });
  const filename = fixture.buildPlannerCalendarFilename({ selectedCandidate });
  assert.match(filename, /^youhora-planner-[a-z0-9-]+-20270327T130000Z\.ics$/);
  assert.match(filename, /sao-paulo-city-2/);
  assert.ok(filename.length <= 157);
  assert.doesNotMatch(filename, /--|[\\/\r\n;\0]/);
  assert.equal(fixture.buildPlannerCalendarFilename({ selectedCandidate }), filename);
  const asciiFixture = await calendarWithCatalog([...cities, { slug: "z".repeat(200), name: "Long City", timezone: "UTC" }]);
  const longCandidate = candidate({ citySlugs: ["toronto", "z".repeat(200)] });
  assert.ok(asciiFixture.buildPlannerCalendarEvent({ selectedCandidate: longCandidate }).uid.includes("z".repeat(200)));
  assert.ok(asciiFixture.buildPlannerCalendarFilename({ selectedCandidate: longCandidate }).length <= 157);
});

test("title overflow retains all full names and five-city descriptions escape/fold/round-trip exactly", async () => {
  const names = Array.from({ length: 5 }, (_, index) => `City ${index} É東🌍,;\\\r\n${"Long name ".repeat(12)}`);
  const fixture = await calendarWithCatalog(names.map((name, index) => ({ name, slug: `long-${index}`, timezone: "UTC" })));
  const selectedCandidate = candidate({ citySlugs: names.map((_, index) => `long-${index}`) });
  const event = fixture.buildPlannerCalendarEvent({ selectedCandidate });
  assert.equal(event.title, "Meeting across 5 cities");
  names.forEach((name) => assert.ok(event.description.includes(name)));
  const value = ics.serializeCalendarEventToIcs(event, { generatedAtEpochMilliseconds });
  for (const line of value.split("\r\n")) assert.ok(Buffer.byteLength(line, "utf8") <= 75);
  const bytes = new TextEncoder().encode(value);
  assert.equal(new TextDecoder("utf-8", { fatal: true }).decode(bytes), value);
  const logical = unfold(value);
  const description = logical.split("\r\n").find((line) => line.startsWith("DESCRIPTION:")).slice("DESCRIPTION:".length);
  assert.equal(decodeText(description), event.description.replace(/\r\n|\r/g, "\n"));
  assert.ok(value.endsWith("END:VCALENDAR\r\n"));
  assert.equal(logical.split("\r\n").filter((line) => line === "BEGIN:VEVENT").length, 1);
});

test("the title limit includes exactly 120 characters and falls back only above it", async () => {
  for (const [secondLength, expected] of [[55, "x".repeat(54) + " · " + "y".repeat(55) + " meeting"], [56, "Meeting across 2 cities"]]) {
    const fixture = await calendarWithCatalog([{ slug: "first", name: "x".repeat(54), timezone: "UTC" },
      { slug: "second", name: "y".repeat(secondLength), timezone: "UTC" }]);
    const event = fixture.buildPlannerCalendarEvent({ selectedCandidate: candidate({ citySlugs: ["first", "second"] }) });
    assert.equal(event.title, expected);
    assert.ok(event.description.includes("x".repeat(54))); assert.ok(event.description.includes("y".repeat(secondLength)));
  }
});

test("different DTSTAMP values preserve planner UID, DTSTART and DTEND", () => {
  const selectedCandidate = candidate();
  const first = serialize(selectedCandidate, Date.parse("2026-01-01T00:00Z"));
  const second = serialize(selectedCandidate, Date.parse("2026-10-12T00:00Z"));
  assert.deepEqual(identityLines(first), identityLines(second));
  assert.notEqual(first, second);
});

test("repeated planner downloads use independent anchors and object URLs with deferred revocation", async () => {
  const selectedCandidate = candidate({ citySlugs: ["toronto", "london", "paris"] });
  const blobs = [], anchors = [], revoked = [], deferred = [];
  const environment = {
    Blob,
    URL: {
      createObjectURL(blob) { blobs.push(blob); return `blob:planner-${blobs.length}`; },
      revokeObjectURL(url) { revoked.push(url); },
    },
    document: {
      createElement(tag) {
        assert.equal(tag, "a");
        const anchor = { clicks: 0, removed: false, click() { this.clicks++; }, remove() { this.removed = true; } };
        anchors.push(anchor); return anchor;
      },
      body: { appendChild(anchor) { assert.ok(anchors.includes(anchor)); } },
    },
    setTimeout(fn, delay) { assert.equal(delay, 0); deferred.push(fn); },
  };
  for (let index = 0; index < 2; index++) {
    ics.downloadIcsFile({ ics: serialize(selectedCandidate, generatedAtEpochMilliseconds + index * 1000), filename: fileFor(selectedCandidate) }, environment);
  }
  assert.equal(blobs.length, 2); assert.equal(anchors.length, 2);
  assert.notEqual(anchors[0], anchors[1]); assert.notEqual(anchors[0].href, anchors[1].href);
  for (const anchor of anchors) {
    assert.equal(anchor.clicks, 1); assert.equal(anchor.removed, true);
    assert.equal(anchor.hidden, true); assert.equal(anchor.download, fileFor(selectedCandidate));
  }
  assert.deepEqual(revoked, []);
  assert.deepEqual(identityLines(await blobs[0].text()), identityLines(await blobs[1].text()));
  assert.ok(blobs.every((blob) => blob.type === "text/calendar;charset=utf-8"));
  deferred.forEach((fn) => fn());
  assert.deepEqual(revoked, ["blob:planner-1", "blob:planner-2"]);
});

test("planner event/filename construction is clock-independent across host timezones", () => {
  const moduleUrl = new URL("../src/utils/calendarEvent.js", import.meta.url).href;
  const input = candidate({ citySlugs: ["toronto", "kathmandu", "sydney"] });
  const expected = JSON.stringify([eventFor(input), fileFor(input)]);
  for (const TZ of ["UTC", "America/Los_Angeles", "Asia/Kathmandu"]) {
    const script = `const {buildPlannerCalendarEvent,buildPlannerCalendarFilename}=await import(${JSON.stringify(moduleUrl)}); Date.now=()=>{throw Error('Implicit clock')}; const selectedCandidate=${JSON.stringify(input)}; process.stdout.write(JSON.stringify([buildPlannerCalendarEvent({selectedCandidate}),buildPlannerCalendarFilename({selectedCandidate})]));`;
    const child = spawnSync(process.execPath, ["--input-type=module", "-e", script], { env: { ...process.env, TZ }, encoding: "utf8" });
    assert.equal(child.status, 0, child.stderr); assert.equal(child.stdout, expected);
  }
});
