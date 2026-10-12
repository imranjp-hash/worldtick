import { cities } from "../data/cities.js";
import { formatDateInZone, formatTimeInZone, getTimeZoneDisplay } from "./dateTime.js";
import { formatIcsUtcTimestamp } from "./ics.js";

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

const plannerCityBySlug = new Map(cities.map((city) => [city.slug, city]));
// Keep calendar summaries concise and filenames below 160 ASCII characters.
const MAX_PLANNER_TITLE_LENGTH = 120;
const MAX_PLANNER_FILENAME_STEM_LENGTH = 120;
const plannerDateOptions = { weekday: "short", year: "numeric", month: "short", day: "numeric" };
const plannerTimeOptions = { hour: "numeric", minute: "2-digit", second: "2-digit", hour12: true };

function validatePlannerCandidate(selectedCandidate) {
  const { startEpochMilliseconds, endEpochMilliseconds, locations } = selectedCandidate ?? {};
  for (const epoch of [startEpochMilliseconds, endEpochMilliseconds]) {
    if (!Number.isSafeInteger(epoch)) {
      throw new TypeError("Planner calendar endpoints must be safe integers.");
    }
    if (epoch % 1000 !== 0) {
      throw new RangeError("Planner calendar endpoints must have whole-second precision.");
    }
    // Use the serializer's existing date range and four-digit UTC year contract.
    formatIcsUtcTimestamp(epoch);
  }
  if (endEpochMilliseconds <= startEpochMilliseconds) {
    throw new RangeError("Planner calendar end must be after its start.");
  }
  if (!Array.isArray(locations) || locations.length < 2 || locations.length > 5) {
    throw new TypeError("Planner calendar events require 2–5 locations.");
  }
  const seen = new Set();
  const selectedCities = [];
  for (let index = 0; index < locations.length; index++) {
    const slug = locations[index]?.citySlug;
    if (!Object.hasOwn(locations, index) || typeof slug !== "string" || !plannerCityBySlug.has(slug)) {
      throw new TypeError("Planner calendar locations must be a dense list of catalog cities.");
    }
    if (seen.has(slug)) throw new TypeError("Planner calendar locations must be distinct cities.");
    seen.add(slug);
    selectedCities.push(plannerCityBySlug.get(slug));
  }
  return selectedCities;
}

export function getPlannerCalendarExportEligibility({ selectedCandidate, nowEpochMilliseconds } = {}) {
  if (!selectedCandidate) return { eligible: false, reason: "unresolved" };
  try {
    validatePlannerCandidate(selectedCandidate);
  } catch (error) {
    if (!(error instanceof TypeError || error instanceof RangeError)) throw error;
    return { eligible: false, reason: "invalid-candidate" };
  }
  if (!Number.isFinite(nowEpochMilliseconds)) return { eligible: false, reason: "invalid-now" };
  const { startEpochMilliseconds } = selectedCandidate;
  return startEpochMilliseconds > nowEpochMilliseconds
    ? { eligible: true, reason: null, startEpochMilliseconds }
    : { eligible: false, reason: "past", startEpochMilliseconds };
}

export function buildPlannerCalendarEvent({ selectedCandidate } = {}) {
  const selectedCities = validatePlannerCandidate(selectedCandidate);
  const { startEpochMilliseconds, endEpochMilliseconds } = selectedCandidate;
  const start = new Date(startEpochMilliseconds);
  const end = new Date(endEpochMilliseconds);
  // Presentation order is not identity. Never sanitize/truncate catalog slugs in a UID.
  const citySet = selectedCities.map((city) => city.slug).sort().join(".");
  const uid = `youhora-planner-v1-${startEpochMilliseconds}-${endEpochMilliseconds}-${citySet}@youhora.com`;
  const fullTitle = `${selectedCities.map((city) => city.name).join(" · ")} meeting`;
  const title = fullTitle.length <= MAX_PLANNER_TITLE_LENGTH
    ? fullTitle : `Meeting across ${selectedCities.length} cities`;
  const sections = selectedCities.map((city) => {
    const startDate = formatDateInZone(city.timezone, start, plannerDateOptions);
    const endDate = formatDateInZone(city.timezone, end, plannerDateOptions);
    const startTime = formatTimeInZone(city.timezone, start, plannerTimeOptions);
    const endTime = formatTimeInZone(city.timezone, end, plannerTimeOptions);
    const startZone = getTimeZoneDisplay(city.timezone, start);
    const endZone = getTimeZoneDisplay(city.timezone, end);
    if (startZone.label !== endZone.label || startZone.offsetMinutes !== endZone.offsetMinutes) {
      return `${city.name}:\nStart: ${startDate} at ${startTime} · ${startZone.label}\nEnd: ${endDate} at ${endTime} · ${endZone.label}`;
    }
    return `${city.name}: ${startDate} · ${startTime} → ${endDate === startDate ? "" : `${endDate} · `}${endTime}\n${startZone.label}`;
  });
  return {
    uid,
    title,
    description: [...sections, "Created with YouHora"].join("\n\n"),
    startEpochMilliseconds,
    endEpochMilliseconds,
  };
}

export function buildPlannerCalendarFilename({ selectedCandidate } = {}) {
  const selectedCities = validatePlannerCandidate(selectedCandidate);
  const stem = selectedCities.map((city, index) => safeIdentifierSegment(city.slug, `city-${index + 1}`))
    .join("-").slice(0, MAX_PLANNER_FILENAME_STEM_LENGTH).replace(/-$/g, "") || "cities";
  const timestamp = formatIcsUtcTimestamp(selectedCandidate.startEpochMilliseconds);
  return `youhora-planner-${stem}-${timestamp}.ics`;
}
