import assert from "node:assert/strict";
import test from "node:test";
import {
  downloadIcsFile,
  escapeIcsText,
  foldIcsContentLine,
  formatIcsUtcTimestamp,
  serializeCalendarEventToIcs,
} from "../src/utils/ics.js";

const event = Object.freeze({
  uid: "youhora-v1-1806152400000-toronto-london-30m@youhora.com",
  title: "Toronto ↔ London meeting",
  description: "Toronto: Saturday, March 27, 2027 at 9:00 AM\nEastern Daylight Time · UTC−4\n\nLondon: Saturday, March 27, 2027 at 1:00 PM\nGreenwich Mean Time · UTC+0",
  startEpochMilliseconds: Date.UTC(2027, 2, 27, 13),
  endEpochMilliseconds: Date.UTC(2027, 2, 27, 13, 30),
});
const generatedAtEpochMilliseconds = Date.UTC(2026, 9, 4, 15, 30, 12, 987);

function unfold(value) {
  return value.replace(/\r\n[ \t]/g, "");
}

test("UTC timestamp formatting is basic, zero-padded, UTC and has no milliseconds", () => {
  assert.equal(formatIcsUtcTimestamp(Date.UTC(2027, 2, 7, 3, 4, 5, 999)), "20270307T030405Z");
});

test("UTC timestamp formatting covers day, leap-day and year boundaries", () => {
  for (const [instant, expected] of [
    ["0000-01-01T00:00:00.000Z", "00000101T000000Z"],
    ["2027-01-31T23:59:59.999Z", "20270131T235959Z"],
    ["2027-02-01T00:00:00.000Z", "20270201T000000Z"],
    ["2028-02-29T12:34:56.789Z", "20280229T123456Z"],
    ["2027-12-31T23:59:59.999Z", "20271231T235959Z"],
    ["2028-01-01T00:00:00.000Z", "20280101T000000Z"],
    ["9999-12-31T23:59:59.999Z", "99991231T235959Z"],
  ]) {
    assert.equal(formatIcsUtcTimestamp(Date.parse(instant)), expected);
  }
});

test("UTC timestamp formatting rejects years outside the four-digit contract", () => {
  assert.throws(
    () => formatIcsUtcTimestamp(Date.parse("+010000-01-01T00:00:00.000Z")),
    /UTC year between 0000 and 9999/,
  );
  assert.throws(
    () => formatIcsUtcTimestamp(Date.parse("-000001-12-31T23:59:59.000Z")),
    /UTC year between 0000 and 9999/,
  );
});

test("serializer emits the portable UTC calendar contract with injected DTSTAMP", () => {
  const ics = serializeCalendarEventToIcs(event, { generatedAtEpochMilliseconds });
  const logical = unfold(ics);

  for (const line of [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//YouHora//Calendar Event 1.0//EN",
    "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    `UID:${event.uid}`,
    "DTSTAMP:20261004T153012Z",
    "DTSTART:20270327T130000Z",
    "DTEND:20270327T133000Z",
    "SUMMARY:Toronto ↔ London meeting",
    "END:VEVENT",
    "END:VCALENDAR",
  ]) {
    assert.ok(logical.includes(`${line}\r\n`), line);
  }
  assert.doesNotMatch(ics, /TZID|VTIMEZONE|METHOD|ATTENDEE|ORGANIZER|VALARM|RRULE/);
  assert.doesNotMatch(logical, /^DT(?:STAMP|START|END):.*\.\d+/m);
});

test("DTSTART follows the event sentinel rather than display text or generation time", () => {
  const sentinelEvent = {
    ...event,
    description: "DTSTART:19000101T000000Z",
    startEpochMilliseconds: Date.UTC(2031, 5, 2, 1, 2, 3, 456),
    endEpochMilliseconds: Date.UTC(2031, 5, 2, 1, 32, 3, 456),
  };
  const logical = unfold(serializeCalendarEventToIcs(sentinelEvent, {
    generatedAtEpochMilliseconds,
  }));
  assert.match(logical, /DTSTART:20310602T010203Z\r\n/);
  assert.match(logical, /DTSTAMP:20261004T153012Z\r\n/);
});

test("changing DTSTAMP leaves UID, DTSTART and DTEND identical", () => {
  const first = unfold(serializeCalendarEventToIcs(event, {
    generatedAtEpochMilliseconds: Date.UTC(2026, 0, 1),
  }));
  const second = unfold(serializeCalendarEventToIcs(event, {
    generatedAtEpochMilliseconds: Date.UTC(2026, 6, 1),
  }));
  const identityLines = (value) => value.split("\r\n").filter(
    (line) => /^(?:UID|DTSTART|DTEND):/.test(line),
  );

  assert.deepEqual(identityLines(first), identityLines(second));
  assert.notEqual(
    first.split("\r\n").find((line) => line.startsWith("DTSTAMP:")),
    second.split("\r\n").find((line) => line.startsWith("DTSTAMP:")),
  );
});

test("TEXT escaping normalizes newlines, strips controls and prevents property injection", () => {
  assert.equal(
    escapeIcsText("one\\two,three;four\r\nDTSTART:evil\rfive\nsix\0\u0007"),
    "one\\\\two\\,three\\;four\\nDTSTART:evil\\nfive\\nsix",
  );
  const malicious = serializeCalendarEventToIcs({
    ...event,
    title: "Meeting\r\nMETHOD:CANCEL",
    description: "Safe\nBEGIN:VEVENT",
  }, { generatedAtEpochMilliseconds });
  const logicalLines = unfold(malicious).split("\r\n");
  assert.equal(logicalLines.includes("METHOD:CANCEL"), false);
  assert.equal(logicalLines.filter((line) => line === "BEGIN:VEVENT").length, 1);
  assert.match(unfold(malicious), /SUMMARY:Meeting\\nMETHOD:CANCEL/);
});

test("serialization uses CRLF throughout and includes a final CRLF", () => {
  const ics = serializeCalendarEventToIcs(event, { generatedAtEpochMilliseconds });
  assert.ok(ics.endsWith("END:VCALENDAR\r\n"));
  assert.equal(ics.replace(/\r\n/g, "").includes("\n"), false);
  assert.equal(ics.replace(/\r\n/g, "").includes("\r"), false);
});

test("UTF-8 folding stays within 75 octets, preserves code points and unfolds exactly", () => {
  const logicalLine = `DESCRIPTION:${"É東🌍".repeat(40)}\\n${"long text ".repeat(20)}`;
  const folded = foldIcsContentLine(logicalLine);
  assert.ok(folded.length > 1);
  for (const physicalLine of folded) {
    assert.ok(new TextEncoder().encode(physicalLine).length <= 75, physicalLine);
  }
  assert.equal(folded.map((line, index) => index ? line.slice(1) : line).join(""), logicalLine);
  const bytes = new TextEncoder().encode(folded.join("\r\n"));
  assert.equal(new TextDecoder("utf-8", { fatal: true }).decode(bytes), folded.join("\r\n"));
});

function downloadHarness({ failures = [] } = {}) {
  const created = [];
  const revoked = [];
  const appended = [];
  const deferred = [];
  const fallbackDeferred = [];
  const failureSet = new Set(failures);
  const errors = new Map(failures.map((stage) => [stage, new Error(`${stage} failed`)]));
  const fail = (stage) => {
    if (failureSet.has(stage)) throw errors.get(stage);
  };
  let href;
  let download;
  let hidden;
  const anchor = {
    removed: false,
    clickCount: 0,
    set href(value) { fail("href"); href = value; },
    get href() { return href; },
    set download(value) { fail("download"); download = value; },
    get download() { return download; },
    set hidden(value) { fail("hidden"); hidden = value; },
    get hidden() { return hidden; },
    click() {
      this.clickCount += 1;
      fail("click");
    },
    remove() { fail("remove"); this.removed = true; },
  };
  const environment = {
    Blob: function BlobConstructor(parts, options) {
      fail("blob");
      return new Blob(parts, options);
    },
    URL: {
      createObjectURL(blob) {
        fail("createObjectURL");
        created.push(blob);
        return `blob:test-${created.length}`;
      },
      revokeObjectURL(url) { revoked.push(url); },
    },
    document: {
      createElement(name) { assert.equal(name, "a"); fail("createElement"); return anchor; },
      body: { appendChild(node) { fail("append"); appended.push(node); } },
    },
    setTimeout(callback, delay) { fail("setTimeout"); deferred.push({ callback, delay }); },
    queueMicrotask(callback) { fail("queueMicrotask"); fallbackDeferred.push(callback); },
  };
  return {
    environment, created, revoked, appended, deferred, fallbackDeferred, anchor, errors,
    flushRevocations() {
      for (const task of deferred.splice(0)) task.callback();
      for (const callback of fallbackDeferred.splice(0)) callback();
    },
  };
}

test("browser download uses the correct MIME type and cleans up after deferred revocation", () => {
  const harness = downloadHarness();
  downloadIcsFile({ ics: "BEGIN:VCALENDAR\r\n", filename: "event.ics" }, harness.environment);

  assert.equal(harness.created.length, 1);
  assert.equal(harness.created[0].type, "text/calendar;charset=utf-8");
  assert.equal(harness.anchor.href, "blob:test-1");
  assert.equal(harness.anchor.download, "event.ics");
  assert.equal(harness.anchor.hidden, true);
  assert.equal(harness.anchor.clickCount, 1);
  assert.equal(harness.anchor.removed, true);
  assert.deepEqual(harness.revoked, []);
  assert.equal(harness.deferred[0].delay, 0);
  harness.deferred[0].callback();
  assert.deepEqual(harness.revoked, ["blob:test-1"]);
});

test("repeated downloads revoke every object URL without leaking", () => {
  const harness = downloadHarness();
  downloadIcsFile({ ics: "one", filename: "one.ics" }, harness.environment);
  downloadIcsFile({ ics: "two", filename: "two.ics" }, harness.environment);
  assert.equal(harness.created.length, 2);
  assert.deepEqual(harness.revoked, []);
  harness.flushRevocations();
  assert.deepEqual(harness.revoked, ["blob:test-1", "blob:test-2"]);
});

test("a throwing click still removes the anchor and schedules object URL revocation", () => {
  const harness = downloadHarness({ failures: ["click"] });
  assert.throws(
    () => downloadIcsFile({ ics: "event", filename: "event.ics" }, harness.environment),
    /click failed/,
  );
  assert.equal(harness.anchor.removed, true);
  assert.deepEqual(harness.revoked, []);
  harness.deferred[0].callback();
  assert.deepEqual(harness.revoked, ["blob:test-1"]);
});

test("Blob and object URL creation failures do not start owned-resource cleanup", () => {
  for (const stage of ["blob", "createObjectURL"]) {
    const harness = downloadHarness({ failures: [stage] });
    assert.throws(
      () => downloadIcsFile({ ics: "event", filename: "event.ics" }, harness.environment),
      harness.errors.get(stage),
    );
    assert.equal(harness.created.length, 0);
    assert.equal(harness.deferred.length, 0);
    assert.deepEqual(harness.revoked, []);
  }
});

test("every failure after object URL creation removes any anchor and defers revocation", () => {
  for (const stage of ["createElement", "href", "download", "hidden", "append", "click"]) {
    const harness = downloadHarness({ failures: [stage] });
    assert.throws(
      () => downloadIcsFile({ ics: "event", filename: "event.ics" }, harness.environment),
      harness.errors.get(stage),
    );
    assert.equal(harness.created.length, 1, stage);
    assert.equal(harness.anchor.removed, stage === "createElement" ? false : true, stage);
    assert.deepEqual(harness.revoked, [], stage);
    harness.flushRevocations();
    assert.deepEqual(harness.revoked, ["blob:test-1"], stage);
  }
});

test("anchor removal failure is surfaced after revocation is safely scheduled", () => {
  const harness = downloadHarness({ failures: ["remove"] });
  assert.throws(
    () => downloadIcsFile({ ics: "event", filename: "event.ics" }, harness.environment),
    harness.errors.get("remove"),
  );
  assert.deepEqual(harness.revoked, []);
  harness.flushRevocations();
  assert.deepEqual(harness.revoked, ["blob:test-1"]);
});

test("revocation scheduling failure uses a deferred fallback and surfaces the failure", () => {
  const harness = downloadHarness({ failures: ["setTimeout"] });
  assert.throws(
    () => downloadIcsFile({ ics: "event", filename: "event.ics" }, harness.environment),
    harness.errors.get("setTimeout"),
  );
  assert.deepEqual(harness.revoked, []);
  assert.equal(harness.fallbackDeferred.length, 1);
  harness.flushRevocations();
  assert.deepEqual(harness.revoked, ["blob:test-1"]);
});

test("the primary failure remains surfaced when removal and scheduling also fail", () => {
  const harness = downloadHarness({ failures: ["click", "remove", "setTimeout"] });
  assert.throws(
    () => downloadIcsFile({ ics: "event", filename: "event.ics" }, harness.environment),
    harness.errors.get("click"),
  );
  harness.flushRevocations();
  assert.deepEqual(harness.revoked, ["blob:test-1"]);
});

test("a final best-effort revocation runs if both deferred mechanisms fail", () => {
  const harness = downloadHarness({ failures: ["setTimeout", "queueMicrotask"] });
  assert.throws(
    () => downloadIcsFile({ ics: "event", filename: "event.ics" }, harness.environment),
    harness.errors.get("setTimeout"),
  );
  assert.deepEqual(harness.revoked, ["blob:test-1"]);
});
