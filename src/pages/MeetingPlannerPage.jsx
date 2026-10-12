import { memo, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { cities } from "../data/cities";
import { generateMeetingPlan, MIN_PLANNER_DATE, MAX_PLANNER_DATE } from "../utils/meetingPlanner";
import { formatDateInZone, formatTimeInZone, getTimeZoneDisplay } from "../utils/dateTime";
import PlannerCalendarDownloadControl from "../components/PlannerCalendarDownloadControl";

const dateOptions = { weekday: "short", year: "numeric", month: "short", day: "numeric" };
const timeOptions = { hour: "numeric", minute: "2-digit", second: undefined, hour12: true };
const cityBySlug = new Map(cities.map((city) => [city.slug, city]));

function dayRelation(days) {
  if (days === 0) return "Same day";
  if (days === -1) return "Previous day";
  if (days === 1) return "Next day";
  return `${Math.abs(days)} days ${days < 0 ? "earlier" : "later"}`;
}

function cityInterval(location, candidate) {
  const city = cityBySlug.get(location.citySlug);
  const start = new Date(candidate.startEpochMilliseconds);
  const end = new Date(candidate.endEpochMilliseconds);
  const startDate = formatDateInZone(city.timezone, start, dateOptions);
  const endDate = formatDateInZone(city.timezone, end, dateOptions);
  const startTime = formatTimeInZone(city.timezone, start, timeOptions);
  const endTime = formatTimeInZone(city.timezone, end, timeOptions);
  return { start, end, startDate, endDate, startTime, endTime };
}

function MeetingPlannerPage() {
  const [state, setState] = useState({
    citySlugs: ["toronto", "london"], referenceCitySlug: "toronto", referenceDate: "",
    preferredWindow: { start: "09:00", end: "17:00" }, selectedStartEpochMilliseconds: null,
    planRevision: 0, showAlternatives: false, referenceNotice: "",
  });
  const [addingCity, setAddingCity] = useState("");
  const dateInput = useRef(null);
  const { citySlugs, referenceCitySlug, referenceDate, preferredWindow, selectedStartEpochMilliseconds,
    planRevision, showAlternatives, referenceNotice } = state;
  const referenceCity = cityBySlug.get(referenceCitySlug);
  const plan = useMemo(() => referenceDate ? generateMeetingPlan({
    citySlugs, referenceCitySlug, referenceDate, preferredWindow,
  }) : null, [citySlugs, referenceCitySlug, referenceDate, preferredWindow]);
  const selectedCandidate = plan?.status === "success"
    ? plan.candidates.find((candidate) => candidate.startEpochMilliseconds === selectedStartEpochMilliseconds)
    : null;
  const remainingCities = cities.filter((city) => !citySlugs.includes(city.slug));
  const error = plan?.status === "invalid" ? plan.error : null;
  const mainCandidates = plan?.status === "success" ? plan.preferredCandidates : [];
  const displayedCandidates = mainCandidates.length ? mainCandidates
    : showAlternatives && plan?.status === "success" ? plan.alternatives : [];

  function edit(changes) {
    setState((current) => {
      const next = { ...current, ...(typeof changes === "function" ? changes(current) : changes) };
      if (next.citySlugs === current.citySlugs && next.referenceCitySlug === current.referenceCitySlug
        && next.referenceDate === current.referenceDate && next.preferredWindow.start === current.preferredWindow.start
        && next.preferredWindow.end === current.preferredWindow.end) return current;
      return { ...next, planRevision: current.planRevision + 1, selectedStartEpochMilliseconds: null, showAlternatives: false };
    });
  }

  function addCity() {
    setState((current) => {
      if (!cityBySlug.has(addingCity) || current.citySlugs.includes(addingCity) || current.citySlugs.length >= 5) return current;
      return { ...current, citySlugs: [...current.citySlugs, addingCity], planRevision: current.planRevision + 1,
        selectedStartEpochMilliseconds: null, showAlternatives: false };
    });
    setAddingCity("");
  }

  function removeCity(slug) {
    setState((current) => {
      if (current.citySlugs.length <= 2 || !current.citySlugs.includes(slug)) return current;
      const nextCities = current.citySlugs.filter((citySlug) => citySlug !== slug);
      const nextReference = current.referenceCitySlug === slug ? nextCities[0] : current.referenceCitySlug;
      return { ...current, citySlugs: nextCities,
        referenceCitySlug: nextReference, planRevision: current.planRevision + 1,
        selectedStartEpochMilliseconds: null, showAlternatives: false,
        referenceNotice: current.referenceCitySlug === slug
          ? `${cityBySlug.get(nextReference).name} is now the reference city. The entered date is preserved.`
          : current.referenceNotice };
    });
    // The date field stays enabled, including removal from the five-city limit.
    dateInput.current?.focus();
  }

  function makeReference(slug) {
    setState((current) => {
      if (!current.citySlugs.includes(slug) || current.referenceCitySlug === slug) return current;
      return { ...current, referenceCitySlug: slug, planRevision: current.planRevision + 1,
        selectedStartEpochMilliseconds: null, showAlternatives: false,
        referenceNotice: `${cityBySlug.get(slug).name} is now the reference city. The entered date is preserved.` };
    });
  }

  function selectCandidate(epoch) {
    // Validate against current inputs even if a previously rendered handler is retained.
    setState((current) => {
      if (current.planRevision !== planRevision) return current;
      const currentPlan = generateMeetingPlan(current);
      return currentPlan.status === "success" && currentPlan.candidates.some((candidate) => candidate.startEpochMilliseconds === epoch)
        ? { ...current, selectedStartEpochMilliseconds: epoch } : current;
    });
  }

  return (
    <main className="meeting-planner-page">
      <div className="meeting-planner-content">
        <p className="meeting-planner-eyebrow">MEETING PLANNER</p>
        <h1>Find a time across cities</h1>
        <p>Plan a 30-minute meeting using preferred local hours. These hours do not represent anyone’s calendar availability.</p>
        <fieldset className="meeting-planner-panel">
          <legend>Meeting cities · 2–5 cities</legend>
          <ul className="meeting-city-list">
            {citySlugs.map((slug) => {
              const city = cityBySlug.get(slug);
              return <li key={slug} className="meeting-city-row">
                <span><strong>{city.name}</strong><small>{city.country}</small></span>
                {slug === referenceCitySlug ? <span className="meeting-reference-badge">Reference</span>
                  : <button type="button" onClick={() => makeReference(slug)}>Make {city.name} reference</button>}
                <button type="button" disabled={citySlugs.length <= 2} aria-label={`Remove ${city.name}`} onClick={() => removeCity(slug)}>Remove</button>
              </li>;
            })}
          </ul>
          <div className="meeting-add-city">
            <label htmlFor="meeting-add-city">Add a city</label>
            <select id="meeting-add-city" value={addingCity} disabled={citySlugs.length >= 5}
              onChange={(event) => setAddingCity(event.target.value)}>
              <option value="">Choose a city</option>
              {remainingCities.map((city) => <option key={city.slug} value={city.slug}>{city.name}, {city.country}</option>)}
            </select>
            <button type="button" disabled={!addingCity || citySlugs.length >= 5} onClick={addCity}>Add city</button>
          </div>
          <p className="meeting-help">{citySlugs.length >= 5 ? "Maximum 5 cities. Remove a city to add another." : "Keep at least 2 cities. Different cities can share a timezone."}</p>
          <p role="status" className="meeting-help">{referenceNotice}</p>
        </fieldset>
        <fieldset className="meeting-planner-panel">
          <legend>Date and preferred hours</legend>
          <div className="meeting-controls">
            <div>
              <label htmlFor="meeting-date">Meeting date in {referenceCity.name}</label>
              <input ref={dateInput} id="meeting-date" type="date" min={MIN_PLANNER_DATE} max={MAX_PLANNER_DATE} value={referenceDate}
                aria-invalid={error?.field === "referenceDate" || undefined}
                aria-describedby={`meeting-date-help${error?.field === "referenceDate" ? " meeting-error" : ""}`}
                onChange={(event) => edit({ referenceDate: event.target.value })} />
            </div>
            {["start", "end"].map((field) => <div key={field}>
              <label htmlFor={`meeting-hours-${field}`}>Preferred {field === "start" ? "opening" : "closing"} time</label>
              <input id={`meeting-hours-${field}`} type="time" step="60" value={preferredWindow[field]}
                aria-invalid={error?.field === `preferredWindow.${field}` || undefined}
                aria-describedby={`meeting-hours-help${error?.field === `preferredWindow.${field}` ? " meeting-error" : ""}`}
                onChange={(event) => {
                  const value = event.target.value;
                  edit((current) => ({ preferredWindow: { ...current.preferredWindow, [field]: value } }));
                }} />
            </div>)}
          </div>
          <p id="meeting-date-help" className="meeting-help">Other cities may be on a different date. Planning dates start at January 1, 2020.</p>
          <p id="meeting-hours-help" className="meeting-help">One local window applies to every city, every day. The entire 30-minute meeting must fit. Overnight hours are not supported yet.</p>
        </fieldset>
        {error && <p id="meeting-error" role="alert" className="meeting-error">{error.message}</p>}
        {!referenceDate && <p>Choose a meeting date to see candidate times.</p>}
        <p role="status" aria-live="polite" className="meeting-result-count">
          {plan?.status === "success" ? `${mainCandidates.length} candidate${mainCandidates.length === 1 ? "" : "s"} with all cities within preferred hours.` : ""}
        </p>
        {plan?.status === "success" && <section aria-label="Meeting candidates">
          <h2>{mainCandidates.length ? "All cities within preferred hours" : "No common preferred-hours overlap at the sampled 30-minute start times."}</h2>
          {!mainCandidates.length && <>
            <button type="button" aria-expanded={showAlternatives} aria-controls="meeting-candidate-options" onClick={() => setState((current) => ({ ...current, showAlternatives: !current.showAlternatives }))}>
              {showAlternatives ? "Hide alternatives" : "Show alternatives"}
            </button>
            {showAlternatives && <h3>Most cities within preferred hours</h3>}
          </>}
          <p className="meeting-help">Starts are sampled every 30 elapsed minutes in {referenceCity.name}’s selected day. Duration: 30 minutes.</p>
          <fieldset id="meeting-candidate-options" className="meeting-candidates">
            <legend>Select one meeting time</legend>
            {displayedCandidates.map((candidate) => {
              const reference = candidate.locations.find((location) => location.citySlug === referenceCitySlug);
              const preview = cityInterval(reference, candidate);
              return <label key={candidate.startEpochMilliseconds} className="meeting-candidate">
                <input type="radio" name="meeting-candidate" value={candidate.startEpochMilliseconds}
                  checked={selectedStartEpochMilliseconds === candidate.startEpochMilliseconds}
                  onChange={() => selectCandidate(candidate.startEpochMilliseconds)} />
                <span><strong>{referenceCity.name}: {preview.startTime}–{preview.endTime}</strong>
                  <small>{preview.startDate} · {reference.start.offset}{reference.start.offset !== reference.end.offset ? ` → ${reference.end.offset}` : ""}</small>
                  <small>{candidate.allWithinPreferredHours ? "All cities within preferred hours" : `${candidate.withinPreferredCount} of ${citySlugs.length} cities within preferred hours`}</small>
                  <small className="meeting-candidate-locations">{candidate.locations.map((location, index) => {
                    const row = cityInterval(location, candidate);
                    return <span key={location.citySlug} className="meeting-candidate-location">
                      {index > 0 && <span className="meeting-candidate-location-divider" aria-hidden="true"> · </span>}
                      <span className="meeting-candidate-location-heading"><strong>{cityBySlug.get(location.citySlug).name}</strong> — {row.startTime}–{row.endTime}</span>{" "}
                      <span className="meeting-candidate-location-date">({row.startDate}{location.start.date !== location.end.date ? ` → ${row.endDate}` : ""})</span>
                    </span>;
                  })}</small>
                  {!candidate.allWithinPreferredHours && <small className="meeting-candidate-outside-hours">Outside preferred hours: {candidate.locations.filter((location) => !location.isWithinPreferredHours).map((location) => cityBySlug.get(location.citySlug).name).join(", ")}</small>}
                </span>
              </label>;
            })}
          </fieldset>
        </section>}
        {selectedCandidate && <section className="meeting-planner-panel" aria-labelledby="meeting-selected-title">
          <h2 id="meeting-selected-title">Selected meeting · 30 minutes</h2>
          <div className="meeting-selected-cities">
            {selectedCandidate.locations.map((location) => {
              const city = cityBySlug.get(location.citySlug);
              const row = cityInterval(location, selectedCandidate);
              const startZone = getTimeZoneDisplay(city.timezone, row.start);
              const endZone = getTimeZoneDisplay(city.timezone, row.end);
              return <article key={city.slug}>
                <h3>{city.name}{city.slug === referenceCitySlug ? " · Reference" : ""}</h3>
                <p>{row.startDate} · {dayRelation(location.dayDifference)}</p>
                <p className="meeting-selected-time">{row.startTime}–{row.endTime}</p>
                {location.start.date !== location.end.date && <p>Ends {row.endDate}</p>}
                <p>{startZone.label}{location.start.offset !== location.end.offset ? ` → ${endZone.label}` : ""}</p>
                <p>{location.isWithinPreferredHours ? "Within preferred hours" : "Outside preferred hours"}</p>
              </article>;
            })}
          </div>
          <PlannerCalendarDownloadControl selectedCandidate={selectedCandidate} planRevision={planRevision} />
        </section>}
        <p className="meeting-help"><Link to="/time-difference">Compare a specific time between two cities</Link></p>
      </div>
    </main>
  );
}

// App consumes the shared clock too. Its ticks must not reformat planner rows.
export default memo(MeetingPlannerPage);
