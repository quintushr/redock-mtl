import { describe, expect, it } from "vitest";
import {
  CORRIDOR_MAX_OFFSET,
  corridorDistance,
  haversineMetres,
  projectOntoPath,
} from "@/lib/geo";
import type { LatLon } from "@/lib/types";

/**
 * Estimating along a measured corridor instead of along a straight line.
 *
 * The defect this exists for was found in the field, not invented. On a
 * downtown-to-Lachine trip the planner chose a stop that is 12 m from the
 * straight line between the two ends, at 47% of the way: the perfect midpoint
 * under `routedDistance`, and 1.7 km of real riding worse than the best
 * alternative, because it sits on the far side of an escarpment and a rail yard.
 * Four candidate stops fell within 1.4% of each other under the straight-line
 * estimate and within 16% of each other in reality, so the estimator was not
 * choosing badly, it was unable to choose at all.
 *
 * The numbers below are the measured ones from that trip, kept as a regression
 * case. Nothing here reaches the network: the corridor is a literal.
 */

/** A due-east corridor at Montreal's latitude, roughly 1.3 km, five vertices. */
const straightCorridor: LatLon[] = [
  { lat: 45.5, lon: -73.6 },
  { lat: 45.5, lon: -73.5958 },
  { lat: 45.5, lon: -73.5916 },
  { lat: 45.5, lon: -73.5874 },
  { lat: 45.5, lon: -73.5832 },
];

describe("projecting a point onto a path", () => {
  it("reports zero offset for a point on the path", () => {
    const position = projectOntoPath(straightCorridor[2], straightCorridor);
    expect(position).not.toBeNull();
    expect(position?.offset).toBeCloseTo(0, 6);
  });

  it("measures the distance travelled to reach the nearest vertex", () => {
    const start = projectOntoPath(straightCorridor[0], straightCorridor);
    const end = projectOntoPath(
      straightCorridor[straightCorridor.length - 1],
      straightCorridor,
    );
    expect(start?.along).toBeCloseTo(0, 6);
    // The path's own length, walked vertex by vertex.
    let length = 0;
    for (let i = 1; i < straightCorridor.length; i += 1) {
      length += haversineMetres(straightCorridor[i - 1], straightCorridor[i]);
    }
    expect(end?.along).toBeCloseTo(length, 6);
  });

  it("reports the perpendicular distance for a point beside the path", () => {
    // 0.002 degrees of latitude is about 222 m.
    const beside = { lat: 45.502, lon: -73.5916 };
    const position = projectOntoPath(beside, straightCorridor);
    expect(position?.offset).toBeGreaterThan(200);
    expect(position?.offset).toBeLessThan(240);
  });

  it("returns null for an empty path rather than throwing", () => {
    // A corridor that could not be traced is the ordinary case, not an error.
    expect(projectOntoPath(straightCorridor[0], [])).toBeNull();
  });
});

describe("estimating along the corridor", () => {
  it("is the distance between the projections when both sit on it", () => {
    const a = straightCorridor[1];
    const b = straightCorridor[3];
    const estimate = corridorDistance(a, b, straightCorridor);
    expect(estimate).not.toBeNull();
    expect(estimate as number).toBeCloseTo(haversineMetres(a, b), 0);
  });

  it("adds each end's own offset, because getting on and off costs something", () => {
    const onPath = straightCorridor[1];
    const beside = { lat: 45.502, lon: -73.5874 };
    const estimate = corridorDistance(onPath, beside, straightCorridor) as number;
    const alongOnly = haversineMetres(onPath, {
      lat: 45.5,
      lon: -73.5874,
    });
    const offset = projectOntoPath(beside, straightCorridor)?.offset as number;
    expect(estimate).toBeCloseTo(alongOnly + offset, 0);
  });

  it("is symmetric", () => {
    const a = { lat: 45.5005, lon: -73.5958 };
    const b = { lat: 45.4995, lon: -73.5874 };
    expect(corridorDistance(a, b, straightCorridor)).toBeCloseTo(
      corridorDistance(b, a, straightCorridor) as number,
      6,
    );
  });

  it("declines to answer when either end is too far from the corridor", () => {
    // The model is "get on, ride along, get off". Past a few blocks that
    // sentence stops describing anything, and the planner falls back to the
    // straight-line estimate rather than being handed a confident wrong number.
    const far = { lat: 45.52, lon: -73.5916 };
    expect(projectOntoPath(far, straightCorridor)?.offset).toBeGreaterThan(
      CORRIDOR_MAX_OFFSET,
    );
    expect(corridorDistance(far, straightCorridor[1], straightCorridor)).toBeNull();
    expect(corridorDistance(straightCorridor[1], far, straightCorridor)).toBeNull();
  });

  it("declines to answer without a corridor at all", () => {
    expect(corridorDistance(straightCorridor[0], straightCorridor[1], [])).toBeNull();
  });
});

/**
 * The trip that produced the defect, reduced to the two stations that matter.
 *
 * The corridor is the real BRouter path from St-Mathieu / Sherbrooke to
 * Provost / 16e avenue, thinned to the vertices needed to carry its shape: down
 * through Westmount, along Upper-Lachine and Saint-Jacques south of the
 * escarpment, then west to Lachine. Hingston / de Monkland sits north of it on
 * the NDG plateau; Gare Montréal-Ouest sits on it.
 */
describe("the Lachine trip that this exists for", () => {
  const ORIGIN: LatLon = { lat: 45.49589, lon: -73.58267 };
  const DESTINATION: LatLon = { lat: 45.44201, lon: -73.67843 };
  const HINGSTON: LatLon = { lat: 45.4705, lon: -73.62759 };
  const MONTREAL_OUEST: LatLon = { lat: 45.45268, lon: -73.64562 };

  const corridor: LatLon[] = [
    ORIGIN,
    { lat: 45.4895, lon: -73.5885 },
    { lat: 45.4832, lon: -73.5972 },
    { lat: 45.4785, lon: -73.6062 },
    { lat: 45.4736, lon: -73.6158 },
    { lat: 45.4687, lon: -73.6231 },
    { lat: 45.4622, lon: -73.6295 },
    { lat: 45.4561, lon: -73.6372 },
    { lat: 45.4527, lon: -73.6451 },
    { lat: 45.4489, lon: -73.6552 },
    { lat: 45.4451, lon: -73.6668 },
    DESTINATION,
  ];

  it("puts the station that broke it out of reach of the corridor", () => {
    // 12 m from the straight line, and nowhere near the road anybody rides.
    // This one number is the whole bug.
    const offset = projectOntoPath(HINGSTON, corridor)?.offset as number;
    expect(offset).toBeGreaterThan(CORRIDOR_MAX_OFFSET);
    expect(corridorDistance(ORIGIN, HINGSTON, corridor)).toBeNull();
  });

  it("keeps the station on the real corridor within reach", () => {
    const offset = projectOntoPath(MONTREAL_OUEST, corridor)?.offset as number;
    expect(offset).toBeLessThan(CORRIDOR_MAX_OFFSET);
  });

  it("prices a stop on the corridor at close to the corridor's own length", () => {
    // Measured against BRouter: 10 883 m through Gare Montréal-Ouest against
    // 10 896 m direct. The estimate has to reproduce that near-equality, because
    // it is what tells the planner the stop is nearly free.
    const first = corridorDistance(ORIGIN, MONTREAL_OUEST, corridor) as number;
    const second = corridorDistance(MONTREAL_OUEST, DESTINATION, corridor) as number;
    expect(first).not.toBeNull();
    expect(second).not.toBeNull();

    let length = 0;
    for (let i = 1; i < corridor.length; i += 1) {
      length += haversineMetres(corridor[i - 1], corridor[i]);
    }
    // Within 5% of riding the whole corridor, which is what "the stop is on the
    // way" means numerically.
    expect(first + second).toBeLessThan(length * 1.05);
  });
});
