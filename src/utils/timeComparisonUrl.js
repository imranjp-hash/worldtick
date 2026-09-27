import { cities } from "../data/cities.js";
import { convertLocalDateTime } from "./dateTime.js";

const recognizedParameters = Object.freeze([
  "from",
  "to",
  "mode",
  "date",
  "time",
  "occurrence",
]);
const recognizedParameterSet = new Set(recognizedParameters);
const defaultPair = Object.freeze({ fromCity: cities[0], toCity: cities[1] });

function findCity(slug) {
  return cities.find((city) => city.slug === slug);
}

function valuesFor(params, name) {
  return params.getAll(name);
}

function resolveCurrentPair(params) {
  const from = valuesFor(params, "from");
  const to = valuesFor(params, "to");

  if (from.length !== 1 || to.length !== 1) return defaultPair;

  const fromCity = findCity(from[0]);
  const toCity = findCity(to[0]);
  return fromCity && toCity ? { fromCity, toCity } : defaultPair;
}

function invalidSpecificState({ params, fromCity, toCity, date, time, occurrence, issue }) {
  return {
    mode: "specific",
    status: "invalid",
    issue,
    fromCity: fromCity ?? defaultPair.fromCity,
    toCity: toCity ?? defaultPair.toCity,
    date,
    time,
    occurrence,
    conversion: null,
    selectedConversion: null,
    shareable: false,
    cityParametersValid: Boolean(fromCity && toCity),
    fromCityParameterValid: Boolean(fromCity),
    toCityParameterValid: Boolean(toCity),
    sourceSearch: params.toString(),
  };
}

/**
 * Parse calculator query state. Parameter cardinality belongs here, while all
 * calendar and time-zone classification remains in convertLocalDateTime().
 */
export function parseTimeComparisonSearch(search, classifyLocalDateTime = convertLocalDateTime) {
  const params = new URLSearchParams(search);
  const modeValues = valuesFor(params, "mode");
  const hasSpecificFields = ["date", "time", "occurrence"]
    .some((name) => params.has(name));

  if (modeValues.length === 0 && !hasSpecificFields) {
    return {
      mode: "current",
      status: "current",
      ...resolveCurrentPair(params),
      date: "",
      time: "",
      occurrence: null,
      conversion: null,
      selectedConversion: null,
      shareable: true,
      cityParametersValid: true,
      fromCityParameterValid: true,
      toCityParameterValid: true,
      sourceSearch: params.toString(),
    };
  }

  const fromValues = valuesFor(params, "from");
  const toValues = valuesFor(params, "to");
  const dateValues = valuesFor(params, "date");
  const timeValues = valuesFor(params, "time");
  const occurrenceValues = valuesFor(params, "occurrence");
  const fromCity = fromValues.length === 1 ? findCity(fromValues[0]) : null;
  const toCity = toValues.length === 1 ? findCity(toValues[0]) : null;
  const date = dateValues.length === 1 ? dateValues[0] : "";
  const time = timeValues.length === 1 ? timeValues[0] : "";
  const occurrence = occurrenceValues.length === 1 ? occurrenceValues[0] : null;
  const cardinalities = {
    from: fromValues.length,
    to: toValues.length,
    mode: modeValues.length,
    date: dateValues.length,
    time: timeValues.length,
    occurrence: occurrenceValues.length,
  };

  if (modeValues.length !== 1 || modeValues[0] !== "specific") {
    return invalidSpecificState({
      params, fromCity, toCity, date, time, occurrence,
      issue: "INVALID_MODE",
    });
  }

  if (Object.values(cardinalities).some((count) => count > 1)) {
    return invalidSpecificState({
      params, fromCity, toCity, date, time, occurrence,
      issue: "DUPLICATE_PARAMETER",
    });
  }

  if (!fromCity || !toCity) {
    return invalidSpecificState({
      params, fromCity, toCity, date, time, occurrence,
      issue: "INVALID_CITY",
    });
  }

  if (dateValues.length !== 1 || timeValues.length !== 1) {
    return invalidSpecificState({
      params, fromCity, toCity, date, time, occurrence,
      issue: "INCOMPLETE",
    });
  }

  if (occurrence !== null && occurrence !== "earlier" && occurrence !== "later") {
    return invalidSpecificState({
      params, fromCity, toCity, date, time, occurrence: null,
      issue: "INVALID_OCCURRENCE",
    });
  }

  const conversion = classifyLocalDateTime({
    date,
    time,
    sourceTimeZone: fromCity.timezone,
    destinationTimeZone: toCity.timezone,
    disambiguation: "reject",
  });

  if (conversion.status === "invalid") {
    return {
      ...invalidSpecificState({
        params, fromCity, toCity, date, time, occurrence,
        issue: "INVALID_CONVERSION",
      }),
      conversion,
    };
  }

  if (conversion.status === "nonexistent") {
    return {
      mode: "specific",
      status: "nonexistent",
      issue: null,
      fromCity,
      toCity,
      date,
      time,
      occurrence,
      conversion,
      selectedConversion: null,
      shareable: false,
      cityParametersValid: true,
      fromCityParameterValid: true,
      toCityParameterValid: true,
      sourceSearch: params.toString(),
    };
  }

  if (conversion.status === "success") {
    if (occurrence !== null) {
      return {
        ...invalidSpecificState({
          params, fromCity, toCity, date, time, occurrence,
          issue: "INAPPLICABLE_OCCURRENCE",
        }),
        conversion,
      };
    }

    return {
      mode: "specific",
      status: "success",
      issue: null,
      fromCity,
      toCity,
      date,
      time,
      occurrence: null,
      conversion,
      selectedConversion: conversion,
      shareable: true,
      cityParametersValid: true,
      fromCityParameterValid: true,
      toCityParameterValid: true,
      sourceSearch: params.toString(),
    };
  }

  const selectedConversion = occurrence === null
    ? null
    : conversion.candidates.find((candidate) => candidate.interpretation === occurrence) ?? null;

  return {
    mode: "specific",
    status: selectedConversion ? "success" : "ambiguous",
    issue: null,
    fromCity,
    toCity,
    date,
    time,
    occurrence,
    conversion,
    selectedConversion,
    shareable: Boolean(selectedConversion),
    cityParametersValid: true,
    fromCityParameterValid: true,
    toCityParameterValid: true,
    sourceSearch: params.toString(),
  };
}

export function getTimeComparisonClassificationSearch(search) {
  const params = new URLSearchParams(search);
  const classificationParams = new URLSearchParams();
  for (const name of ["from", "to", "mode", "date", "time"]) {
    for (const value of params.getAll(name)) classificationParams.append(name, value);
  }
  return `?${classificationParams}`;
}

export function classifyTimeComparisonSearch(search, classifyLocalDateTime = convertLocalDateTime) {
  const params = new URLSearchParams(search);
  params.delete("occurrence");
  return parseTimeComparisonSearch(`?${params}`, classifyLocalDateTime).conversion;
}

function appendComparisonParameters(params, state) {
  if (state.mode !== "specific" || state.fromCityParameterValid !== false) {
    params.append("from", state.fromCity.slug);
  }
  if (state.mode !== "specific" || state.toCityParameterValid !== false) {
    params.append("to", state.toCity.slug);
  }

  if (state.mode !== "specific") return;

  params.append("mode", "specific");
  if (state.date) params.append("date", state.date);
  if (state.time) params.append("time", state.time);
  if (state.occurrence) params.append("occurrence", state.occurrence);
}

export function buildInteractiveComparisonSearch(currentSearch, state) {
  const current = new URLSearchParams(currentSearch);

  if (state.mode !== "specific") {
    current.set("from", state.fromCity.slug);
    current.set("to", state.toCity.slug);
    current.delete("mode");
    current.delete("date");
    current.delete("time");
    current.delete("occurrence");
    return `?${current}`;
  }

  const next = new URLSearchParams();
  appendComparisonParameters(next, state);

  for (const [name, value] of current) {
    if (!recognizedParameterSet.has(name)) next.append(name, value);
  }

  return `?${next}`;
}

export function buildCanonicalComparisonPath(state) {
  if (!state.shareable) return null;

  const params = new URLSearchParams();
  appendComparisonParameters(params, state);
  return `/time-difference?${params}`;
}

export { recognizedParameters };
