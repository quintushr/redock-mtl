import { describe, expect, it } from "vitest";
import {
  PATH_ENDPOINT_TOLERANCE,
  PATH_ENDPOINT_TOLERANCE_POINT,
  PATH_LENGTH_ABSOLUTE_SLACK,
  PATH_LENGTH_SANITY_FACTOR,
} from "@/lib/endpoints";
import { haversineMetres } from "@/lib/geo";
import { isPlausiblePath } from "@/lib/route-geometry";
import type { LatLon, TracedPath } from "@/lib/types";

/**
 * The two FR-326 checks.
 *
 * These exist because a router that answers is not the same as a router that
 * answered about the right thing. A path whose ends are somewhere else, or that
 * wanders absurdly far, would be drawn solid, labelled verified, and used to
 * compute a duration.
 *
 * The first version of this check was a pure ratio, and it was wrong in a way
 * that took a browser to notice: it rejected the short legs of a real trip,
 * silently, because a rejected path and a not-yet-fetched path look identical.
 * The cases below marked "regression" are the ones that were failing.
 */

const STATION_A: LatLon = { lat: 45.5017, lon: -73.5673 };
const STATION_B: LatLon = { lat: 45.5088, lon: -73.554 };
const FAR_STRAIGHT = haversineMetres(STATION_A, STATION_B);

/** Moves a point north by roughly `metres`. */
function northOf(point: LatLon, metres: number): LatLon {
  return { lat: point.lat + metres / 111_320, lon: point.lon };
}

function path(overrides: Partial<TracedPath> = {}): TracedPath {
  return {
    coordinates: [STATION_A, STATION_B],
    length: FAR_STRAIGHT * 1.4,
    profile: "bike",
    ...overrides,
  };
}

/** A station-to-station request: its ends are authoritative positions. */
const between = (from: LatLon, to: LatLon) => ({
  from,
  to,
  stations: { fromId: "a", toId: "b" },
});

/** A point-to-point request: its ends are wherever the rider tapped. */
const points = (from: LatLon, to: LatLon) => ({ from, to });

describe("endpoint tolerance", () => {
  it("accepts a path whose ends are exactly the requested points", () => {
    expect(isPlausiblePath(path(), between(STATION_A, STATION_B))).toBe(true);
  });

  it("accepts a station snapped to the nearest street", () => {
    const snapped = northOf(STATION_A, PATH_ENDPOINT_TOLERANCE - 20);
    expect(
      isPlausiblePath(
        path({ coordinates: [snapped, STATION_B] }),
        between(STATION_A, STATION_B),
      ),
    ).toBe(true);
  });

  it("rejects a station end that is somewhere else entirely", () => {
    const wrong = northOf(STATION_A, PATH_ENDPOINT_TOLERANCE + 50);
    expect(
      isPlausiblePath(
        path({ coordinates: [wrong, STATION_B] }),
        between(STATION_A, STATION_B),
      ),
    ).toBe(false);
  });

  it("regression: allows an arbitrary point to snap further than a station", () => {
    /*
     * A rider's origin is wherever they tapped: the middle of a park, a campus,
     * a building footprint. The nearest way a person can actually walk on can be
     * a few hundred metres away without anything being wrong. Holding a map
     * click to the station tolerance rejected perfectly good walking routes.
     */
    const snapped = northOf(STATION_A, PATH_ENDPOINT_TOLERANCE + 100);
    expect(
      isPlausiblePath(
        path({ coordinates: [snapped, STATION_B], profile: "foot" }),
        points(STATION_A, STATION_B),
      ),
    ).toBe(true);
  });

  it("still rejects a point end that is nowhere near", () => {
    const wrong = northOf(STATION_A, PATH_ENDPOINT_TOLERANCE_POINT + 200);
    expect(
      isPlausiblePath(
        path({ coordinates: [wrong, STATION_B] }),
        points(STATION_A, STATION_B),
      ),
    ).toBe(false);
  });
});

describe("length sanity, long legs", () => {
  it("accepts a realistic detour", () => {
    // 1.5 is the application's own detour factor default.
    expect(
      isPlausiblePath(
        path({ length: FAR_STRAIGHT * 1.5 }),
        between(STATION_A, STATION_B),
      ),
    ).toBe(true);
  });

  it("rejects a path that wanders absurdly far", () => {
    expect(
      isPlausiblePath(
        path({ length: FAR_STRAIGHT * 40 }),
        between(STATION_A, STATION_B),
      ),
    ).toBe(false);
  });

  it("puts the boundary where the constants say", () => {
    const bound =
      FAR_STRAIGHT * PATH_LENGTH_SANITY_FACTOR + PATH_LENGTH_ABSOLUTE_SLACK;
    expect(
      isPlausiblePath(path({ length: bound - 1 }), between(STATION_A, STATION_B)),
    ).toBe(true);
    expect(
      isPlausiblePath(path({ length: bound + 1 }), between(STATION_A, STATION_B)),
    ).toBe(false);
  });

  it("is dominated by the ratio on a long leg", () => {
    // The absolute slack is 400 m against a bound of several kilometres here, so
    // it changes nothing that matters at this range.
    const ratioOnly = FAR_STRAIGHT * PATH_LENGTH_SANITY_FACTOR;
    expect(PATH_LENGTH_ABSOLUTE_SLACK / ratioOnly).toBeLessThan(0.1);
  });
});

describe("length sanity, short legs (the regression)", () => {
  /*
   * The defect this section exists for. A ratio is the wrong instrument at short
   * range, and the failure was invisible: a rejected path falls back to a
   * straight line, which is exactly what an un-fetched path looks like. The
   * symptom was that only the longer parts of a trip ever traced.
   */

  it("accepts a short walk that goes around a building", () => {
    const from: LatLon = { lat: 45.5017, lon: -73.5673 };
    const to = northOf(from, 40);
    // 40 m apart, 200 m on foot round the block: five times, and correct.
    expect(isPlausiblePath(path({ length: 200, profile: "foot", coordinates: [from, to] }), points(from, to))).toBe(true);
  });

  it("accepts two stations either side of a divided boulevard", () => {
    const from: LatLon = { lat: 45.5017, lon: -73.5673 };
    const to = northOf(from, 80);
    // 80 m apart, 500 m to ride: down to the lights, across, and back.
    expect(
      isPlausiblePath(
        path({ length: 500, coordinates: [from, to] }),
        between(from, to),
      ),
    ).toBe(true);
  });

  it("still rejects a short leg answered with a kilometres-long path", () => {
    // Tolerance is not credulity: 400 m of slack, not unlimited.
    const from: LatLon = { lat: 45.5017, lon: -73.5673 };
    const to = northOf(from, 40);
    expect(
      isPlausiblePath(
        path({ length: 4000, coordinates: [from, to] }),
        between(from, to),
      ),
    ).toBe(false);
  });

  it("does not divide by zero when the endpoints coincide", () => {
    expect(() =>
      isPlausiblePath(path({ length: 5 }), between(STATION_A, STATION_A)),
    ).not.toThrow();
    // Coincident ends with a short path is a station moved a few metres between
    // feed updates, not a wrong answer.
    expect(
      isPlausiblePath(
        path({ length: 5, coordinates: [STATION_A, STATION_A] }),
        between(STATION_A, STATION_A),
      ),
    ).toBe(true);
  });

  it("does not reject a path for being shorter than the crow flies", () => {
    // Geometrically impossible, but it arises from rounding on very short
    // segments and misleads nobody. The check is one-sided on purpose.
    expect(
      isPlausiblePath(
        path({ length: FAR_STRAIGHT * 0.98 }),
        between(STATION_A, STATION_B),
      ),
    ).toBe(true);
  });
});
