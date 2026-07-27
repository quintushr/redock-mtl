# Phase 1 Data Model: Free-Window Trip Planner

**Feature**: 001-free-window-trip-planner
**Date**: 2026-07-26
**Source**: Key Entities in [spec.md](./spec.md)

All types live in `src/lib/types.ts` and are pure data. No class holds behaviour, no type imports
React, and nothing here is aware of how it is fetched or rendered.

## Geometry primitives

```
LatLon           { lat: number; lon: number }
Metres           number
Seconds          number
```

Coordinates are always `LatLon`, never a bare tuple, so that latitude and longitude cannot be
swapped silently. Durations are always `Seconds` in the core; formatting to minutes is a UI
concern.

## Network and stations

```
Station {
  id: string                     // provider station_id, stable across feeds
  name: string
  position: LatLon
  capacity: number | null        // total docks, null when the feed omits it
  mechanicalBikesAvailable: number
  ebikesAvailable: number
  docksAvailable: number
  isInstalled: boolean
  isRenting: boolean
  isReturning: boolean
}

StationSnapshot {
  stations: Station[]
  observedAt: Date               // feed last_updated, not local clock
  ttl: Seconds
  attribution: FeedAttribution
}

FeedAttribution {
  operatorName: string
  licenseUrl: string | null
  licenseName: string | null
}

ServiceArea {
  hull: LatLon[]                 // convex hull of active station positions
  bufferMetres: Metres
}
```

**Validation rules**
- A station is *operational* when `isInstalled && isRenting && isReturning` (FR-013). Non-
  operational stations are excluded from both roles below.
- A station *can start* a segment when operational and
  `mechanicalBikesAvailable > bikeReserve` (FR-011).
- A station *can end* a segment when operational and `docksAvailable > dockReserve` (FR-012).
- `observedAt` comes from the feed, never from `Date.now()`. FR-014 requires showing when the
  snapshot was taken, and a local clock would make a stale feed look fresh.
- `ServiceArea.hull` is built from operational stations only, so a fully out-of-season network
  yields an empty hull rather than a phantom coverage area (FR-029a).

**Notably absent**: no `isEligible` boolean is stored. Eligibility depends on the current
parameters (the reserves), so it is computed, never persisted. Storing it would let a stale flag
survive a parameter change.

## Planning parameters

```
PlanningParameters {
  freeWindow: Seconds            // default 45 min, user-adjustable
  safetyMargin: Seconds          // default conservative, user-adjustable
  cyclingSpeed: number           // metres per second, user-adjustable
  maxWalkDistance: Metres        // user-adjustable
  dockCooldown: Seconds          // default 60, operator rule
  bikeReserve: number            // default small non-zero
  dockReserve: number            // default small non-zero
  detourFactor: number           // calibrated constant, > 1
  walkingSpeed: number           // metres per second, fixed conservative value
}
```

**Validation rules**
- `freeWindow - safetyMargin > 0`, otherwise the parameter set is rejected with an explanation
  (FR-024, and the matching edge case in the spec). This is the segment budget.
- `cyclingSpeed > 0`, `maxWalkDistance >= 0`, `detourFactor >= 1`.
- Reserves are non-negative integers.
- Defaults are conservative rather than optimistic (FR-023, Principle IV).

`segmentBudget = freeWindow - safetyMargin` is derived, never stored.

## Itinerary

```
WalkLeg {
  kind: 'walk'
  from: LatLon
  to: LatLon
  toStationId: string | null     // null on the final leg to the destination
  duration: Seconds
  distance: Metres
}

BikeSegment {
  kind: 'bike'
  fromStationId: string
  toStationId: string
  duration: Seconds
  distance: Metres
  budgetShare: number            // duration / segmentBudget, in [0, 1]
  budgetStatus: BudgetStatus
}

BudgetStatus = 'comfortable' | 'moderate' | 'tight'

DockingStop {
  kind: 'dock'
  stationId: string
  cooldown: Seconds
}

ItineraryStep = WalkLeg | BikeSegment | DockingStop

Itinerary {
  steps: ItineraryStep[]
  totalDuration: Seconds
  stopCount: number
  freeWindowConsumed: Seconds    // sum of bike segment durations only
  snapshotObservedAt: Date
}
```

**Validation rules**
- Every `BikeSegment.duration <= segmentBudget` (FR-004). This is an invariant of any returned
  itinerary and is asserted in tests, not merely produced by construction.
- `WalkLeg` and `DockingStop` durations never count toward `freeWindowConsumed` (FR-006, FR-019).
- `totalDuration` is the sum of every step's duration, including cooldowns (FR-009, FR-016).
- `stopCount` equals the number of `DockingStop` steps.
- `budgetShare` and `budgetStatus` are computed from the same source, so the bar length and the
  label can never disagree (FR-018a).
- Steps alternate correctly: the sequence always starts with a `WalkLeg`, ends with a `WalkLeg`,
  and every `DockingStop` sits between two `BikeSegment`s. A walk-only itinerary is a single
  `WalkLeg` (FR-032).

**Discriminated union**: `kind` is the discriminant so the step list renderer handles every case
exhaustively and a new step type becomes a compile error rather than a silently skipped row.

## Failure

```
PlanningFailure {
  reason: PlanningFailureReason
  suggestions: Suggestion[]      // never empty (FR-028)
}

PlanningFailureReason =
  | 'origin-out-of-coverage'
  | 'destination-out-of-coverage'
  | 'no-station-near-origin'
  | 'no-mechanical-bike-near-origin'
  | 'no-station-near-destination'
  | 'gap-too-large'
  | 'invalid-parameters'

Suggestion {
  kind: 'increase-walk-distance' | 'increase-speed' | 'reduce-safety-margin'
  currentValue: number
  suggestedValue: number
}

PlanResult = { ok: true; itinerary: Itinerary } | { ok: false; failure: PlanningFailure }
```

**Validation rules**
- `origin-out-of-coverage` and `destination-out-of-coverage` are raised only when the point falls
  outside the buffered hull (FR-029a). A point inside the hull with nothing in walking range is
  `no-station-near-origin` or `no-station-near-destination` (FR-029b). These must not be
  conflated; that distinction is the whole point of the clarification that produced FR-029b.
- `no-mechanical-bike-near-origin` is raised when stations are in range but none can start a
  segment, while e-bikes are present (FR-031). It is distinct from `no-station-near-origin`.
- `suggestions` carries the concrete value to move to, so the UI can offer a one-tap adjustment
  rather than vague advice.

**No exceptions**: the planner returns `PlanResult`. It never throws. A thrown error from the core
would surface as a raw error in the UI, which FR-030 forbids.

## Feed status

```
FeedStatus =
  | { state: 'loading' }
  | { state: 'ready'; snapshot: StationSnapshot }
  | { state: 'stale'; snapshot: StationSnapshot; age: Seconds }
  | { state: 'unavailable'; reason: 'network' | 'malformed' | 'out-of-season' }
```

`stale` deliberately keeps the snapshot: a stale plan clearly labelled as stale is more useful than
no plan, and FR-030 asks for an explicit message rather than an empty screen.

## State transitions

The only entity with a lifecycle is the feed:

```
loading -> ready        feed fetched and parsed
loading -> unavailable  fetch failed, parse failed, or feed reports out of season
ready   -> stale        wall clock passes observedAt + ttl
stale   -> ready        refresh succeeds
stale   -> unavailable  refresh fails and the snapshot exceeds the staleness tolerance
```

Refresh is never scheduled faster than `ttl` (Principle V).

Stations and itineraries have no lifecycle. A station is a value from one snapshot; an itinerary is
a pure function of a snapshot and a parameter set. Recomputing is always cheaper and safer than
mutating, which is what makes US3's live recomputation straightforward.
