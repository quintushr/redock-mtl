# Contract: internal module boundaries

**Feature**: 004-real-route-geometry | **Date**: 2026-07-28

The public surface of what this feature adds and changes. The rule this contract exists to hold:
**`planner.ts` never learns that a network exists.**

---

## `lib/planner.ts` — changed, additively

```ts
// MeasuredDistance is declared once, in lib/types.ts, and imported here:
//
//   /** Measured street distance for a station pair, in metres. Sparse. */
//   export type MeasuredDistance = (
//     fromStationId: string,
//     toStationId: string,
//   ) => Metres | undefined;
//
// It lives in types.ts rather than here because route-refinement.ts needs it and
// must not import planner.ts. A shared type is not a reason to couple a pure
// state machine to the planner.
import type { MeasuredDistance } from "./types";

export function planTrip(
  origin: LatLon,
  destination: LatLon,
  snapshot: StationSnapshot,
  params: PlanningParameters,
  measured?: MeasuredDistance,     // NEW, optional
): PlanResult;
```

Guarantees:

- **Absent, output is identical.** Not "equivalent": identical. Every existing planner test calls
  the four-argument form and must pass unchanged. A test asserts the equality directly.
- Where `measured` returns a value, that distance replaces `haversine × detourFactor` for that
  pair's edge cost. Where it returns `undefined`, the estimate is used. The lookup is sparse by
  construction: the graph holds O(n²) candidate edges and we will only ever have measurements for
  the few on a displayed path.
- The budget filter at `planner.ts:243` is unchanged, which is the whole trick: a measured pair
  that no longer fits simply has no edge, and the corrected plan falls out of an ordinary
  shortest-path run (research R9).
- Still pure. Still never throws. No import added.

Deliberately a **distance** lookup rather than the duration the feature brief named: duration must
stay derived from the rider's own `cyclingSpeed` and `segmentOverhead`, or a provider's internal
speed model would silently become an unadjustable parameter, which principle IV forbids.

---

## `lib/routing.ts` — new, impure, no React

```ts
export interface RoutingRequest {
  from: LatLon;
  to: LatLon;
  profile: RouteProfile;
  /** Present for station-to-station steps; drives the persistent key. */
  stations?: { fromId: string; toId: string };
}

/** Never throws. Null means "no path", for any reason. */
export function fetchPath(
  request: RoutingRequest,
  signal?: AbortSignal,
): Promise<TracedPath | null>;

/** Cached-only lookup. Synchronous, no request, for a first paint from store. */
export function cachedPath(request: RoutingRequest): TracedPath | null;

/** Exposed for the settings purge control and for tests. */
export function clearRoutingCache(): void;
```

- No React import, no DOM read beyond `localStorage` via `path-store.ts`, no component may hold
  its logic.
- One in-flight promise per `PathKey`; concurrent callers share it, as `loadStationSnapshot`
  already does for the feeds.
- Total: every failure path in `contracts/route-source.md` resolves to `null`.
- The parser (`parseRoutePayload`) is exported separately, is **pure**, and is what the fixture
  tests exercise. No test in this feature touches the network.

---

## `lib/path-store.ts` — new, impure, browser only

```ts
export function readStoredPath(key: PathKey): TracedPath | null;
export function writeStoredPath(key: PathKey, path: TracedPath): void;
export function purgeStoredPaths(): void;
export function storedPathCount(): number;   // for the settings control's label
```

Total in every direction: absent `localStorage`, a `SecurityError` in a private window, a
`QuotaExceededError`, a malformed blob, or a schema-version mismatch all resolve to "nothing
cached" and never to an exception. LRU eviction on write at `PATH_CACHE_MAX_ENTRIES`.

---

## `lib/route-geometry.ts` — new, pure

The parts of this feature that are calculation rather than I/O, so they are unit-testable without
a browser (principle III).

```ts
/** Total. Returns a ParseResult, never throws. */
export function parseRoutePayload(
  payload: unknown,
  request: { from: LatLon; to: LatLon; profile: RouteProfile },
): ParseResult<TracedPath>;

/**
 * The two plausibility checks of FR-326, separately testable.
 *
 * Takes the request rather than two points, because the tolerance differs by
 * what the endpoint is: a station is placed on a street by its operator, a map
 * click can be in the middle of a park (FR-326b).
 */
export function isPlausiblePath(
  path: TracedPath,
  request: { from: LatLon; to: LatLon; stations?: unknown },
): boolean;

/** FR-329: the reuse identity. */
export function pathKey(request: RoutingRequest): PathKey;

/** FR-313: measured length through the rider's own speed. */
export function durationFromPath(
  path: TracedPath,
  params: PlanningParameters,
): Seconds;

/** FR-305: the drawn path meets its markers. */
export function anchorPath(path: TracedPath, from: LatLon, to: LatLon): LatLon[];

/** FR-314, FR-315: which steps broke their budget once measured. */
export function overBudgetSteps(
  traced: TracedItinerary,
  params: PlanningParameters,
): number[];
```

---

## `lib/route-refinement.ts` — new, pure

**The orchestration logic, as a synchronous state machine.** This module exists so that "the
source returns a length that breaks the plan" is a unit test over a plain function, with no
React, no jsdom, no fake timers and no network. That case is the reason the feature exists; it
must be the easiest thing in the codebase to test, not the hardest.

```ts
export interface RefinementState {
  traced: TracedItinerary;
  /** Steps still wanted, in request order. Empty when nothing is outstanding. */
  outstanding: RoutingRequest[];
  /**
   * Measurements gathered so far, keyed by PathKey, carried across rounds.
   *
   * This is what makes correction terminate: a pair measured once stays
   * measured, so each round can only remove edges and the edge set shrinks
   * monotonically over a finite graph.
   */
  measured: Map<PathKey, Metres>;
  rounds: number;
}

/** Opens a refinement over a fresh plan. Lists what to fetch; fetches nothing. */
export function beginRefinement(
  plan: Itinerary,
  stations: Station[],
): RefinementState;

/**
 * Folds one resolved request into the state. `path === null` means the request
 * failed, timed out, or was rejected: the step becomes `approximate`.
 *
 * Synchronous, total, and referentially transparent. Same state in, same state out.
 */
export function applyPath(
  state: RefinementState,
  request: RoutingRequest,
  path: TracedPath | null,
  params: PlanningParameters,
): RefinementState;

/**
 * What the caller must do next. The whole correction decision, including
 * termination, lives here rather than in a component.
 */
export type NextAction =
  | { kind: "fetch"; requests: RoutingRequest[] }
  | { kind: "replan"; measured: MeasuredDistance; reason: "over-budget" }
  | { kind: "settled" }
  | { kind: "exhausted" };   // MAX_CORRECTION_ROUNDS reached

export function nextAction(
  state: RefinementState,
  params: PlanningParameters,
): NextAction;

/** Opens the next round over a corrected plan, carrying measurements forward. */
export function beginCorrection(
  state: RefinementState,
  corrected: Itinerary,
  stations: Station[],
): RefinementState;
```

Every one of these is pure. `nextAction` returning `{kind: "replan"}` is what a test asserts when
a stubbed 4 km path lands on a segment the estimate had at 2 km; feeding its `measured` lookup to
`planTrip` and asserting the corrected itinerary avoids that edge is the second half of the same
test. Neither half renders anything.

---

## `components/useTracedItinerary.ts` — new hook, an adapter and nothing more

```ts
export function useTracedItinerary(
  plan: PlanResult | null,
  snapshot: StationSnapshot | null,
  params: PlanningParameters,
): TracedItinerary | null;
```

Its entire body is: hold a `RefinementState` in `useState`, call `nextAction`, and in an effect
either `await fetchPath(...)` and fold the result back through `applyPath`, or call `planTrip`
with the returned `measured` lookup and `beginCorrection`. It owns the `AbortController` and the
supersession check.

It contains **no** decision about which step to fetch, whether a path is acceptable, whether a
duration breaks the budget, whether to replan, or when to stop. Every one of those is a call into
`route-refinement.ts` or `route-geometry.ts`. If a rule can be written as a pure function, it does
not live here (principle III).

---

## `components/MapView.tsx` — changed

The `route-line` layer is unchanged; only the per-feature `width` and `dash` properties change
value:

| Step | Status | `width` | `dash` |
|---|---|---|---|
| bike | approximate / pending | 3 | `[3, 2]` |
| bike | traced | 4 | `[1, 0]` |
| walk | approximate / pending | 2 | `[1, 2]` |
| walk | traced | 2.5 | `[1, 0]` |

Coordinates come from `anchorPath(...)` when traced, and from the two endpoints when not. A
result arriving is a `setData` call on the existing source: no animation, no layer churn, no
camera change (FR-323).

---

## `components/ItineraryTrail.tsx` — changed

Each leg row gains a status word from the i18n registry (feature 003; no string is typed into a
component). Every state has wording, `pending` included, and the word is in the accessible name,
not only in the visual treatment (FR-308, FR-309). The trail also states, once, when the plan it
is showing was corrected (`corrections > 0`, FR-316).

---

## `components/AssumptionsLine.tsx` — changed

One control added in the advanced section: purge stored paths, labelled with `storedPathCount()`
(FR-329a). No new planning parameter.

---

## Forbidden

A test asserts each of these, because each is the kind of thing that erodes quietly:

1. No import of `routing.ts` or `path-store.ts` from `planner.ts`, `geo.ts`, `params.ts`,
   `remaining.ts`, `pricing.ts`, `gbfs.ts`, or `route-refinement.ts`.
2. No `fetch` in any module under `lib/` other than `feed-client.ts` and `routing.ts`.
3. **No import of `routing.ts` anywhere under `components/` except `useTracedItinerary.ts`** — no
   exception to this one — and **no `fetch` or `XMLHttpRequest` under `components/`** except that
   hook and `SearchField.tsx`. In particular not in `MapView.tsx`. A request fired from the map's
   own effect would put retrieval, caching and the correction decision inside a component that
   cannot be instantiated without WebGL, which is how this feature would end up with its central
   case untestable.

   `SearchField.tsx` is the one standing exception and predates this feature: it queries the
   geocoder for address suggestions and holds no geometry, no cache and no plan. It is listed by
   name in the guard test rather than waved through by a pattern, because widening that list is
   how the rule dies.
4. No network in any test, and **no test of the correction logic may require React or jsdom**.
   `tests/unit/route-refinement-correction.test.ts` imports `lib/`, never `components/`.
5. No arrival time anywhere (FR-312, and `docs/ui-guidelines.md`).
6. No second hue on the map: traced and approximate differ by weight and dash, never by colour.

---

## `lib/route-corridor.ts` — new, pure (US7)

```ts
/** Precomputes cumulative lengths so stations can be projected in one pass. */
export function toCorridor(path: TracedPath): Corridor;

/** Stations within CORRIDOR_BAND of the corridor, located along it. */
export function locateStations(
  corridor: Corridor,
  stations: Station[],
): CorridorStation[];

/**
 * Real distances for every pair of located stations, clamped so the result is
 * never more optimistic than the straight-line estimate (research R14).
 *
 * Returns a lookup shaped for planTrip, so US7 needs nothing new in the planner.
 */
export function corridorDistances(
  corridor: Corridor,
  stations: Station[],
  params: PlanningParameters,
): MeasuredDistance;
```

Pure, synchronous, total. No network, no React, no state. Tested against a committed corridor
fixture, exactly as the parser is tested against a committed BRouter response.

The clamp is exported separately so its rule can be asserted on its own:

```ts
export function clampToEstimate(
  alongRoute: Metres,
  from: LatLon,
  to: LatLon,
  params: PlanningParameters,
): Metres;
```

**Forbidden, and covered by the existing guard**: `route-corridor.ts` may not import `routing.ts`,
`path-store.ts` or `planner.ts`. It receives geometry and returns numbers.

---

## `lib/route-refinement.ts` — changed by US7

The corridor is a round in the existing state machine, not a second machine beside it. Three
additive changes, all of them still pure:

```ts
export interface RefinementState {
  // ...as above, plus:

  /**
   * Whether the corridor has been asked for yet, and for what.
   *
   * Carried across replans by beginCorrection, so the request is issued at most
   * once per user request however many times the plan is rebuilt.
   */
  corridor:
    | { status: "wanted"; request: RoutingRequest }
    | { status: "done"; distances: MeasuredDistance | null };
}

export type NextAction =
  | { kind: "corridor"; request: RoutingRequest }        // NEW, returned first
  | { kind: "fetch"; requests: RoutingRequest[] }
  | { kind: "replan"; measured: MeasuredDistance; reason: "over-budget" | "corridor" }
  | { kind: "settled" }
  | { kind: "exhausted" };

/** Now takes the reason, because a corridor replan is not a correction. */
export function beginCorrection(
  state: RefinementState,
  corrected: Itinerary,
  stations: Station[],
  reason: "over-budget" | "corridor",
): RefinementState;
```

Four rules the caller does not get to decide:

1. **The corridor is asked for before any per-step path**, so the steps of a plan the corridor is
   about to replace are never fetched. That is a saving, not a cost, against FR-330a.
2. **It is asked for only when the plan has a `dock` step.** A plan with no stop has no stop to
   choose, and its single segment is already traced by US1 under the same key.
3. **A direct measurement beats a corridor one for the same pair.** `applyPath` writes into
   `measured`; the corridor lookup is consulted only where `measured` has nothing. A measured path
   is the thing itself; a corridor figure is a projection of it.
4. **`reason: "corridor"` increments neither `corrections` nor `rounds`** (FR-344). Nothing was
   invalidated, and a corridor replan must not spend a correction round that a genuine budget
   violation will need.

`applyPath` recognises the corridor answer by its key and folds `corridorDistances` in. A `null`
answer sets `{status: "done", distances: null}` and the machine proceeds to per-step fetches with
the estimated plan intact, which is FR-345.
