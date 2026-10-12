# React + Vite

## Deterministic meeting planner (Phase 3A)

`/meeting-planner` plans fixed 30-elapsed-minute meetings across 2–5 distinct
catalog cities. One explicit reference city owns the selected calendar date.
The global preferred local window defaults to 09:00–17:00 and applies every day;
it does not represent actual calendar availability. Equal endpoints are invalid
and overnight windows are deferred.

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
limitation as the conversion engine. Planner selection clears on all input changes.
There are no planner URLs, individual/overnight windows,
external integrations or planner analytics in this phase.

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
affects UID generation. Editing planner inputs clears selection; retained handlers
read a committed snapshot and are disabled on unmount. No planner sharing URL,
calendar provider, invitation, analytics, recurrence or custom duration is added.

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
