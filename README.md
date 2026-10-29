# React + Vite

## Deterministic meeting planner (Phase 3A)

`/meeting-planner` plans fixed 30-elapsed-minute meetings across 2–5 distinct
catalog cities. One explicit reference city owns the selected calendar date.
The legacy engine form accepts a shared preferred local window, defaulting to
09:00–17:00 every day. Phase 3D's editor uses independent city preferences (see
below). Neither form represents calendar availability. Equal endpoints are
invalid and overnight windows are deferred.

`generateMeetingPlan({ citySlugs, referenceCitySlug, referenceDate,
preferredWindow: { start, end } })` in `src/utils/meetingPlanner.js` is pure and
does not read the clock. It returns either `{ status: "invalid", error: { field,
code, message } }` or `{ status: "success", referenceDay, candidates,
preferredCandidates, alternatives }`. Preferred hours can be omitted for the
default. Every candidate preserves exact `startEpochMilliseconds` and
`endEpochMilliseconds`, city-local start/end projections, calendar day difference,
per-city preferred-hours classification and aggregate counts.

Temporal determines the first valid instant of the reference date and the next
calendar date. The engine advances between those boundaries by 1,800,000 elapsed
milliseconds, checking that each start projects back to the requested date. A
local day is not assumed to contain 24 hours. Preferred-hours evaluation splits
each meeting at IANA offset transitions and checks the complete constant-offset
segments, including their exclusive-end limits. Ending exactly at closing is
allowed. Candidate ordering is by epoch; alternatives order by city count
descending then epoch ascending. Sampling can miss an overlap between grid points.

Planning dates are deliberately limited to 2020-01-01 through 9999-12-30, using
strict four-digit ISO dates. The upper bound reserves the following calendar day
so reference-day boundaries and projections into other current catalog cities
stay within four-digit years; it is a planner policy, not a Temporal limitation.
Historical date re-entry and second-offset archaeology
are outside Phase 3A. Invalid or unsupported reference days return an explicit
error. Calculations use the runtime's IANA rules, with the same rule-version
limitation as the conversion engine. Phase 3A originally cleared selection on all
input changes; Phase 3D's preference-only preservation policy is documented below.
Phase 3A did not introduce URLs, individual/overnight windows, external
integrations or planner analytics.

## Selected meeting calendar export (Phase 3B)

After selecting a meeting candidate, download its `.ics` event from the selected
meeting summary. Export is allowed only while the exact start epoch is strictly
in the future; exact-now and past starts are disabled. Only the small download
control subscribes to the live clock, and the click handler checks current time
again before exporting. The planner page is memoized against its clock-subscribing
App parent. Planner calculations and event construction stay clock-independent.

The planner helpers in `src/utils/calendarEvent.js` validate 2–5 distinct catalog
locations and safe, serializable, whole-second start/end epochs. They copy both
endpoints without recomputing duration or parsing local projections. Each city's
local dates, times and endpoint timezone labels are regenerated from those epochs.
The existing provider-neutral event, ICS serializer and browser download helper
are shared with the two-city comparison export, whose contract is unchanged.

Planner UIDs are `youhora-planner-v1-<start>-<end>-<sorted-dot-joined-city-slugs>@youhora.com`.
City order affects presentation, not identity. Reference city/date, preferred hours
and plan revision are excluded. Titles retain display order up to 120 UTF-16 code
units (JavaScript string `.length`), then use `Meeting across N cities`;
descriptions always retain every city.
Filenames retain sanitized display-order slugs (48 characters per segment), cap
the joined city stem at 120 characters, and preserve the UTC start timestamp and
`.ics` extension, for a maximum of 157 ASCII characters. Filename truncation never
affects UID generation. Candidate-defining edits clear selection; Phase 3D
preference edits preserve a still-valid exact selected epoch. Retained handlers
read a committed snapshot and are disabled on unmount. Phase 3B added no sharing URL,
calendar provider, invitation, analytics, recurrence or custom duration is added.

## Shareable meeting plans (Phase 3C)

`Copy plan link` shares a complete planner configuration. `Copy selected meeting
link`, in the selected-meeting summary, additionally shares its exact start
epoch. Both use the production origin and `/meeting-planner`, independently of
the development hostname. Copying and local edits do not change browser history
or synchronize the address bar. Local edits are an unsaved draft: refresh and
Back/Forward initialize the visited URL afresh, including selection.

The v1 canonical order is `v`, `cities`, `reference`, `date`, `hoursStart`,
`hoursEnd`, optional `start`. Phase 3C copied links included `v=1`, 2–5 distinct
catalog slugs in display order, an explicit selected reference city, its ISO
calendar date and both preferred local endpoints, even when equal to defaults.
Distinct cities sharing a timezone remain distinct. `URLSearchParams` encodes
the raw comma-joined slugs and minute times. Extras and fragments are omitted.

```text
https://www.youhora.com/meeting-planner?v=1&cities=toronto%2Clondon%2Ctokyo&reference=toronto&date=2027-03-27&hoursStart=09%3A00&hoursEnd=17%3A00
https://www.youhora.com/meeting-planner?v=1&cities=toronto%2Clondon%2Ctokyo&reference=toronto&date=2027-03-27&hoursStart=09%3A00&hoursEnd=17%3A00&start=1806152400000
```

v1 retains fixed 30-elapsed-minute duration and sampling, one shared same-day
preferred window and the existing 2020-01-01 through 9999-12-30 date policy.
Missing/empty/duplicate/unknown versions or incomplete/invalid plan fields show
an invalid-link error rather than a fallback plan. `Start a new plan` navigates
to `/meeting-planner` and removes the query and fragment. No recognized planner
parameters means the ordinary blank-date default planner.

`start` is an optional canonical unsigned safe-integer epoch in milliseconds,
never a wall time, occurrence label, rank or array index. Duplicate/malformed
starts and nonmembers clear selection while preserving the valid plan and
showing a concise notice. Exact membership is checked against all regenerated
candidates, including alternatives. Restored alternatives are explained in the
selected summary; no-overlap alternatives open on restoration. Toronto's two
2027-11-07 1:00 AM occurrences have distinct starts `1825563600000` (EDT) and
`1825567200000` (EST). v1 does not serialize an end because duration is fixed.

Runtime IANA rules are not pinned. A formerly valid selected epoch may no longer
be a candidate after a rule update: the valid plan still loads, selection clears,
and no nearest candidate is substituted. Even a retained epoch's local labels
and preferred-hours classifications can change with runtime timezone data.

Copy handlers read the latest committed inputs/selection. One outstanding write
is allowed across both actions and editor replacements within the route; old
navigation handlers are inert. Success/failure feedback is polite, expires after
two seconds and cannot reappear after edits, selection changes, history returns
or unmount. Past meetings remain shareable; future-only `.ics` eligibility and
Phase 3B export semantics remain unchanged.

Phase 3C added no planner analytics, provider integrations, individual/overnight
windows, custom duration, shortened links or server-side shared state. Query
states retain the static planner SEO canonical and are absent from the sitemap.
Manual page-view payloads remain query-free. Release QA must separately inspect
consented GA4 network payloads and external enhanced-measurement settings; these
are outside the repository and can capture history URLs independently.

## Individual preferred local hours (Phase 3D)

The editor stores `citySlugs` as the sole membership/display-order authority and
`cityPreferences` as exactly one own `{ start, end }` window per selected slug.
There is no second shared-window editor state. Fresh Toronto/London entries and
each added city independently start at 09:00–17:00. Existing custom windows survive
city additions and reference changes. Removal deletes the preference; re-addition
resets it to defaults. The pending add-city dropdown stores only a slug. Cities
sharing a timezone remain independent.

The canonical engine call is `generateMeetingPlan({ citySlugs, referenceCitySlug,
referenceDate, cityPreferences })`. Legacy omitted/shared `preferredWindow` calls
remain supported through an explicit engine compatibility path; supplying both
forms is invalid. Canonical maps reject missing, extra or inherited entries and
malformed windows without repair or default substitution. Endpoints must be exact
`HH:mm` with `00:00 <= start < end <= 23:59`: no seconds, equality, `24:00`, trimming
or overnight wrapping. Minute endpoints need not align with the candidate grid.

Preferences only classify the existing exact intervals. Day boundaries, candidate
count, start/end epochs and 30-elapsed-minute sampling remain unchanged. Each
city's endpoints are parsed once per engine call, then the existing full-interval,
transition-aware predicate checks its window. Opening is inclusive; a meeting
ending at closing fits, while one starting at closing does not. This checks occupied
instants, including transition interiors, rather than just displayed endpoints.
Preferred candidates remain chronological; alternatives remain count descending,
then start epoch ascending, with no reference weighting or other scoring.

Adding/removing a city or changing reference/date clears selection. A preference-only
edit increments `planRevision` to invalidate old radio callbacks but preserves the
selected exact epoch while it remains a regenerated candidate. The selected summary
updates its count and outside-hours list in place, even if its radio disappears from
the preferred list. Temporarily invalid local preferences suspend results, the selected
summary, sharing and export while remembering the exact meeting. Repairing preferences
restores it only if it remains a current candidate. Candidate-defining changes and lost
candidate membership clear selection permanently; invalid shared plans remain rejected.
Same-value edits are no-ops. Functional updates
merge rapid edits; membership-array identity makes removed/re-added city handlers
inert. No calendar export fields, UID or eligibility semantics change.

New copies always emit v2, including unchanged loaded v1 plans. V1 keeps its shared
meaning and historical ignored-extra behavior forever: hydration validates that
shared window, then expands it into independent per-city entries. Neither loading
nor local editing rewrites browser location, and no v1/v2 editor mode is stored.

V2's canonical order is `v`, `cities`, `reference`, `date`, `hours`, optional `start`.
`hours` contains `slug:HH:mm-HH:mm` entries, comma-separated in city display order,
including defaults. The parser accepts a different entry order and resolves by
slug. Exactly one entry per selected city is required; duplicates, missing/extra
entries, malformed grammar, and mixed v2 `hoursStart`/`hoursEnd` fields invalidate the
plan. Required/encoded-name duplicates also fail. `URLSearchParams` decodes once;
double encoding is not repaired. Unrelated extras are ignored on load and stripped
from copies. Malformed/stale/duplicate `start` only clears selection with a notice;
outside-hours and past members remain shareable. No nearest candidate is substituted.

```text
https://www.youhora.com/meeting-planner?v=2&cities=toronto%2Clondon&reference=toronto&date=2027-03-27&hours=toronto%3A08%3A00-16%3A00%2Clondon%3A09%3A30-17%3A30
https://www.youhora.com/meeting-planner?v=2&cities=toronto%2Clondon&reference=toronto&date=2027-03-27&hours=toronto%3A08%3A00-16%3A00%2Clondon%3A09%3A30-17%3A30&start=1806152400000
```

The 168-city catalog's five longest slugs produce a maximum canonical v2 URL of
355 characters, or 377 with a valid selected start at the upper date limit. No
short-link service or saved server state is needed. Back/Forward and refresh mount
the visited plan afresh and discard local drafts. Sharing retains committed
snapshots, the cross-editor clipboard lock, scoped feedback and timer cleanup.
Clock ticks still bypass planner generation and city formatting. Analytics, static
canonical metadata, sitemap and structured data remain unchanged.

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.

## Deterministic time-zone conversion

`convertLocalDateTime` in `src/utils/dateTime.js` converts a source wall-clock date and time into an exact instant and represents that instant in a destination time zone. It uses the existing IANA time-zone identifiers and `@js-temporal/polyfill`; it does not read the current clock or the host computer's time zone.

```js
import { convertLocalDateTime } from "./src/utils/dateTime.js";

const result = convertLocalDateTime({
  date: "2027-01-15",
  time: "09:00",
  sourceTimeZone: "America/Toronto",
  destinationTimeZone: "Europe/London",
  disambiguation: "reject",
});
```

Inputs are strict:

- `date` must be a real ISO calendar date in `YYYY-MM-DD` form.
- `time` must be a 24-hour local clock time in `HH:mm` form.
- Both time zones must be supported named IANA identifiers. `UTC` is accepted; numeric fixed-offset identifiers are rejected.
- `disambiguation` is optional and defaults to `reject`. Its accepted values are `reject`, `earlier`, and `later`.

The function always returns one of four JSON-safe outcomes and does not throw for invalid user input:

- `success`: contains `instant` as an ISO UTC string, `epochMilliseconds`, complete `source` and `destination` objects, `dayDifference`, `dayRelation`, and `disambiguation`. Each zoned object contains `timeZone`, `date`, `time`, and `offset`.
- `ambiguous`: the entered time occurred twice. It contains the unresolved source fields, destination zone, disambiguation metadata, and ordered `earlier` and `later` candidates. Each candidate has the same conversion fields as a successful result. No top-level instant is selected.
- `nonexistent`: the entered time was skipped by a forward offset transition. It contains the requested source fields, destination zone, and disambiguation metadata. It never contains a shifted instant.
- `invalid`: contains `error.field`, `error.code`, and `error.message`. Missing or unsupported time zones cannot fall back to the host time zone.

For a repeated time, `earlier` chooses the first exact instant and `later` chooses the second; `disambiguation.applied` records the selected policy. These policies only resolve repeated times. A skipped time remains `nonexistent` even when either policy is requested.

`dayDifference` compares the destination calendar date with the source calendar date. `dayRelation` is `previous-day`, `same-day`, or `next-day` for differences of -1, 0, or 1, and `earlier-date` or `later-date` for date-line cases whose calendar dates differ by more than one day.

Localized display formatting remains separate in `formatTimeInZone` and `formatDateInZone`.

### Time-zone rule limitation

The calculation is deterministic for the same inputs and the same time-zone rules. The Temporal polyfill obtains named-zone behavior from the browser or Node runtime's available IANA time-zone data. That data can differ between runtime versions and can become outdated when governments change time-zone law. Phase 1 does not bundle or pin a versioned time-zone database; the conversion API provides a boundary where the rule source can be upgraded later without changing callers.
