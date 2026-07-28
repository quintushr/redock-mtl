---

description: "Task list for feature 004: real route geometry"
---

# Tasks: Real Route Geometry

**Input**: Design documents from `/specs/004-real-route-geometry/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/](./contracts/)

**Tests**: Unit tests over pure modules are REQUIRED by Constitution Principle III and ship in the same change as the module they cover. They run against frozen fixtures in `tests/fixtures/` and MUST NOT hit the network.

**Organization**: Tasks are grouped by user story so each can be implemented, tested and demonstrated on its own.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1..US7)
- Exact file paths in every description

## Path Conventions

This repository uses a flat `lib/`, not the `lib/core/` of the generic template. The concrete
structure is recorded in [plan.md](./plan.md):

- **Pure domain modules**: `lib/` (`route-geometry.ts`, `route-refinement.ts`, `route-corridor.ts`, `planner.ts`, `geo.ts`, `params.ts`)
- **I/O modules**: `lib/routing.ts`, `lib/path-store.ts`, `lib/feed-client.ts`
- **UI**: `components/`, `app/`
- **Wording**: `lib/i18n/messages/`
- **Tests and fixtures**: `tests/unit/`, `tests/fixtures/`
- No backend directory, and none may be added (Constitution Principle I)

---

## ⚠️ The mistake this task list exists to prevent

The obvious implementation of this feature is a `fetch` inside a `useEffect` in
`components/MapView.tsx`, with the correction loop written inline beside it. **Do not do this, and
reject it in review.** It puts retrieval, caching and the replan decision inside a component that
cannot be instantiated without WebGL, which means the one case this feature exists to handle — the
source returns a length that pushes a segment past the free window — becomes reachable only through
React, jsdom and fake timers. The most important path in the feature would be its least-tested one,
and Constitution Principle III forbids exactly this: "Logic that could be expressed as a pure
function MUST NOT be written inside a component."

The shape that works instead:

```text
lib/routing.ts            does I/O, holds no rules
lib/route-refinement.ts   holds every rule, does no I/O, synchronous, no React
components/useTracedItinerary.ts   useState + one effect + AbortController. Nothing else.
```

T015 enforces it with a test. T030 is the case that proves it was worth doing, and it imports
nothing from `components/`.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: the constants and fixtures every later phase reads.

- [X] T001 Capture live BRouter responses as fixtures: `tests/fixtures/brouter-trekking.json` (bike, `messages` array included, exactly as sent) and `tests/fixtures/brouter-hiking.json` (foot profile), using the two curl commands in [quickstart.md](./quickstart.md)
- [X] T002 [P] Hand-write malformed payload cases in `tests/fixtures/brouter-malformed.json`: empty `features`, geometry that is not a `LineString`, a single coordinate, a non-numeric `track-length`, a missing `track-length`
- [X] T003 [P] Add the routing entry to `lib/endpoints.ts`: `ROUTING_BASE_URL` defaulting to `https://brouter.de/brouter` with the optional `NEXT_PUBLIC_ROUTING_BASE_URL` build-time override and a fallback on a malformed value, the profile map (`bike` → `trekking`, `foot` → `hiking-beta`), `ROUTING_TRACKNAME = "redock-mtl"`, and the BRouter/OpenStreetMap attribution, each with its verification date and rationale in the manner the file already requires (FR-331, FR-332)
- [X] T004 [P] Add the tuning constants to `lib/endpoints.ts` with the justification recorded in [data-model.md](./data-model.md): `PATH_ENDPOINT_TOLERANCE` (150 m), `PATH_LENGTH_SANITY_FACTOR` (4.0), `PATH_REQUEST_TIMEOUT_MS` (8000), `MAX_CORRECTION_ROUNDS` (3), `MAX_REQUESTS_PER_USER_REQUEST` (20), `PATH_CACHE_MAX_ENTRIES` (500), `PATH_CACHE_SCHEMA_VERSION` (1), the last per FR-330a. Note in the comment on the sanity factor and the tolerance that they are validation thresholds rather than modelling parameters, which is why they sit here and not in `PlanningParameters`, following the precedent of `ELLIPSE_SLACK` in `lib/planner.ts`. **Amended 2026-07-28**: two further constants shipped with the plausibility fix and belong in this inventory, `PATH_ENDPOINT_TOLERANCE_POINT` (500 m, FR-326b) and `PATH_LENGTH_ABSOLUTE_SLACK` (400 m, FR-326a)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: the types, the pure parser, the pure state machine, and the request discipline. Nothing may issue a network request before this phase is complete, because Principle V's obligations have to be in place before the first request is ever sent.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [X] T005 Add the new types to `lib/types.ts` per [data-model.md](./data-model.md): `RouteProfile`, `TracedPath`, `PathStatus`, `StepGeometry`, `TracedItinerary`, `PathKey`, `MeasuredDistance`. Pure data only; `BikeSegment` and `WalkLeg` are deliberately left unchanged
- [X] T006 [P] Write the parser tests in `tests/unit/route-geometry-parse.test.ts` against the Phase 1 fixtures, one case per row of the rejection table in [contracts/route-source.md](./contracts/route-source.md), asserting that `track-length` arriving as a string is coerced, that the third coordinate component is dropped, and that no input throws
- [X] T007 [P] Write the plausibility tests in `tests/unit/route-geometry-plausibility.test.ts`: endpoints at, just inside and just outside `PATH_ENDPOINT_TOLERANCE`; length at, just under and just over `PATH_LENGTH_SANITY_FACTOR` times straight-line (FR-326). **Amended 2026-07-28**: also a short step whose correct route is several times the straight line, which a pure ratio bound rejects and the absolute term admits (FR-326a), and a station endpoint against an arbitrary map point at the same offset, which take different tolerances (FR-326b)
- [X] T008 [P] Write the key tests in `tests/unit/route-geometry-key.test.ts`: a station pair and a point pair produce different key forms, A→B and B→A differ, coordinates round to 5 decimals, the profile is part of the key (FR-329)
- [X] T009 Implement the pure module `lib/route-geometry.ts` with `parseRoutePayload`, `isPlausiblePath`, `pathKey` and `durationFromPath`, per [contracts/core-modules.md](./contracts/core-modules.md). Total by construction: every failure is a `ParseResult`, nothing throws. Makes T006, T007 and T008 pass
- [X] T010 [P] Write the store tests in `tests/unit/path-store.test.ts`: LRU eviction at `PATH_CACHE_MAX_ENTRIES`, a thrown `QuotaExceededError` resolving to "nothing cached", a schema-version mismatch discarding the store, `localStorage` absent entirely, and a malformed blob under a valid key
- [X] T011 Implement `lib/path-store.ts` with `readStoredPath`, `writeStoredPath`, `purgeStoredPaths` and `storedPathCount`, storing the terse `StoredPath` form from [data-model.md](./data-model.md). Every entry point total. Makes T010 pass
- [X] T012 Implement `lib/routing.ts` with `fetchPath` and `cachedPath` per [contracts/route-source.md](./contracts/route-source.md): URL built in exactly one function with longitude first, `trackname` on every request, no custom header, `AbortSignal` honoured, `PATH_REQUEST_TIMEOUT_MS` enforced, one in-flight promise per `PathKey`, persistent store for station pairs and a module-level session `Map` for point pairs, no automatic retry, a hard stop at `MAX_REQUESTS_PER_USER_REQUEST` reset on endpoint or parameter change rather than on a corrected plan, and `clearRoutingCache()` exported (FR-324, FR-326, FR-328, FR-330, FR-330a)
- [X] T013 [P] Write the state machine tests in `tests/unit/route-refinement.test.ts`, importing only from `lib/`: `beginRefinement` lists one request per step and fetches nothing; `applyPath` with a valid path marks that step `traced` and leaves the others untouched; `applyPath` with `null` marks it `approximate`; applying the same request twice is idempotent; `nextAction` returns `settled` only once every step has left `pending`
- [X] T014 Implement the pure state machine `lib/route-refinement.ts` with `beginRefinement`, `applyPath` and `nextAction` per [contracts/core-modules.md](./contracts/core-modules.md). Synchronous, total, referentially transparent, no `async`, no import of `routing.ts`. Makes T013 pass
- [X] T015 Write the architecture guard test in `tests/unit/routing-boundaries.test.ts` covering all six prohibitions in [contracts/core-modules.md](./contracts/core-modules.md), and in particular: **no `fetch`, no `XMLHttpRequest` and no import of `routing.ts` anywhere under `components/` except `useTracedItinerary.ts`, and never in `MapView.tsx`**; no import of `routing.ts` or `path-store.ts` from any pure module including `route-refinement.ts`; no network in any test

**Checkpoint**: geometry can be fetched, parsed, validated and reused; every rule about what to do with it is a pure function; and nothing in the domain core knows a network exists.

---

## Phase 3: User Story 1 - See the path you can actually ride (Priority: P1) 🎯 MVP

**Goal**: bike segments are drawn along streets and cycling infrastructure instead of straight through the river, with the anchor stations still reading as the points of the journey.

**Independent Test**: with a frozen station snapshot, plan a trip whose straight-line segment crosses the Saint-Laurent away from a bridge, and verify the drawn path crosses only at a bridge and stays on ways a bike may use.

### Tests for User Story 1 ⚠️

- [X] T016 [P] [US1] Write the anchoring tests in `tests/unit/route-geometry-anchor.test.ts`: `anchorPath` prepends the requested origin and appends the requested destination, leaves an already-exact path unchanged, and never produces fewer than two points (FR-305)

### Implementation for User Story 1

- [X] T017 [US1] Implement `anchorPath` in `lib/route-geometry.ts` so a path snapped to the roadway still meets its station markers. Makes T016 pass
- [X] T018 [US1] Add the adapter hook `components/useTracedItinerary.ts`: hold a `RefinementState` in `useState`, call `nextAction`, and in one effect either `await fetchPath(...)` and fold the result back through `applyPath`, or settle. It owns the `AbortController` and nothing else. **No decision about what to fetch, what is acceptable, or what to do next may be written in this file** (FR-301, FR-322)
- [X] T019 [US1] Render by status in `components/MapView.tsx`: traced bike segments at `{width: 4, dash: [1, 0]}` drawn from `anchorPath`, untraced at the current `{width: 3, dash: [3, 2]}`. Replace the source data on arrival, no animation, no layer churn, no camera change. This file performs no I/O of any kind. Update the comment at `MapView.tsx:488` that explains why the bike line was dashed, since this is the change that earns it a solid line (FR-301, FR-304, FR-310)
- [X] T020 [US1] Wire the hook in `components/PlannerShell.tsx` between the memoized `plan` and the map, passing the settled parameters so nothing fetches while a slider is still moving
- [ ] T021 [US1] Verify by hand against the live service per [quickstart.md](./quickstart.md): a cross-river trip crosses at a bridge, consecutive segments stay separable at their shared station (FR-306), and the anchor markers stay on top of the geometry (FR-304, SC-001)

**Checkpoint**: the map shows a path a rider can follow. Durations are still estimates and nothing yet says which lines are verified.

---

## Phase 4: User Story 2 - Never mistake an approximation for a verified route (Priority: P1)

**Goal**: per-step status that a rider can read at a glance and a screen reader can announce, so a partial success never looks like a full one.

**Independent Test**: force the source to fail for one segment of a three-segment itinerary, and verify the plan is complete and usable, the untraced segment is marked approximate visually and in words, the traced ones are not, and the distinction survives colour removal.

### Tests for User Story 2 ⚠️

- [X] T022 [P] [US2] Extend `tests/unit/i18n-coverage.test.ts` so the new status wording is present in every language and no entry is missing or untranslated
- [X] T023 [P] [US2] Write the trail status tests in `tests/unit/itinerary-trail-status.test.ts`: every one of `pending`, `traced` and `approximate` renders a word, that word is in the accessible name, and no itinerary-wide claim is rendered when statuses are mixed (FR-307, FR-309, FR-311)
- [X] T024 [P] [US2] Assert FR-310 in `tests/unit/map-styling.test.ts`: for both modes, the width used for a traced step is strictly greater than the width used for an approximate one, so a later style tweak cannot silently equalise them

### Implementation for User Story 2

- [X] T025 [P] [US2] Add the status wording to `lib/i18n/messages/` in every language: traced, approximate, pending, and the sentence that says part of this itinerary is an approximation. No string is typed into a component (FR-202, feature 003)
- [X] T026 [US2] Show the per-leg status in `components/ItineraryTrail.tsx`, with the word in the accessible name and not only in the visual treatment (FR-307, FR-308, FR-309). Makes T023 pass
- [X] T027 [US2] Add the BRouter and OpenStreetMap credits to `components/MapAttribution.tsx`, shown only when a traced path is displayed, without duplicating the OpenStreetMap label the map tiles already render (FR-332, SC-011)
- [X] T028 [US2] Write the degradation test in `tests/unit/traced-itinerary-degraded.test.ts`: with every `StepGeometry` forced to `approximate`, the summary, every step, every duration and every failure state still render. This is the automated half of FR-325's "no essential capability depends on a traced path"
- [ ] T029 [US2] Verify the degradation path by hand: block `brouter.de` in devtools and confirm a complete usable plan, every line dashed, every leg saying so in words, no raw error and no blank screen, then repeat in a greyscale render at 360 px width (FR-324, FR-325, SC-003, SC-004)

**Checkpoint**: US1 and US2 together are shippable. A rider is never misled about what has been checked.

---

## Phase 5: User Story 3 - Durations that match the path shown (Priority: P2)

**Goal**: a segment's duration comes from its real path, every figure derived from it follows, and a segment that no longer fits the free window produces a corrected plan rather than a silently false one.

**Independent Test**: with a fixed itinerary and a stubbed path whose length exceeds the estimate, verify the displayed duration comes from the path, that the total and every remaining-time figure follow, and that a segment pushed past the usable budget produces a corrected itinerary rather than being displayed as valid.

### Tests for User Story 3 ⚠️

- [X] T030 [P] [US3] **The case that matters.** Write `tests/unit/route-refinement-correction.test.ts`, importing only from `lib/` and rendering nothing: build a state over a plan whose second segment the estimate put at 2 km, fold in a stubbed `TracedPath` of 4 km through `applyPath`, and assert `nextAction` returns `{kind: "replan"}` carrying a `MeasuredDistance` that reports the measured length for that pair. Then pass that lookup to `planTrip` and assert the corrected itinerary does not use the over-budget edge. Also assert: a measured length that still fits returns no replan; a measured length *shorter* than the estimate returns no replan (FR-320); `nextAction` returns `exhausted` rather than looping once `rounds` reaches `MAX_CORRECTION_ROUNDS` (FR-319)
- [X] T031 [P] [US3] Write the planner tests in `tests/unit/planner-measured.test.ts`: called without the lookup, `planTrip` returns output **identical** to the four-argument form for every existing fixture; with a sparse lookup the measured pairs use the measured distance and every other pair is unchanged
- [X] T032 [P] [US3] Write the over-budget detection tests in `tests/unit/route-geometry-budget.test.ts`: `overBudgetSteps` returns the indices of bike segments whose measured duration exceeds `segmentBudget`, and an empty list when every measured duration fits

### Implementation for User Story 3

- [X] T033 [US3] Add the optional `measured?: MeasuredDistance` fifth argument to `planTrip` in `lib/planner.ts`, substituting the measured distance for `haversine × detourFactor` where the sparse lookup answers. No import added, purity preserved, existing tests untouched. Makes T031 pass
- [X] T034 [P] [US3] Implement `overBudgetSteps` and `durationFromPath` in `lib/route-geometry.ts`, deriving duration from the measured length through the rider's own `cyclingSpeed` and `segmentOverhead` and discarding the source's `total-time` (Principle IV, research R4, FR-313). Makes T032 pass
- [X] T035 [US3] Extend `lib/route-refinement.ts` with the correction decision: `nextAction` returns `replan` with a `MeasuredDistance` when `overBudgetSteps` is non-empty and `rounds < MAX_CORRECTION_ROUNDS`, `exhausted` at the cap, and `beginCorrection` carries measurements into the next round. Still pure, still synchronous. Makes T030 pass (FR-315, FR-316, FR-318, FR-319)
- [X] T036 [US3] Apply refined durations through the state machine so the total, the remaining free time at each step and every gauge recompute from measured values as they arrive (FR-314, SC-007)
- [X] T037 [US3] Handle the `replan` and `exhausted` actions in `components/useTracedItinerary.ts` by calling `planTrip` with the returned lookup and `beginCorrection`. The hook decides nothing; it dispatches on `NextAction.kind`. Never display the invalidated plan as valid in the interval (FR-317)
- [X] T038 [P] [US3] Add the correction wording to `lib/i18n/messages/` in every language: the plan was corrected and why, and the statement made when the cap is reached with at least one concrete adjustment (FR-319)
- [X] T039 [US3] Show the correction notice in `components/ItineraryTrail.tsx` when `corrections > 0`, without an arrival time and without wording a duration as anything but an estimate (FR-312, FR-316, SC-006)

**Checkpoint**: the free-window promise now holds against real distances, which is the point of the whole feature.

---

## Phase 6: User Story 4 - Walking legs follow real footpaths (Priority: P2)

**Goal**: the walk to the first station follows streets a person on foot can use, with a duration to match.

**Independent Test**: plan a trip whose first walk crosses a closed block, and verify the drawn walk follows a walkable way and that its duration comes from that way.

- [X] T040 [US4] Emit `foot`-profile requests for walk legs from `beginRefinement` in `lib/route-refinement.ts`, keyed on rounded coordinates and reused for the session only, never persisted (FR-302, FR-303, FR-329b)
- [X] T041 [P] [US4] Render traced walks at `{width: 2.5, dash: [1, 0]}` in `components/MapView.tsx`, untraced staying at the current `{width: 2, dash: [1, 2]}` (FR-310)
- [X] T042 [US4] Apply measured walk durations in `lib/route-refinement.ts` and `components/ItineraryTrail.tsx`, keeping walk legs identified as not consuming the free window (FR-019 of feature 001, FR-313 here)
- [ ] T043 [US4] Verify by hand that a walk crossing a closed block or a park with no through path follows a walkable way, and that a walk with no path is marked approximate under the same rules as a bike segment

**Checkpoint**: every leg of the journey is drawn as it is actually travelled.

---

## Phase 7: User Story 5 - The plan appears immediately and sharpens afterwards (Priority: P2)

**Goal**: the answer is readable before any network round trip, and refinement never moves the map or the reader's place.

**Independent Test**: delay every path response by several seconds, request a plan, and verify the full itinerary is displayed and usable before the first response arrives, then that refinements land without moving the map or the reading position.

- [X] T044 [P] [US5] Write the sequence tests in `tests/unit/route-refinement-sequence.test.ts`, importing only from `lib/`: `beginRefinement` yields a complete `TracedItinerary` with every step `pending` and performs no I/O; results fold in one at a time and independently of each other; a result whose request is not in `outstanding` is discarded rather than applied (FR-321, FR-322, FR-327)
- [X] T045 [US5] Abort in-flight requests on supersession in `components/useTracedItinerary.ts`, passing the plan's `AbortSignal` through `fetchPath` and discarding late results whose plan is no longer current (FR-327). **Amended 2026-07-28**: an aborted request must also leave the in-flight table in `lib/routing.ts`, or a later plan asking for the same geometry joins a promise that is already dead and is told there is no path. That is the defect that made only the second half of a trip with a stop resolve; `tests/unit/routing-abort.test.ts` covers it (FR-327a)
- [ ] T046 [US5] Verify the camera and the reading position are preserved across every arrival, at 360 px and at desktop width, with the panel scrolled mid-itinerary (FR-323, SC-010)
- [ ] T047 [US5] Verify under a throttled connection that the plan is complete and readable before the first path resolves, and that no spinner gates it (FR-321, SC-002)
- [ ] T048 [US5] Measure time-to-settled for a two-stop itinerary on a throttled mobile profile with a cold cache, and record it against the 5-second budget. If it does not hold, raise it here rather than leaving the criterion unmet (SC-009)

**Checkpoint**: accuracy has cost the product none of its responsiveness.

---

## Phase 8: User Story 7 - Stops chosen along the route you will actually ride (Priority: P2)

**Goal**: one route through the corridor the rider will actually ride, and the stops chosen along it, so US3's correction becomes the exception rather than the routine.

**Independent Test**: with a frozen station snapshot and the recorded corridor in `tests/fixtures/brouter-corridor.json`, verify that along-route distances are supplied for every station pair near the line, that the recomputed plan uses them, and that the plan is unchanged when the geometry is unavailable. No network, no React.

**⚠️ Task numbering**: these tasks sit before Phase 9 in execution order but carry higher IDs, because T001 through T062 are shipped and referenced by name in this file, in commit messages and in source comments. Renumbering delivered work to preserve a numeric ordering would break every one of those references to fix nothing.

**Test order**: T066, T067, T068, T070 and T075 are all written before the implementation they cover. T075 in particular precedes T071, because it is the test that justifies a design decision already argued for in writing, and those are the tests most easily written to pass.

**⚠️ The mistake this phase invites**: computing the corridor inside `useTracedItinerary.ts` because the geometry arrives there. The projection, the access cost and the clamp are arithmetic; they belong in a pure module for the same reason the correction decision does. The hook gains no new branch beyond dispatching on `NextAction.kind`.

- [X] T063 [US7] Capture the corridor fixture `tests/fixtures/brouter-corridor.json` with the curl command in [quickstart.md](./quickstart.md): the westmost to the eastmost station of the frozen snapshot, 11 220 m over 645 points. **Already done during planning**; verify it is committed and parses through `parseRoutePayload` before relying on it
- [ ] T064 [P] [US7] Add `CORRIDOR_BAND` (150 m) and `CORRIDOR_ACCESS_FACTOR` (2) to `lib/endpoints.ts`, each carrying the measurement that produced it as its comment per the table in [data-model.md](./data-model.md): 23 stations inside the band on the committed corridor yielding 253 pairs from one request, itself a floor since the snapshot is trimmed (research R13), and the offset paid twice for leaving the corridor and rejoining it (FR-340)
- [ ] T065 [P] [US7] Add `Corridor` and `CorridorStation` to `lib/types.ts` per [data-model.md](./data-model.md), and extend `NextAction` with `{ kind: "corridor"; request: RoutingRequest }` and the `replan` variant's `reason` with `"corridor"`. Extend `RefinementState` with the corridor phase and the corridor lookup. Pure data only
- [ ] T066 [P] [US7] Write the projection tests in `tests/unit/route-corridor-projection.test.ts` against `brouter-corridor.json`: `cumulative.length === coordinates.length`, `cumulative` non-decreasing and ending at `path.length` within rounding, a station projected onto a vertex, a station projected onto the interior of a segment, a station beyond either end clamped to that end, and every returned `CorridorStation` inside `CORRIDOR_BAND` (FR-339, FR-341, data-model invariants 1 and 2)
- [ ] T067 [P] [US7] Write the distance tests in `tests/unit/route-corridor-distances.test.ts`: the along-route distance between two located stations equals the difference of their `along` values plus each offset counted twice; a pair in which one station is outside the band returns `undefined` rather than a guess; a reversed pair returns the same figure, since the lookup is by station id and the corridor was computed one way; the same corridor and stations produce the same lookup twice (FR-339, FR-340, FR-341)
- [ ] T068 [P] [US7] Write the clamp tests in `tests/unit/route-corridor-clamp.test.ts`: where the along-route figure exceeds `haversine x detourFactor` it is returned; where it falls below, the estimate is returned unchanged; and the measured 21% underestimate of research R14 is reproduced as a case, asserting the clamp returns the estimate. This is the test that stands between the corridor and an optimistic free-window promise (FR-346, Principle IV)
- [ ] T069 [US7] Implement `lib/route-corridor.ts` per [contracts/core-modules.md](./contracts/core-modules.md): `toCorridor`, `locateStations`, `corridorDistances`, `clampToEstimate`. Pure, synchronous, total. Precompute `cumulative` once and prefilter stations by the corridor's bounding box expanded by `CORRIDOR_BAND` before projecting, so hundreds of stations against hundreds of vertices stays linear rather than becoming the accidental cubic this shape invites. Makes T066, T067 and T068 pass
- [ ] T070 [US7] Write the corridor round tests in `tests/unit/route-refinement-corridor.test.ts`, importing only from `lib/`: `nextAction` asks for the corridor before any per-step fetch and only when the plan has at least one `dock` step, since a plan with no stop has no stop to choose; the corridor request is issued at most once per user request even across replans; a `null` corridor answer leaves the estimated plan intact and moves straight to per-step fetches (FR-345, SC-016); a corridor answer produces `{ kind: "replan", reason: "corridor" }` whose `measured` lookup answers for pairs near the line and `undefined` elsewhere (FR-342); and a directly traced measurement takes precedence over the corridor figure for the same pair
- [ ] T071 [US7] Implement the corridor round in `lib/route-refinement.ts`: `beginRefinement` sets the corridor request from the plan's first pickup and last drop-off station; `nextAction` returns it before `fetch`; `applyPath` recognises the corridor answer by its key and folds `corridorDistances` into the state as a lookup consulted only where a direct measurement is absent; `beginCorrection` takes the replan reason and increments `corrections` and `rounds` for `"over-budget"` only, carrying the corridor phase forward so the request cannot repeat (FR-338, FR-342, FR-344, data-model invariant 5). Makes T070 pass
- [ ] T072 [US7] Dispatch the new action in `components/useTracedItinerary.ts`: `corridor` fetches through the existing `fetchPath` and folds the answer back through `applyPath` exactly as a step answer does, and the existing `replan` branch passes `action.reason` to `beginCorrection`. No new decision, no new branch beyond the `kind` switch; if this file grows a rule, it belongs in T071 instead
- [ ] T073 [US7] Confirm in `lib/routing.ts` that a corridor request needs no new function: it is a station-pair `bike` request, so it is already cached, persisted, plausibility-checked and counted against `MAX_REQUESTS_PER_USER_REQUEST` (FR-330a). Add only what measurement shows is missing, and record in the module comment that the corridor deliberately reuses the step path rather than growing a second one
- [ ] T074 [US7] Extend `tests/unit/routing-boundaries.test.ts` so `lib/route-corridor.ts` may import neither `routing.ts` nor `path-store.ts` nor `planner.ts`, and contains no `fetch` (data-model invariant 4). Add it to the guard by name, as `SearchField.tsx` is, rather than by a pattern that would quietly admit the next module
- [ ] T075 [US7] Write the fallback test in `tests/unit/route-refinement-corridor.test.ts`: a corridor whose own stations admit no segmentation inside the free window still yields a plan, built by the same graph search from stations away from the corridor, and a corridor that improves nothing leaves the estimated plan standing rather than producing a planning failure (FR-343, US7 acceptance scenario 6). **This is the test that justifies keeping the graph search** instead of the route-first design considered and rejected in [plan.md](./plan.md) Complexity Tracking. Without it that rejection is an assertion in a document. Write it before T071, not after: a test that justifies a decision already implemented gets written to pass
- [ ] T076 [US7] Verify by hand a trip long enough to need a stop and crossing a river or a rail cut: the estimated plan appears immediately, the stops may then move as the corridor lands, and the trail does **not** say the plan was corrected (FR-344, FR-345). Then block `brouter.de` and confirm the estimated plan is produced, displayed and usable unchanged (FR-325, SC-016)
- [ ] T077 [US7] Verify SC-014 by counting, through `corridorDistances` itself, the station pairs the committed corridor yields against the committed station snapshot. Research R13 predicts **23 stations and 253 pairs at a 150 m band**, measured independently of the implementation; if `corridorDistances` disagrees, one of the two is wrong and the discrepancy is the finding. Both are floors, since the snapshot is trimmed. If the count falls below fifty, `CORRIDOR_BAND` is wrong and its comment must be corrected rather than the criterion quietly dropped (SC-014)
- [ ] T078 [US7] Verify SC-015 on a fixed set of trips: record the share of plans whose refined durations push a segment over budget with the corridor round enabled and disabled, holding any calibrated value constant so the improvement is attributable to the corridor and not to US6. Record both figures here. This is the number that says whether US7 earned its request

**Checkpoint**: the stops a rider is given are chosen from the corridor they will ride, and the correction of US3 has become the exception it was meant to be.

---

## Phase 9: User Story 6 - Estimates that learn from reality (Priority: P3)

**Goal**: the gap between the straight-line estimate and the measured path stops being repeated, so fewer plans need correcting at all.

**⚠️ BLOCKED**: FR-335 is unresolved — whether the detour factor moves automatically or the move is proposed. Do not start this phase until it is settled. Nothing in US1 through US5 depends on it. The recommendation is recorded in [research.md](./research.md) R11: apply automatically in the conservative direction only, propose the optimistic one.

- [ ] T049 [P] [US6] Write the calibration tests in `tests/unit/detour-calibration.test.ts`: a sequence of observations moves the value toward the observed ratio, the value never leaves its plausible bounds, and calibration never makes the estimate more optimistic than the documented default without observations to support it (FR-337)
- [ ] T050 [US6] Implement the pure calibration function in `lib/route-geometry.ts`, recording the ratio between estimated and measured geometry per segment (FR-334). Makes T049 pass
- [ ] T051 [US6] Persist observations and apply the calibrated value in `lib/path-store.ts` and `lib/route-refinement.ts` per the resolution of FR-335
- [ ] T052 [P] [US6] Show the calibrated value in `components/AssumptionsLine.tsx` as visible, adjustable, identified as adjusted from observation, and restorable to its documented default, with wording in `lib/i18n/messages/` (FR-336, SC-012)

**Checkpoint**: all seven stories independently functional.

---

## Phase 10: Polish & Cross-Cutting Concerns

- [X] T053 [P] Add the purge control to `components/AssumptionsLine.tsx` in the advanced section, labelled with `storedPathCount()`, calling `purgeStoredPaths()` and `clearRoutingCache()`, with wording in `lib/i18n/messages/` (FR-329a)
- [X] T054 [P] Disclose that requesting a path sends a step's endpoints to a third party (FR-333), in the panel footer beside the attribution, with wording in `lib/i18n/messages/`
- [X] T055 [P] Do not reuse a stored path for a station pair whose stations have left the snapshot or moved, in `lib/routing.ts` (FR-329c)
- [X] T056 [P] Update `README.md` with the routing source, its keyless and cost-free status, the optional build-time override and its build-time-only nature, and contact details so the operator can reach the project (research R7, FR-331)
- [X] T057 Run `npm test` and `npm run lint`, both clean
- [X] T058 Run `npm run build` and confirm it still produces a working static export with no server-side execution (Principle I)
- [ ] T059 Verify from a clean clone that `npm install && npm run dev` works with zero environment variables and zero accounts (Principle II, FR-331)
- [X] T060 Verify no screen displays a to-the-minute arrival time and every duration reads as an estimate (Principle IV, FR-312, SC-013)
- [ ] T061 Verify request discipline in the Network tab: at most one request per distinct displayed step per plan, no more than `MAX_REQUESTS_PER_USER_REQUEST` across a full correction sequence, none on hover, keystroke, pan or zoom, none for a candidate station, and zero repeat requests for station-to-station geometry after a reload (FR-328, FR-330, FR-330a, SC-005, SC-008)
- [ ] T062 Run the full [quickstart.md](./quickstart.md) validation walkthrough

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: no dependencies, starts immediately
- **Foundational (Phase 2)**: depends on Setup, **blocks every user story**
- **US1 (Phase 3)**: depends on Foundational
- **US2 (Phase 4)**: depends on Foundational; reads the status field US1 populates, separately testable against a stubbed status
- **US3 (Phase 5)**: depends on Foundational and on US1 producing paths
- **US4 (Phase 6)**: depends on Foundational; reuses the US1 adapter and the US2 status treatment
- **US5 (Phase 7)**: hardens what US1 built; T044 is testable the moment T014 exists
- **US7 (Phase 8)**: depends on Foundational and on US3, whose `measured` parameter and replan round it reuses wholesale. `lib/route-corridor.ts` (T069) is testable against the fixture the moment T064 and T065 land, with nothing else in place
- **US6 (Phase 9)**: depends on US3 producing measured gaps, and on FR-335 being resolved. US7 makes it less urgent rather than blocking it: a corridor gives real distances for the pairs that matter, which is most of what calibrating the detour factor was meant to buy
- **Polish (Phase 10)**: depends on the stories being delivered

### Within Each User Story

- Tests are written first and fail before the implementation lands
- Pure modules before the hook that calls them
- The hook before the components that read it
- Wording lands with the component that shows it, never inline

### Parallel Opportunities

- T002, T003, T004 in Setup
- T006, T007, T008, T010, T013 in Foundational, all different test files
- T022, T023, T024, T025 in US2
- T030, T031, T032 in US3, and T034 alongside T033
- T041 alongside T040 in US4
- T064, T065 in US7, then T066, T067, T068 as three independent test files
- T053 through T056 in Polish
- With more than one person: US2, US3 and US4 can proceed in parallel once Foundational lands

---

## Parallel Example: Phase 2 Foundational

```bash
# Five independent test files, written before their modules exist:
Task: "Parser tests in tests/unit/route-geometry-parse.test.ts"
Task: "Plausibility tests in tests/unit/route-geometry-plausibility.test.ts"
Task: "Key tests in tests/unit/route-geometry-key.test.ts"
Task: "Store tests in tests/unit/path-store.test.ts"
Task: "State machine tests in tests/unit/route-refinement.test.ts"
```

## Parallel Example: User Story 3

```bash
Task: "Correction case in tests/unit/route-refinement-correction.test.ts"
Task: "Planner measured-distance tests in tests/unit/planner-measured.test.ts"
Task: "Over-budget detection tests in tests/unit/route-geometry-budget.test.ts"
```

## Parallel Example: User Story 7

```bash
# Three independent test files over one pure module, all against the committed corridor:
Task: "Projection tests in tests/unit/route-corridor-projection.test.ts"
Task: "Distance tests in tests/unit/route-corridor-distances.test.ts"
Task: "Clamp tests in tests/unit/route-corridor-clamp.test.ts"
```

---

## Implementation Strategy

### MVP (Setup + Foundational + US1 + US2)

US1 alone is not shippable. A map that draws verified paths for some segments and straight lines
for others, with nothing distinguishing them, is a worse product than today's honest dashes: it
invites a rider to trust a line nobody checked. US2 is what makes US1 safe to ship, which is why
both carry P1.

1. Phase 1: Setup
2. Phase 2: Foundational (blocks everything)
3. Phase 3: US1
4. Phase 4: US2
5. **STOP and VALIDATE**: T028 and T029 are the gate. Ship.

### Incremental Delivery

1. Setup + Foundational → geometry can be fetched, parsed and reused, and every rule is pure
2. US1 + US2 → paths a rider can follow, honestly labelled → **ship**
3. US3 → durations and the free-window promise hold against real distances → ship
4. US4 → walks follow real footpaths → ship
5. US5 → responsiveness hardened under a slow network → ship
6. US7 → stops chosen along the real corridor, so US3's correction becomes rare → ship
7. US6 → estimates improve with use, once FR-335 is answered

### Where US7 sits

US7 is the only story that changes which stops a rider is given, and it is deliberately last of the
shippable set. It rests on US3's `measured` parameter and replan round, which is why it costs one
pure module and one extra round rather than a planner rewrite. It is worth doing after US1 through
US5 have shipped and not before: without US2's status treatment, stops that move a moment after the
plan appears would read as instability rather than as refinement.

---

## Notes

- [P] means different files with no dependency on incomplete work
- Every constant lands with the reasoning that produced it, in the manner `lib/params.ts`
  established: a default nobody can justify is a guess wearing a number
- No test performs network I/O, and no test of the correction logic may require React or jsdom;
  T015 enforces both
- Commit per task or per logical group
- The six prohibitions in [contracts/core-modules.md](./contracts/core-modules.md) are each backed
  by a test, because each is the kind of thing that erodes quietly

**Total**: 78 tasks. Setup 4, Foundational 11, US1 6, US2 8, US3 10, US4 4, US5 5, US7 16, US6 4,
Polish 10.

US7 was added on 2026-07-28, after US1 through US5 shipped. Its tasks are T063 through T078, and
they sit in Phase 8 rather than at the end because US7 is P2 and US6 is P3. Task IDs were not
renumbered: T001 through T062 are delivered and are referenced by number in this file, in commit
messages and in source comments.

Amended 2026-07-28 after `/speckit.analyze`: T075 added for FR-343, whose acceptance scenario had no
task, and T004, T007 and T045 amended to name FR-326a, FR-326b and FR-327a. Those three requirements
were added to the spec during implementation, after the plausibility and abort-race defects were
found, and their tasks had been left describing the design that preceded them.
