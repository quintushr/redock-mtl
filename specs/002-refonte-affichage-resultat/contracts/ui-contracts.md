# Phase 1 Contracts: Result-First Planner Panel

**Feature**: `002-refonte-affichage-resultat` | **Date**: 2026-07-27

Two kinds of contract: the pure domain modules the display consumes, and the components that
consume them. Visual treatment is not specified here; `docs/ui-guidelines.md` is authoritative for
that.

---

## Part 1: Domain module contracts

### `lib/remaining.ts`

The single source of the remaining-time thresholds, as `lib/budget.ts` was for the old bands. The
gauge fill, the state and the accessible label all derive from these functions, so they cannot
disagree.

```ts
/** Band boundaries in seconds, from docs/ui-guidelines.md. */
export const COMFORTABLE_ABOVE: Seconds;   // 15 * 60
export const ALARMING_BELOW: Seconds;      //  5 * 60

/**
 * Usable segment budget left on arrival. Clamped at zero: an over-budget
 * segment has no slack, it does not have negative slack.
 */
export function remainingAfter(
  segmentDuration: Seconds,
  params: PlanningParameters,
): Seconds;

export function remainingStatus(remaining: Seconds): RemainingStatus;

/**
 * Gauge fill, in [0, 1]. Full means the whole usable budget is in hand.
 * Returns 0 when the budget is not positive, so a degenerate parameter set
 * cannot produce NaN in a style attribute.
 */
export function gaugeFraction(
  remaining: Seconds,
  params: PlanningParameters,
): number;

/**
 * Non-numeric label, so the state is never carried by colour alone (FR-112).
 * Exposed to assistive technology, which sees no colour and no bar.
 */
export function remainingLabel(status: RemainingStatus): string;
```

**Invariants** (each is a test in `tests/unit/remaining.test.ts`):

1. `remainingAfter(0, p) === segmentBudget(p)`.
2. `remainingAfter(d, p) >= 0` for every `d`, including `d` far beyond the budget.
3. `remainingAfter(d, p) <= segmentBudget(p)`, so the safety margin is never returned as slack.
4. Raising `safetyMargin` lowers `remainingAfter(d, p)` for a fixed `d`.
5. Band boundaries are exact: 15 min is `neutral`, one second above is `comfortable`; 5 min is
   `neutral`, one second below is `alarming`.
6. `gaugeFraction` is 1 at zero duration, 0 at or beyond the budget, monotonically decreasing
   between, and never `NaN` when `freeWindow === safetyMargin`.
7. Over an itinerary with two anchor stops, every bike segment's `remaining` is measured against
   the full budget, not a running total. This is the reset property, and it is the one most likely
   to be broken by a later "optimisation".

### `lib/pricing.ts`

```ts
/**
 * The same trip with no anchor stop, built from the plan's own station pair.
 * Null when the plan contains no bike segment at all (FR-132).
 * Pure: no clock, no network, no global state.
 */
export function noStopRide(
  itinerary: Itinerary,
  stations: Station[],
  params: PlanningParameters,
): NoStopRide | null;

/** Currency units for a ride of this duration. Zero at or below the free window. */
export function overageCost(
  duration: Seconds,
  params: PlanningParameters,
): number;
```

**Invariants** (`tests/unit/pricing.test.ts`):

1. `overageCost(d, p) === 0` for every `d <= p.freeWindow`, including exactly at the window.
2. `overageCost` is measured against `freeWindow`, not `segmentBudget`. A ride that exceeds the
   budget but fits the window is free. Charging our own safety margin would invent a fee.
3. `overageCost(p.freeWindow + 600, p)` equals `10 * p.overageRate`.
4. `overageRate: 0` yields zero cost at any duration.
5. `noStopRide` returns `null` for a walk-only itinerary.
6. `noStopRide` uses the first bike step's `fromStationId` and the last bike step's `toStationId`,
   verified on a three-segment itinerary where the middle stations must not be chosen.
7. `noStopRide().duration` includes `segmentOverhead` exactly once, not once per skipped stop.
8. For an itinerary that already has no stop, `deltaAgainstPlan` is zero and `cost` is zero.

---

## Part 2: Component contracts

Every component below is presentational. None computes remaining time, a band, a gauge fraction or
a cost; all four arrive as props from the domain modules above. This is the check that
`docs/ui-guidelines.md` states as "Il n'est jamais calculé dans un composant" and that principle
III states as "Logic that could be expressed as a pure function MUST NOT be written inside a
component".

### `PlannerShell` (modified)

Owns state and composition. The map is a full-frame layer; the panel overlays it.

```tsx
<main>                              {/* full viewport, dvh, never vh */}
  <MapView … />                     {/* mounted ONCE, stable tree position */}
  <PlannerPanel>
    <SearchField … /> ×2            {/* endpoint entry, first per FR-102 */}
    <FeedNotice … />
    <TripSummary … />
    <ItineraryTrail … />
    <NoStopComparison … />
    <AssumptionsLine … />           {/* last, per FR-101 and FR-103 */}
  </PlannerPanel>
</main>
```

**Hard constraints**:

- `MapView` must not move under a conditionally rendered node. Remounting it builds a new MapLibre
  instance at the default camera and breaks FR-123, FR-124 and FR-145. See research R5.
- The existing `focus` prop with its incrementing `id` is the only way the camera moves. Unchanged.
- The heading and the description paragraph are removed, not shrunk (FR-146).
- The `arm()` scroll-into-view call becomes unnecessary once the map is behind the panel rather
  than above it. Removing it is in scope; leaving a scroll that now fights the panel is not.

### `PlannerPanel` (new)

```tsx
interface PlannerPanelProps {
  children: React.ReactNode;
}
```

One component, two anchorings, per FR-141 and `docs/ui-guidelines.md`. Below 1024 px it is
bottom-anchored with two rest positions, `collapsed` on the summary and `expanded` on the full
trail, capped at 65dvh. At 1024 px and above it is left-anchored at a fixed width. The rest
position is local state; nothing above it needs to know.

The scroll container inside the panel is a stable node. Opening the assumptions expands a region
inside it and must not swap it out, or FR-122 fails.

### `TripSummary` (new)

```tsx
interface TripSummaryProps {
  itinerary: Itinerary;
  /** Null when the plan needs no stop, so nothing is billed. */
  noStop: NoStopRide | null;
}
```

Total duration, stop count, cost. Durations worded as estimates (FR-113). No clock time (FR-138).
When `itinerary.stopCount === 0`, says the trip is already free rather than reporting a zero.

### `ItineraryTrail` (new, replaces `ItineraryList`)

```tsx
interface ItineraryTrailProps {
  itinerary: Itinerary;
  stations: Station[];
  params: PlanningParameters;   // for wording the budget, not for computing it
}
```

One continuous list (FR-116). Anchor stops render at the same rank as start and destination
(FR-117), each distinguishable by more than position (FR-118), each naming its station (FR-119).
Walk legs and docking waits carry no gauge and say plainly that they do not spend the free window
(FR-114).

Exhaustive switch on `step.kind`, as `ItineraryList` does today, so a new step type is a compile
error rather than a silently dropped row. That property is worth carrying over.

### `RemainingGauge` (new, replaces `SegmentBudget`)

```tsx
interface RemainingGaugeProps {
  remaining: Seconds;
  status: RemainingStatus;
  fraction: number;        // from gaugeFraction(), not computed here
  budget: Seconds;         // to word "22 of 40 min in hand"
}
```

**Accessibility contract**, the part most easily lost and the direct successor to what
`tests/unit/segment-budget.test.tsx` asserted today:

- The accessible name contains the remaining duration and the non-numeric label from
  `remainingLabel()`. A screen reader sees no colour and no bar; if the state is not in the name,
  it does not exist for that user.
- `comfortable`, `neutral` and `alarming` must produce three distinguishable accessible names.
- The figure is always rendered as text, never colour-only (FR-112, and the quality floor in
  `docs/ui-guidelines.md`).
- The fill is visible at `fraction === 0`: a zero-width bar reads as a rendering bug rather than as
  "no slack". `SegmentBudget` already handles this with a minimum width; carry it over inverted.
- No clock time anywhere in the rendered output.

### `AssumptionsLine` (new, replaces `ParameterPanel`)

```tsx
interface AssumptionsLineProps {
  parameters: PlanningParameters;
  onChange: (next: PlanningParameters) => void;
  correction: string | null;
}
```

At rest: one line (FR-103), stating whether the parameters are at their defaults (FR-125). Opened:
safety margin alone at the first level (FR-120); every other parameter, `overageRate` included,
inside a nested group closed by default (FR-121, FR-133). Reset to defaults in one action (FR-127).
The existing `validateParameters` correction message keeps its role (FR-126).

Opening it must not move the reading position or the camera (FR-122, FR-124).

### `NoStopComparison` (new)

```tsx
interface NoStopComparisonProps {
  /** Null when the plan has no bike segment; the component renders the reason. */
  noStop: NoStopRide | null;
  overageRate: number;   // to state the assumption the amount rests on
}
```

Reachable in one action from the trail (FR-128, SC-007). States duration, amount and the delta
against the plan (FR-129, FR-129a). The amount is worded as an estimate and states that it is
before taxes and at which rate (FR-130). Dismissing returns the trail unchanged with the camera
untouched (FR-134). Stays open and recomputes when a parameter changes (FR-135); it must not
unmount itself on a parameter change, or it will appear to close under the user's finger.

---

## Part 3: What no longer exists

Deleting these is part of the contract, not cleanup deferred to later. Nothing old may sit beside
its replacement.

| Removed | Replaced by |
|---|---|
| `components/ItineraryList.tsx` | `ItineraryTrail.tsx` |
| `components/SegmentBudget.tsx` | `RemainingGauge.tsx` |
| `components/ParameterPanel.tsx` | `AssumptionsLine.tsx` |
| `lib/budget.ts` | `lib/remaining.ts` |
| `tests/unit/budget.test.ts` | `tests/unit/remaining.test.ts` |
| `tests/unit/segment-budget.test.tsx` | `tests/unit/itinerary-trail.test.tsx` |
| `BikeSegment.budgetShare`, `BikeSegment.budgetStatus` | `remaining`, `remainingStatus` |
| `BudgetStatus` | `RemainingStatus` |

A grep for `budgetShare`, `budgetStatus`, `BudgetStatus`, `budgetLabel`, `SegmentBudget`,
`ItineraryList` or `ParameterPanel` must return nothing outside this spec directory when the work
is done.
