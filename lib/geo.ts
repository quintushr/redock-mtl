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
// Corridor
// ---------------------------------------------------------------------------

/**
 * How far from the measured corridor a station may sit and still be estimated
 * against it, in metres.
 *
 * The corridor model says "leave the path, ride along it, rejoin it", and that
 * sentence stops describing anything real once a station is far enough away that
 * getting to the path is a journey of its own. 400 m is about three Montreal
 * blocks: near enough that the approach is a detail, far enough to admit the
 * stations that actually line a cycling artery.
 *
 * Beyond it the old straight-line estimate is used instead, unchanged. This is a
 * refinement of the estimate where it can be trusted, never a replacement of the
 * planner's fallback.
 */
export const CORRIDOR_MAX_OFFSET: Metres = 400;

/** Where a point falls with respect to a path. */
export interface CorridorPosition {
  /** Distance from the path's start to the nearest point on it. */
  along: Metres;
  /** Straight-line distance from the point to the path. */
  offset: Metres;
}

/**
 * Projects a point onto a path.
 *
 * Vertex-wise rather than segment-wise: the nearest *vertex* is taken rather
 * than the nearest point on the nearest segment. A traced path from the router
 * carries a vertex every few metres in a city, so the difference is under the
 * error of everything else here, and the segment-wise version costs a
 * projection per vertex per candidate over several hundred candidates.
 */
export function projectOntoPath(
  point: LatLon,
  path: readonly LatLon[],
): CorridorPosition | null {
  if (path.length === 0) return null;

  let along = 0;
  let bestAlong = 0;
  let bestOffset = Number.POSITIVE_INFINITY;

  for (let i = 0; i < path.length; i += 1) {
    if (i > 0) along += haversineMetres(path[i - 1], path[i]);
    const offset = haversineMetres(point, path[i]);
    if (offset < bestOffset) {
      bestOffset = offset;
      bestAlong = along;
    }
  }

  return { along: bestAlong, offset: bestOffset };
}

/**
 * How much longer the measured corridor is than the straight line it spans.
 *
 * One real observation about how indirect this particular area is, which is
 * exactly what `detourFactor` guesses at with a constant. Null when the corridor
 * cannot supply one.
 *
 * It exists to keep the two estimators comparable, and that is not a detail. A
 * corridor estimate is honest, and an honest number is usually *larger* than an
 * optimistic one; a straight-line estimate with too small a factor is optimistic.
 * Mix them without care and the planner prefers whichever station it knows least
 * about, which is the opposite of what measuring was for. See the note at the
 * edge cost in planner.ts.
 */
export function corridorDetourRatio(corridor: readonly LatLon[]): number | null {
  if (corridor.length < 2) return null;

  const straight = haversineMetres(corridor[0], corridor[corridor.length - 1]);
  if (straight <= 0) return null;

  let length = 0;
  for (let i = 1; i < corridor.length; i += 1) {
    length += haversineMetres(corridor[i - 1], corridor[i]);
  }

  return length / straight;
}

/**
 * Riding distance between two stations, estimated along a measured corridor.
 *
 * Returns null when the corridor has nothing to say about this pair, which is
 * the caller's signal to fall back to `routedDistance`.
 *
 * Why this exists. `routedDistance` is a great-circle distance times one scalar
 * factor, and a scalar is isotropic: it assumes the street network is equally
 * permeable in every direction. Montreal's west end is not. The Décarie trench,
 * the Turcot rail yards and the Falaise Saint-Jacques make north-south crossings
 * expensive, so a station that sits *on* the straight line between two points
 * can be a long way off the route a rider can actually take.
 *
 * That is not hypothetical. On a downtown-to-Lachine trip, four candidate stops
 * fell within 1.4% of each other under the straight-line estimate, and within
 * 16% of each other in reality. The estimator could not tell them apart, and the
 * one it picked was the worst of the four: 12 m from the straight line, on the
 * far side of the escarpment, and 1.7 km of real riding worse than the best.
 *
 * The model here is the one the geometry actually supports: get onto the
 * corridor, ride along it, get off. So the estimate is the distance between the
 * two projections plus each station's own offset. Measured against BRouter on
 * that same trip, it predicted the real distance to about 1%.
 *
 * `Math.abs` on the along-difference rather than rejecting a backwards pair: a
 * corridor that doubles back on itself is ordinary, and a pair that goes
 * momentarily against the flow is not automatically wrong. What the absolute
 * value costs is that a genuine backtrack is under-estimated, which the
 * measurement pass then catches.
 */
export function corridorDistance(
  a: LatLon,
  b: LatLon,
  corridor: readonly LatLon[],
): Metres | null {
  return corridorDistanceBetween(
    projectOntoPath(a, corridor),
    projectOntoPath(b, corridor),
  );
}

/**
 * The same estimate from two projections already computed.
 *
 * This is the form the planner uses, and the split is not tidiness. Projecting
 * is O(corridor length) and a graph over the whole network holds hundreds of
 * thousands of candidate edges; projecting inside the edge cost meant several
 * hundred million distance calculations for one plan, which took a planner that
 * answers in milliseconds and hung it indefinitely. Each station is projected
 * once, before the graph is built, and this reads the answers.
 */
export function corridorDistanceBetween(
  a: CorridorPosition | null,
  b: CorridorPosition | null,
): Metres | null {
  if (a === null || b === null) return null;
  if (a.offset > CORRIDOR_MAX_OFFSET || b.offset > CORRIDOR_MAX_OFFSET) {
    return null;
  }

  return Math.abs(b.along - a.along) + a.offset + b.offset;
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
