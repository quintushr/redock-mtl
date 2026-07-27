# Phase 1 Data Model: Result-First Planner Panel

**Feature**: `002-refonte-affichage-resultat` | **Date**: 2026-07-27

Changes to `lib/types.ts` and `lib/params.ts`. Everything not listed here is unchanged: `LatLon`,
`Station`, `StationSnapshot`, `ServiceArea`, `FeedAttribution`, `WalkLeg`, `DockingStop`,
`Itinerary`, `PlanningFailure`, `Suggestion`, `PlanResult`, `FeedStatus`, `ParseResult`.

---

## 1. `BikeSegment`: consumed becomes remaining

```ts
// Before
export interface BikeSegment {
  kind: "bike";
  fromStationId: string;
  toStationId: string;
  duration: Seconds;
  distance: Metres;
  budgetShare: number;          // REMOVED: duration / segmentBudget, clamped [0,1]
  budgetStatus: BudgetStatus;   // REMOVED: comfortable | moderate | tight, share-banded
}

// After
export interface BikeSegment {
  kind: "bike";
  fromStationId: string;
  toStationId: string;
  duration: Seconds;
  distance: Metres;
  /** Usable segment budget still in hand on arrival. Never negative. FR-108. */
  remaining: Seconds;
  /** Band of `remaining`, by absolute duration. FR-111. */
  remainingStatus: RemainingStatus;
}
```

**Why the old fields go**: `budgetShare` is consumed share, which FR-109 forbids displaying
anywhere. Nothing may render it, so nothing should carry it. See research R1 for why this does not
count as touching planning logic.

**Validation rules**:

- `remaining >= 0`. An over-budget segment clamps to zero rather than going negative; zero is
  meaningful and means "no slack at all".
- `remaining <= segmentBudget(params)`. It is measured against the usable budget, not the free
  window, so the safety margin is never counted as time in hand (FR-108a).
- `remaining` does not accumulate across a stop. Every bike segment is measured against the full
  budget, because docking resets the window (FR-108b).

**Derivation** (`lib/remaining.ts`, called from `buildItinerary`):

```
budget    = freeWindow - safetyMargin
remaining = max(0, budget - segment.duration)
```

`segment.duration` already includes `segmentOverhead`: `buildItinerary` computes
`rideDuration = edge.cost - cooldown`, and `addBikeEdges` folded the overhead into `edge.cost`.
No change is needed to make the overhead count.

---

## 2. `RemainingStatus` replaces `BudgetStatus`

```ts
// Before
export type BudgetStatus = "comfortable" | "moderate" | "tight";

// After
export type RemainingStatus = "comfortable" | "neutral" | "alarming";
```

Bands are absolute durations of remaining budget, from `docs/ui-guidelines.md`:

| `remaining` | `remainingStatus` |
|---|---|
| > 15 min | `comfortable` |
| 5 min to 15 min inclusive | `neutral` |
| < 5 min | `alarming` |

The names change with the bands deliberately. Keeping `BudgetStatus` while inverting its meaning
would leave every existing reference reading plausibly and meaning the opposite.

**State transition**: none. This is a pure classification of one number.

---

## 3. `PlanningParameters` gains `overageRate`

```ts
export interface PlanningParameters {
  // ... nine existing fields, all unchanged ...

  /**
   * Currency units billed per minute beyond the free window, before taxes.
   * User-adjustable (FR-133), principle IV.
   */
  overageRate: number;
}
```

**Default** in `lib/params.ts`, following the convention every other default there uses of stating
its source and the date it was read:

```
overageRate: 0.19   // CAD per minute, before taxes.
                    // Verified 2026-07-27 at https://bixi.com/fr/tarifs/ : "19¢ / min."
                    // beyond the 45 minutes included per ride, and "Les prix affichés
                    // n'incluent pas les taxes". Stored pre-tax and labelled pre-tax
                    // rather than grossed up; see research R3.
```

**Validation**, added to `validateParameters` in the existing style, returning a corrected value
rather than throwing:

- `overageRate < 0` is rejected: "The overage rate cannot be negative." Corrected to `0`.
- `overageRate === 0` is legal. A rider whose plan bills nothing sets it to zero and the comparison
  reports a free ride, which is true for them.

`segmentBudget()` is unchanged. `overageRate` influences no route, only a displayed amount.

---

## 4. `NoStopRide`: constructed, not searched

```ts
export interface NoStopRide {
  /** Same stations as the plan's first pickup and last drop-off. FR-128a. */
  fromStationId: string;
  toStationId: string;
  /** Riding time plus one segmentOverhead, on the same terms as any segment. FR-128b. */
  duration: Seconds;
  distance: Metres;
  /** By how much `duration` exceeds the free window. Zero when it fits. */
  overage: Seconds;
  /** overage, in minutes, times overageRate. Zero when there is no overage. */
  cost: number;
  /** Signed: negative means the no-stop ride is faster than the plan. FR-129a. */
  deltaAgainstPlan: Seconds;
}
```

**Why a separate type rather than reusing `BikeSegment`**: a `BikeSegment` carries `remaining` and
`remainingStatus`, and the no-stop ride has neither in any meaningful sense. It is defined by
exceeding the window, so a "remaining" of zero would be technically true and rhetorically wrong.

**Construction** (`lib/pricing.ts`, pure, given an itinerary, a snapshot and parameters):

1. Find the first `bike` step and the last `bike` step in `itinerary.steps`.
   If there is none, return `null`. That is FR-132's walk-only case, and the only absence.
2. `fromStationId` is the first bike step's `fromStationId`; `toStationId` is the last one's
   `toStationId`.
3. `duration = cyclingDuration(from.position, to.position, params) + params.segmentOverhead`,
   using the same `lib/geo.ts` helpers the planner uses, so the two are costed identically.
4. `distance = routedDistance(from.position, to.position, params)`.
5. `overage = max(0, duration - params.freeWindow)`.
   Measured against the free window, not the segment budget: the safety margin is our caution, and
   the operator does not bill it.
6. `cost = (overage / 60) * params.overageRate`.
7. `deltaAgainstPlan = (duration + walking) - itinerary.totalDuration`, where `walking` is the sum
   of the plan's own walk legs, which are unchanged by construction (FR-128a).

**Note on step 5**: `overage` uses `freeWindow` while `remaining` uses `segmentBudget`. This is not
an inconsistency. `remaining` answers "how much slack do I have", where the margin is held back on
purpose. `overage` answers "what will I be charged", where only the operator's rule applies.
Charging the rider for our own safety margin would invent a fee.

---

## 5. Relationships

```text
PlanningParameters ──> segmentBudget() ──> remaining(segment)  ──> RemainingStatus
        │                                        │
        │                                        └──> gaugeFraction() ──> RemainingGauge
        │
        └──> overageRate ──> noStopRide(itinerary, snapshot, params) ──> NoStopRide | null

Itinerary.steps ─┬─ WalkLeg      no gauge, "does not use the free window"   (FR-114)
                 ├─ DockingStop  no gauge, "resets the free window"          (FR-114)
                 └─ BikeSegment  remaining + remainingStatus + gauge         (FR-108, FR-110)
```

`Itinerary.freeWindowConsumed` stays in the structure but is no longer rendered anywhere; it is
summed by `buildItinerary` from the segment durations and is not a display field. If the
implementation finds no remaining reader for it, deleting it is in scope under FR-137.

---

## 6. Impact on existing tests

`tests/unit/budget.test.ts` and `tests/unit/segment-budget.test.tsx` are deleted with the modules
and components they cover.

Any planner test that constructs or asserts `budgetShare` / `budgetStatus` must be updated to the
new fields. This is a mechanical rename of two properties in fixture literals, not a change to what
those tests assert about routing. The route assertions themselves, meaning which stations are
chosen, how many stops, which failures fire, must come through untouched. If a planner test needs
more than a field rename, that is a signal the change has reached further than intended and should
stop for review.
