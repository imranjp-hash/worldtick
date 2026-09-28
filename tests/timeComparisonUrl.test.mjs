import assert from "node:assert/strict";
import test from "node:test";
import {
  buildCanonicalComparisonPath,
  buildInteractiveComparisonSearch,
  parseTimeComparisonSearch,
  recognizedParameters,
} from "../src/utils/timeComparisonUrl.js";
import { getTimeZoneDisplay } from "../src/utils/dateTime.js";

const ordinary = "?from=toronto&to=london&mode=specific&date=2027-01-15&time=09%3A00";
const overlap = "?from=toronto&to=london&mode=specific&date=2027-11-07&time=01%3A30";

test("legacy current links and fallback behavior remain unchanged", () => {
  for (const [search, pair] of [
    ["?from=toronto&to=london", ["toronto", "london"]],
    ["", ["toronto", "vancouver"]],
    ["?from=london", ["toronto", "vancouver"]],
    ["?from=unknown&to=london", ["toronto", "vancouver"]],
    ["?from=toronto&from=london&to=paris", ["toronto", "vancouver"]],
  ]) {
    const state = parseTimeComparisonSearch(search);
    assert.equal(state.mode, "current", search);
    assert.deepEqual([state.fromCity.slug, state.toCity.slug], pair, search);
    assert.equal(state.shareable, true, search);
  }
});

test("ordinary specific state hydrates and serializes canonically", () => {
  const state = parseTimeComparisonSearch(`${ordinary}&campaign=test`);
  assert.equal(state.status, "success");
  assert.equal(state.conversion.status, "success");
  assert.equal(state.occurrence, null);
  assert.equal(state.shareable, true);
  assert.equal(buildCanonicalComparisonPath(state), `/time-difference${ordinary}`);
});

test("ambiguous earlier and later hydrate by candidate interpretation", () => {
  for (const occurrence of ["earlier", "later"]) {
    const state = parseTimeComparisonSearch(`${overlap}&occurrence=${occurrence}`);
    assert.equal(state.status, "success");
    assert.equal(state.conversion.status, "ambiguous");
    assert.equal(state.selectedConversion.interpretation, occurrence);
    assert.equal(state.shareable, true);
    assert.equal(
      buildCanonicalComparisonPath(state),
      `/time-difference${overlap}&occurrence=${occurrence}`,
    );
  }
});

test("an unresolved ambiguous time exposes candidates but is not shareable", () => {
  const state = parseTimeComparisonSearch(overlap);
  assert.equal(state.status, "ambiguous");
  assert.deepEqual(state.conversion.candidates.map(({ interpretation }) => interpretation), [
    "earlier", "later",
  ]);
  assert.equal(state.selectedConversion, null);
  assert.equal(state.shareable, false);
  assert.equal(buildCanonicalComparisonPath(state), null);
});

test("ordinary times reject occurrence and invalid or duplicate occurrence values", () => {
  for (const [suffix, issue] of [
    ["&occurrence=earlier", "INAPPLICABLE_OCCURRENCE"],
    ["&occurrence=compatible", "INVALID_OCCURRENCE"],
    ["&occurrence=EARLIER", "INVALID_OCCURRENCE"],
    ["&occurrence=earlier&occurrence=later", "DUPLICATE_PARAMETER"],
  ]) {
    const state = parseTimeComparisonSearch(`${ordinary}${suffix}`);
    assert.equal(state.status, "invalid", suffix);
    assert.equal(state.issue, issue, suffix);
    assert.equal(state.shareable, false, suffix);
  }
});

test("empty, whitespace and encoded duplicate occurrence values are invalid", () => {
  for (const [search, issue] of [
    [`${overlap}&occurrence=`, "INVALID_OCCURRENCE"],
    [`${overlap}&occurrence=%20earlier%20`, "INVALID_OCCURRENCE"],
    [`${overlap}&occurrence=Earlier`, "INVALID_OCCURRENCE"],
    [`${overlap}&occurrence=earlier&%6Fccurrence=later`, "DUPLICATE_PARAMETER"],
  ]) {
    const state = parseTimeComparisonSearch(search);
    assert.equal(state.status, "invalid", search);
    assert.equal(state.issue, issue, search);
    assert.equal(state.shareable, false, search);
  }
});

test("missing, malformed and impossible specific fields never become shareable", () => {
  for (const [search, expected] of [
    ["?from=toronto&to=london&mode=specific&time=09%3A00", "INCOMPLETE"],
    ["?from=toronto&to=london&mode=specific&date=2027-01-15", "INCOMPLETE"],
    ["?from=toronto&to=london&mode=specific&date=2027-1-15&time=09%3A00", "INVALID_CONVERSION"],
    ["?from=toronto&to=london&mode=specific&date=2027-01-15&time=9%3A00", "INVALID_CONVERSION"],
    ["?from=toronto&to=london&mode=specific&date=2027-02-30&time=09%3A00", "INVALID_CONVERSION"],
  ]) {
    const state = parseTimeComparisonSearch(search);
    assert.equal(state.status, "invalid", search);
    assert.equal(state.issue, expected, search);
    assert.equal(state.selectedConversion, null, search);
    assert.equal(buildCanonicalComparisonPath(state), null, search);
  }
});

test("nonexistent local times remain unshifted and unshareable", () => {
  const state = parseTimeComparisonSearch(
    "?from=toronto&to=london&mode=specific&date=2027-03-14&time=02%3A30",
  );
  assert.equal(state.status, "nonexistent");
  assert.equal(state.conversion.status, "nonexistent");
  assert.equal("instant" in state.conversion, false);
  assert.equal(state.shareable, false);
});

test("invalid specific cities never produce a fallback conversion", () => {
  const state = parseTimeComparisonSearch(
    "?from=unknown&to=london&mode=specific&date=2027-01-15&time=09%3A00",
  );
  assert.equal(state.status, "invalid");
  assert.equal(state.issue, "INVALID_CITY");
  assert.equal(state.conversion, null);
  assert.equal(state.selectedConversion, null);
  assert.equal(state.shareable, false);
});

test("duplicates of every recognized parameter invalidate specific state", () => {
  const values = {
    from: "toronto", to: "london", mode: "specific",
    date: "2027-01-15", time: "09:00", occurrence: "earlier",
  };
  for (const name of recognizedParameters) {
    const base = new URLSearchParams(values);
    if (name === "occurrence") {
      base.delete("occurrence");
      base.append("date", "2027-11-07");
      base.set("date", "2027-11-07");
      base.set("time", "01:30");
      base.append("occurrence", "earlier");
    }
    base.append(name, values[name]);
    const state = parseTimeComparisonSearch(`?${base}`);
    assert.equal(state.status, "invalid", name);
    assert.equal(state.shareable, false, name);
  }
});

test("encoded recognized parameter names participate in duplicate detection", () => {
  for (const search of [
    `${ordinary}&%66rom=london`,
    `${ordinary}&fr%6Fm=london`,
    `${overlap}&occurrence=earlier&%6Fccurrence=later`,
  ]) {
    const state = parseTimeComparisonSearch(search);
    assert.equal(state.status, "invalid", search);
    assert.equal(state.issue, "DUPLICATE_PARAMETER", search);
  }
});

test("specific fields without mode and unsupported mode values are invalid shared state", () => {
  for (const search of [
    "?from=toronto&to=london&date=2027-01-15&time=09%3A00",
    "?from=toronto&to=london&mode=current&date=2027-01-15&time=09%3A00",
    "?from=toronto&to=london&mode=specific&mode=specific&date=2027-01-15&time=09%3A00",
  ]) {
    const state = parseTimeComparisonSearch(search);
    assert.equal(state.mode, "specific");
    assert.equal(state.status, "invalid");
    assert.equal(state.selectedConversion, null);
  }
});

test("unknown extras are ignored by hydration and stripped from canonical output", () => {
  const state = parseTimeComparisonSearch(`${ordinary}&utm_source=test&tag=one&tag=two`);
  assert.equal(state.status, "success");
  assert.equal(buildCanonicalComparisonPath(state), `/time-difference${ordinary}`);
});

test("canonical ordinary, earlier and later URLs round-trip to the same semantic state", () => {
  for (const search of [ordinary, `${overlap}&occurrence=earlier`, `${overlap}&occurrence=later`]) {
    const first = parseTimeComparisonSearch(search);
    const canonicalPath = buildCanonicalComparisonPath(first);
    const second = parseTimeComparisonSearch(new URL(canonicalPath, "https://example.test").search);
    assert.deepEqual({
      mode: second.mode,
      status: second.status,
      from: second.fromCity.slug,
      to: second.toCity.slug,
      date: second.date,
      time: second.time,
      occurrence: second.occurrence,
      epochMilliseconds: second.selectedConversion.epochMilliseconds,
    }, {
      mode: first.mode,
      status: first.status,
      from: first.fromCity.slug,
      to: first.toCity.slug,
      date: first.date,
      time: first.time,
      occurrence: first.occurrence,
      epochMilliseconds: first.selectedConversion.epochMilliseconds,
    }, search);
  }
});

test("canonical specific URLs restore identical timezone clarity", () => {
  for (const search of [ordinary, `${overlap}&occurrence=earlier`, `${overlap}&occurrence=later`]) {
    const first = parseTimeComparisonSearch(search);
    const canonicalPath = buildCanonicalComparisonPath(first);
    const second = parseTimeComparisonSearch(new URL(canonicalPath, "https://example.test").search);
    const displays = (state) => {
      const instant = new Date(state.selectedConversion.epochMilliseconds);
      return [state.fromCity, state.toCity].map((city) =>
        getTimeZoneDisplay(city.timezone, instant).label);
    };

    assert.deepEqual(displays(second), displays(first), search);
  }
});

test("interactive specific serialization is ordered and preserves unrelated parameters", () => {
  const state = parseTimeComparisonSearch(ordinary);
  assert.equal(
    buildInteractiveComparisonSearch("?campaign=test&tag=one&tag=two", state),
    `${ordinary}&campaign=test&tag=one&tag=two`,
  );
});

test("interactive current serialization preserves legacy parameter ordering", () => {
  const state = parseTimeComparisonSearch("?from=vancouver&to=toronto");
  assert.equal(
    buildInteractiveComparisonSearch("?to=london&campaign=test", state),
    "?to=toronto&campaign=test&from=vancouver",
  );
});

test("classification delegates to the conversion engine with reject disambiguation", () => {
  const calls = [];
  const expected = {
    status: "success",
    epochMilliseconds: 1,
    dayDifference: 0,
    disambiguation: { requested: "reject", applied: null },
  };
  const state = parseTimeComparisonSearch(ordinary, (input) => {
    calls.push(input);
    return expected;
  });
  assert.equal(state.selectedConversion, expected);
  assert.deepEqual(calls, [{
    date: "2027-01-15",
    time: "09:00",
    sourceTimeZone: "America/Toronto",
    destinationTimeZone: "Europe/London",
    disambiguation: "reject",
  }]);
});
