import { cyclingDuration, routedDistance } from "./geo";
import type {
  Itinerary,
  NoStopRide,
  PlanningParameters,
  Seconds,
  Station,
  SummaryCase,
  TripCostComparison,
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

/**
 * What the plan itself costs.
 *
 * Usually nothing, and the reason is worth stating because it used to be
 * asserted rather than computed. The planner only builds edges whose ride fits
 * the segment budget, so every segment it returns is inside the free window,
 * and a freshly planned trip is free by construction.
 *
 * That stopped being the whole story when feature 004 began replacing estimated
 * durations with measured ones. A measured segment can exceed the window, and
 * when correction runs out of rounds the rider is left holding a plan that
 * really would be billed. Saying "free" then is not an approximation, it is a
 * wrong number (FR-404).
 *
 * Summed per ride, never over the total. The meter runs from unlock to dock,
 * once per ride; costing the whole trip as one ride would charge for the walks
 * and the cooldowns, and would contradict the product's own thesis that a trip
 * split into short rides is cheaper than the same trip ridden through.
 */
export function plannedCost(
  itinerary: Itinerary,
  params: PlanningParameters,
): number {
  return itinerary.steps.reduce(
    (sum, step) =>
      step.kind === "bike" ? sum + overageCost(step.duration, params) : sum,
    0,
  );
}

/**
 * Which of four things the summary is saying.
 *
 * Here rather than inside the component, because the choice is a function of
 * its arguments and principle III says such a thing does not belong in a
 * component. It is also the part most likely to be got subtly wrong, and a
 * chain of conditionals inside a render body cannot be tested without a
 * renderer.
 *
 * The order below is load-bearing, not stylistic:
 *
 *   1. `pending` first, because FR-408a is unconditional. Whatever else is true
 *      of the plan, an itinerary still being revised may not be priced.
 *   2. A plan with no stop is answered before anything is compared: it *is* the
 *      direct ride, so two identical amounts and a zero would be arithmetically
 *      true and rhetorically useless (FR-406a).
 *   3. The null check precedes reading `cost`, or a plan whose anchor stations
 *      left the snapshot would throw here instead of degrading (FR-409).
 */
export function summaryCase(
  itinerary: Itinerary,
  noStop: NoStopRide | null,
  settled: boolean,
  params: PlanningParameters,
): SummaryCase {
  if (!settled) return { kind: "pending" };

  const planned = plannedCost(itinerary, params);

  if (itinerary.stopCount === 0) return { kind: "no-stop-needed", cost: planned };
  // No ride to compare against: a walk-only plan, or stations that have left
  // the snapshot. Worded as the no-stop case, which is what it amounts to.
  if (noStop === null) return { kind: "no-stop-needed", cost: planned };

  if (noStop.cost === 0) return { kind: "nothing-saved", cost: planned };

  const costs: TripCostComparison = {
    planned,
    withoutStops: noStop.cost,
    // Floored rather than allowed negative. The direct ride is at least as long
    // as any one segment of the plan it replaces, so this cannot go below zero
    // for a plan the planner built; the floor is there so a future caller
    // cannot make the summary announce a negative saving.
    saved: Math.max(0, noStop.cost - planned),
  };

  return {
    kind: "comparison",
    costs,
    directDuration: noStop.duration,
    deltaAgainstPlan: noStop.deltaAgainstPlan,
  };
}
