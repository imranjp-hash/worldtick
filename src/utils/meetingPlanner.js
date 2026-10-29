import { Temporal } from "@js-temporal/polyfill";
import { cities } from "../data/cities.js";

export const MEETING_DURATION_MILLISECONDS = 1_800_000;
export const MIN_PLANNER_DATE = "2020-01-01";
// Reserve the following calendar day within the planner's four-digit year policy.
export const MAX_PLANNER_DATE = "9999-12-30";
const cityBySlug = new Map(cities.map((city) => [city.slug, city]));
const timePattern = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const invalid = (field, code, message) => ({ status: "invalid", error: { field, code, message } });

function parseWindow(window, fieldPrefix) {
  for (const field of ["start", "end"]) {
    if (!window || typeof window !== "object" || Array.isArray(window) || !Object.hasOwn(window, field)
      || typeof window[field] !== "string" || window[field].length !== 5 || !timePattern.test(window[field])) {
      return invalid(`${fieldPrefix}.${field}`, "INVALID_TIME", "Enter preferred hours in HH:mm format.");
    }
  }
  const opening = Temporal.PlainTime.from(window.start);
  const closing = Temporal.PlainTime.from(window.end);
  const order = Temporal.PlainTime.compare(opening, closing);
  const cityMessage = "Choose a closing time later than the opening time. Overnight hours are not supported.";
  if (order === 0) return invalid(`${fieldPrefix}.end`, "EQUAL_HOURS",
    fieldPrefix === "preferredWindow" ? "Preferred opening and closing times must differ." : cityMessage);
  if (order > 0) return invalid(`${fieldPrefix}.end`, "OVERNIGHT_UNSUPPORTED",
    fieldPrefix === "preferredWindow" ? "Overnight hours are not supported yet." : cityMessage);
  return { opening, closing };
}

function project(value) {
  return {
    date: value.toPlainDate().toString(),
    time: value.toPlainTime().toString({ smallestUnit: "second" }),
    offset: value.offset,
  };
}

function firstValidInstantForLocalDate(date, timeZone) {
  // An explicit PlainDateTime avoids the polyfill's clock-reading start-of-day
  // path. Earlier chooses the first occurrence when midnight is repeated.
  const midnight = date.toPlainDateTime("00:00");
  const earlier = midnight.toZonedDateTime(timeZone, { disambiguation: "earlier" });
  if (earlier.toPlainDateTime().equals(midnight)) return earlier;

  // Midnight is in a forward gap. Its earlier/later interpretations bracket
  // the first instant of the date, even when the gap begins before midnight.
  // IANA transitions occur at whole milliseconds; search explicit projections
  // rather than the polyfill's current-clock-dependent transition API.
  const later = midnight.toZonedDateTime(timeZone, { disambiguation: "later" });
  let low = earlier.epochMilliseconds, high = later.epochMilliseconds;
  while (high - low > 1) {
    const middle = Math.floor((low + high) / 2);
    const projected = Temporal.Instant.fromEpochMilliseconds(middle).toZonedDateTimeISO(timeZone);
    if (Temporal.PlainDate.compare(projected.toPlainDate(), date) < 0) low = middle;
    else high = middle;
  }
  const first = Temporal.Instant.fromEpochMilliseconds(high).toZonedDateTimeISO(timeZone);
  if (!first.toPlainDate().equals(date)) throw new RangeError("The local calendar date does not exist.");
  return first;
}

// Modern IANA rules have at most one offset change in a 30-minute interval.
// Locate that change with bounded instant projections instead of Temporal's
// transition-search API (the polyfill consults Date.now for its search horizon).
// Each resulting segment advances monotonically in local time. Test both ends,
// including the instant immediately before its exclusive end.
function withinWindow(start, endEpochMilliseconds, opening, closing) {
  let cursor = start;
  while (cursor.epochMilliseconds < endEpochMilliseconds) {
    let segmentEnd = endEpochMilliseconds;
    const final = Temporal.Instant.fromEpochMilliseconds(endEpochMilliseconds - 1).toZonedDateTimeISO(start.timeZoneId);
    if (cursor.offsetNanoseconds !== final.offsetNanoseconds) {
      let low = cursor.epochMilliseconds, high = endEpochMilliseconds - 1;
      while (high - low > 1) {
        const middle = Math.floor((low + high) / 2);
        const projected = Temporal.Instant.fromEpochMilliseconds(middle).toZonedDateTimeISO(start.timeZoneId);
        if (projected.offsetNanoseconds === cursor.offsetNanoseconds) low = middle;
        else high = middle;
      }
      segmentEnd = high;
    }
    const last = Temporal.Instant.fromEpochMilliseconds(segmentEnd)
      .subtract({ nanoseconds: 1 }).toZonedDateTimeISO(start.timeZoneId);
    if (!cursor.toPlainDate().equals(last.toPlainDate())
      || Temporal.PlainTime.compare(cursor.toPlainTime(), opening) < 0
      || Temporal.PlainTime.compare(last.toPlainTime(), closing) >= 0) return false;
    if (segmentEnd === endEpochMilliseconds) return true;
    cursor = Temporal.Instant.fromEpochMilliseconds(segmentEnd).toZonedDateTimeISO(start.timeZoneId);
  }
  return true;
}

/** Pure, clock-independent preferred-hours planner. Dates before 2020 are
 * deliberately unsupported; this is not a historical timezone analysis API.
 * Returns {status:'invalid', error} or {status:'success', ...results}.
 */
export function generateMeetingPlan(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return invalid("input", "INVALID_INPUT", "Expected meeting planner inputs.");
  }
  const { citySlugs, referenceCitySlug, referenceDate } = input;
  if (!Array.isArray(citySlugs) || citySlugs.length < 2 || citySlugs.length > 5) {
    return invalid("citySlugs", "INVALID_CITY_COUNT", "Choose between 2 and 5 cities.");
  }
  const seen = new Set();
  for (let index = 0; index < citySlugs.length; index++) {
    if (!Object.hasOwn(citySlugs, index) || typeof citySlugs[index] !== "string"
      || !citySlugs[index] || !cityBySlug.has(citySlugs[index])) {
      return invalid("citySlugs", "INVALID_CITY", "Choose a dense list of supported catalog city slugs.");
    }
    if (seen.has(citySlugs[index])) return invalid("citySlugs", "DUPLICATE_CITY", "Choose distinct cities.");
    seen.add(citySlugs[index]);
  }
  if (!citySlugs.includes(referenceCitySlug)) {
    return invalid("referenceCitySlug", "INVALID_REFERENCE", "The reference city must be a selected city.");
  }
  if (typeof referenceDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(referenceDate)) {
    return invalid("referenceDate", "INVALID_DATE", "Enter a valid date in YYYY-MM-DD format.");
  }
  let date;
  try {
    date = Temporal.PlainDate.from(referenceDate, { overflow: "reject" });
  } catch {
    return invalid("referenceDate", "INVALID_DATE", "Enter a valid calendar date.");
  }
  if (referenceDate < MIN_PLANNER_DATE || referenceDate > MAX_PLANNER_DATE) {
    return invalid("referenceDate", "UNSUPPORTED_DATE", `Choose a planning date from ${MIN_PLANNER_DATE} through ${MAX_PLANNER_DATE}.`);
  }
  const windows = new Map();
  if ("cityPreferences" in input) {
    if ("preferredWindow" in input) return invalid("cityPreferences", "AMBIGUOUS_PREFERENCES", "Supply either city preferences or a shared window, not both.");
    const preferences = input.cityPreferences;
    if (!Object.hasOwn(input, "cityPreferences") || !preferences || typeof preferences !== "object" || Array.isArray(preferences)
      || Reflect.ownKeys(preferences).length !== citySlugs.length
      || Reflect.ownKeys(preferences).some((slug) => !seen.has(slug))
      || citySlugs.some((slug) => !Object.hasOwn(preferences, slug))) {
      return invalid("cityPreferences", "INVALID_PREFERENCES", "Provide exactly one preferred window for each selected city.");
    }
    for (const slug of citySlugs) {
      const parsed = parseWindow(preferences[slug], `cityPreferences.${slug}`);
      if (parsed.status === "invalid") return parsed;
      windows.set(slug, parsed);
    }
  } else {
    // Explicit Phase 3A compatibility path. The editor and v2 URLs use cityPreferences.
    const parsed = parseWindow(input.preferredWindow === undefined ? { start: "09:00", end: "17:00" } : input.preferredWindow, "preferredWindow");
    if (parsed.status === "invalid") return parsed;
    for (const slug of citySlugs) windows.set(slug, parsed);
  }

  try {
    const referenceTimeZone = cityBySlug.get(referenceCitySlug).timezone;
    const start = firstValidInstantForLocalDate(date, referenceTimeZone);
    const nextStart = firstValidInstantForLocalDate(date.add({ days: 1 }), referenceTimeZone);
    if (!start.toPlainDate().equals(date) || nextStart.epochMilliseconds <= start.epochMilliseconds) {
      return invalid("referenceDate", "UNSUPPORTED_DATE", "This date cannot produce a valid reference-city day.");
    }
    const candidates = [];
    for (let epoch = start.epochMilliseconds; epoch < nextStart.epochMilliseconds; epoch += MEETING_DURATION_MILLISECONDS) {
      const instant = Temporal.Instant.fromEpochMilliseconds(epoch);
      if (!instant.toZonedDateTimeISO(referenceTimeZone).toPlainDate().equals(date)) {
        return invalid("referenceDate", "UNSUPPORTED_DATE", "This date cannot produce a continuous reference-city day.");
      }
      const endEpochMilliseconds = epoch + MEETING_DURATION_MILLISECONDS;
      const locations = citySlugs.map((citySlug) => {
        const zone = cityBySlug.get(citySlug).timezone;
        const { opening, closing } = windows.get(citySlug);
        const localStart = instant.toZonedDateTimeISO(zone);
        const localEnd = Temporal.Instant.fromEpochMilliseconds(endEpochMilliseconds).toZonedDateTimeISO(zone);
        return {
          citySlug,
          start: project(localStart),
          end: project(localEnd),
          dayDifference: date.until(localStart.toPlainDate()).days,
          isWithinPreferredHours: withinWindow(localStart, endEpochMilliseconds, opening, closing),
        };
      });
      const withinPreferredCount = locations.filter((location) => location.isWithinPreferredHours).length;
      candidates.push({ startEpochMilliseconds: epoch, endEpochMilliseconds, locations,
        withinPreferredCount, allWithinPreferredHours: withinPreferredCount === citySlugs.length });
    }
    return {
      status: "success",
      referenceDay: { startEpochMilliseconds: start.epochMilliseconds, endEpochMilliseconds: nextStart.epochMilliseconds },
      candidates,
      preferredCandidates: candidates.filter((candidate) => candidate.allWithinPreferredHours),
      alternatives: candidates.filter((candidate) => !candidate.allWithinPreferredHours)
        .sort((a, b) => b.withinPreferredCount - a.withinPreferredCount || a.startEpochMilliseconds - b.startEpochMilliseconds),
    };
  } catch (error) {
    if (!(error instanceof RangeError)) throw error;
    return invalid("referenceDate", "UNSUPPORTED_DATE", "This date or timezone rule is not supported by this runtime.");
  }
}
