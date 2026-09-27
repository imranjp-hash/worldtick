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

function resolveCityPair(search) {
  const params = new URLSearchParams(search);
  const from = params.getAll("from");
  const to = params.getAll("to");
  const defaultPair = { fromCity: cities[0], toCity: cities[1] };

  if (from.length !== 1 || to.length !== 1) return defaultPair;

  const fromCity = cities.find((city) => city.slug === from[0]);
  const toCity = cities.find((city) => city.slug === to[0]);
  return fromCity && toCity ? { fromCity, toCity } : defaultPair;
}

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

export default function TimeDifferencePage() {
  const location = useLocation();
  const navigate = useNavigate();
  const resolvedPair = resolveCityPair(location.search);
  const { fromCity, toCity } = resolvedPair;
  const activePair = useRef(null);
  const now = useNow();
  const [mode, setMode] = useState("current");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [occurrenceSelection, setOccurrenceSelection] = useState(null);
  const comparisonUrl = getSiteUrl(`/time-difference?${new URLSearchParams({
    from: fromCity.slug,
    to: toCity.slug,
  })}`);
  const [copyFeedback, setCopyFeedback] = useState({ url: comparisonUrl, message: "" });
  const copyPending = useRef(false);
  const copyScope = useRef(null);
  const copyResetTimer = useRef(null);

  // Reset with the rendered pair, including a return to a previously copied pair.
  if (copyFeedback.url !== comparisonUrl) {
    setCopyFeedback({ url: comparisonUrl, message: "" });
  }

  useLayoutEffect(() => {
    const scope = { active: true };
    copyScope.current = scope;
    return () => {
      scope.active = false;
      window.clearTimeout(copyResetTimer.current);
    };
  }, [comparisonUrl]);

  async function handleCopyComparisonLink() {
    const scope = copyScope.current;
    if (copyPending.current || !scope?.active) return;

    copyPending.current = true;
    window.clearTimeout(copyResetTimer.current);
    setCopyFeedback({ url: comparisonUrl, message: "" });
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

    setCopyFeedback({ url: comparisonUrl, message });
    copyResetTimer.current = window.setTimeout(() => {
      if (scope.active) setCopyFeedback({ url: comparisonUrl, message: "" });
      copyResetTimer.current = null;
    }, 2000);
  }

  function getActivePair() {
    // A new router location invalidates any pending pair from the previous visit.
    return activePair.current?.location === location
      ? activePair.current.pair
      : resolvedPair;
  }

  function updatePair(nextPair) {
    const params = new URLSearchParams(location.search);
    params.set("from", nextPair.fromCity.slug);
    params.set("to", nextPair.toCity.slug);
    // Preserve rapid consecutive actions before the router's next render.
    activePair.current = { location, pair: nextPair };
    navigate(
      { pathname: location.pathname, search: `?${params}`, hash: location.hash },
      { replace: true, state: location.state },
    );
  }

  function handleCitySelection(field, slug) {
    const city = cities.find((candidate) => candidate.slug === slug);
    const currentPair = getActivePair();
    if (!city || currentPair[field].slug === city.slug) return;

    const nextPair = { ...currentPair, [field]: city };
    try {
      const result = getTimeDifferenceMinutes(
        nextPair.fromCity.timezone,
        nextPair.toCity.timezone,
        now,
      );
      if (!Number.isFinite(result)) return;
    } catch {
      return;
    }

    updatePair(nextPair);
    if (field === "fromCity") setOccurrenceSelection(null);

    if (nextPair.fromCity.slug !== nextPair.toCity.slug) {
      void trackTimeComparisonCompleted({
        fromCitySlug: nextPair.fromCity.slug,
        toCitySlug: nextPair.toCity.slug,
      });
    }
  }

  function handleSwapCities() {
    const { fromCity: currentFrom, toCity: currentTo } = getActivePair();
    setOccurrenceSelection(null);
    updatePair({ fromCity: currentTo, toCity: currentFrom });
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

  const occurrenceContext = `${fromCity.timezone}\u0000${date}\u0000${time}`;
  const selectedOccurrence = occurrenceSelection?.context === occurrenceContext
    ? occurrenceSelection.value
    : "reject";

  // A router-driven source change must invalidate the stored choice before commit.
  // The derived selection above is already "reject" for this render, so stale state
  // can never resolve an ambiguous instant even once.
  if (occurrenceSelection && occurrenceSelection.context !== occurrenceContext) {
    setOccurrenceSelection(null);
  }

  const specificConversion = useMemo(() => {
    if (mode !== "specific" || !date || !time) return null;
    return convertLocalDateTime({
      date,
      time,
      sourceTimeZone: fromCity.timezone,
      destinationTimeZone: toCity.timezone,
      disambiguation: "reject",
    });
  }, [date, fromCity.timezone, mode, time, toCity.timezone]);

  const ambiguousConversion = specificConversion?.status === "ambiguous"
    ? specificConversion
    : null;
  const successfulConversion = specificConversion?.status === "success"
    ? specificConversion
    : ambiguousConversion && selectedOccurrence !== "reject"
    ? ambiguousConversion.candidates.find(
        (candidate) => candidate.interpretation === selectedOccurrence,
      ) ?? null
    : null;
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
            onClick={() => setMode("current")}
          >
            Current time
          </button>
          <button
            type="button"
            className={mode === "specific" ? "is-active" : ""}
            aria-pressed={mode === "specific"}
            aria-controls="specific-date-time-controls"
            onClick={() => setMode("specific")}
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
              value={fromCity.slug}
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
              value={toCity.slug}
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
            <h2 id="specific-date-time-heading">Date and time in {fromCity.name}</h2>
            <p>Enter the local calendar date and clock time in {fromCity.name}.</p>
            <div className="specific-date-time-fields">
              <div>
                <label htmlFor="specific-date">Date</label>
                <input
                  id="specific-date"
                  type="date"
                  value={date}
                  aria-invalid={invalidField === "date" || undefined}
                  aria-describedby={invalidField === "date" ? inputErrorId : undefined}
                  onChange={(event) => {
                    setDate(event.target.value);
                    setOccurrenceSelection(null);
                  }}
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
                  onChange={(event) => {
                    setTime(event.target.value);
                    setOccurrenceSelection(null);
                  }}
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

            {ambiguousConversion?.status === "ambiguous" && (
              <fieldset className="specific-occurrence-options">
                <legend>
                  This local time happens twice in {fromCity.name} because the clocks
                  change. Which one do you mean?
                </legend>
                {ambiguousConversion.candidates.map((candidate, index) => {
                  const candidateInstant = new Date(candidate.epochMilliseconds);
                  const value = index === 0 ? "earlier" : "later";
                  const choiceId = `specific-occurrence-${value}`;
                  return (
                    <div key={value} className="specific-occurrence-choice">
                      <input
                        id={choiceId}
                        type="radio"
                        name="specific-time-occurrence"
                        value={value}
                        checked={selectedOccurrence === value}
                        onChange={() => setOccurrenceSelection({
                          context: occurrenceContext,
                          value,
                        })}
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
                  ? `Choose a date and local time in ${fromCity.name} to see the time in ${toCity.name}.`
                  : specificConversion?.status === "ambiguous"
                  ? "Choose the first or second occurrence above to complete the conversion."
                  : "Change the entered date or time to complete the conversion."}
              </p>
            </div>
          )}

          <div
            className="time-difference-actions"
            style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", alignItems: "center", gap: "12px", marginTop: "28px" }}
          >
            <Link
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
            </Link>
            <button
              type="button"
              className="time-difference-copy-button"
              onClick={handleCopyComparisonLink}
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
                cursor: "pointer",
              }}
            >
              {copyFeedback.message || (mode === "specific" ? "Copy city-pair link" : "Copy comparison link")}
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
