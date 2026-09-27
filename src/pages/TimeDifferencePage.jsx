import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { cities } from "../data/cities";
import StructuredData from "../components/StructuredData";
import {
  convertLocalDateTime,
  formatDateInZone,
  formatTimeInZone,
  getTimeDifferenceMinutes,
  splitTimeDifference,
} from "../utils/dateTime";
import useNow from "../hooks/useNow";
import { getSiteUrl, siteConfig } from "../config/site";
import { trackComparisonLinkCopied, trackTimeComparisonCompleted } from "../utils/analytics";
import {
  buildCanonicalComparisonPath,
  buildInteractiveComparisonSearch,
  classifyTimeComparisonSearch,
  getTimeComparisonClassificationSearch,
  parseTimeComparisonSearch,
} from "../utils/timeComparisonUrl";

const fullDateOptions = {
  weekday: "long",
  year: "numeric",
  month: "long",
  day: "numeric",
};

const localTimeOptions = {
  hour: "numeric",
  minute: "2-digit",
  second: undefined,
  hour12: true,
};

function formatPlainDate(date) {
  return formatDateInZone("UTC", new Date(`${date}T12:00:00Z`), fullDateOptions);
}

function describeDayDifference(dayDifference) {
  if (dayDifference === -1) return "Previous day";
  if (dayDifference === 0) return "Same day";
  if (dayDifference === 1) return "Next day";
  return dayDifference < 0
    ? `${Math.abs(dayDifference)} days earlier`
    : `${dayDifference} days later`;
}

function occurrenceContext(sourceTimeZone, date, time) {
  return `${sourceTimeZone}\u0000${date}\u0000${time}`;
}

function contextBoundOccurrence(value, sourceTimeZone, date, time) {
  return value === "earlier" || value === "later"
    ? { value, context: occurrenceContext(sourceTimeZone, date, time) }
    : null;
}

export default function TimeDifferencePage() {
  const location = useLocation();
  const navigate = useNavigate();
  const classificationSearch = getTimeComparisonClassificationSearch(location.search);
  const classifiedConversion = useMemo(
    () => classifyTimeComparisonSearch(classificationSearch, convertLocalDateTime),
    [classificationSearch],
  );
  const resolvedState = useMemo(
    () => parseTimeComparisonSearch(location.search, () => classifiedConversion),
    [classifiedConversion, location.search],
  );
  const { fromCity, toCity, mode, date, time } = resolvedState;
  const activeComparison = useRef(null);
  const specificDraft = useRef({ date: "", time: "", occurrenceSelection: null });
  const now = useNow();

  const canonicalPath = buildCanonicalComparisonPath(resolvedState);
  const comparisonUrl = canonicalPath ? getSiteUrl(canonicalPath) : null;
  const copyIdentity = comparisonUrl ?? `unshareable:${location.search}`;
  const [copyFeedback, setCopyFeedback] = useState({ url: copyIdentity, message: "" });
  const copyPending = useRef(false);
  const copyScope = useRef(null);
  const copyResetTimer = useRef(null);

  useLayoutEffect(() => {
    if (mode === "specific") {
      specificDraft.current = {
        date,
        time,
        occurrenceSelection: contextBoundOccurrence(
          resolvedState.occurrence,
          fromCity.timezone,
          date,
          time,
        ),
      };
    }
  }, [date, fromCity.timezone, mode, resolvedState.occurrence, time]);

  // Reset with the complete rendered copy target, including history returns.
  if (copyFeedback.url !== copyIdentity) {
    setCopyFeedback({ url: copyIdentity, message: "" });
  }

  useLayoutEffect(() => {
    const scope = { active: true };
    copyScope.current = scope;
    return () => {
      scope.active = false;
      window.clearTimeout(copyResetTimer.current);
    };
  }, [copyIdentity]);

  async function handleCopyComparisonLink() {
    const scope = copyScope.current;
    if (!comparisonUrl || copyPending.current || !scope?.active) return;

    copyPending.current = true;
    window.clearTimeout(copyResetTimer.current);
    setCopyFeedback({ url: copyIdentity, message: "" });
    let message = "Copy failed";

    try {
      if (typeof navigator.clipboard?.writeText === "function") {
        await navigator.clipboard.writeText(comparisonUrl);
        void trackComparisonLinkCopied({
          fromCitySlug: fromCity.slug,
          toCitySlug: toCity.slug,
        });
        message = "Link copied";
      }
    } catch {
      // Clipboard availability and permission failures use the same brief feedback.
    } finally {
      copyPending.current = false;
    }

    if (!scope.active) return;

    setCopyFeedback({ url: copyIdentity, message });
    copyResetTimer.current = window.setTimeout(() => {
      if (scope.active) setCopyFeedback({ url: copyIdentity, message: "" });
      copyResetTimer.current = null;
    }, 2000);
  }

  function getActiveComparison() {
    // A new router location invalidates pending state from the previous visit.
    return activeComparison.current?.location === location
      ? activeComparison.current.state
      : resolvedState;
  }

  function updateComparison(nextState, { replace }) {
    const search = buildInteractiveComparisonSearch(location.search, nextState);
    activeComparison.current = { location, state: nextState };
    navigate(
      { pathname: location.pathname, search, hash: location.hash },
      { replace, state: location.state },
    );
  }

  function handleModeChange(nextMode) {
    const current = getActiveComparison();
    if (current.mode === nextMode) return;

    if (nextMode === "current") {
      if (current.mode === "specific") {
        specificDraft.current = {
          date: current.date,
          time: current.time,
          occurrenceSelection: contextBoundOccurrence(
            current.occurrence,
            current.fromCity.timezone,
            current.date,
            current.time,
          ),
        };
      }
      updateComparison({ ...current, mode: "current", date: "", time: "", occurrence: null }, { replace: false });
      return;
    }

    const draft = specificDraft.current;
    const restoredOccurrence = draft.occurrenceSelection?.context === occurrenceContext(
      current.fromCity.timezone,
      draft.date,
      draft.time,
    )
      ? draft.occurrenceSelection.value
      : null;
    updateComparison({
      ...current,
      mode: "specific",
      date: draft.date,
      time: draft.time,
      occurrence: restoredOccurrence,
      shareable: false,
    }, { replace: false });
  }

  function handleCitySelection(field, slug) {
    const city = cities.find((candidate) => candidate.slug === slug);
    const current = getActiveComparison();
    if (!city || (current[field].slug === city.slug && (
      current.mode === "current" || current.cityParametersValid
    ))) return;

    const nextState = {
      ...current,
      [field]: city,
      [`${field}ParameterValid`]: true,
      occurrence: field === "fromCity" ? null : current.occurrence,
    };
    nextState.cityParametersValid = nextState.fromCityParameterValid !== false
      && nextState.toCityParameterValid !== false;
    if (nextState.mode === "specific") {
      specificDraft.current = {
        date: nextState.date,
        time: nextState.time,
        occurrenceSelection: contextBoundOccurrence(
          nextState.occurrence,
          nextState.fromCity.timezone,
          nextState.date,
          nextState.time,
        ),
      };
    } else if (field === "fromCity") {
      specificDraft.current.occurrenceSelection = null;
    }
    try {
      const result = getTimeDifferenceMinutes(
        nextState.fromCity.timezone,
        nextState.toCity.timezone,
        now,
      );
      if (!Number.isFinite(result)) return;
    } catch {
      return;
    }

    updateComparison(nextState, { replace: true });

    if (nextState.cityParametersValid
      && current[field].slug !== city.slug
      && nextState.fromCity.slug !== nextState.toCity.slug) {
      void trackTimeComparisonCompleted({
        fromCitySlug: nextState.fromCity.slug,
        toCitySlug: nextState.toCity.slug,
      });
    }
  }

  function handleSwapCities() {
    const current = getActiveComparison();
    const nextState = {
      ...current,
      fromCity: current.toCity,
      toCity: current.fromCity,
      fromCityParameterValid: current.toCityParameterValid,
      toCityParameterValid: current.fromCityParameterValid,
      occurrence: null,
    };
    if (nextState.mode === "specific") {
      specificDraft.current = { date: nextState.date, time: nextState.time, occurrenceSelection: null };
    } else {
      specificDraft.current.occurrenceSelection = null;
    }
    updateComparison(nextState, { replace: true });
  }

  function handleSpecificFieldChange(field, value) {
    const current = getActiveComparison();
    const nextState = {
      ...current,
      mode: "specific",
      [field]: value,
      occurrence: null,
    };
    specificDraft.current = { date: nextState.date, time: nextState.time, occurrenceSelection: null };
    updateComparison(nextState, { replace: true });
  }

  function handleOccurrenceChange(occurrence) {
    const current = getActiveComparison();
    specificDraft.current = {
      date: current.date,
      time: current.time,
      occurrenceSelection: contextBoundOccurrence(
        occurrence,
        current.fromCity.timezone,
        current.date,
        current.time,
      ),
    };
    updateComparison({ ...current, occurrence }, { replace: true });
  }

  const calculatorStructuredData = {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: `${siteConfig.publicSiteName} Time Difference Calculator`,
    url: getSiteUrl("/time-difference"),
    description: "Compare the current time difference between cities around the world.",
    applicationCategory: "UtilitiesApplication",
    operatingSystem: "Web",
  };

  const differenceMinutes = getTimeDifferenceMinutes(fromCity.timezone, toCity.timezone, now);
  const { hours, minutes } = splitTimeDifference(differenceMinutes);
  const direction = differenceMinutes > 0
    ? `${toCity.name} is ahead of ${fromCity.name}`
    : differenceMinutes < 0
    ? `${toCity.name} is behind ${fromCity.name}`
    : `${toCity.name} and ${fromCity.name} currently have the same UTC offset`;
  const fromCityTime = formatTimeInZone(fromCity.timezone, now, localTimeOptions);
  const toCityTime = formatTimeInZone(toCity.timezone, now, localTimeOptions);

  const specificConversion = resolvedState.conversion;

  const ambiguousConversion = specificConversion?.status === "ambiguous"
    ? specificConversion
    : null;
  const successfulConversion = resolvedState.selectedConversion;
  const selectedInstant = successfulConversion
    ? new Date(successfulConversion.epochMilliseconds)
    : null;
  const specificDifference = selectedInstant
    ? getTimeDifferenceMinutes(fromCity.timezone, toCity.timezone, selectedInstant)
    : null;
  const specificDifferenceParts = specificDifference === null
    ? null
    : splitTimeDifference(specificDifference);
  const specificDirection = specificDifference === null
    ? ""
    : specificDifference > 0
    ? `${toCity.name} is ahead of ${fromCity.name} at this time`
    : specificDifference < 0
    ? `${toCity.name} is behind ${fromCity.name} at this time`
    : `${toCity.name} and ${fromCity.name} have the same UTC offset at this time`;
  const invalidField = specificConversion?.status === "invalid"
    ? specificConversion.error.field
    : null;
  const hasNonexistentTime = specificConversion?.status === "nonexistent";
  const hasSharedStateError = mode === "specific" && resolvedState.status === "invalid";
  const fromCityIdentityValid = mode !== "specific" || resolvedState.fromCityParameterValid !== false;
  const toCityIdentityValid = mode !== "specific" || resolvedState.toCityParameterValid !== false;
  const sourceCityLabel = fromCityIdentityValid ? fromCity.name : "the source city";
  const destinationCityLabel = toCityIdentityValid ? toCity.name : "the destination city";
  const inputErrorId = "specific-time-error";

  return (
    <div
      className="time-difference-page"
      style={{
        minHeight: "100vh",
        background: "radial-gradient(circle at top, #10213d 0%, #071120 45%, #050914 100%)",
        color: "white",
        padding: "clamp(56px, 10vw, 80px) clamp(16px, 5vw, 22px)",
        fontFamily: "Inter, Arial, sans-serif",
      }}
    >
      <StructuredData data={calculatorStructuredData} />
      <div className="time-difference-content" style={{ maxWidth: "900px", margin: "0 auto", textAlign: "center" }}>
        <p style={{ color: "#67e8f9", letterSpacing: "0.2em", fontWeight: 700 }}>
          TIME DIFFERENCE CALCULATOR
        </p>
        <h1 style={{ fontSize: "clamp(2.2rem, 6vw, 4.5rem)", margin: "18px 0" }}>
          Compare Time Between Cities
        </h1>
        <p style={{ color: "#b8c1d1", fontSize: "1.15rem", marginBottom: "32px" }}>
          Quickly calculate the time difference between two cities anywhere in the world.
        </p>

        <div className="time-difference-mode-toggle" role="group" aria-label="Comparison time">
          <button
            type="button"
            className={mode === "current" ? "is-active" : ""}
            aria-pressed={mode === "current"}
            onClick={() => handleModeChange("current")}
          >
            Current time
          </button>
          <button
            type="button"
            className={mode === "specific" ? "is-active" : ""}
            aria-pressed={mode === "specific"}
            aria-controls="specific-date-time-controls"
            onClick={() => handleModeChange("specific")}
          >
            Specific date &amp; time
          </button>
        </div>

        <div
          className="time-difference-city-grid"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(min(240px, 100%), 1fr))",
            gap: "22px",
            marginBottom: "20px",
          }}
        >
          <div>
            <label htmlFor="time-difference-from-city" style={{ display: "block", marginBottom: "10px", color: "#c5cad5" }}>
              From city
            </label>
            <select
              id="time-difference-from-city"
              value={fromCityIdentityValid ? fromCity.slug : ""}
              onChange={(event) => handleCitySelection("fromCity", event.target.value)}
              style={{
                width: "100%",
                padding: "16px",
                borderRadius: "14px",
                background: "#0f1d33",
                color: "white",
                border: "1px solid rgba(255,255,255,0.15)",
                minWidth: 0,
              }}
            >
              {!fromCityIdentityValid && <option value="">Choose a valid source city</option>}
              {cities.map((city) => (
                <option key={city.slug} value={city.slug}>
                  {city.name}, {city.country}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="time-difference-to-city" style={{ display: "block", marginBottom: "10px", color: "#c5cad5" }}>
              To city
            </label>
            <select
              id="time-difference-to-city"
              value={toCityIdentityValid ? toCity.slug : ""}
              onChange={(event) => handleCitySelection("toCity", event.target.value)}
              style={{
                width: "100%",
                padding: "16px",
                borderRadius: "14px",
                background: "#0f1d33",
                color: "white",
                border: "1px solid rgba(255,255,255,0.15)",
                minWidth: 0,
              }}
            >
              {!toCityIdentityValid && <option value="">Choose a valid destination city</option>}
              {cities.map((city) => (
                <option key={city.slug} value={city.slug}>
                  {city.name}, {city.country}
                </option>
              ))}
            </select>
          </div>
        </div>

        <button
          type="button"
          className="time-difference-swap-button"
          onClick={handleSwapCities}
          style={{
            minHeight: "44px",
            padding: "12px 24px",
            borderRadius: "12px",
            border: "1px solid rgba(103,232,249,0.3)",
            background: "rgba(103,232,249,0.08)",
            color: "#67e8f9",
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          ⇄ Swap cities
        </button>

        {mode === "specific" && (
          <section
            id="specific-date-time-controls"
            className="specific-date-time-panel"
            aria-labelledby="specific-date-time-heading"
          >
            <h2 id="specific-date-time-heading">Date and time in {sourceCityLabel}</h2>
            <p>Enter the local calendar date and clock time in {sourceCityLabel}.</p>
            <div className="specific-date-time-fields">
              <div>
                <label htmlFor="specific-date">Date</label>
                <input
                  id="specific-date"
                  type="date"
                  value={date}
                  aria-invalid={invalidField === "date" || undefined}
                  aria-describedby={invalidField === "date" ? inputErrorId : undefined}
                  onChange={(event) => handleSpecificFieldChange("date", event.target.value)}
                />
              </div>
              <div>
                <label htmlFor="specific-time">Time</label>
                <input
                  id="specific-time"
                  type="time"
                  value={time}
                  aria-invalid={(invalidField === "time" || hasNonexistentTime) || undefined}
                  aria-describedby={(invalidField === "time" || hasNonexistentTime) ? inputErrorId : undefined}
                  onChange={(event) => handleSpecificFieldChange("time", event.target.value)}
                />
              </div>
            </div>

            {hasNonexistentTime && (
              <p id={inputErrorId} className="specific-date-time-error" role="alert">
                This time doesn&apos;t occur in {fromCity.name} on{" "}
                {formatPlainDate(specificConversion.source.date)} because the clocks move
                forward. Choose a different local time.
              </p>
            )}
            {specificConversion?.status === "invalid" && (
              <p id={inputErrorId} className="specific-date-time-error" role="alert">
                {invalidField === "date"
                  ? "Choose a valid calendar date."
                  : invalidField === "time"
                  ? "Choose a valid local time."
                  : "This conversion could not be completed. Check the selected values."}
              </p>
            )}
            {hasSharedStateError && specificConversion?.status !== "invalid" && (
              <p id={inputErrorId} className="specific-date-time-error" role="alert">
                {resolvedState.issue === "INCOMPLETE"
                  ? "This shared comparison is incomplete. Choose both a date and local time."
                  : resolvedState.issue === "INAPPLICABLE_OCCURRENCE"
                  ? "This shared link specifies an occurrence for a local time that happens only once."
                  : resolvedState.issue === "INVALID_OCCURRENCE"
                  ? "This shared link has an invalid occurrence. Choose the first or second occurrence if prompted."
                  : resolvedState.issue === "INVALID_CITY"
                  ? "This shared link contains an unknown or missing city. Choose both cities to continue."
                  : "This shared comparison link is invalid. Check the cities, date, and time to continue."}
              </p>
            )}

            {ambiguousConversion?.status === "ambiguous" && (
              <fieldset className="specific-occurrence-options">
                <legend>
                  This local time happens twice in {fromCity.name} because the clocks
                  change. Which one do you mean?
                </legend>
                {ambiguousConversion.candidates.map((candidate, index) => {
                  const candidateInstant = new Date(candidate.epochMilliseconds);
                  const value = candidate.interpretation;
                  const choiceId = `specific-occurrence-${value}`;
                  return (
                    <div key={value} className="specific-occurrence-choice">
                      <input
                        id={choiceId}
                        type="radio"
                        name="specific-time-occurrence"
                        value={value}
                        checked={resolvedState.occurrence === value}
                        onChange={() => handleOccurrenceChange(value)}
                      />
                      <label htmlFor={choiceId}>
                        <strong>{index === 0 ? "First occurrence" : "Second occurrence"}</strong>
                        <span>
                          {formatDateInZone(toCity.timezone, candidateInstant, fullDateOptions)} at{" "}
                          {formatTimeInZone(toCity.timezone, candidateInstant, localTimeOptions)} in{" "}
                          {toCity.name}
                        </span>
                      </label>
                    </div>
                  );
                })}
              </fieldset>
            )}
          </section>
        )}

        <div
          className="time-difference-result-card"
          style={{
            marginTop: "28px",
            padding: "clamp(28px, 7vw, 42px)",
            borderRadius: "28px",
            background: "rgba(255,255,255,0.06)",
            border: "1px solid rgba(103,232,249,0.25)",
            boxShadow: "0 28px 80px rgba(103,232,249,0.12)",
          }}
        >
          {mode === "current" ? (
            <>
              <h2 style={{ fontSize: "clamp(1.45rem, 7vw, 2rem)", marginBottom: "16px", overflowWrap: "anywhere" }}>
                {direction}
              </h2>
              <p style={{ fontSize: "clamp(2.25rem, 12vw, 3rem)", fontWeight: 800, color: "#67e8f9" }}>
                {hours}h {minutes}m
              </p>
              <p style={{ color: "#9ca7ba" }}>{fromCity.name} → {toCity.name}</p>
              <div style={{ marginTop: "24px", color: "#cfd8e3", fontSize: "1.05rem", lineHeight: "1.9" }}>
                <div><strong>{fromCity.name}:</strong> {fromCityTime}</div>
                <div><strong>{toCity.name}:</strong> {toCityTime}</div>
              </div>
            </>
          ) : successfulConversion && selectedInstant ? (
            <div className="specific-conversion-result" aria-live="polite" aria-atomic="true">
              <h2>{specificDirection}</h2>
              <p className="time-difference-value" style={{ fontSize: "clamp(2.25rem, 12vw, 3rem)", fontWeight: 800, color: "#67e8f9" }}>
                {specificDifferenceParts.hours}h {specificDifferenceParts.minutes}m
              </p>
              <div className="specific-result-grid">
                <article>
                  <p className="specific-result-label">From</p>
                  <h3>{fromCity.name}</h3>
                  <p>{formatDateInZone(fromCity.timezone, selectedInstant, fullDateOptions)}</p>
                  <strong>{formatTimeInZone(fromCity.timezone, selectedInstant, localTimeOptions)}</strong>
                </article>
                <span className="specific-result-arrow" aria-hidden="true">→</span>
                <article>
                  <p className="specific-result-label">To</p>
                  <h3>{toCity.name}</h3>
                  <p>{formatDateInZone(toCity.timezone, selectedInstant, fullDateOptions)}</p>
                  <strong>{formatTimeInZone(toCity.timezone, selectedInstant, localTimeOptions)}</strong>
                  <span className="specific-day-relation">
                    {describeDayDifference(successfulConversion.dayDifference)}
                  </span>
                </article>
              </div>
            </div>
          ) : (
            <div className="specific-result-placeholder">
              <h2>Convert a specific date and time</h2>
              <p>
                {!date || !time
                  ? `Choose a date and local time in ${sourceCityLabel} to see the time in ${destinationCityLabel}.`
                  : specificConversion?.status === "ambiguous"
                  ? "Choose the first or second occurrence above to complete the conversion."
                  : hasSharedStateError
                  ? "Correct the shared comparison details to complete the conversion."
                  : "Change the entered date or time to complete the conversion."}
              </p>
            </div>
          )}

          <div
            className="time-difference-actions"
            style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", alignItems: "center", gap: "12px", marginTop: "28px" }}
          >
            {(mode === "current" || resolvedState.cityParametersValid) && <Link
              to={`/compare/${fromCity.slug}/${toCity.slug}`}
              style={{
                display: "inline-block",
                minHeight: "44px",
                padding: "13px 22px",
                borderRadius: "14px",
                background: "#67e8f9",
                color: "#06101f",
                fontWeight: 900,
                textDecoration: "none",
                whiteSpace: "normal",
              }}
            >
              {mode === "specific" ? "View Current Comparison Page" : "View Full Comparison Page"}
            </Link>}
            <button
              type="button"
              className="time-difference-copy-button"
              onClick={handleCopyComparisonLink}
              disabled={mode === "specific" ? !comparisonUrl : undefined}
              style={{
                padding: "13px 22px",
                minHeight: "44px",
                width: "min(250px, 100%)",
                borderRadius: "14px",
                border: "1px solid rgba(103,232,249,0.3)",
                background: "rgba(103,232,249,0.08)",
                color: "#67e8f9",
                font: "inherit",
                fontWeight: 700,
                cursor: comparisonUrl ? "pointer" : "not-allowed",
                opacity: comparisonUrl ? 1 : 0.55,
              }}
            >
              {copyFeedback.message || "Copy comparison link"}
            </button>
          </div>
          <span className="sr-only" role="status" aria-atomic="true">
            {copyFeedback.message}
          </span>
        </div>
      </div>
    </div>
  );
}
