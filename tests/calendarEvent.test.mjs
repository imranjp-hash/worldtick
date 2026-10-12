import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  CALENDAR_EVENT_DURATION_MILLISECONDS,
  createCalendarEvent,
  createCalendarFilename,
  getCalendarExportState,
} from "../src/utils/calendarEvent.js";
import { convertLocalDateTime } from "../src/utils/dateTime.js";

const sourceCity = { name: "Toronto", slug: "toronto" };
const destinationCity = { name: "London", slug: "london" };
const sourceDisplay = {
  date: "Saturday, March 27, 2027",
  time: "9:00 AM",
  timeZoneLabel: "Eastern Daylight Time · UTC−4",
};
const destinationDisplay = {
  date: "Saturday, March 27, 2027",
  time: "1:00 PM",
  timeZoneLabel: "Greenwich Mean Time · UTC+0",
};
const comparisonUrl = "https://www.youhora.com/time-difference?from=toronto&to=london&mode=specific&date=2027-03-27&time=09%3A00";

function eventFor(selectedConversion, overrides = {}) {
  return createCalendarEvent({
    selectedConversion,
    sourceCity,
    destinationCity,
    sourceDisplay,
    destinationDisplay,
    occurrence: null,
    comparisonUrl,
    ...overrides,
  });
}

test("calendar eligibility requires a resolved future safe-integer instant in specific mode", () => {
  const conversion = { epochMilliseconds: 1_000 };
  assert.deepEqual(getCalendarExportState({
    mode: "specific", selectedConversion: conversion, nowEpochMilliseconds: 999,
  }), { eligible: true, reason: null, startEpochMilliseconds: 1_000 });
  assert.equal(getCalendarExportState({
    mode: "specific", selectedConversion: conversion, nowEpochMilliseconds: 1_000,
  }).reason, "past");
  assert.equal(getCalendarExportState({
    mode: "specific", selectedConversion: conversion, nowEpochMilliseconds: 1_001,
  }).reason, "past");
  assert.equal(getCalendarExportState({
    mode: "current", selectedConversion: conversion, nowEpochMilliseconds: 0,
  }).reason, "not-specific");
  for (const selectedConversion of [null, {}, { epochMilliseconds: 1.5 }, { epochMilliseconds: NaN }]) {
    assert.equal(getCalendarExportState({
      mode: "specific", selectedConversion, nowEpochMilliseconds: 0,
    }).reason, "unresolved");
  }
});

test("provider-neutral event copies the selected epoch exactly and adds 30 elapsed minutes", () => {
  const selectedConversion = {
    epochMilliseconds: 1_806_150_123_456,
    source: { date: "2027-03-27" },
  };
  const event = eventFor(selectedConversion);

  assert.deepEqual(event, {
    uid: "youhora-v1-1806150123456-toronto-london-30m@youhora.com",
    title: "Toronto ↔ London meeting",
    description: [
      "Toronto: Saturday, March 27, 2027 at 9:00 AM",
      "Eastern Daylight Time · UTC−4",
      "",
      "London: Saturday, March 27, 2027 at 1:00 PM",
      "Greenwich Mean Time · UTC+0",
      "",
      `Comparison: ${comparisonUrl}`,
      "Created with YouHora",
    ].join("\n"),
    startEpochMilliseconds: selectedConversion.epochMilliseconds,
    endEpochMilliseconds: selectedConversion.epochMilliseconds + 1_800_000,
  });
  assert.equal(
    event.endEpochMilliseconds - event.startEpochMilliseconds,
    CALENDAR_EVENT_DURATION_MILLISECONDS,
  );
});

test("display strings and Phase 2C labels cannot override the selected timing", () => {
  const sentinel = 1_800_000_000_123;
  const event = eventFor({ epochMilliseconds: sentinel }, {
    sourceDisplay: {
      date: "not a date",
      time: "DTSTART:19000101T000000Z",
      timeZoneLabel: "invented zone",
    },
  });
  assert.equal(event.startEpochMilliseconds, sentinel);
  assert.equal(event.endEpochMilliseconds, sentinel + 1_800_000);
});

test("elapsed duration survives midnight, year boundaries and DST transitions", () => {
  const cases = [
    convertLocalDateTime({
      date: "2027-12-31", time: "23:45",
      sourceTimeZone: "UTC", destinationTimeZone: "Asia/Tokyo",
    }),
    convertLocalDateTime({
      date: "2027-03-14", time: "01:45",
      sourceTimeZone: "America/Toronto", destinationTimeZone: "UTC",
    }),
    convertLocalDateTime({
      date: "2027-11-07", time: "01:45",
      sourceTimeZone: "America/Toronto", destinationTimeZone: "UTC",
      disambiguation: "earlier",
    }),
  ];

  for (const conversion of cases) {
    assert.equal(conversion.status, "success");
    const event = eventFor(conversion);
    assert.equal(event.startEpochMilliseconds, conversion.epochMilliseconds);
    assert.equal(event.endEpochMilliseconds - event.startEpochMilliseconds, 1_800_000);
  }
});

test("resolved earlier and later overlaps have distinct stable event identities", () => {
  const unresolved = convertLocalDateTime({
    date: "2027-11-07", time: "01:30",
    sourceTimeZone: "America/Toronto", destinationTimeZone: "Europe/London",
  });
  assert.equal(unresolved.status, "ambiguous");
  const earlier = eventFor(unresolved.candidates[0], { occurrence: "earlier" });
  const earlierAgain = eventFor(unresolved.candidates[0], { occurrence: "earlier" });
  const later = eventFor(unresolved.candidates[1], { occurrence: "later" });

  assert.equal(earlier.uid, earlierAgain.uid);
  assert.notEqual(earlier.uid, later.uid);
  assert.match(earlier.description, /First occurrence/);
  assert.match(later.description, /Second occurrence/);

  const reversed = eventFor(unresolved.candidates[0], {
    sourceCity: destinationCity,
    destinationCity: sourceCity,
  });
  assert.notEqual(earlier.uid, reversed.uid);
});

test("calendar filenames are deterministic, ASCII-safe and bounded", () => {
  assert.equal(createCalendarFilename({
    sourceCity, destinationCity, sourceDate: "2027-03-27",
  }), "youhora-toronto-london-2027-03-27.ics");
  const filename = createCalendarFilename({
    sourceCity: { name: "São Paulo", slug: " São///Paulo;;;\r\n" },
    destinationCity: { name: "", slug: "---" },
    sourceDate: "../../2027/03/27\0",
  });
  assert.match(filename, /^youhora-[a-z0-9-]+-destination-[a-z0-9-]+\.ics$/);
  assert.doesNotMatch(filename, /[\\/\r\n;\0]/);
  assert.ok(filename.length < 170);
});

test("calendar code has no conversion, URL parsing or timezone arithmetic dependency", async () => {
  const source = await readFile(new URL("../src/utils/calendarEvent.js", import.meta.url), "utf8");
  assert.doesNotMatch(source, /convertLocalDateTime|Temporal|URLSearchParams|getTimeZoneOffset|Date\.parse/);
});
