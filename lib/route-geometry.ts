import {
  PATH_ENDPOINT_TOLERANCE,
  PATH_ENDPOINT_TOLERANCE_POINT,
  PATH_LENGTH_ABSOLUTE_SLACK,
  PATH_LENGTH_SANITY_FACTOR,
} from "./endpoints";
import { haversineMetres } from "./geo";
import { segmentBudget } from "./params";
import type {
  LatLon,
  Metres,
  ParseResult,
  PathKey,
  PlanningParameters,
  RouteProfile,
  RoutingRequest,
  Seconds,
  TracedItinerary,
  TracedPath,
} from "./types";

/**
 * Everything about route geometry that is calculation rather than I/O.
 *
 * Pure by construction (principle III): this module knows what a BRouter payload
 * looks like and what the domain needs from it, and nothing about fetching,
 * caching or rendering. lib/routing.ts does the I/O and holds no rules; if a
 * rule appears there, it belongs here. Same boundary gbfs.ts and feed-client.ts
 * already draw.
 *
 * Every function here is total. A parser that throws surfaces as a raw error in
 * the UI, which FR-030 forbids, so failures are values.
 */

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

function fail(detail: string): ParseResult<TracedPath> {
  return { ok: false, error: "malformed", detail };
}

/**
 * BRouter reports its numbers as strings: `"track-length": "1909"`, not 1909.
 * Coercing rather than trusting the JSON type, in the manner gbfs.ts already
 * uses for the feeds.
 */
function positiveNumber(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) && value > 0 ? value : null;
  }
  if (typeof value !== "string") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

/**
 * One `[lon, lat, elevation?]` entry.
 *
 * Longitude first. This is the opposite order to `LatLon` and is the single most
 * likely way to get this feature wrong, which is why the conversion happens here
 * and nowhere else. Elevation is dropped: nothing in this application reads it,
 * and carrying a three-tuple around would invite exactly the swap `LatLon`
 * exists to prevent.
 */
function toLatLon(entry: unknown): LatLon | null {
  if (!Array.isArray(entry) || entry.length < 2) return null;
  const [lon, lat] = entry;
  if (typeof lon !== "number" || typeof lat !== "number") return null;
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return { lat, lon };
}

/**
 * Reads a BRouter GeoJSON response.
 *
 * Total: every malformed shape in the rejection table of
 * specs/004-real-route-geometry/contracts/route-source.md comes back as a
 * failure value. The caller turns that into an approximate step, never into an
 * error the rider sees.
 *
 * `total-time`, `messages`, `cost`, `total-energy` and both ascend fields are
 * discarded. The source's duration in particular must not cross into the domain:
 * its trekking profile implies 19.4 km/h against this application's conservative
 * 15 km/h default, and principle IV requires values influencing a displayed
 * duration to be adjustable by the rider.
 */
export function parseRoutePayload(
  payload: unknown,
  request: { from: LatLon; to: LatLon; profile: RouteProfile },
): ParseResult<TracedPath> {
  if (typeof payload !== "object" || payload === null) {
    return fail("payload is not an object");
  }

  const features = (payload as { features?: unknown }).features;
  if (!Array.isArray(features)) return fail("features is not an array");
  if (features.length === 0) return fail("features is empty");

  const feature = features[0];
  if (typeof feature !== "object" || feature === null) {
    return fail("first feature is not an object");
  }

  const { geometry, properties } = feature as {
    geometry?: unknown;
    properties?: unknown;
  };

  if (typeof geometry !== "object" || geometry === null) {
    return fail("geometry is missing");
  }
  if ((geometry as { type?: unknown }).type !== "LineString") {
    return fail("geometry is not a LineString");
  }

  const rawCoordinates = (geometry as { coordinates?: unknown }).coordinates;
  if (!Array.isArray(rawCoordinates)) return fail("coordinates is not an array");

  const coordinates: LatLon[] = [];
  for (const entry of rawCoordinates) {
    const point = toLatLon(entry);
    if (point === null) return fail("coordinate is malformed or out of range");
    coordinates.push(point);
  }
  if (coordinates.length < 2) return fail("fewer than two coordinates");

  const props = (properties ?? {}) as Record<string, unknown>;
  const length = positiveNumber(props["track-length"]);
  if (length === null) return fail("track-length is missing or not positive");

  void request.from;
  void request.to;

  return { ok: true, value: { coordinates, length, profile: request.profile } };
}

// ---------------------------------------------------------------------------
// Plausibility (FR-326)
// ---------------------------------------------------------------------------

/**
 * Whether a returned path is about the journey we asked about.
 *
 * A router that answers is not the same as a router that answered about the
 * right thing. A path whose ends are somewhere else, or that wanders absurdly
 * far, would be drawn solid, labelled as verified, and used to compute a
 * duration. Rejecting it and falling back to the honest approximation is the
 * conservative direction (principle IV).
 *
 * Both bounds have an absolute term, and that is the whole lesson of this
 * function. A pure ratio is the wrong instrument at short range: a 40 m walk
 * that goes around a building is 200 m and perfectly correct, and two stations
 * either side of a divided boulevard are a 500 m ride. Judging those by a
 * multiple of the crow-flies distance rejects real routes, and the rejection is
 * invisible because falling back to a straight line is exactly what the feature
 * looks like when it has not run yet.
 *
 * The length check is deliberately one-sided. A path shorter than the great
 * circle is geometrically impossible, but it arises from rounding on very short
 * segments and misleads nobody.
 */
export function isPlausiblePath(
  path: TracedPath,
  request: { from: LatLon; to: LatLon; stations?: unknown },
): boolean {
  const first = path.coordinates[0];
  const last = path.coordinates[path.coordinates.length - 1];
  if (first === undefined || last === undefined) return false;

  // A station's position is placed on a street by its operator; a rider's own
  // endpoint is wherever they tapped, and may be nowhere near a way anybody can
  // walk on.
  const tolerance =
    request.stations !== undefined
      ? PATH_ENDPOINT_TOLERANCE
      : PATH_ENDPOINT_TOLERANCE_POINT;

  if (haversineMetres(first, request.from) > tolerance) return false;
  if (haversineMetres(last, request.to) > tolerance) return false;

  const straight = haversineMetres(request.from, request.to);
  const bound = straight * PATH_LENGTH_SANITY_FACTOR + PATH_LENGTH_ABSOLUTE_SLACK;

  return path.length <= bound;
}

// ---------------------------------------------------------------------------
// Reuse identity (FR-329)
// ---------------------------------------------------------------------------

/** About a metre, matching what formatCoordinates already treats as our floor. */
const KEY_PRECISION = 5;

const round = (value: number): string => value.toFixed(KEY_PRECISION);

/**
 * The identity under which a path is reused.
 *
 * Two forms, because the two cases have different lifetimes. A station pair is
 * invariant and is persisted; a point pair depends on where the rider happened
 * to tap and is only reused for the session.
 *
 * Ordered in both forms: BRouter routes one-ways, so A to B and B to A are
 * different paths and reusing one for the other would send a rider the wrong way
 * up a street.
 *
 * The station form ignores coordinates on purpose. A published station position
 * can shift by a few metres between feed updates without the station having
 * moved, and re-fetching every path on that basis would be pure waste.
 */
export function pathKey(request: RoutingRequest): PathKey {
  if (request.stations !== undefined) {
    const { fromId, toId } = request.stations;
    return `s:${fromId}>${toId}:${request.profile}`;
  }
  const from = `${round(request.from.lat)},${round(request.from.lon)}`;
  const to = `${round(request.to.lat)},${round(request.to.lon)}`;
  return `p:${from}>${to}:${request.profile}`;
}

// ---------------------------------------------------------------------------
// Duration (FR-313)
// ---------------------------------------------------------------------------

/**
 * A measured path's duration, through the rider's own speed.
 *
 * Not the source's `total-time`. The measured length is a better input to the
 * same model, not a replacement for the model: the rider sets the speed, and
 * principle IV requires that they be able to.
 *
 * `segmentOverhead` is charged for a ride and not for a walk, matching the
 * planner: the operator's meter runs from unlock to dock, and there is nothing
 * to unlock on foot.
 */
export function durationFromPath(
  path: TracedPath,
  params: PlanningParameters,
): Seconds {
  if (path.profile === "foot") {
    return path.length / params.walkingSpeed;
  }
  return path.length / params.cyclingSpeed + params.segmentOverhead;
}

// ---------------------------------------------------------------------------
// Anchoring (FR-305)
// ---------------------------------------------------------------------------

/** Beyond this a snap is visible on the map and worth closing. */
const ANCHOR_SNAP_METRES = 2;

/**
 * The path as drawn, meeting its markers at both ends.
 *
 * BRouter snaps to the nearest routable way, so a path can begin a few metres
 * off the station, on the roadway. Left alone that shows as a gap between the
 * line and the marker, which reads as a rendering bug rather than as what it is.
 * Station positions stay the authoritative anchors of the journey; the path is
 * drawn between them.
 */
export function anchorPath(
  path: TracedPath,
  from: LatLon,
  to: LatLon,
): LatLon[] {
  const points = [...path.coordinates];
  const first = points[0];
  const last = points[points.length - 1];

  if (first === undefined || last === undefined) return [from, to];
  if (haversineMetres(first, from) > ANCHOR_SNAP_METRES) points.unshift(from);
  if (haversineMetres(last, to) > ANCHOR_SNAP_METRES) points.push(to);

  return points;
}

// ---------------------------------------------------------------------------
// Over-budget detection (FR-315)
// ---------------------------------------------------------------------------

/**
 * Indices of the bike segments whose measured duration no longer fits.
 *
 * Walk legs are never included: they do not consume the free window, so a longer
 * walk is a worse estimate but never an invalid plan.
 *
 * Returns indices into `itinerary.steps`, so the caller can name the offending
 * segment rather than saying only that something went wrong.
 */
export function overBudgetSteps(
  traced: TracedItinerary,
  params: PlanningParameters,
): number[] {
  const budget = segmentBudget(params);
  const over: number[] = [];

  traced.itinerary.steps.forEach((step, index) => {
    if (step.kind !== "bike") return;
    const geometry = traced.geometry[index];
    if (geometry === undefined || geometry.path === null) return;
    if (durationFromPath(geometry.path, params) > budget) over.push(index);
  });

  return over;
}

/** Measured length for a step, or undefined when it has no traced path. */
export function measuredLength(
  traced: TracedItinerary,
  index: number,
): Metres | undefined {
  return traced.geometry[index]?.path?.length;
}
