import { Temporal } from "@js-temporal/polyfill";

const DEFAULT_TIME_OPTIONS = {
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: true,
};

const DEFAULT_DATE_OPTIONS = {
  weekday: "long",
  month: "short",
  day: "numeric",
};

export function formatTimeInZone(timeZone, date = new Date(), options = {}) {
  return new Intl.DateTimeFormat("en-US", {
    ...DEFAULT_TIME_OPTIONS,
    ...options,
    timeZone,
  }).format(date);
}

export function formatDateInZone(timeZone, date = new Date(), options = {}) {
  return new Intl.DateTimeFormat("en-US", {
    ...DEFAULT_DATE_OPTIONS,
    ...options,
    timeZone,
  }).format(date);
}

export function getTimeZoneOffsetMinutes(timeZone, date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    timeZoneName: "shortOffset",
  }).formatToParts(date);
  const offset = parts.find((part) => part.type === "timeZoneName")?.value;

  if (!offset || offset === "GMT") return 0;

  const match = offset.match(/^GMT([+-])(\d{1,2})(?::(\d{2}))?$/);

  if (!match) {
    throw new RangeError(`Unsupported time zone offset: ${offset}`);
  }

  const sign = match[1] === "+" ? 1 : -1;
  return sign * (Number(match[2]) * 60 + Number(match[3] || 0));
}

export function getTimeDifferenceMinutes(fromTimeZone, toTimeZone, date = new Date()) {
  return (
    getTimeZoneOffsetMinutes(toTimeZone, date) -
    getTimeZoneOffsetMinutes(fromTimeZone, date)
  );
}

export function splitTimeDifference(differenceMinutes) {
  const absoluteMinutes = Math.abs(differenceMinutes);

  return {
    hours: Math.floor(absoluteMinutes / 60),
    minutes: absoluteMinutes % 60,
  };
}

function invalidConversion(field, code, message) {
  return { status: "invalid", error: { field, code, message } };
}

function isNamedTimeZone(timeZone) {
  if (typeof timeZone !== "string" || !timeZone || /^[+-]/.test(timeZone)) {
    return false;
  }

  try {
    // A fixed instant validates the identifier without consulting the current clock.
    // The constructor accepts identifiers, not date strings containing zone annotations.
    new Temporal.ZonedDateTime(0n, timeZone);
    return true;
  } catch (error) {
    if (!(error instanceof RangeError)) throw error;
    return false;
  }
}

function serializeZonedDateTime(value) {
  return {
    timeZone: value.timeZoneId,
    date: value.toPlainDate().toString(),
    time: value.toPlainTime().toString({ smallestUnit: "second" }),
    offset: value.offset,
  };
}

function describeConversion(source, destinationTimeZone) {
  const destination = source.withTimeZone(destinationTimeZone);
  // Compare calendar dates, not elapsed milliseconds: a local day need not be 24 hours.
  const dayDifference = source.toPlainDate().until(destination.toPlainDate()).days;
  const dayRelation = dayDifference === 0
    ? "same-day"
    : dayDifference === -1
    ? "previous-day"
    : dayDifference === 1
    ? "next-day"
    : dayDifference < 0
    ? "earlier-date"
    : "later-date";

  return {
    instant: source.toInstant().toString(),
    epochMilliseconds: source.epochMilliseconds,
    source: serializeZonedDateTime(source),
    destination: serializeZonedDateTime(destination),
    dayDifference,
    dayRelation,
  };
}

/**
 * Convert an ISO calendar date (YYYY-MM-DD) and local time (HH:mm) between named
 * IANA zones. Returns JSON-safe success, ambiguous, nonexistent, or invalid data.
 * earlier/later resolves overlaps only; gaps are never shifted. See README.md
 * for the result contract and the runtime time-zone-rule version limitation.
 */
export function convertLocalDateTime(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return invalidConversion("input", "INVALID_INPUT", "Expected a conversion options object.");
  }

  const { date, time, sourceTimeZone, destinationTimeZone, disambiguation = "reject" } = input;

  if (typeof date !== "string" || date.length !== 10 || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return invalidConversion("date", "INVALID_DATE", "Expected a valid ISO calendar date in YYYY-MM-DD format.");
  }

  let plainDate;
  try {
    plainDate = Temporal.PlainDate.from(date, { overflow: "reject" });
  } catch (error) {
    if (!(error instanceof RangeError)) throw error;
    return invalidConversion("date", "INVALID_DATE", "Expected a valid ISO calendar date in YYYY-MM-DD format.");
  }

  if (typeof time !== "string" || time.length !== 5 || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time)) {
    return invalidConversion("time", "INVALID_TIME", "Expected a local time in HH:mm format, from 00:00 through 23:59.");
  }

  for (const [field, value] of Object.entries({ sourceTimeZone, destinationTimeZone })) {
    if (!isNamedTimeZone(value)) {
      return invalidConversion(field, "INVALID_TIME_ZONE", "Expected a supported named IANA time zone, including UTC; numeric offsets are not accepted.");
    }
  }

  if (!["reject", "earlier", "later"].includes(disambiguation)) {
    return invalidConversion("disambiguation", "INVALID_DISAMBIGUATION", "Expected reject, earlier, or later.");
  }

  const localDateTime = plainDate.toPlainDateTime(Temporal.PlainTime.from(time));
  const earlier = localDateTime.toZonedDateTime(sourceTimeZone, { disambiguation: "earlier" });
  const later = localDateTime.toZonedDateTime(sourceTimeZone, { disambiguation: "later" });
  const unresolved = {
    source: {
      timeZone: earlier.timeZoneId,
      date: plainDate.toString(),
      time: localDateTime.toPlainTime().toString({ smallestUnit: "second" }),
    },
    destinationTimeZone,
    disambiguation: { requested: disambiguation, applied: null },
  };

  // Temporal shifts gaps for earlier/later. Round-tripping detects those shifts
  // before any candidate can be returned as the user's requested wall-clock time.
  if (!earlier.toPlainDateTime().equals(localDateTime) || !later.toPlainDateTime().equals(localDateTime)) {
    return { status: "nonexistent", ...unresolved };
  }

  const ambiguous = earlier.epochNanoseconds !== later.epochNanoseconds;
  if (ambiguous && disambiguation === "reject") {
    return {
      status: "ambiguous",
      ...unresolved,
      candidates: [
        { interpretation: "earlier", ...describeConversion(earlier, destinationTimeZone) },
        { interpretation: "later", ...describeConversion(later, destinationTimeZone) },
      ],
    };
  }

  return {
    status: "success",
    ...describeConversion(disambiguation === "later" ? later : earlier, destinationTimeZone),
    disambiguation: { requested: disambiguation, applied: ambiguous ? disambiguation : null },
  };
}
