import { readFile } from "node:fs/promises";

// This command is deliberately outside node --test and the application startup.
// No expected value is obtained from either runtime time-zone implementation.
const fixtureUrl = new URL("../tests/fixtures/timeZoneRules.json", import.meta.url);
const requiredZones = ["America/Vancouver", "America/Edmonton", "America/Winnipeg", "Africa/Casablanca", "America/Toronto"];
const minute = 60_000;
const halfHour = 30 * minute;
const totals = Object.fromEntries(["Fixture", "Native Intl", "Temporal", "Application"].map((name) => [name, { passed: 0, failed: 0 }]));

function requireValue(condition, message) {
  if (!condition) throw new Error(message);
}

function record(value, keys) {
  requireValue(value && typeof value === "object" && !Array.isArray(value), "Expected an object");
  requireValue(Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key)),
    `Expected exactly these fields: ${keys.join(", ")}`);
}

function nonempty(value) {
  requireValue(typeof value === "string" && value.trim().length > 0, "Expected a nonempty string");
}

function instantMilliseconds(value) {
  requireValue(typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value), "Expected canonical UTC instant with milliseconds");
  const epoch = Date.parse(value);
  requireValue(Number.isFinite(epoch) && new Date(epoch).toISOString() === value, `Invalid UTC instant: ${value}`);
  return epoch;
}

function localMilliseconds(value) {
  requireValue(typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value), "Expected local YYYY-MM-DDTHH:mm");
  return instantMilliseconds(`${value}:00.000Z`);
}

function dateMilliseconds(value) {
  requireValue(typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value), "Expected YYYY-MM-DD");
  return localMilliseconds(`${value}T00:00`);
}

function offsetMinutes(value) {
  requireValue(typeof value === "string", "Missing offset string");
  const match = /^([+-])(\d{2}):([0-5]\d)$/.exec(value);
  requireValue(match && Number(match[2]) <= 14 && (Number(match[2]) < 14 || match[3] === "00") && value !== "-00:00", `Malformed or unsupported offset: ${value}`);
  return (match[1] === "-" ? -1 : 1) * (Number(match[2]) * 60 + Number(match[3]));
}

function validateFixture(fixture) {
  record(fixture, ["schemaVersion", "reviewedOn", "provenance", "groups"]);
  requireValue(fixture.schemaVersion === 1, "Unsupported fixture schema");
  dateMilliseconds(fixture.reviewedOn);
  nonempty(fixture.provenance);
  requireValue(Array.isArray(fixture.groups) && fixture.groups.length === requiredZones.length, "Expected all five fixture groups");
  const zones = new Set(), ids = new Set();
  for (const group of fixture.groups) {
    record(group, ["timeZone", "reviewedIanaRelease", "sources", "notes", "checks"]);
    requireValue(requiredZones.includes(group.timeZone) && !zones.has(group.timeZone), `Unexpected or duplicate zone: ${group.timeZone}`);
    zones.add(group.timeZone);
    requireValue(typeof group.reviewedIanaRelease === "string" && /^\d{4}[a-z]$/.test(group.reviewedIanaRelease),
      `${group.timeZone}: reviewedIanaRelease must be a string matching YYYYx`);
    nonempty(group.notes);
    requireValue(Array.isArray(group.sources) && group.sources.length >= 2, "Missing authoritative references");
    for (const source of group.sources) {
      record(source, ["title", "url"]);
      nonempty(source.title);
      requireValue(new URL(source.url).protocol === "https:", "Expected HTTPS source URL");
    }
    requireValue(group.sources.some(({ url }) => url.startsWith(`https://data.iana.org/time-zones/tzdb-${group.reviewedIanaRelease}/`)), "Missing release-specific IANA source");
    requireValue(Array.isArray(group.checks) && group.checks.length > 0 && group.checks.some((check) => check?.kind === "offset"), "Missing offset checks");
    for (const check of group.checks) {
      try {
        nonempty(check?.id);
        requireValue(!ids.has(check.id), `Duplicate id: ${check.id}`);
        ids.add(check.id);
        if (check.kind === "offset") {
          record(check, ["id", "kind", "instant", "expectedOffset"]);
          instantMilliseconds(check.instant);
          offsetMinutes(check.expectedOffset);
        } else if (check.kind === "local") {
          record(check, ["id", "kind", "local", "expectedStatus", "expectedOccurrences"]);
          const localEpoch = localMilliseconds(check.local);
          requireValue(Array.isArray(check.expectedOccurrences), "Missing expected occurrences");
          requireValue(typeof check.expectedStatus === "string" && ["nonexistent", "success", "ambiguous"].includes(check.expectedStatus),
            "expectedStatus must be a string: nonexistent, success, or ambiguous");
          const count = { nonexistent: 0, success: 1, ambiguous: 2 }[check.expectedStatus];
          requireValue(Number.isInteger(count) && check.expectedOccurrences.length === count, "Status/occurrence count mismatch");
          let previous = -Infinity;
          for (const occurrence of check.expectedOccurrences) {
            record(occurrence, ["instant", "offset"]);
            const epoch = instantMilliseconds(occurrence.instant);
            requireValue(epoch > previous && epoch + offsetMinutes(occurrence.offset) * minute === localEpoch, "Unordered or inconsistent expected occurrence");
            previous = epoch;
          }
        } else if (check.kind === "plannerDay") {
          record(check, ["id", "kind", "date", "nextDate", "referenceCitySlug", "expectedStart", "expectedEnd", "expectedCandidateCount"]);
          requireValue(dateMilliseconds(check.nextDate) - dateMilliseconds(check.date) === 86_400_000, "Expected consecutive planner dates");
          requireValue(group.timeZone === "America/Winnipeg" && check.referenceCitySlug === "winnipeg", "Unsupported planner fixture zone/city");
          const duration = instantMilliseconds(check.expectedEnd) - instantMilliseconds(check.expectedStart);
          requireValue(Number.isInteger(check.expectedCandidateCount) && check.expectedCandidateCount > 0 && duration === check.expectedCandidateCount * halfHour, "Invalid planner duration/count");
        } else {
          throw new Error(`Unknown check kind: ${check.kind}`);
        }
      } catch (error) {
        throw new Error(`${group.timeZone} / ${check?.id ?? "missing id"}: ${error.message}`);
      }
    }
  }
  for (const id of ["winnipeg-november-2-noon", "winnipeg-no-repeated-hour", "winnipeg-planner-november-1", "toronto-still-repeats-hour"]) {
    requireValue(ids.has(id), `Missing required regression: ${id}`);
  }
}

const formatters = new Map();
function nativeProjection(timeZone, epoch) {
  if (!formatters.has(timeZone)) {
    formatters.set(timeZone, new Intl.DateTimeFormat("en-US-u-ca-iso8601-nu-latn", {
      timeZone, year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23", timeZoneName: "longOffset",
    }));
  }
  const parts = formatters.get(timeZone).formatToParts(new Date(epoch));
  const part = (type) => {
    const matches = parts.filter((item) => item.type === type);
    requireValue(matches.length === 1 && typeof matches[0].value === "string" && matches[0].value.length > 0, `Missing/duplicate Intl ${type}`);
    return matches[0].value;
  };
  const name = part("timeZoneName");
  // Only an explicit GMT token means zero. Missing/unrecognized data throws.
  const offset = name === "GMT" ? "+00:00" : name.startsWith("GMT") ? name.slice(3) : undefined;
  offsetMinutes(offset);
  const local = `${part("year")}-${part("month")}-${part("day")}T${part("hour")}:${part("minute")}`;
  localMilliseconds(local);
  requireValue(/^[0-5]\d$/.test(part("second")), "Malformed Intl second");
  return { local, offset };
}

function nativeOccurrences(timeZone, local) {
  const wallEpoch = localMilliseconds(local);
  const occurrences = [];
  // Intl has no wall-time inversion API. Exhaust all minute offsets in +/-14h,
  // independently of the fixture's expected offsets. These modern fixtures have
  // minute-aligned offsets; this is not a general historical timezone provider.
  for (let candidateOffset = 14 * 60; candidateOffset >= -14 * 60; candidateOffset--) {
    const epoch = wallEpoch - candidateOffset * minute;
    const projected = nativeProjection(timeZone, epoch);
    if (projected.local === local) occurrences.push({ instant: new Date(epoch).toISOString(), offset: projected.offset });
  }
  return occurrences;
}

function localResult(occurrences) {
  requireValue(Array.isArray(occurrences) && occurrences.length <= 2, "Unsupported occurrence result");
  for (const occurrence of occurrences) {
    instantMilliseconds(occurrence.instant);
    offsetMinutes(occurrence.offset);
  }
  return { status: ["nonexistent", "success", "ambiguous"][occurrences.length], occurrences };
}

function temporalOccurrences(Temporal, timeZone, local) {
  const wall = Temporal.PlainDateTime.from(local);
  const occurrences = new Map();
  for (const disambiguation of ["earlier", "later"]) {
    const zoned = wall.toZonedDateTime(timeZone, { disambiguation });
    if (zoned.toPlainDateTime().equals(wall)) {
      const epoch = zoned.epochMilliseconds;
      occurrences.set(epoch, { instant: new Date(epoch).toISOString(), offset: zoned.offset });
    }
  }
  return [...occurrences.entries()].sort(([a], [b]) => a - b).map(([, occurrence]) => occurrence);
}

function dayResult(check, occurrences, projectDate) {
  const start = occurrences(`${check.date}T00:00`), end = occurrences(`${check.nextDate}T00:00`);
  requireValue(start.length === 1 && end.length === 1, "Planner probe requires unique midnights");
  const first = instantMilliseconds(start[0].instant), last = instantMilliseconds(end[0].instant);
  requireValue(last > first && last - first <= 48 * 60 * minute, "Invalid observed day boundaries");
  let candidateCount = 0;
  for (let epoch = first; epoch < last; epoch += halfHour) {
    requireValue(projectDate(epoch) === check.date, "Planner start projects outside reference date");
    candidateCount++;
  }
  return { start: start[0].instant, end: end[0].instant, candidateCount };
}

function expectedResult(check) {
  if (check.kind === "offset") return { offset: check.expectedOffset };
  if (check.kind === "local") return { status: check.expectedStatus, occurrences: check.expectedOccurrences };
  return { start: check.expectedStart, end: check.expectedEnd, candidateCount: check.expectedCandidateCount };
}

function runProbe(engine, label, expected, probe) {
  let observed, failure;
  try {
    observed = probe();
    requireValue(observed !== undefined && observed !== null, "Probe returned no value");
    if (JSON.stringify(observed) !== JSON.stringify(expected)) failure = "disagreement";
  } catch (error) {
    failure = `probe error: ${error.message}`;
  }
  totals[engine][failure ? "failed" : "passed"]++;
  console.log(`${failure ? "FAIL" : "PASS"} [${engine}] ${label} expected=${JSON.stringify(expected)} observed=${observed === undefined ? "unavailable" : JSON.stringify(observed)}${failure ? ` (${failure})` : ""}`);
}

async function optionalImport(path) {
  try { return { module: await import(path) }; }
  catch (error) { return { error }; }
}

function loaded(result) {
  if (result.error) throw result.error;
  return result.module;
}

async function main() {
  console.log("Independent time-zone regression gate (fixed expectations; engine agreement is insufficient)");
  console.log(`Node=${process.versions.node ?? "unavailable"} ICU=${process.versions.icu ?? "unavailable"} CLDR=${process.versions.cldr ?? "unavailable"} tzdata=${process.versions.tz ?? "unavailable"}`);
  const fixture = JSON.parse(await readFile(fixtureUrl, "utf8"));
  validateFixture(fixture);
  totals.Fixture.passed++;
  console.log(`Fixture schema valid; reviewed ${fixture.reviewedOn}. ${fixture.provenance}`);
  const temporal = await optionalImport("@js-temporal/polyfill");
  const conversions = await optionalImport("../src/utils/dateTime.js");
  const planner = await optionalImport("../src/utils/meetingPlanner.js");
  for (const group of fixture.groups) {
    console.log(`\n${group.timeZone} | reviewed IANA ${group.reviewedIanaRelease}`);
    for (const source of group.sources) console.log(`Source: ${source.title} ${source.url}`);
    for (const check of group.checks) {
      const label = `${check.id} (${check.instant ?? check.local ?? check.date})`;
      const expected = expectedResult(check);
      runProbe("Native Intl", label, expected, () => {
        if (check.kind === "offset") return { offset: nativeProjection(group.timeZone, instantMilliseconds(check.instant)).offset };
        if (check.kind === "local") return localResult(nativeOccurrences(group.timeZone, check.local));
        return dayResult(check, (local) => nativeOccurrences(group.timeZone, local), (epoch) => nativeProjection(group.timeZone, epoch).local.slice(0, 10));
      });
      runProbe("Temporal", label, expected, () => {
        const { Temporal } = loaded(temporal);
        if (check.kind === "offset") {
          const offset = Temporal.Instant.from(check.instant).toZonedDateTimeISO(group.timeZone).offset;
          offsetMinutes(offset);
          return { offset };
        }
        if (check.kind === "local") return localResult(temporalOccurrences(Temporal, group.timeZone, check.local));
        return dayResult(check, (local) => temporalOccurrences(Temporal, group.timeZone, local), (epoch) => Temporal.Instant.fromEpochMilliseconds(epoch).toZonedDateTimeISO(group.timeZone).toPlainDate().toString());
      });
      if (check.kind === "local") runProbe("Application", label, expected, () => {
        const result = loaded(conversions).convertLocalDateTime({
          date: check.local.slice(0, 10), time: check.local.slice(11), sourceTimeZone: group.timeZone,
          destinationTimeZone: "UTC", disambiguation: "reject",
        });
        requireValue(["success", "ambiguous", "nonexistent"].includes(result?.status), `Conversion failed: unexpected status ${String(result?.status)}`);
        const candidates = result.status === "success" ? [result] : result.status === "ambiguous" ? result.candidates : [];
        const observed = localResult(candidates.map((candidate) => {
          const epochMilliseconds = candidate?.epochMilliseconds;
          requireValue(Number.isSafeInteger(epochMilliseconds),
            `Invalid conversion epochMilliseconds: ${String(epochMilliseconds)} (type ${typeof epochMilliseconds}); expected a safe integer`);
          return { instant: new Date(epochMilliseconds).toISOString(), offset: candidate.source?.offset };
        }));
        requireValue(observed.status === result.status, "Conversion status/occurrence mismatch");
        return observed;
      });
      if (check.kind === "plannerDay") runProbe("Application", label, expected, () => {
        const result = loaded(planner).generateMeetingPlan({ citySlugs: [check.referenceCitySlug, "london"], referenceCitySlug: check.referenceCitySlug, referenceDate: check.date });
        requireValue(result?.status === "success" && Array.isArray(result.candidates), `Planner failed: ${JSON.stringify(result)}`);
        const first = result.referenceDay?.startEpochMilliseconds, last = result.referenceDay?.endEpochMilliseconds;
        requireValue(Number.isSafeInteger(first) && Number.isSafeInteger(last) && last > first, "Missing planner boundaries");
        requireValue(result.candidates.length === (last - first) / halfHour, "Planner count/duration mismatch");
        for (const [index, candidate] of result.candidates.entries()) {
          requireValue(candidate.startEpochMilliseconds === first + index * halfHour && candidate.endEpochMilliseconds === candidate.startEpochMilliseconds + halfHour, "Planner candidate grid mismatch");
        }
        return { start: new Date(first).toISOString(), end: new Date(last).toISOString(), candidateCount: result.candidates.length };
      });
    }
  }
}

try { await main(); }
catch (error) {
  totals.Fixture.failed++;
  console.error(`FAIL [Fixture/setup] ${error.message}`);
}
let failures = 0;
console.log("\nFailure counts (each probe compares to the fixture independently):");
for (const [engine, result] of Object.entries(totals)) {
  failures += result.failed;
  console.log(`${engine}: ${result.passed} passed, ${result.failed} failed, ${result.passed + result.failed} total`);
}
console.log(`Total failures: ${failures}`);
process.exitCode = failures > 0 ? 1 : 0;
