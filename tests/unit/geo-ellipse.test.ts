import { describe, expect, it } from "vitest";
import { haversineMetres, withinEllipse } from "@/lib/geo";
import type { LatLon } from "@/lib/types";

/**
 * Ellipse pruning must be conservative. A false positive leaves an extra
 * station in the graph and costs a little time; a false negative removes a
 * station the optimum needed and silently returns a worse route or none at all.
 *
 * These tests exist to prove the second never happens.
 */

const origin: LatLon = { lat: 45.5, lon: -73.65 };
const destination: LatLon = { lat: 45.53, lon: -73.55 };

const sumToFoci = (p: LatLon): number =>
  haversineMetres(p, origin) + haversineMetres(p, destination);

describe("withinEllipse", () => {
  it("always accepts the foci themselves", () => {
    const budget = haversineMetres(origin, destination);
    expect(withinEllipse(origin, origin, destination, budget)).toBe(true);
    expect(withinEllipse(destination, origin, destination, budget)).toBe(true);
  });

  it("accepts any point on the straight line between the foci", () => {
    const budget = haversineMetres(origin, destination);
    for (let t = 0; t <= 1; t += 0.1) {
      const between: LatLon = {
        lat: origin.lat + t * (destination.lat - origin.lat),
        lon: origin.lon + t * (destination.lon - origin.lon),
      };
      // Great-circle sum along the chord can exceed the direct distance by a
      // hair; allow the budget the planner would actually use.
      expect(withinEllipse(between, origin, destination, budget * 1.001)).toBe(
        true,
      );
    }
  });

  it("rejects only points whose distance sum exceeds the budget", () => {
    const budget = 10_000;
    const samples: LatLon[] = [];
    for (let dLat = -0.15; dLat <= 0.15; dLat += 0.01) {
      for (let dLon = -0.2; dLon <= 0.2; dLon += 0.01) {
        samples.push({ lat: 45.5 + dLat, lon: -73.6 + dLon });
      }
    }

    for (const point of samples) {
      const admissible = sumToFoci(point) <= budget;
      // The whole contract: excluded implies genuinely inadmissible.
      expect(withinEllipse(point, origin, destination, budget)).toBe(admissible);
    }
  });

  it("never excludes a point when the budget grows", () => {
    // Monotonicity: relaxing the constraint can only ever admit more stations.
    const samples: LatLon[] = [
      { lat: 45.52, lon: -73.6 },
      { lat: 45.6, lon: -73.5 },
      { lat: 45.4, lon: -73.8 },
    ];
    for (const point of samples) {
      const tight = withinEllipse(point, origin, destination, 5_000);
      const loose = withinEllipse(point, origin, destination, 50_000);
      if (tight) expect(loose).toBe(true);
    }
  });

  it("prunes nothing when the budget is not finite", () => {
    // An unbounded budget must degrade to keeping every station, not to
    // comparing against NaN and silently excluding everything.
    const far: LatLon = { lat: 46.81, lon: -71.21 };
    expect(withinEllipse(far, origin, destination, Number.POSITIVE_INFINITY)).toBe(
      true,
    );
    expect(withinEllipse(far, origin, destination, Number.NaN)).toBe(true);
  });

  it("excludes a point that is clearly unreachable", () => {
    const quebecCity: LatLon = { lat: 46.81, lon: -71.21 };
    expect(withinEllipse(quebecCity, origin, destination, 10_000)).toBe(false);
  });
});
