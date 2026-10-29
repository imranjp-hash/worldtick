import { generateMeetingPlan } from "./meetingPlanner.js";

export const plannerUrlParameters = Object.freeze([
  "v", "cities", "reference", "date", "hours", "start",
]);
const v1RequiredParameters = ["v", "cities", "reference", "date", "hoursStart", "hoursEnd"];
const knownParameters = [...plannerUrlParameters, "hoursStart", "hoursEnd"];
const invalidPlan = (issue) => ({ status: "invalid", issue });

/** Decode once. Plan errors and selection errors deliberately have different outcomes. */
export function parseMeetingPlannerSearch(search) {
  const params = new URLSearchParams(search);
  if (!knownParameters.some((name) => params.has(name))) return { status: "default" };
  if (params.getAll("v").length !== 1 || !["1", "2"].includes(params.get("v"))) return invalidPlan("UNSUPPORTED_VERSION");
  const version = params.get("v");
  const requiredParameters = version === "1" ? v1RequiredParameters : plannerUrlParameters.slice(0, -1);
  if (requiredParameters.some((name) => params.getAll(name).length !== 1 || !params.get(name))) {
    return invalidPlan("INCOMPLETE_OR_DUPLICATE_PARAMETER");
  }
  const inputs = {
    citySlugs: params.get("cities").split(","),
    referenceCitySlug: params.get("reference"),
    referenceDate: params.get("date"),
  };
  // The engine owns calendar/time validation. Enforce exact URL field lengths
  // too, so JavaScript's end anchor cannot admit a trailing line terminator.
  if (inputs.referenceDate.length !== 10) return invalidPlan("INVALID_FIELD_SYNTAX");
  let plan;
  if (version === "1") {
    // V1 forever means one shared window. Historically unknown extras stay ignored.
    const preferredWindow = { start: params.get("hoursStart"), end: params.get("hoursEnd") };
    if (preferredWindow.start.length !== 5 || preferredWindow.end.length !== 5) return invalidPlan("INVALID_FIELD_SYNTAX");
    plan = generateMeetingPlan({ ...inputs, preferredWindow });
    if (plan.status !== "success") return invalidPlan(plan.error.code);
    inputs.cityPreferences = Object.fromEntries(inputs.citySlugs.map((slug) => [slug, { ...preferredWindow }]));
  } else {
    if (params.has("hoursStart") || params.has("hoursEnd")) return invalidPlan("MIXED_PREFERENCE_SCHEMA");
    const entries = params.get("hours").split(",");
    if (entries.length < 2 || entries.length > 5) return invalidPlan("INVALID_PREFERENCES");
    const preferences = new Map();
    for (const entry of entries) {
      const match = /^([a-z0-9]+(?:-[a-z0-9]+)*):(\d{2}:\d{2})-(\d{2}:\d{2})$/.exec(entry);
      if (!match || match[0] !== entry || preferences.has(match[1])) return invalidPlan("INVALID_PREFERENCES");
      preferences.set(match[1], { start: match[2], end: match[3] });
    }
    inputs.cityPreferences = Object.fromEntries(preferences);
    plan = generateMeetingPlan(inputs);
  }
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
  if (!inputs || !Object.hasOwn(inputs, "cityPreferences")) return null;
  const plan = generateMeetingPlan(inputs);
  if (plan.status !== "success") return null;
  if (selectedStartEpochMilliseconds !== null && (!Number.isSafeInteger(selectedStartEpochMilliseconds)
    || !plan.candidates.some((candidate) => candidate.startEpochMilliseconds === selectedStartEpochMilliseconds))) return null;
  const params = new URLSearchParams();
  params.append("v", "2");
  params.append("cities", inputs.citySlugs.join(","));
  params.append("reference", inputs.referenceCitySlug);
  params.append("date", inputs.referenceDate);
  params.append("hours", inputs.citySlugs.map((slug) => `${slug}:${inputs.cityPreferences[slug].start}-${inputs.cityPreferences[slug].end}`).join(","));
  if (selectedStartEpochMilliseconds !== null) params.append("start", String(selectedStartEpochMilliseconds));
  return `/meeting-planner?${params}`;
}
