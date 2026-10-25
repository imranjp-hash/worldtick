import { generateMeetingPlan } from "./meetingPlanner.js";

export const plannerUrlParameters = Object.freeze([
  "v", "cities", "reference", "date", "hoursStart", "hoursEnd", "start",
]);
const requiredParameters = plannerUrlParameters.slice(0, -1);
const invalidPlan = (issue) => ({ status: "invalid", issue });

/** Decode once. Plan errors and selection errors deliberately have different outcomes. */
export function parseMeetingPlannerSearch(search) {
  const params = new URLSearchParams(search);
  if (!plannerUrlParameters.some((name) => params.has(name))) return { status: "default" };
  if (requiredParameters.some((name) => params.getAll(name).length !== 1 || !params.get(name))) {
    return invalidPlan("INCOMPLETE_OR_DUPLICATE_PARAMETER");
  }
  if (params.get("v") !== "1") return invalidPlan("UNSUPPORTED_VERSION");
  const inputs = {
    citySlugs: params.get("cities").split(","),
    referenceCitySlug: params.get("reference"),
    referenceDate: params.get("date"),
    preferredWindow: { start: params.get("hoursStart"), end: params.get("hoursEnd") },
  };
  // The engine owns calendar/time validation. Enforce exact URL field lengths
  // too, so JavaScript's end anchor cannot admit a trailing line terminator.
  if (inputs.referenceDate.length !== 10 || inputs.preferredWindow.start.length !== 5
    || inputs.preferredWindow.end.length !== 5) return invalidPlan("INVALID_FIELD_SYNTAX");
  const plan = generateMeetingPlan(inputs);
  if (plan.status !== "success") return invalidPlan(plan.error.code);

  const starts = params.getAll("start");
  let selectedStartEpochMilliseconds = null;
  let selectionIssue = null;
  if (starts.length) {
    const requested = starts.length === 1 && /^(?:0|[1-9]\d*)$/.test(starts[0]) ? Number(starts[0]) : NaN;
    if (Number.isSafeInteger(requested) && String(requested) === starts[0]
      && plan.candidates.some((candidate) => candidate.startEpochMilliseconds === requested)) {
      selectedStartEpochMilliseconds = requested;
    } else selectionIssue = "INVALID_SELECTION";
  }
  return { status: "success", inputs, selectedStartEpochMilliseconds, selectionIssue };
}

/** Returns null rather than sharing incomplete inputs or an unvalidated selection. */
export function buildCanonicalMeetingPlannerPath(inputs, selectedStartEpochMilliseconds = null) {
  if (!inputs?.preferredWindow || typeof inputs.preferredWindow.start !== "string"
    || typeof inputs.preferredWindow.end !== "string" || inputs.preferredWindow.start.length !== 5
    || inputs.preferredWindow.end.length !== 5) return null;
  const plan = generateMeetingPlan(inputs);
  if (plan.status !== "success") return null;
  if (selectedStartEpochMilliseconds !== null && (!Number.isSafeInteger(selectedStartEpochMilliseconds)
    || !plan.candidates.some((candidate) => candidate.startEpochMilliseconds === selectedStartEpochMilliseconds))) return null;
  const params = new URLSearchParams();
  params.append("v", "1");
  params.append("cities", inputs.citySlugs.join(","));
  params.append("reference", inputs.referenceCitySlug);
  params.append("date", inputs.referenceDate);
  params.append("hoursStart", inputs.preferredWindow.start);
  params.append("hoursEnd", inputs.preferredWindow.end);
  if (selectedStartEpochMilliseconds !== null) params.append("start", String(selectedStartEpochMilliseconds));
  return `/meeting-planner?${params}`;
}
