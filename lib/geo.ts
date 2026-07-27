import type { LatLon, Metres, PlanningParameters, Seconds, ServiceArea } from "./types";

/**
 * Geometry and duration estimation. Pure functions only.
 *
 * There is no routing engine here by design (research R9): shipping a street
 * graph to the browser is at odds with both the static deployment and the
 * one-second budget. Distances are great-circle, corrected by a detour factor.
 */

const EARTH_RADIUS_M = 6_371_008.8;

const toRadians = (degrees: number): number => (degrees * Math.PI) / 180;

/**
 * Great-circle distance in metres. Symmetric, and zero for identical points.
 */
export function haversineMetres(a: LatLon, b: LatLon): Metres {
  const phi1 = toRadians(a.lat);
  const phi2 = toRadians(b.lat);
  const deltaPhi = toRadians(b.lat - a.lat);
  const deltaLambda = toRadians(b.lon - a.lon);

  const h =
    Math.sin(deltaPhi / 2) ** 2 +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) ** 2;

  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Estimated cycling duration between two points.
 *
 * The detour factor accounts for the fact that streets are not straight lines.
 * Because the factor is always at least 1, this never returns less than the
 * straight-line distance divided by the speed: the estimate cannot flatter
 * (constitution principle IV).
 */
export function cyclingDuration(
  a: LatLon,
  b: LatLon,
  params: PlanningParameters,
): Seconds {
  const straight = haversineMetres(a, b);
  return (straight * params.detourFactor) / params.cyclingSpeed;
}

/**
 * Estimated walking duration. Uses the same detour correction, since pedestrians
 * follow streets too.
 */
export function walkingDuration(
  a: LatLon,
  b: LatLon,
  params: PlanningParameters,
): Seconds {
  const straight = haversineMetres(a, b);
  return (straight * params.detourFactor) / params.walkingSpeed;
}

/**
 * Street-corrected distance, which is what `maxWalkDistance` is compared
 * against. Comparing a walking limit to a straight-line distance would let the
 * planner propose walks noticeably longer than the user allowed.
 */
export function routedDistance(
  a: LatLon,
  b: LatLon,
  params: PlanningParameters,
): Metres {
  return haversineMetres(a, b) * params.detourFactor;
}

// ---------------------------------------------------------------------------
// Service area
// ---------------------------------------------------------------------------

/**
 * Convex hull by monotone chain, in longitude/latitude space.
 *
 * Treating degrees as planar is acceptable here: the hull only ever bounds one
 * city, where the distortion is far smaller than the buffer applied on top.
 *
 * Returns points in counter-clockwise order. Degenerate inputs (zero, one, two,
 * or all-collinear points) return the deduplicated input rather than throwing,
 * because an out-of-season network legitimately produces them.
 */
export function convexHull(points: LatLon[]): LatLon[] {
  const unique = Array.from(
    new Map(points.map((p) => [`${p.lon},${p.lat}`, p])).values(),
  ).sort((p, q) => (p.lon === q.lon ? p.lat - q.lat : p.lon - q.lon));

  if (unique.length < 3) return unique;

  // Positive when the turn o -> a -> b is counter-clockwise.
  const cross = (o: LatLon, a: LatLon, b: LatLon): number =>
    (a.lon - o.lon) * (b.lat - o.lat) - (a.lat - o.lat) * (b.lon - o.lon);

  const build = (sorted: LatLon[]): LatLon[] => {
    const chain: LatLon[] = [];
    for (const point of sorted) {
      while (
        chain.length >= 2 &&
        cross(chain[chain.length - 2], chain[chain.length - 1], point) <= 0
      ) {
        chain.pop();
      }
      chain.push(point);
    }
    chain.pop();
    return chain;
  };

  const hull = [...build(unique), ...build([...unique].reverse())];

  // All points collinear: the chains collapse and nothing encloses an area.
  return hull.length < 3 ? unique : hull;
}

/** Shortest distance from a point to a segment, in metres. */
function distanceToSegment(point: LatLon, a: LatLon, b: LatLon): Metres {
  // Work in a local planar frame scaled so one unit of longitude matches one
  // unit of latitude in ground distance at this latitude.
  const latScale = Math.cos(toRadians(point.lat));
  const px = point.lon * latScale;
  const py = point.lat;
  const ax = a.lon * latScale;
  const ay = a.lat;
  const bx = b.lon * latScale;
  const by = b.lat;

  const dx = bx - ax;
  const dy = by - ay;
  const lengthSquared = dx * dx + dy * dy;

  let t = 0;
  if (lengthSquared > 0) {
    t = ((px - ax) * dx + (py - ay) * dy) / lengthSquared;
    t = Math.max(0, Math.min(1, t));
  }

  const nearest: LatLon = {
    lat: ay + t * dy,
    lon: (ax + t * dx) / (latScale || 1),
  };

  return haversineMetres(point, nearest);
}

/** True when the point lies inside the hull polygon, by ray casting. */
function isInsidePolygon(point: LatLon, polygon: LatLon[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i];
    const b = polygon[j];
    const straddles = a.lat > point.lat !== b.lat > point.lat;
    if (!straddles) continue;
    const crossingLon =
      ((b.lon - a.lon) * (point.lat - a.lat)) / (b.lat - a.lat) + a.lon;
    if (point.lon < crossingLon) inside = !inside;
  }
  return inside;
}

/** True when the point is inside one buffered hull. */
function isInsideOneHull(
  point: LatLon,
  hull: LatLon[],
  bufferMetres: Metres,
): boolean {
  if (hull.length === 0) return false;
  if (hull.length === 1) return haversineMetres(point, hull[0]) <= bufferMetres;

  if (hull.length >= 3 && isInsidePolygon(point, hull)) return true;

  // Within the buffer of any edge, which also covers the degenerate two-point
  // and collinear cases where there is no interior at all.
  for (let i = 0; i < hull.length; i++) {
    const a = hull[i];
    const b = hull[(i + 1) % hull.length];
    if (distanceToSegment(point, a, b) <= bufferMetres) return true;
  }
  return false;
}

/**
 * True when the point falls inside any of the service area's hulls, or within
 * the buffer around one (FR-029a).
 *
 * Checking each cluster separately is the whole point: a feed carrying two
 * distant cities must not report the gap between them as covered. No hulls at
 * all means nothing is covered, which is what an out-of-season network should
 * look like.
 */
export function isInsideBufferedHull(
  point: LatLon,
  area: ServiceArea,
): boolean {
  return area.hulls.some((hull) =>
    isInsideOneHull(point, hull, area.bufferMetres),
  );
}

// ---------------------------------------------------------------------------
// Candidate pruning
// ---------------------------------------------------------------------------

/**
 * True when a point could lie on a route whose total travelled distance is at
 * most `maxSumMetres`, using the ellipse property: the sum of distances to the
 * two foci is bounded on any such route.
 *
 * This is deliberately conservative. A false positive merely leaves an extra
 * station in the graph and costs a little time. A false negative removes a
 * station the optimum needed and silently returns a worse route or none at all,
 * which is a correctness bug. When in doubt, keep the station.
 */
export function withinEllipse(
  point: LatLon,
  focusA: LatLon,
  focusB: LatLon,
  maxSumMetres: Metres,
): boolean {
  if (!Number.isFinite(maxSumMetres)) return true;
  const sum = haversineMetres(point, focusA) + haversineMetres(point, focusB);
  return sum <= maxSumMetres;
}
