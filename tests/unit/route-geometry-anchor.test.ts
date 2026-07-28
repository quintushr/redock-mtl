import { describe, expect, it } from "vitest";
import { anchorPath } from "@/lib/route-geometry";
import type { LatLon, TracedPath } from "@/lib/types";

/**
 * The path as drawn meets its markers (FR-305).
 *
 * BRouter snaps to the nearest routable way, so a path can begin a few metres
 * off the station, out on the roadway. Left alone that shows as a gap between
 * the line and the marker, which a rider reads as a rendering bug rather than as
 * what it is. Station positions stay the authoritative anchors of the journey.
 */

const STATION_A: LatLon = { lat: 45.5017, lon: -73.5673 };
const STATION_B: LatLon = { lat: 45.5088, lon: -73.554 };

/** Moves a point north by roughly `metres`. */
function northOf(point: LatLon, metres: number): LatLon {
  return { lat: point.lat + metres / 111_320, lon: point.lon };
}

const path = (coordinates: LatLon[]): TracedPath => ({
  coordinates,
  length: 1900,
  profile: "bike",
});

describe("anchorPath", () => {
  it("prepends the station when the path starts out on the road", () => {
    const snapped = northOf(STATION_A, 25);
    const drawn = anchorPath(path([snapped, STATION_B]), STATION_A, STATION_B);
    expect(drawn[0]).toEqual(STATION_A);
    expect(drawn).toHaveLength(3);
  });

  it("appends the station when the path ends out on the road", () => {
    const snapped = northOf(STATION_B, 25);
    const drawn = anchorPath(path([STATION_A, snapped]), STATION_A, STATION_B);
    expect(drawn[drawn.length - 1]).toEqual(STATION_B);
  });

  it("closes both ends when both are snapped", () => {
    const drawn = anchorPath(
      path([northOf(STATION_A, 30), northOf(STATION_B, 30)]),
      STATION_A,
      STATION_B,
    );
    expect(drawn[0]).toEqual(STATION_A);
    expect(drawn[drawn.length - 1]).toEqual(STATION_B);
    expect(drawn).toHaveLength(4);
  });

  it("leaves an already-exact path unchanged", () => {
    // Adding a duplicate point would put a degenerate zero-length segment at
    // each end, which MapLibre renders as a round-cap blob on the marker.
    const exact = [STATION_A, { lat: 45.505, lon: -73.56 }, STATION_B];
    expect(anchorPath(path(exact), STATION_A, STATION_B)).toEqual(exact);
  });

  it("tolerates a snap of a metre or two without adding a point", () => {
    const drawn = anchorPath(
      path([northOf(STATION_A, 1), STATION_B]),
      STATION_A,
      STATION_B,
    );
    expect(drawn).toHaveLength(2);
  });

  it("never returns fewer than two points", () => {
    expect(anchorPath(path([]), STATION_A, STATION_B)).toEqual([
      STATION_A,
      STATION_B,
    ]);
  });

  it("does not mutate the path it was given", () => {
    const original = [northOf(STATION_A, 25), STATION_B];
    const subject = path([...original]);
    anchorPath(subject, STATION_A, STATION_B);
    expect(subject.coordinates).toEqual(original);
  });

  it("keeps the intermediate shape intact", () => {
    // The middle of the path is the part a rider follows. Anchoring touches the
    // ends only.
    const middle = [
      { lat: 45.503, lon: -73.565 },
      { lat: 45.506, lon: -73.559 },
    ];
    const drawn = anchorPath(
      path([northOf(STATION_A, 20), ...middle, northOf(STATION_B, 20)]),
      STATION_A,
      STATION_B,
    );
    expect(drawn.slice(2, 4)).toEqual(middle);
  });
});
