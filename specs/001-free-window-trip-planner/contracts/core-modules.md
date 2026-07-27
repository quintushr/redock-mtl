# Contract: Pure Core Modules

**Feature**: 001-free-window-trip-planner

This is the boundary Principle III protects. Everything below is a pure function: no `fetch`, no
`document`, no module-level mutable state, no `Date.now()`. Nothing in `lib/` may import React
or anything from `components/`. A lint rule enforces the import direction.

Signatures are the contract. Implementations may change freely behind them.

## `lib/geo.ts`

```ts
export function haversineMetres(a: LatLon, b: LatLon): Metres

export function cyclingDuration(
  a: LatLon, b: LatLon, params: PlanningParameters
): Seconds

export function walkingDuration(
  a: LatLon, b: LatLon, params: PlanningParameters
): Seconds

export function convexHull(points: LatLon[]): LatLon[]

export function isInsideBufferedHull(
  point: LatLon, area: ServiceArea
): boolean

export function withinEllipse(
  point: LatLon, focusA: LatLon, focusB: LatLon, maxSumMetres: Metres
): boolean
```

**Guarantees**
- `haversineMetres` is symmetric and returns 0 for identical points.
- `cyclingDuration` applies the detour factor; it never returns a duration shorter than the
  straight-line distance divided by the speed. Estimates must not flatter (Principle IV).
- `convexHull` returns points in a consistent winding order and handles the degenerate cases of
  zero, one, two, and all-collinear inputs without throwing.
- `withinEllipse` is conservative: if it returns `false`, no admissible path can use that point.
  False positives are acceptable, false negatives are a correctness bug.

## `lib/gbfs.ts`

```ts
export function parseStationSnapshot(
  information: unknown, status: unknown, vehicleTypes: unknown, systemInfo: unknown
): ParseResult<StationSnapshot>

export type ParseResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: 'malformed'; detail: string }

export function isOperational(station: Station): boolean
export function canStartSegment(station: Station, params: PlanningParameters): boolean
export function canEndSegment(station: Station, params: PlanningParameters): boolean
export function buildServiceArea(
  stations: Station[], bufferMetres: Metres
): ServiceArea
```

**Guarantees**
- `parseStationSnapshot` takes `unknown` and validates. It never throws, never trusts the shape,
  and returns a typed failure on malformed input (FR-030).
- Unknown fields are ignored, so a provider adding fields does not break parsing.
- Stations present in one feed but not the other are dropped rather than half-populated.
- The mechanical-versus-electric split comes from the vehicle type catalogue, never from a
  hard-coded type id.
- No network access. Fetching lives in `lib/feed-client.ts`, which is impure by design and
  excluded from this contract.

## `lib/planner.ts`

```ts
export function planTrip(
  origin: LatLon,
  destination: LatLon,
  snapshot: StationSnapshot,
  params: PlanningParameters
): PlanResult
```

One entry point. Everything else in the module is internal.

**Guarantees**
- Deterministic: identical inputs give an identical result, which is what makes fixture tests
  meaningful.
- Never throws. Every failure is a `PlanResult` with `ok: false` and a non-empty `suggestions`
  array (FR-028).
- Every `BikeSegment` in a successful result satisfies `duration <= freeWindow - safetyMargin`
  (FR-004). This is the single most important invariant in the codebase.
- Returns no intermediate stop when one segment suffices (FR-008).
- Returns exactly one itinerary, never a list (FR-034).
- `totalDuration` accounts for walking legs and cooldowns (FR-009).
- Only the first pickup station is required to have a mechanical bike available (FR-011,
  FR-011a).
- Pure: it reads the snapshot passed to it and consults no clock and no network.

## `lib/params.ts`

```ts
export const DEFAULT_PARAMETERS: PlanningParameters

export function validateParameters(
  params: PlanningParameters
): { ok: true } | { ok: false; reason: string; corrected: PlanningParameters }

export function segmentBudget(params: PlanningParameters): Seconds
```

**Guarantees**
- Defaults are conservative (Principle IV). Each default carries a comment explaining where the
  value came from; the detour factor's comment must cite the calibration sample (research R9).
- `validateParameters` returns a corrected set rather than throwing, so the UI can offer a fix
  (FR-024).

## `lib/budget.ts`

```ts
export function budgetShare(segment: Seconds, params: PlanningParameters): number
export function budgetStatus(share: number): BudgetStatus
```

**Guarantees**
- `budgetShare` is clamped to `[0, 1]`.
- `budgetStatus` thresholds are defined once here. The bar length, the colour band, and the text
  label in the UI all derive from these two functions, so they cannot disagree (FR-018a).

## Test obligations

Per Principle III, every function above ships with unit tests in `tests/unit/` over frozen JSON
fixtures in `tests/fixtures/`. No test performs network access. Required cases beyond the happy
path:

- A trip needing exactly one segment, and one needing several.
- A station with docks but no bikes usable as an intermediate stop but not as the first pickup.
- Every `PlanningFailureReason` reachable and distinguishable, in particular out-of-coverage
  versus no-station-in-range.
- Malformed, empty, and out-of-season feeds.
- Parameter sets where the safety margin meets or exceeds the free window.
- A property test that ellipse pruning never removes a station used by the unpruned optimum.
- A benchmark over a full-size fixture asserting SC-012's one-second budget.
