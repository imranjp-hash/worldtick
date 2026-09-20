# React + Vite

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
