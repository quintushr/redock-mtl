import { describe, expect, it } from "vitest";
import {
  cyclingDuration,
  haversineMetres,
  routedDistance,
  walkingDuration,
} from "@/lib/geo";
import { DEFAULT_PARAMETERS } from "@/lib/params";
import type { LatLon } from "@/lib/types";

// Two real BIXI stations, from tests/fixtures/montreal-station-information.json.
const drummond: LatLon = { lat: 45.4996545106653, lon: -73.57633531093597 };
const elsewhere: LatLon = { lat: 45.53, lon: -73.62 };

describe("haversineMetres", () => {
  it("is zero for identical points", () => {
    expect(haversineMetres(drummond, { ...drummond })).toBe(0);
  });

  it("is symmetric", () => {
    expect(haversineMetres(drummond, elsewhere)).toBeCloseTo(
      haversineMetres(elsewhere, drummond),
      9,
    );
  });

  it("matches a known one-degree-of-latitude distance", () => {
    // One degree of latitude is close to 111.2 km anywhere on the globe.
    const metres = haversineMetres({ lat: 45, lon: -73 }, { lat: 46, lon: -73 });
    expect(metres).toBeGreaterThan(111_000);
    expect(metres).toBeLessThan(111_400);
  });

  it("handles antipodal points without returning NaN", () => {
    const metres = haversineMetres({ lat: 0, lon: 0 }, { lat: 0, lon: 180 });
    expect(Number.isFinite(metres)).toBe(true);
    expect(metres).toBeGreaterThan(20_000_000);
  });

  it("obeys the triangle inequality", () => {
    const via: LatLon = { lat: 45.51, lon: -73.6 };
    const direct = haversineMetres(drummond, elsewhere);
    const detour =
      haversineMetres(drummond, via) + haversineMetres(via, elsewhere);
    expect(detour).toBeGreaterThanOrEqual(direct - 1e-6);
  });
});

describe("cyclingDuration", () => {
  it("never returns less than straight-line distance over speed", () => {
    // Constitution principle IV: an estimate must not flatter. The detour
    // factor is always at least 1, so the corrected duration is always at
    // least the naive one.
    const naive =
      haversineMetres(drummond, elsewhere) / DEFAULT_PARAMETERS.cyclingSpeed;
    expect(cyclingDuration(drummond, elsewhere, DEFAULT_PARAMETERS)).toBeGreaterThanOrEqual(
      naive,
    );
  });

  it("is zero for identical points", () => {
    expect(cyclingDuration(drummond, drummond, DEFAULT_PARAMETERS)).toBe(0);
  });

  it("grows when the speed falls", () => {
    const slow = cyclingDuration(drummond, elsewhere, {
      ...DEFAULT_PARAMETERS,
      cyclingSpeed: DEFAULT_PARAMETERS.cyclingSpeed / 2,
    });
    const normal = cyclingDuration(drummond, elsewhere, DEFAULT_PARAMETERS);
    expect(slow).toBeCloseTo(normal * 2, 6);
  });

  it("is symmetric", () => {
    expect(cyclingDuration(drummond, elsewhere, DEFAULT_PARAMETERS)).toBeCloseTo(
      cyclingDuration(elsewhere, drummond, DEFAULT_PARAMETERS),
      9,
    );
  });
});

describe("walkingDuration", () => {
  it("is slower than cycling over the same distance", () => {
    expect(walkingDuration(drummond, elsewhere, DEFAULT_PARAMETERS)).toBeGreaterThan(
      cyclingDuration(drummond, elsewhere, DEFAULT_PARAMETERS),
    );
  });
});

describe("routedDistance", () => {
  it("is at least the straight-line distance", () => {
    // maxWalkDistance is compared against this, not against the straight line,
    // so that the planner cannot propose a walk longer than the user allowed.
    expect(routedDistance(drummond, elsewhere, DEFAULT_PARAMETERS)).toBeGreaterThanOrEqual(
      haversineMetres(drummond, elsewhere),
    );
  });
});
