import { useLayoutEffect, useRef, useState } from "react";
import useNow from "../hooks/useNow";
import {
  buildPlannerCalendarEvent,
  buildPlannerCalendarFilename,
  getCurrentEpochMilliseconds,
  getPlannerCalendarExportEligibility,
} from "../utils/calendarEvent";
import { downloadIcsFile, serializeCalendarEventToIcs } from "../utils/ics";

// Only this small control subscribes to the clock; the planner rows stay untouched.
export default function PlannerCalendarDownloadControl({ selectedCandidate, planRevision }) {
  const now = useNow();
  const snapshot = useRef(null);
  const [feedback, setFeedback] = useState({ selectedCandidate, planRevision, message: "" });
  const eligibility = getPlannerCalendarExportEligibility({ selectedCandidate, nowEpochMilliseconds: now.getTime() });
  const statusId = "meeting-calendar-past-help";
  const sameSelection = feedback.selectedCandidate === selectedCandidate && feedback.planRevision === planRevision;
  // Reset selection-scoped state before committing a new selection. Eligible clock
  // ticks preserve feedback; ineligibility discards it so it cannot resurface later.
  if (!sameSelection || (!eligibility.eligible && feedback.message)) {
    setFeedback({ selectedCandidate, planRevision, message: "" });
  }

  useLayoutEffect(() => {
    const committed = { selectedCandidate, planRevision };
    snapshot.current = committed;
    return () => {
      if (snapshot.current === committed) snapshot.current = null;
    };
  }, [selectedCandidate, planRevision]);

  function downloadCalendar() {
    const current = snapshot.current;
    if (!current) return;
    const generatedAtEpochMilliseconds = getCurrentEpochMilliseconds();
    if (!getPlannerCalendarExportEligibility({
      selectedCandidate: current.selectedCandidate,
      nowEpochMilliseconds: generatedAtEpochMilliseconds,
    }).eligible) return;
    try {
      const event = buildPlannerCalendarEvent(current);
      const ics = serializeCalendarEventToIcs(event, { generatedAtEpochMilliseconds });
      const filename = buildPlannerCalendarFilename(current);
      downloadIcsFile({ ics, filename });
      setFeedback({ ...current, message: "" });
    } catch {
      setFeedback({ ...current, message: "Unable to download the calendar event. Please try again." });
    }
  }

  // Ineligible state takes precedence over attempt feedback. Downloads have no
  // success announcement because initiating a browser save does not prove it saved.
  const statusMessage = !eligibility.eligible
    ? eligibility.reason === "past" ? "This meeting time has already passed." : ""
    : sameSelection ? feedback.message : "";
  return <div className="meeting-calendar-download">
    <button type="button" onClick={downloadCalendar} disabled={!eligibility.eligible}
      aria-describedby={statusMessage ? statusId : undefined}>
      Download calendar event (.ics)
    </button>
    <p id={statusId} className="meeting-help" role="status" aria-live="polite">
      {statusMessage}
    </p>
  </div>;
}
