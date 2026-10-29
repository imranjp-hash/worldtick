import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { getSiteUrl } from "../config/site";
import { buildCanonicalMeetingPlannerPath } from "../utils/meetingPlannerUrl";

// One lock serves both actions. Retained callbacks only read the committed scope.
export default function usePlannerSharing({ citySlugs, referenceCitySlug, referenceDate,
  cityPreferences, planRevision, plan, selectedCandidate, copyPending }) {
  const scope = useMemo(() => ({
    inputs: { citySlugs, referenceCitySlug, referenceDate, cityPreferences },
    planRevision,
    valid: plan?.status === "success",
    selectedStart: selectedCandidate?.startEpochMilliseconds ?? null,
  }), [citySlugs, referenceCitySlug, referenceDate, cityPreferences, planRevision, plan, selectedCandidate]);
  const committed = useRef(null);
  const localPending = useRef(false);
  const pending = copyPending ?? localPending;
  const resetTimer = useRef(null);
  const [feedback, setFeedback] = useState(null);

  useLayoutEffect(() => {
    const current = { scope };
    committed.current = current;
    return () => {
      if (committed.current === current) committed.current = null;
      window.clearTimeout(resetTimer.current);
      resetTimer.current = null;
    };
  }, [scope]);

  async function copy(kind) {
    const current = committed.current;
    if (!current?.scope.valid || pending.current || (kind === "selected" && current.scope.selectedStart === null)) return;
    const path = buildCanonicalMeetingPlannerPath(current.scope.inputs, kind === "selected" ? current.scope.selectedStart : null);
    if (!path) return;
    pending.current = true;
    window.clearTimeout(resetTimer.current);
    setFeedback(null);
    let message = "Copy failed. Please try again.";
    try {
      if (typeof navigator.clipboard?.writeText === "function") {
        await navigator.clipboard.writeText(getSiteUrl(path));
        message = kind === "plan" ? "Plan link copied" : "Selected meeting link copied";
      }
    } catch {
      // Permission, availability and write failures all remain retryable.
    } finally {
      pending.current = false;
    }
    if (committed.current !== current) return;
    setFeedback({ scope: current.scope, kind, message });
    const timer = window.setTimeout(() => {
      if (committed.current === current) setFeedback(null);
      if (resetTimer.current === timer) resetTimer.current = null;
    }, 2000);
    resetTimer.current = timer;
  }

  return {
    copyPlan: () => copy("plan"),
    copySelected: () => copy("selected"),
    planMessage: feedback?.scope === scope && feedback.kind === "plan" ? feedback.message : "",
    selectedMessage: feedback?.scope === scope && feedback.kind === "selected" ? feedback.message : "",
  };
}
