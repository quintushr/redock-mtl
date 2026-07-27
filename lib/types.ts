/**
 * Shared data types for the free-window trip planner.
 *
 * Pure data only. Nothing here holds behaviour, imports React, or knows how a
 * value was fetched or will be rendered (constitution principle III).
 *
 * See specs/001-free-window-trip-planner/data-model.md.
 */

// ---------------------------------------------------------------------------
// Geometry primitives
// ---------------------------------------------------------------------------

/**
 * A geographic point. Always a named pair rather than a tuple, so latitude and
 * longitude cannot be swapped silently.
 */
export interface LatLon {
  lat: number;
  lon: number;
}

/** Distance in metres. */
export type Metres = number;

/**
 * Duration in seconds. The core works in seconds throughout; formatting to
 * minutes is a presentation concern.
 */
export type Seconds = number;

// ---------------------------------------------------------------------------
// Network and stations
// ---------------------------------------------------------------------------

export interface Station {
  /** Provider station_id, stable across feeds. */
  id: string;
  name: string;
  position: LatLon;
  /** Total docks. Null when the feed omits it. */
  capacity: number | null;
  mechanicalBikesAvailable: number;
  ebikesAvailable: number;
  docksAvailable: number;
  isInstalled: boolean;
  isRenting: boolean;
  isReturning: boolean;
}

export interface FeedAttribution {
  operatorName: string;
  licenseUrl: string | null;
  licenseName: string | null;
}

export interface StationSnapshot {
  stations: Station[];
  /**
   * The feed's own last_updated, never the local clock. FR-014 requires showing
   * when the snapshot was taken, and a local clock would make a stale feed look
   * fresh.
   */
  observedAt: Date;
  ttl: Seconds;
  attribution: FeedAttribution;
}

export interface ServiceArea {
  /**
   * One convex hull per connected cluster of active stations (FR-029a).
   *
   * Deliberately a list rather than a single hull. The BIXI feed carries both
   * Montreal and Sherbrooke, 130 km apart; one hull over the raw feed spans
   * 160 km and declares the countryside between them covered, which destroys
   * the very distinction FR-029 and FR-029b exist to draw.
   */
  hulls: LatLon[][];
  bufferMetres: Metres;
}

// ---------------------------------------------------------------------------
// Planning parameters
// ---------------------------------------------------------------------------

export interface PlanningParameters {
  /** The subscription's free duration per ride. User-adjustable (FR-021). */
  freeWindow: Seconds;
  /** Subtracted from freeWindow to get the usable segment budget (FR-004). */
  safetyMargin: Seconds;
  /** Metres per second. User-adjustable (FR-021). */
  cyclingSpeed: number;
  /** User-adjustable (FR-021). */
  maxWalkDistance: Metres;
  /** Operator cooldown between docking a bike and taking it again (FR-007). */
  dockCooldown: Seconds;
  /**
   * Time to unlock a bike, adjust it, and dock it again, charged once per bike
   * segment. Without it the planner proposes 65 m rides taking 16 seconds,
   * which is an optimistic estimate and therefore forbidden by principle IV.
   */
  segmentOverhead: Seconds;
  /** Bikes left untouched so a plan never depends on the last one. */
  bikeReserve: number;
  /** Docks left untouched so a plan never depends on the last one. */
  dockReserve: number;
  /** Straight-line distance is multiplied by this to approximate street routing. */
  detourFactor: number;
  /** Metres per second. */
  walkingSpeed: number;
  /**
   * Currency units billed per minute beyond the free window, before taxes.
   *
   * Influences a figure the rider reads, so principle IV makes it adjustable
   * like every other parameter here (FR-131, FR-133). Local by construction:
   * no tariff feed, no account, no key.
   */
  overageRate: number;
}

// ---------------------------------------------------------------------------
// The no-stop comparison
// ---------------------------------------------------------------------------

/**
 * The same trip ridden straight through, with no anchor stop.
 *
 * Constructed from the plan's own station pair rather than searched, so the two
 * walking legs are identical to the planned ones and the stops are the only
 * thing that differs (FR-128a). Anything else would move two variables at once
 * and the comparison would stop meaning anything.
 *
 * Deliberately not a BikeSegment: that type carries `remaining`, and this ride
 * is defined by exceeding the window. A remaining of zero would be technically
 * true and rhetorically wrong.
 */
export interface NoStopRide {
  fromStationId: string;
  toStationId: string;
  /** Riding time plus one segmentOverhead, on the same terms as any segment. */
  duration: Seconds;
  distance: Metres;
  /** By how much `duration` exceeds the free window. Zero when it fits. */
  overage: Seconds;
  /** `overage` in minutes times overageRate. Zero when there is no overage. */
  cost: number;
  /** Negative means the no-stop ride is faster than the plan (FR-129a). */
  deltaAgainstPlan: Seconds;
}

// ---------------------------------------------------------------------------
// Itinerary
// ---------------------------------------------------------------------------

export interface WalkLeg {
  kind: "walk";
  from: LatLon;
  to: LatLon;
  /** Null on the final leg to the destination. */
  toStationId: string | null;
  duration: Seconds;
  distance: Metres;
}

/**
 * Three bands of *remaining* free window, by absolute duration.
 *
 * Named for what is left rather than what was spent. The previous type banded
 * the share consumed, and keeping that name while inverting its meaning would
 * leave every existing reference reading plausibly and meaning the opposite.
 */
export type RemainingStatus = "comfortable" | "neutral" | "alarming";

export interface BikeSegment {
  kind: "bike";
  fromStationId: string;
  toStationId: string;
  duration: Seconds;
  distance: Metres;
  /**
   * Usable segment budget still in hand on arrival: the free window less the
   * safety margin less this ride. Never negative, never above the budget, and
   * reset to full at every anchor stop because docking restarts the window
   * (FR-108, FR-108a, FR-108b).
   */
  remaining: Seconds;
  /** Band of `remaining`. See lib/remaining.ts for the thresholds. */
  remainingStatus: RemainingStatus;
}

export interface DockingStop {
  kind: "dock";
  stationId: string;
  cooldown: Seconds;
}

/**
 * Discriminated on `kind` so the step list renderer handles every case
 * exhaustively; a new step type becomes a compile error rather than a silently
 * skipped row.
 */
export type ItineraryStep = WalkLeg | BikeSegment | DockingStop;

export interface Itinerary {
  steps: ItineraryStep[];
  /** Sum of every step's duration, cooldowns included (FR-009, FR-016). */
  totalDuration: Seconds;
  stopCount: number;
  /** Sum of bike segment durations only. Walking and cooldowns never count. */
  freeWindowConsumed: Seconds;
  snapshotObservedAt: Date;
}

// ---------------------------------------------------------------------------
// Failure
// ---------------------------------------------------------------------------

export type PlanningFailureReason =
  | "origin-out-of-coverage"
  | "destination-out-of-coverage"
  | "no-station-near-origin"
  | "no-mechanical-bike-near-origin"
  | "no-station-near-destination"
  | "gap-too-large"
  | "invalid-parameters";

export interface Suggestion {
  kind: "increase-walk-distance" | "increase-speed" | "reduce-safety-margin";
  currentValue: number;
  suggestedValue: number;
}

export interface PlanningFailure {
  reason: PlanningFailureReason;
  /** Never empty (FR-028). */
  suggestions: Suggestion[];
}

/**
 * The planner returns this and never throws. A thrown error from the core would
 * surface as a raw error in the UI, which FR-030 forbids.
 */
export type PlanResult =
  | { ok: true; itinerary: Itinerary }
  | { ok: false; failure: PlanningFailure };

// ---------------------------------------------------------------------------
// Feed status
// ---------------------------------------------------------------------------

/**
 * `stale` deliberately keeps the snapshot: a stale plan clearly labelled as
 * stale is more useful than no plan, and FR-030 asks for an explicit message
 * rather than an empty screen.
 */
export type FeedStatus =
  | { state: "loading" }
  | { state: "ready"; snapshot: StationSnapshot }
  | { state: "stale"; snapshot: StationSnapshot; age: Seconds }
  | {
      state: "unavailable";
      reason: "network" | "malformed" | "out-of-season";
    };

/** Total parse result: validation failures are values, not exceptions. */
export type ParseResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: "malformed"; detail: string };
