# Phase 1 Data Model: Real Route Geometry

**Feature**: 004-real-route-geometry | **Date**: 2026-07-28

Additions to `lib/types.ts` and the shape of the two new modules' state. Pure data: nothing here
holds behaviour, imports React, or knows how a value was fetched (principle III).

---

## New types

### `RouteProfile`

```ts
/** The travel modes we ask the path source about. Never a free string. */
export type RouteProfile = "bike" | "foot";
```

The application's own vocabulary, not the source's. `lib/endpoints.ts` maps it to the provider's
profile names (`trekking`, `hiking-beta`), so changing provider does not ripple into the domain.

### `TracedPath`

```ts
export interface TracedPath {
  /** Ordered positions, first at the origin end. At least two entries. */
  coordinates: LatLon[];
  /** Length of this path in metres, as reported by the source. */
  length: Metres;
  profile: RouteProfile;
}
```

Elevation, `total-time`, `cost` and `messages` from the source are dropped at parse time
(research R4, R5). `length` is the only measured quantity that crosses into the domain; duration
stays derived from the rider's own speed parameters.

Validation, all enforced by the parser and all returning a `ParseResult` rather than throwing:

- at least two coordinates, every one finite, `|lat| <= 90`, `|lon| <= 180`
- `length` finite and `> 0`
- the first and last coordinates lie within `PATH_ENDPOINT_TOLERANCE` of the requested endpoints
  (FR-326)
- `length` at most `PATH_LENGTH_SANITY_FACTOR` times the straight-line distance between the
  requested endpoints (FR-326)

### `PathStatus`

```ts
/**
 * Per step, never per itinerary (FR-311).
 *
 * `pending` is a real state and not a synonym for `approximate`: the map draws
 * both the same way, but the itinerary must not claim a path was checked and
 * found missing while it is still in flight.
 */
export type PathStatus = "pending" | "traced" | "approximate";
```

State transitions, per step:

```text
pending ──── path parsed and plausible ───────────► traced
   │
   ├──────── request failed, timed out, no path ──► approximate
   ├──────── path rejected by plausibility check ─► approximate
   └──────── source unreachable / offline ────────► approximate
```

`traced` is terminal for a given step. Nothing demotes a traced step back to approximate; a new
plan makes new steps.

### `StepGeometry`

```ts
/** What the map and the trail read for one step. */
export interface StepGeometry {
  status: PathStatus;
  /** Present only when status is "traced". */
  path: TracedPath | null;
}
```

### Extensions to existing types

`BikeSegment` and `WalkLeg` in `lib/types.ts` gain nothing. The geometry is held **beside** the
itinerary, keyed by step index, not inside it:

```ts
export interface TracedItinerary {
  itinerary: Itinerary;
  /** One entry per step of `itinerary.steps`, same order, same length. */
  geometry: StepGeometry[];
  /** True once every step has left `pending`. */
  settled: boolean;
  /** How many correction rounds produced this itinerary. Zero on first display. */
  corrections: number;
}
```

Why beside rather than inside: `planTrip` is pure and builds `Itinerary` from station data alone.
Putting a network-derived field on `BikeSegment` would make the planner's output type describe
something the planner cannot produce, and every existing planner test would have to assert a
field the domain has no business owning.

`corrections > 0` is what the trail reads to tell the rider the plan was corrected (FR-316).

### `MeasuredDistance`

```ts
/** Measured street distance for a station pair, in metres. Sparse. */
export type MeasuredDistance = (
  fromStationId: string,
  toStationId: string,
) => Metres | undefined;
```

Declared here in `lib/types.ts` and nowhere else. `planner.ts` and `route-refinement.ts` both
need it, and the state machine must not import the planner, so a shared type file is the only
home that does not create a coupling.

### `RefinementState`

The value the refinement state machine threads through its pure functions. Held by the hook in
`useState`; owned by no module.

```ts
export interface RefinementState {
  traced: TracedItinerary;
  /** Steps still wanted, in request order. Empty when nothing is outstanding. */
  outstanding: RoutingRequest[];
  /** Measurements gathered so far, carried across correction rounds. */
  measured: Map<string, Metres>;
  rounds: number;
}
```

### `NextAction`

What the caller must do next, decided by a pure function rather than by a component.

```ts
export type NextAction =
  | { kind: "fetch"; requests: RoutingRequest[] }
  | { kind: "replan"; measured: MeasuredDistance; reason: "over-budget" }
  | { kind: "settled" }
  | { kind: "exhausted" };
```

`exhausted` is distinct from `settled` on purpose: one means every step resolved and the plan
holds, the other means correction hit `MAX_CORRECTION_ROUNDS` with a plan that still does not.
They are worded differently to the rider (FR-319), so collapsing them into one state would make
that impossible.

### `PathKey`

```ts
/** Reuse identity (FR-329). Ordered: A→B and B→A are different paths. */
export type PathKey = string;
```

Two forms, because the two cases have different lifetimes (research R6):

- station pair: `s:{fromStationId}>{toStationId}:{profile}` — persisted
- arbitrary points: `p:{lat},{lon}>{lat},{lon}:{profile}`, coordinates at 5 decimals — session only

### `StoredPath`

The persisted form. Deliberately not `TracedPath`: it is a wire format for `localStorage` and is
allowed to be terse.

```ts
interface StoredPath {
  /** Schema version. A bump discards the store. */
  v: number;
  /** Flat [lon, lat, lon, lat, ...] at 5 decimals. */
  c: number[];
  /** Length in metres. */
  m: number;
  /** Last read, epoch ms. Drives LRU eviction. */
  t: number;
}
```

Flat rather than nested pairs: half the JSON punctuation for the same data, and the store is the
one place in this codebase where terseness beats readability, because it is bounded by a browser
quota rather than by a reader's patience.

---

## Parameters

No new entry in `PlanningParameters`. `detourFactor` is the value that calibration would move
(FR-336), and it is already there, already user-visible in `AssumptionsLine`, already documented
with its measurement in `lib/params.ts`.

New constants, held beside the endpoint they belong to rather than in the parameter set, because
they do not influence a duration the rider reads:

| Constant | Value | Why |
|---|---|---|
| `PATH_ENDPOINT_TOLERANCE` | 150 m | For a **station**, whose position an operator placed on a street. It can legitimately snap 100 m to the nearest way; past 150 m it is a path between two other places. |
| `PATH_ENDPOINT_TOLERANCE_POINT` | 500 m | For an **arbitrary point**, which is wherever the rider tapped: a park, a campus, a building footprint. Holding a map click to the station figure rejected good walking routes (FR-326b). |
| `PATH_LENGTH_SANITY_FACTOR` | 4.0 | The detour factor's own measurement (`lib/params.ts`) put the observed maximum at 1.96 over 30 real pairs between 700 m and 7 km. |
| `PATH_LENGTH_ABSOLUTE_SLACK` | 400 m | A ratio alone is the wrong instrument at short range: a 40 m walk around a building is 200 m and correct. Without an absolute term the short legs of a trip were silently rejected while the long ones traced (FR-326a). |
| `PATH_REQUEST_TIMEOUT_MS` | 8000 | Matches the geolocation timeout already used in `PlannerShell`. Past that the rider has read their plan and moved on. |
| `MAX_CORRECTION_ROUNDS` | 3 | FR-319. Termination is structural (research R9); this is the cap on how many times a rider watches their plan rearrange. |
| `MAX_REQUESTS_PER_USER_REQUEST` | 20 | FR-330a. A per-plan bound resets on every correction, so three rounds of five steps could issue twenty requests while satisfying every other rule. Twenty is that worst case made explicit rather than reached by accident; the cache means the realistic number is far lower. |
| `PATH_CACHE_MAX_ENTRIES` | 500 | ~1 MB at the measured ~1.8 KB per entry, inside a ~5 MB quota. |
| `PATH_CACHE_SCHEMA_VERSION` | 1 | Bump to discard. |

Each lands in code with the reasoning above as its comment, in the manner `lib/params.ts`
established: "A default nobody can justify is a guess wearing a number."

---

## Module state

### `lib/route-refinement.ts` (pure)

**No module state at all**, which is the point of the module. `RefinementState` is a value the
caller holds and passes back in; `beginRefinement`, `applyPath`, `nextAction` and
`beginCorrection` are functions of their arguments alone. That is what makes "the source returns
a length that breaks the plan" a plain unit test rather than a React rendering exercise.

### `lib/routing.ts` (impure, no React)

```ts
let sessionPaths: Map<PathKey, TracedPath>;   // walk legs, session lifetime
let inFlight: Map<PathKey, Promise<TracedPath | null>>;  // one request per key
let requestsThisUserRequest: number;          // reset on endpoint or parameter change
```

Mirrors `feed-client.ts`: module-level, a `clearRoutingCache()` exported for tests and for the
purge control, and no other reason to reach in.

### `lib/path-store.ts` (impure, browser only)

Wraps `localStorage` behind four functions. Holds no state of its own; the browser holds it.
Every entry point is total: a `QuotaExceededError`, a `SecurityError` in a private window, a
malformed JSON blob, or `localStorage` being absent entirely all resolve to "no cached path"
rather than to an exception.

---

## Invariants

1. `geometry.length === itinerary.steps.length`, always, and index `i` describes step `i`.
2. `status === "traced"` implies `path !== null`; every other status implies `path === null`.
3. A `TracedPath` for a bike step has `profile === "bike"`; likewise for foot (FR-303).
4. `path.coordinates[0]` equals the step's own origin and the last equals its destination: the
   parser prepends and appends the requested endpoints (FR-305, research R10).
5. Every `TracedPath` reaching the UI has passed both plausibility checks (FR-326).
6. `corrections <= MAX_CORRECTION_ROUNDS`.
7. Nothing in `planner.ts`, `geo.ts`, `params.ts`, `remaining.ts`, `pricing.ts` or
   `route-refinement.ts` imports `routing.ts` or `path-store.ts`. The dependency runs one way, and
   a test asserts it.
8. `route-refinement.ts` does not import `planner.ts`. It hands back a `MeasuredDistance` and lets
   the caller replan; it never calls the planner itself.
9. `nextAction` is a function of its arguments alone. Called twice on the same state with the same
   parameters it returns the same action, which is what makes the correction case testable without
   a clock, a network or a renderer.

---

# Addendum: US7, the corridor

## New types

### `Corridor`

```ts
/** One route treated as the axis the rider will ride, with cumulative length. */
export interface Corridor {
  path: TracedPath;
  /** Metres from the start at each vertex. Same length as `path.coordinates`. */
  cumulative: Metres[];
}
```

`cumulative` is precomputed rather than recomputed per station: a corridor has hundreds of vertices
and is projected against hundreds of stations, so this turns an O(stations x vertices x vertices)
walk into O(stations x vertices).

### `CorridorStation`

```ts
/** Where a station sits relative to the corridor. */
export interface CorridorStation {
  stationId: string;
  /** Metres from the corridor's start to this station's projection. */
  along: Metres;
  /** Metres from the station to the corridor. */
  offset: Metres;
}
```

Only stations with `offset <= CORRIDOR_BAND` are kept (FR-341). The rest keep the straight-line
estimate; no along-route distance is claimed for them.

## New constants

| Constant | Value | Why |
|---|---|---|
| `CORRIDOR_BAND` | 150 m | Measured (research R13) against the committed corridor and station fixtures: 23 stations within it, yielding 253 pairs from one request, and that on a trimmed snapshot so it is a floor. The count keeps rising past 150 m, but so does the cost of leaving the corridor to reach those stations, and a station 250 m off the axis is not on the rider's way. |
| `CORRIDOR_ACCESS_FACTOR` | 2 | Leaving the corridor and rejoining it costs the offset twice (FR-340). A straight-line approximation of a detour that is itself a detour, which is why the result is clamped rather than trusted (R14). |

Both land in `lib/endpoints.ts` beside the other tuning constants, with this reasoning as their
comment.

## The rule that matters

```ts
/**
 * Never more optimistic than the estimate it replaces.
 *
 * Measured over six pairs (research R14): the naive along-route figure
 * underestimated the real ride in two of them, once by 21%, with near-zero
 * access offsets, so one-way streets rather than the access approximation are
 * the cause. An optimistic distance makes a segment look like it fits inside
 * the free window when it does not, which is the one failure this product
 * exists to prevent (principle IV).
 *
 * Clamping needs no constant fitted to six samples and cannot be wrong in the
 * dangerous direction. The corridor may only reveal that a pair is worse than
 * assumed, which is exactly the case US7 was built for.
 */
measured(a, b) = max(along + access, haversine(a, b) * detourFactor)
```

## Invariants

1. `corridor.cumulative.length === corridor.path.coordinates.length`, and `cumulative` is
   non-decreasing.
2. Every `CorridorStation` has `offset <= CORRIDOR_BAND`.
3. A corridor-derived distance is never below `haversine x detourFactor` for the same pair.
4. `route-corridor.ts` imports neither `routing.ts` nor `path-store.ts` nor `planner.ts`, and is
   covered by the existing boundary guard.
5. A corridor replan leaves `TracedItinerary.corrections` at zero (FR-344): nothing was invalidated.
