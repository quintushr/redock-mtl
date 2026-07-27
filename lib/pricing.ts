import { cyclingDuration, routedDistance } from "./geo";
import type {
  Itinerary,
  NoStopRide,
  PlanningParameters,
  Seconds,
  Station,
} from "./types";

/**
 * What the same trip would cost ridden straight through.
 *
 * This is the product's own argument, made in numbers: two stops and a cooldown
 * against a fee. A rider who can see both decides for themselves, which is the
 * whole point of showing it.
 *
 * Pure: no clock, no network, no global state. It never throws; an
 * unanswerable comparison comes back as null.
 *
 * Nothing here searches for a route. The ride is *constructed* from the plan's
 * own first pickup and last drop-off, using the same geometry helpers the
 * planner uses, so the two are costed identically and the anchor stops are the
 * only variable between them (FR-128a, FR-128b, FR-136).
 */

/**
 * Currency units for a ride of this duration.
 *
 * Measured against the free window, never against the segment budget. The
 * safety margin is our own caution: the operator does not know about it and
 * does not bill for it, and charging the rider for it would invent a fee.
 */
export function overageCost(
  duration: Seconds,
  params: PlanningParameters,
): number {
  const over = Math.max(0, duration - params.freeWindow);
  if (over === 0) return 0;
  return (over / 60) * params.overageRate;
}

/**
 * The same trip with no anchor stop, or null when there is nothing to compare.
 *
 * Null happens in exactly one case: the plan contains no bike segment at all,
 * so there is no pickup or drop-off to ride between (FR-132). A walk-only plan
 * is the ordinary way to reach it.
 */
export function noStopRide(
  itinerary: Itinerary,
  stations: Station[],
  params: PlanningParameters,
): NoStopRide | null {
  const rides = itinerary.steps.filter((step) => step.kind === "bike");
  if (rides.length === 0) return null;

  const first = rides[0];
  const last = rides[rides.length - 1];
  if (first.kind !== "bike" || last.kind !== "bike") return null;

  const byId = new Map(stations.map((s) => [s.id, s]));
  const from = byId.get(first.fromStationId);
  const to = byId.get(last.toStationId);
  // A stale render can hold an itinerary whose stations left the snapshot.
  // Returning null beats throwing inside a component tree.
  if (from === undefined || to === undefined) return null;

  // The overhead counts because the meter runs from unlock to dock, not from
  // the first pedal stroke. Once, not once per skipped stop: this is one ride.
  const duration =
    cyclingDuration(from.position, to.position, params) + params.segmentOverhead;
  const distance = routedDistance(from.position, to.position, params);

  const overage = Math.max(0, duration - params.freeWindow);

  // Against the whole planned trip, walks and cooldowns included, because that
  // is the time the rider actually spends either way. Negative means the direct
  // ride is faster, which is the usual case and the reason the fee is tempting.
  const walking = itinerary.steps.reduce(
    (sum, step) => (step.kind === "walk" ? sum + step.duration : sum),
    0,
  );

  return {
    fromStationId: from.id,
    toStationId: to.id,
    duration,
    distance,
    overage,
    cost: overageCost(duration, params),
    deltaAgainstPlan: duration + walking - itinerary.totalDuration,
  };
}
