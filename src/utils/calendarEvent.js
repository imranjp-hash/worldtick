export const CALENDAR_EVENT_DURATION_MILLISECONDS = 30 * 60 * 1000;

const MAX_FILENAME_SEGMENT_LENGTH = 48;

export function getCurrentEpochMilliseconds() {
  return Date.now();
}

function safeIdentifierSegment(value, fallback) {
  const normalized = String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, MAX_FILENAME_SEGMENT_LENGTH)
    .replace(/-$/g, "");

  return normalized || fallback;
}

export function getCalendarExportState({ mode, selectedConversion, nowEpochMilliseconds }) {
  if (mode !== "specific") {
    return { eligible: false, reason: "not-specific" };
  }

  const startEpochMilliseconds = selectedConversion?.epochMilliseconds;
  if (!Number.isSafeInteger(startEpochMilliseconds)) {
    return { eligible: false, reason: "unresolved" };
  }

  if (!Number.isFinite(nowEpochMilliseconds)) {
    return { eligible: false, reason: "invalid-now" };
  }

  if (startEpochMilliseconds <= nowEpochMilliseconds) {
    return { eligible: false, reason: "past", startEpochMilliseconds };
  }

  return { eligible: true, reason: null, startEpochMilliseconds };
}

export function createCalendarEvent({
  selectedConversion,
  sourceCity,
  destinationCity,
  sourceDisplay,
  destinationDisplay,
  occurrence,
  comparisonUrl,
}) {
  const startEpochMilliseconds = selectedConversion?.epochMilliseconds;
  if (!Number.isSafeInteger(startEpochMilliseconds)) {
    throw new TypeError("Calendar events require a resolved safe-integer start instant.");
  }

  const endEpochMilliseconds = startEpochMilliseconds + CALENDAR_EVENT_DURATION_MILLISECONDS;
  if (!Number.isSafeInteger(endEpochMilliseconds)) {
    throw new RangeError("Calendar event end instant is outside the supported range.");
  }

  const sourceSlug = safeIdentifierSegment(sourceCity?.slug, "source");
  const destinationSlug = safeIdentifierSegment(destinationCity?.slug, "destination");
  const durationMinutes = CALENDAR_EVENT_DURATION_MILLISECONDS / 60000;
  const uid = `youhora-v1-${startEpochMilliseconds}-${sourceSlug}-${destinationSlug}-${durationMinutes}m@youhora.com`;
  const occurrenceLabel = occurrence === "earlier"
    ? "First occurrence"
    : occurrence === "later"
    ? "Second occurrence"
    : null;
  const sourceOccurrence = occurrenceLabel ? ` (${occurrenceLabel})` : "";
  const description = [
    `${sourceCity.name}: ${sourceDisplay.date} at ${sourceDisplay.time}${sourceOccurrence}`,
    sourceDisplay.timeZoneLabel,
    "",
    `${destinationCity.name}: ${destinationDisplay.date} at ${destinationDisplay.time}`,
    destinationDisplay.timeZoneLabel,
    "",
    `Comparison: ${comparisonUrl}`,
    "Created with YouHora",
  ].join("\n");

  return {
    uid,
    title: `${sourceCity.name} ↔ ${destinationCity.name} meeting`,
    description,
    startEpochMilliseconds,
    endEpochMilliseconds,
  };
}

export function createCalendarFilename({ sourceCity, destinationCity, sourceDate }) {
  const sourceSlug = safeIdentifierSegment(sourceCity?.slug ?? sourceCity?.name, "source");
  const destinationSlug = safeIdentifierSegment(
    destinationCity?.slug ?? destinationCity?.name,
    "destination",
  );
  const date = safeIdentifierSegment(sourceDate, "date");

  return `youhora-${sourceSlug}-${destinationSlug}-${date}.ics`;
}
