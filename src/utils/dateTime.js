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
