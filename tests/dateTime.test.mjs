import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { cities } from "../src/data/cities.js";
import {
  convertLocalDateTime,
  formatDateInZone,
  formatTimeInZone,
  getTimeDifferenceMinutes,
  getTimeZoneOffsetMinutes,
} from "../src/utils/dateTime.js";

// These fixtures use the IANA rules available in Node's ICU database. Future
// law changes may require an intentional fixture update; see README.md.
const baseInput = Object.freeze({
  date: "2027-01-15",
  time: "09:00",
  sourceTimeZone: "America/Toronto",
  destinationTimeZone: "Europe/London",
});
const convert = (overrides = {}) => convertLocalDateTime({ ...baseInput, ...overrides });

test("Toronto to London in winter returns the complete JSON-safe success contract", () => {
  const result = convertLocalDateTime(baseInput);
  assert.deepEqual(result, {
    status: "success",
    instant: "2027-01-15T14:00:00Z",
    epochMilliseconds: Date.UTC(2027, 0, 15, 14),
    source: { timeZone: "America/Toronto", date: "2027-01-15", time: "09:00:00", offset: "-05:00" },
    destination: { timeZone: "Europe/London", date: "2027-01-15", time: "14:00:00", offset: "+00:00" },
    dayDifference: 0,
    dayRelation: "same-day",
    disambiguation: { requested: "reject", applied: null },
  });
  assert.deepEqual(JSON.parse(JSON.stringify(result)), result);
  assert.deepEqual(baseInput, {
    date: "2027-01-15", time: "09:00",
    sourceTimeZone: "America/Toronto", destinationTimeZone: "Europe/London",
  });
});

for (const [date, destinationTime, destinationOffset, instant] of [
  ["2027-03-15", "13:00:00", "+00:00", "2027-03-15T13:00:00Z"],
  ["2027-04-15", "14:00:00", "+01:00", "2027-04-15T13:00:00Z"],
  ["2027-11-03", "13:00:00", "+00:00", "2027-11-03T13:00:00Z"],
]) {
  test(`Toronto to London uses each zone's own DST rules on ${date}`, () => {
    const result = convert({ date });
    assert.equal(result.status, "success");
    assert.equal(result.instant, instant);
    assert.equal(result.source.offset, "-04:00");
    assert.equal(result.destination.time, destinationTime);
    assert.equal(result.destination.offset, destinationOffset);
  });
}

test("destination can cross into the next calendar day and year", () => {
  const result = convert({ date: "2027-12-31", time: "23:30", sourceTimeZone: "Europe/London", destinationTimeZone: "Asia/Tokyo" });
  assert.equal(result.status, "success");
  assert.equal(result.instant, "2027-12-31T23:30:00Z");
  assert.deepEqual(result.destination, { timeZone: "Asia/Tokyo", date: "2028-01-01", time: "08:30:00", offset: "+09:00" });
  assert.equal(result.dayDifference, 1);
  assert.equal(result.dayRelation, "next-day");
});

test("destination can be on the previous calendar day", () => {
  const result = convert({ time: "00:15", sourceTimeZone: "Asia/Tokyo", destinationTimeZone: "America/Toronto" });
  assert.equal(result.status, "success");
  assert.equal(result.instant, "2027-01-14T15:15:00Z");
  assert.deepEqual(result.destination, { timeZone: "America/Toronto", date: "2027-01-14", time: "10:15:00", offset: "-05:00" });
  assert.equal(result.dayDifference, -1);
  assert.equal(result.dayRelation, "previous-day");
});

test("date-line extremes retain a two-day calendar difference in either direction", () => {
  const forward = convert({ date: "2027-01-01", time: "23:30", sourceTimeZone: "Etc/GMT+12", destinationTimeZone: "Pacific/Kiritimati" });
  assert.equal(forward.status, "success");
  assert.equal(forward.destination.date, "2027-01-03");
  assert.equal(forward.destination.time, "01:30:00");
  assert.equal(forward.dayDifference, 2);
  assert.equal(forward.dayRelation, "later-date");
  const backward = convert({ date: "2027-01-03", time: "00:30", sourceTimeZone: "Pacific/Kiritimati", destinationTimeZone: "Etc/GMT+12" });
  assert.equal(backward.status, "success");
  assert.equal(backward.destination.date, "2027-01-01");
  assert.equal(backward.destination.time, "22:30:00");
  assert.equal(backward.dayDifference, -2);
  assert.equal(backward.dayRelation, "earlier-date");
});

const gapInput = { date: "2027-03-14", time: "02:30" };
const overlapInput = { date: "2027-11-07", time: "01:30" };

test("Toronto spring-forward gap returns nonexistent without a shifted instant", () => {
  assert.deepEqual(convert(gapInput), {
    status: "nonexistent",
    source: { timeZone: "America/Toronto", date: "2027-03-14", time: "02:30:00" },
    destinationTimeZone: "Europe/London",
    disambiguation: { requested: "reject", applied: null },
  });
});

test("earlier and later never shift a nonexistent wall-clock time", () => {
  for (const disambiguation of ["earlier", "later"]) {
    const result = convert({ ...gapInput, disambiguation });
    assert.equal(result.status, "nonexistent");
    assert.equal(result.source.time, "02:30:00");
    assert.equal("instant" in result, false);
    assert.deepEqual(result.disambiguation, { requested: disambiguation, applied: null });
  }
});

test("Toronto repeated hour returns two complete candidate interpretations", () => {
  const result = convert(overlapInput);
  assert.equal(result.status, "ambiguous");
  assert.deepEqual(result.source, { timeZone: "America/Toronto", date: "2027-11-07", time: "01:30:00" });
  assert.equal(result.destinationTimeZone, "Europe/London");
  assert.deepEqual(result.disambiguation, { requested: "reject", applied: null });
  assert.equal("instant" in result, false);
  assert.equal(result.candidates.length, 2);
  for (const [index, interpretation, hour, sourceOffset] of [[0, "earlier", 5, "-04:00"], [1, "later", 6, "-05:00"]]) {
    assert.deepEqual(result.candidates[index], {
      interpretation,
      instant: `2027-11-07T0${hour}:30:00Z`,
      epochMilliseconds: Date.UTC(2027, 10, 7, hour, 30),
      source: { timeZone: "America/Toronto", date: "2027-11-07", time: "01:30:00", offset: sourceOffset },
      destination: { timeZone: "Europe/London", date: "2027-11-07", time: `0${hour}:30:00`, offset: "+00:00" },
      dayDifference: 0,
      dayRelation: "same-day",
    });
  }
  assert.deepEqual(JSON.parse(JSON.stringify(result)), result);
  assert.deepEqual(convert({ ...overlapInput, disambiguation: "reject" }), result);
});

for (const [policy, instant, offset] of [
  ["earlier", "2027-11-07T05:30:00Z", "-04:00"],
  ["later", "2027-11-07T06:30:00Z", "-05:00"],
]) {
  test(`explicit ${policy} selects the corresponding Toronto repeated-hour instant`, () => {
    const result = convert({ ...overlapInput, disambiguation: policy });
    assert.equal(result.status, "success");
    assert.equal(result.instant, instant);
    assert.equal(result.source.time, "01:30:00");
    assert.equal(result.source.offset, offset);
    assert.deepEqual(result.disambiguation, { requested: policy, applied: policy });
  });
}

test("ordinary times do not claim an earlier/later policy was applied", () => {
  for (const disambiguation of ["earlier", "later"]) {
    const result = convert({ disambiguation });
    assert.equal(result.status, "success");
    assert.equal(result.instant, "2027-01-15T14:00:00Z");
    assert.deepEqual(result.disambiguation, { requested: disambiguation, applied: null });
  }
});

test("Toronto transition boundaries preserve the instant at the first valid minute", () => {
  for (const [time, instant, offset] of [
    ["01:59", "2027-03-14T06:59:00Z", "-05:00"],
    ["03:00", "2027-03-14T07:00:00Z", "-04:00"],
  ]) {
    const result = convert({ date: "2027-03-14", time });
    assert.equal(result.status, "success");
    assert.equal(result.instant, instant);
    assert.equal(result.source.offset, offset);
  }
});

test("an exact instant in a repeated destination hour needs no additional disambiguation", () => {
  const results = [];
  for (const [time, offset] of [["05:30", "-04:00"], ["06:30", "-05:00"]]) {
    const result = convert({ date: "2027-11-07", time, sourceTimeZone: "UTC", destinationTimeZone: "America/Toronto" });
    assert.equal(result.status, "success");
    assert.equal(result.destination.time, "01:30:00");
    assert.equal(result.destination.offset, offset);
    assert.equal(result.disambiguation.applied, null);
    results.push(result);
  }
  assert.notEqual(results[0].instant, results[1].instant);
  assert.notEqual(results[0].epochMilliseconds, results[1].epochMilliseconds);
});

test("Samoa's skipped 2011-12-30 calendar day is nonexistent", () => {
  const result = convert({
    date: "2011-12-30",
    time: "12:00",
    sourceTimeZone: "Pacific/Apia",
    destinationTimeZone: "UTC",
  });
  assert.equal(result.status, "nonexistent");
  assert.equal(result.source.date, "2011-12-30");
  assert.equal(result.source.time, "12:00:00");
  assert.equal("instant" in result, false);
  assert.equal("epochMilliseconds" in result, false);
});

for (const [sourceTimeZone, time, offset] of [
  ["Asia/Kathmandu", "03:15:00", "+05:45"],
  ["Asia/Kolkata", "03:30:00", "+05:30"],
]) {
  test(`${sourceTimeZone} retains its fractional-hour offset`, () => {
    const result = convert({ sourceTimeZone });
    assert.equal(result.status, "success");
    assert.equal(result.source.offset, offset);
    assert.equal(result.destination.time, time);
    assert.equal(result.instant, `2027-01-15T${time}Z`);
  });
}

for (const [date, offset, instant] of [
  ["2027-01-15", "+10:30", "2027-01-14T22:30:00Z"],
  ["2027-07-15", "+09:30", "2027-07-14T23:30:00Z"],
]) {
  test(`Adelaide uses southern-hemisphere seasonal rules on ${date}`, () => {
    const result = convert({ date, sourceTimeZone: "Australia/Adelaide", destinationTimeZone: "UTC" });
    assert.equal(result.status, "success");
    assert.equal(result.source.offset, offset);
    assert.equal(result.instant, instant);
    assert.equal(result.dayDifference, -1);
  });
}

let supportsLordHowe = true;
try {
  new Intl.DateTimeFormat("en-US", { timeZone: "Australia/Lord_Howe" });
} catch {
  supportsLordHowe = false;
}

test("Lord Howe's overlap is 30 minutes, not an assumed hour", { skip: !supportsLordHowe }, () => {
  const input = { date: "2027-04-04", time: "01:45", sourceTimeZone: "Australia/Lord_Howe", destinationTimeZone: "UTC" };
  const result = convert(input);
  assert.equal(result.status, "ambiguous");
  assert.deepEqual(result.candidates.map(candidate => [candidate.instant, candidate.source.offset]), [
    ["2027-04-03T14:45:00Z", "+11:00"],
    ["2027-04-03T15:15:00Z", "+10:30"],
  ]);
  assert.equal(result.candidates[1].epochMilliseconds - result.candidates[0].epochMilliseconds, 30 * 60 * 1000);
  assert.equal(convert({ ...input, disambiguation: "later" }).instant, "2027-04-03T15:15:00Z");
});

test("Lord Howe's 30-minute spring gap is nonexistent", { skip: !supportsLordHowe }, () => {
  assert.equal(convert({ date: "2027-10-03", time: "02:15", sourceTimeZone: "Australia/Lord_Howe" }).status, "nonexistent");
  assert.equal(convert({ date: "2027-10-03", time: "02:30", sourceTimeZone: "Australia/Lord_Howe" }).status, "success");
});

test("a valid leap day is preserved", () => {
  const result = convert({ date: "2028-02-29" });
  assert.equal(result.status, "success");
  assert.equal(result.instant, "2028-02-29T14:00:00Z");
  assert.equal(result.source.date, "2028-02-29");
  assert.equal(result.destination.date, "2028-02-29");
});

test("malformed and impossible dates return the documented invalid outcome", () => {
  for (const date of [undefined, null, 20270115, {}, [], "", "2027-02-30", "2027-02-29", "2100-02-29", "2027-13-01", "2027-00-01", "2027-01-00", "2027-01-32", "2027-1-15", "27-01-15", "20270115", "2027-01-15T00:00", "2027-01-15\n", " 2027-01-15"]) {
    assert.deepEqual(convert({ date }), {
      status: "invalid",
      error: { field: "date", code: "INVALID_DATE", message: "Expected a valid ISO calendar date in YYYY-MM-DD format." },
    }, `date: ${JSON.stringify(date)}`);
  }
});

test("time requires exactly HH:mm, with no normalization or trailing characters", () => {
  for (const time of [undefined, null, 900, {}, [], "", "9:00", "09:0", "24:00", "23:60", "-1:30", "09:00:00", "09:00Z", "09:00+05:30", "9 AM", " 09:00", "09:00 ", "09:00\n", "09:00\r\n"]) {
    const result = convert({ time });
    assert.equal(result.status, "invalid", `time: ${JSON.stringify(time)}`);
    assert.equal(result.error.field, "time");
    assert.equal(result.error.code, "INVALID_TIME");
  }
  assert.equal(convert({ time: "00:00" }).status, "success");
  assert.equal(convert({ time: "23:59" }).status, "success");
});

for (const field of ["sourceTimeZone", "destinationTimeZone"]) {
  test(`${field} rejects missing, unsupported, numeric-offset and date-string values`, () => {
    for (const value of [undefined, null, false, 0, {}, [], "", " ", "Not/AZone", "+05:30", "-04:00", "Z", "UTC+05:30", " Europe/London", "Europe/London\n", "2027-01-15T09:00[America/Toronto]"]) {
      const result = convert({ [field]: value });
      assert.equal(result.status, "invalid", `${field}: ${JSON.stringify(value)}`);
      assert.equal(result.error.field, field);
      assert.equal(result.error.code, "INVALID_TIME_ZONE");
    }
  });
}

test("non-object inputs have one structured validation contract", () => {
  for (const input of [undefined, null, [], "2027-01-15", 0, true]) {
    assert.deepEqual(convertLocalDateTime(input), {
      status: "invalid",
      error: { field: "input", code: "INVALID_INPUT", message: "Expected a conversion options object." },
    });
  }
});

test("unsupported disambiguation values cannot silently become compatible", () => {
  for (const disambiguation of [null, "", "compatible", "EARLIER", false, 0, {}, []]) {
    const result = convert({ disambiguation });
    assert.equal(result.status, "invalid");
    assert.equal(result.error.field, "disambiguation");
    assert.equal(result.error.code, "INVALID_DISAMBIGUATION");
  }
});

test("same-zone conversions preserve local fields and still detect ambiguity", () => {
  const result = convert({ destinationTimeZone: "America/Toronto" });
  assert.equal(result.status, "success");
  assert.deepEqual(result.source, result.destination);
  assert.equal(result.instant, "2027-01-15T14:00:00Z");
  assert.equal(result.dayDifference, 0);
  assert.equal(convert({ ...overlapInput, destinationTimeZone: "America/Toronto" }).status, "ambiguous");
  assert.equal(convert({ ...gapInput, destinationTimeZone: "America/Toronto" }).status, "nonexistent");
});

test("equal current offsets do not collapse distinct timezone identities or rules", () => {
  const winter = convert({ destinationTimeZone: "America/Jamaica" });
  assert.equal(winter.status, "success");
  assert.equal(winter.source.offset, winter.destination.offset);
  assert.notEqual(winter.source.timeZone, winter.destination.timeZone);
  assert.equal(winter.destination.time, "09:00:00");
  const summer = convert({ date: "2027-07-15", destinationTimeZone: "America/Jamaica" });
  assert.equal(summer.status, "success");
  assert.equal(summer.source.offset, "-04:00");
  assert.equal(summer.destination.offset, "-05:00");
  assert.equal(summer.destination.time, "08:00:00");
});

test("every catalog zone is accepted by the same conversion API", () => {
  for (const sourceTimeZone of new Set(cities.map(city => city.timezone))) {
    assert.equal(convert({ sourceTimeZone, destinationTimeZone: "UTC" }).status, "success", sourceTimeZone);
  }
});

test("resolved instants work with the existing offset and display helpers", () => {
  const result = convert({ date: "2027-03-15" });
  assert.equal(result.status, "success");
  const instant = new Date(result.epochMilliseconds);
  assert.equal(getTimeZoneOffsetMinutes(result.source.timeZone, instant), -240);
  assert.equal(getTimeZoneOffsetMinutes(result.destination.timeZone, instant), 0);
  assert.equal(getTimeDifferenceMinutes(result.source.timeZone, result.destination.timeZone, instant), 240);
  assert.equal(formatTimeInZone(result.destination.timeZone, instant, { hour12: false }), "13:00:00");
  assert.equal(formatDateInZone(result.destination.timeZone, instant, { weekday: undefined, year: "numeric", month: "2-digit", day: "2-digit" }), "03/15/2027");
});

test("repeated calls are independent of the clock, host timezone and native Temporal", () => {
  const inputs = [
    baseInput,
    { ...baseInput, ...gapInput },
    { ...baseInput, ...overlapInput },
    { ...baseInput, ...overlapInput, disambiguation: "earlier" },
    { ...baseInput, ...overlapInput, disambiguation: "later" },
  ];
  const expected = inputs.map(convertLocalDateTime);
  const hostZones = new Set();
  for (const [clock, timeZone] of [
    [Date.UTC(2000, 0, 1), "UTC"],
    [Date.UTC(2027, 2, 14, 7), "America/Los_Angeles"],
    [Date.UTC(2045, 6, 1), "Asia/Kathmandu"],
  ]) {
    // Import after changing Date, so an implementation that captures today's
    // date/offset during module initialization cannot accidentally pass.
    const script = `
      const OriginalDate = Date;
      globalThis.Date = class extends OriginalDate {
        constructor(...args) { super(...(args.length ? args : [${clock}])); }
        static now() { return ${clock}; }
      };
      globalThis.Temporal = undefined;
      const { convertLocalDateTime } = await import(${JSON.stringify(new URL("../src/utils/dateTime.js", import.meta.url).href)});
      const inputs = ${JSON.stringify(inputs)};
      process.stdout.write(JSON.stringify({
        clock: Date.now(), hostZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        first: inputs.map(convertLocalDateTime), second: inputs.map(convertLocalDateTime)
      }));
    `;
    const child = spawnSync(process.execPath, ["--input-type=module", "-e", script], {
      env: { ...process.env, TZ: timeZone }, encoding: "utf8", timeout: 30000,
    });
    assert.equal(child.status, 0, child.stderr || child.error?.message);
    const actual = JSON.parse(child.stdout);
    assert.equal(actual.clock, clock);
    assert.deepEqual(actual.first, expected);
    assert.deepEqual(actual.second, expected);
    hostZones.add(actual.hostZone);
  }
  assert.equal(hostZones.size, 3, "The probes must actually use different host zones.");
});
