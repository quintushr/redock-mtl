import type { PlanningParameters, Seconds } from "./types";

/**
 * Planning parameters and their defaults.
 *
 * Constitution principle IV: defaults are conservative rather than optimistic,
 * and every default below states where its value came from. A default nobody
 * can justify is a guess wearing a number.
 */

/** Conversion helper kept local so callers never write bare magic numbers. */
const MINUTES = 60;
const KMH_TO_MS = 1000 / 3600;

export const DEFAULT_PARAMETERS: PlanningParameters = {
  /**
   * 45 minutes. The free window quoted in the feature brief as the typical
   * subscription allowance. User-adjustable because it varies by plan.
   */
  freeWindow: 45 * MINUTES,

  /**
   * 5 minutes. Absorbs the gap between our straight-line-plus-detour estimate
   * and reality: traffic lights, a dock that will not accept the bike on the
   * first try, walking the last few metres to a free dock. Conservative by
   * design; a rider who wants tighter segments can lower it, which is exactly
   * the trade FR-034 expects them to make.
   */
  safetyMargin: 5 * MINUTES,

  /**
   * 15 km/h. A relaxed urban cycling pace on a heavy share bike, deliberately
   * below what a fit rider on a road bike would hold. Overestimating speed
   * would produce segments that quietly exceed the free window, which is the
   * one failure mode this product exists to prevent.
   */
  cyclingSpeed: 15 * KMH_TO_MS,

  /**
   * 800 metres, roughly a ten-minute walk at the walking speed below. Beyond
   * this most people would rather take the metro than walk to a dock.
   */
  maxWalkDistance: 800,

  /**
   * 60 seconds. The operator cooldown between docking a bike and taking it
   * again, stated in the feature brief. Not published in any feed, so it is a
   * parameter rather than parsed data.
   */
  dockCooldown: 60,

  /**
   * 90 seconds. Unlocking a bike, adjusting the seat, and docking it at the far
   * end. Charged once per bike segment.
   *
   * Without this the model charges only riding time, and will propose a 65 m
   * ride between two stations 47 m apart because it "takes 16 seconds". That is
   * an optimistic estimate, which principle IV forbids.
   */
  segmentOverhead: 90,

  /**
   * 1 bike. A plan must not depend on the single last mechanical bike at the
   * pickup station, because someone else may take it while the rider walks
   * there. Availability is a snapshot, not a reservation (FR-014).
   */
  bikeReserve: 1,

  /**
   * 1 dock. Same reasoning in reverse: arriving to find the last free dock
   * taken strands the rider mid-trip with the meter running.
   */
  dockReserve: 1,

  /**
   * 1.5. Street distance divided by straight-line distance for urban cycling.
   *
   * Measured, not chosen. On 2026-07-26, 30 random pairs of real BIXI stations
   * between 700 m and 7 km apart were routed through the public OSRM instance
   * and compared against their great-circle distance:
   *
   *   min 1.03 · median 1.33 · mean 1.36 · p75 1.52 · p90 1.71 · max 1.96
   *
   * The default sits at the 75th percentile rather than the median. Taking the
   * median would leave half of all segments underestimated, and an
   * underestimated segment is precisely the failure this product exists to
   * prevent; the safety margin then absorbs the remaining tail. The 90th
   * percentile was rejected as needlessly pessimistic: it would add stops to
   * trips that do not need them.
   *
   * OSRM's driving profile was used as the proxy, since its public instance
   * does not serve a cycling profile. Cyclists can use paths and contraflow
   * lanes closed to cars, so this slightly overestimates, which is the
   * conservative direction (principle IV).
   */
  detourFactor: 1.5,

  /**
   * 4.5 km/h. A deliberately unhurried walking pace, chosen so that the walk to
   * the first station is never the reason an estimate proves optimistic.
   */
  walkingSpeed: 4.5 * KMH_TO_MS,

  /**
   * 0.19 CAD per minute, before taxes.
   *
   * Read on 2026-07-27 from the operator's own pricing page,
   * https://bixi.com/fr/tarifs/ : a subscriber on a regular BIXI has 45 minutes
   * included per trip, and beyond that the rate is "19¢ / min." The same page
   * states "Les prix affichés n'incluent pas les taxes", so this is pre-tax and
   * the interface says so wherever it shows an amount.
   *
   * Stored pre-tax rather than grossed up by the Quebec rate, which does mean
   * the figure shown understates the final bill by roughly 15%. That trade is
   * deliberate: a number the rider cannot reconcile against the operator's own
   * published price reads as an error, and undermines exactly the credibility
   * the comparison exists to build. Labelling carries the honesty instead, and
   * a rider who wants a tax-inclusive figure raises the rate.
   *
   * This is a published price and it will move. Re-check it against the page
   * above rather than trusting this comment's age.
   */
  overageRate: 0.19,
};

/**
 * The usable per-segment budget: what is left of the free window once the
 * safety margin is set aside (FR-004).
 */
export function segmentBudget(params: PlanningParameters): Seconds {
  return params.freeWindow - params.safetyMargin;
}

export type ParameterValidation =
  | { ok: true }
  | { ok: false; reason: string; corrected: PlanningParameters };

/**
 * Validates a parameter set, returning a corrected one rather than throwing, so
 * the UI can offer a fix instead of showing an error (FR-024).
 *
 * Only the first problem found is reported. Correcting one at a time keeps the
 * explanation the user reads down to a single sentence.
 */
export function validateParameters(
  params: PlanningParameters,
): ParameterValidation {
  // Finite, not merely positive. `NaN > 0` is already false, but `Infinity > 0`
  // is true, and an infinite window used to slip through and produce a segment
  // budget of Infinity. That was harmless while the UI showed a consumed
  // *share* (anything over infinity is zero), and stops being harmless the
  // moment the UI shows the remaining *duration*, which would read "Infinity".
  if (!Number.isFinite(params.freeWindow) || params.freeWindow <= 0) {
    return {
      ok: false,
      reason: "The free window must be a real duration longer than zero.",
      corrected: { ...params, freeWindow: DEFAULT_PARAMETERS.freeWindow },
    };
  }

  if (params.safetyMargin < 0) {
    return {
      ok: false,
      reason: "The safety margin cannot be negative.",
      corrected: { ...params, safetyMargin: 0 },
    };
  }

  if (params.safetyMargin >= params.freeWindow) {
    return {
      ok: false,
      reason:
        "The safety margin must be shorter than the free window, otherwise every segment would have to be zero length.",
      corrected: {
        ...params,
        // Leave a usable budget rather than snapping to an arbitrary default:
        // half the window is the largest margin that still permits a plan.
        safetyMargin: Math.floor(params.freeWindow / 2),
      },
    };
  }

  if (!(params.cyclingSpeed > 0)) {
    return {
      ok: false,
      reason: "Cycling speed must be greater than zero.",
      corrected: { ...params, cyclingSpeed: DEFAULT_PARAMETERS.cyclingSpeed },
    };
  }

  if (!(params.walkingSpeed > 0)) {
    return {
      ok: false,
      reason: "Walking speed must be greater than zero.",
      corrected: { ...params, walkingSpeed: DEFAULT_PARAMETERS.walkingSpeed },
    };
  }

  if (params.maxWalkDistance < 0) {
    return {
      ok: false,
      reason: "Maximum walking distance cannot be negative.",
      corrected: { ...params, maxWalkDistance: 0 },
    };
  }

  if (params.detourFactor < 1) {
    return {
      ok: false,
      reason:
        "The detour factor cannot be below 1, because a street route is never shorter than a straight line.",
      corrected: { ...params, detourFactor: 1 },
    };
  }

  if (params.dockCooldown < 0) {
    return {
      ok: false,
      reason: "The docking cooldown cannot be negative.",
      corrected: { ...params, dockCooldown: 0 },
    };
  }

  if (params.segmentOverhead < 0) {
    return {
      ok: false,
      reason: "The per-segment overhead cannot be negative.",
      corrected: { ...params, segmentOverhead: 0 },
    };
  }

  if (params.segmentOverhead >= params.freeWindow - params.safetyMargin) {
    return {
      ok: false,
      reason:
        "The per-segment overhead must be shorter than the segment budget, otherwise no segment could ever fit.",
      corrected: {
        ...params,
        segmentOverhead: DEFAULT_PARAMETERS.segmentOverhead,
      },
    };
  }

  // Zero is legal: a rider whose plan bills nothing sets it to zero, and the
  // comparison then reports a free ride, which is true for them.
  if (!Number.isFinite(params.overageRate) || params.overageRate < 0) {
    return {
      ok: false,
      reason: "The overage rate cannot be negative.",
      corrected: { ...params, overageRate: 0 },
    };
  }

  if (
    !Number.isInteger(params.bikeReserve) ||
    params.bikeReserve < 0 ||
    !Number.isInteger(params.dockReserve) ||
    params.dockReserve < 0
  ) {
    return {
      ok: false,
      reason: "Bike and dock reserves must be whole numbers of zero or more.",
      corrected: {
        ...params,
        bikeReserve: Math.max(0, Math.floor(params.bikeReserve || 0)),
        dockReserve: Math.max(0, Math.floor(params.dockReserve || 0)),
      },
    };
  }

  return { ok: true };
}
