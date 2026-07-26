---

description: "Task list for Free-Window Trip Planner"
---

# Tasks: Free-Window Trip Planner

**Input**: Design documents from `/specs/001-free-window-trip-planner/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md),
[data-model.md](./data-model.md), [contracts/](./contracts/)

**Tests**: Unit tests for the pure modules under `lib/` are REQUIRED by Constitution Principle III
and ship in the same change as the module. They run against frozen JSON fixtures in
`tests/fixtures/` and never hit the network. Component tests appear only where a requirement is
otherwise untestable, notably FR-018b's assistive-technology obligation.

**Organization**: Tasks are grouped by user story so each story can be implemented and tested
independently.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1, US2, US3, US4)
- Include exact file paths in descriptions

## Path Conventions

- **UI / routes**: `app/`
- **React components**: `components/`
- **Pure domain modules**: `lib/` (no network, no DOM, no global state)
- **Tests and fixtures**: `tests/unit/`, `tests/fixtures/`
- Imports resolve through the existing `@/*` mapping in `tsconfig.json`
- There is no backend directory and none may be added (Constitution Principle I)

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Switch the existing scaffold to static export and stand up the test toolchain

- [ ] T001 Add `output: 'export'` to `next.config.ts`
- [ ] T002 In `package.json`, remove the `start` script (meaningless under static export), add `test` and `test:watch` running Vitest
- [ ] T003 Install the runtime dependency `maplibre-gl@6.0.0` and pin it exactly in `package.json`
- [ ] T004 Install dev dependencies `vitest@4.1.10`, `@vitejs/plugin-react@6.0.4`, `jsdom@29.1.1`, `@testing-library/react@16.3.2`, `@testing-library/dom@10.4.1`, `vite-tsconfig-paths@6.1.1`, pinned exactly
- [ ] T005 Create `vitest.config.mts` with `plugins: [tsconfigPaths(), react()]` and `test.environment: 'jsdom'`, per `node_modules/next/dist/docs/01-app/02-guides/testing/vitest.md`
- [ ] T006 [P] Add an ESLint rule to `eslint.config.mjs` forbidding imports of `react`, `react-dom`, and `@/components/*` from anywhere under `lib/`
- [ ] T007 [P] Replace the create-next-app placeholder in `app/page.tsx` and strip unused boilerplate from `app/globals.css`
- [ ] T008 Verify the toolchain end to end: `npm run build` emits `out/`, `npm test` runs, `npm run lint` passes. Resolve any TypeScript 5 incompatibility with Vitest 4 here and record the resolution in `specs/001-free-window-trip-planner/research.md`

**Checkpoint**: static export builds, tests run, lint enforces the pure/impure boundary

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Data types, feed ingestion, geometry, and the app shell that every user story needs

**CRITICAL**: No user story work can begin until this phase is complete

### Types and constants

- [ ] T009 [P] Define every type from `specs/001-free-window-trip-planner/data-model.md` in `lib/types.ts`: `LatLon`, `Metres`, `Seconds`, `Station`, `StationSnapshot`, `FeedAttribution`, `ServiceArea`, `PlanningParameters`, `WalkLeg`, `BikeSegment`, `BudgetStatus`, `DockingStop`, `ItineraryStep`, `Itinerary`, `PlanningFailure`, `PlanningFailureReason`, `Suggestion`, `PlanResult`, `FeedStatus`
- [ ] T010 Verify against provider documentation, then pin in `lib/endpoints.ts`: the GBFS discovery URL, the Photon instance host and its usage policy, and the OpenFreeMap style URL. Do not write any host from memory (research R7, R8, and `contracts/external-services.md`)

### Fixtures

- [ ] T011 Capture the provider's GBFS feeds into `tests/fixtures/`, trimmed to cover a station with docks but no bikes, a non-operational station, an e-bike-only station, and enough spread to force a multi-segment trip. Record capture date, feed URLs, and license in `tests/fixtures/README.md`
- [ ] T012 While capturing, confirm and record in `specs/001-free-window-trip-planner/research.md`: the vehicle-type field shapes, the value identifying a mechanical bike, whether `ttl` is per-feed or global, and the license text

### Parameters

- [ ] T013 [P] Implement `DEFAULT_PARAMETERS`, `validateParameters`, and `segmentBudget` in `lib/params.ts`, each default carrying a comment stating where the value came from
- [ ] T014 [P] Write `tests/unit/params.test.ts` covering conservative defaults, rejection when `safetyMargin >= freeWindow`, and that `validateParameters` returns a corrected set rather than throwing

### Geometry

- [ ] T015 [P] Implement `haversineMetres`, `cyclingDuration`, and `walkingDuration` in `lib/geo.ts`
- [ ] T016 [P] Write `tests/unit/geo-distance.test.ts` asserting symmetry, zero for identical points, and that `cyclingDuration` never returns less than straight-line distance over speed
- [ ] T017 Implement `convexHull` and `isInsideBufferedHull` in `lib/geo.ts`
- [ ] T018 Write `tests/unit/geo-hull.test.ts` covering zero, one, two, and all-collinear inputs without throwing, plus a point inside the hull and one outside the buffer
- [ ] T019 Implement `withinEllipse` in `lib/geo.ts`
- [ ] T020 Write `tests/unit/geo-ellipse.test.ts` asserting conservativeness: a false negative is a correctness bug, so the test must prove no admissible point is ever excluded

### Feed ingestion

- [ ] T021 Implement `parseStationSnapshot` in `lib/gbfs.ts`, taking `unknown`, validating totally, ignoring unknown fields, dropping stations present in only one feed, and returning a typed failure instead of throwing
- [ ] T022 Write `tests/unit/gbfs-parse.test.ts` covering malformed JSON, an empty feed, missing optional fields, and an out-of-season system, all against fixtures
- [ ] T023 Implement `isOperational`, `canStartSegment`, and `canEndSegment` in `lib/gbfs.ts`
- [ ] T024 Write `tests/unit/gbfs-eligibility.test.ts`, including the case that decides the whole design: a station with free docks but no mechanical bike is usable as an intermediate stop yet not as the first pickup (FR-011, FR-011a)
- [ ] T025 [P] Implement `buildServiceArea` in `lib/gbfs.ts` from operational stations only, so an out-of-season network yields an empty hull
- [ ] T026 Implement `lib/feed-client.ts`: fetch the feeds, merge them through `parseStationSnapshot`, and cache client-side honouring the feed's `ttl`. This is the one impure module in `lib/` and must contain no domain logic

### App shell

- [ ] T027 Update `app/layout.tsx` for the single-route shell and Tailwind entry
- [ ] T028 Create `components/PlannerShell.tsx` as a Client Component owning origin, destination, parameters, plan, and feed status via `useState` and context
- [ ] T029 Create `components/MapView.tsx` instantiating MapLibre inside `useEffect` and holding the instance in a ref so re-renders cannot reset the view. Render OpenStreetMap and OpenFreeMap attribution
- [ ] T030 [P] Create `components/FeedNotice.tsx` rendering the `loading`, `stale`, and `unavailable` states with distinct messages for network, malformed, and out-of-season, and displaying operator attribution, feed license, and snapshot timestamp

**Checkpoint**: station data loads, parses, and displays with attribution; geometry is tested; user story implementation can begin

---

## Phase 3: User Story 1 - Reach a destination without paying overage (Priority: P1) 🎯 MVP

**Goal**: Enter a destination and an origin, receive one itinerary split into segments that each fit the free window, shown on the map and as a step list

**Independent Test**: With a frozen snapshot, request a plan between two points unreachable inside one free window and verify the itinerary is complete end to end and that no bike segment exceeds the free limit minus the safety margin

### Tests for User Story 1 (REQUIRED for lib/ changes) ⚠️

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [ ] T031 [P] [US1] Write `tests/unit/planner-graph.test.ts` asserting that bike edges exist only when segment duration fits the budget, that only the first pickup requires an available bike, and that every segment end has free docks
- [ ] T032 [P] [US1] Write `tests/unit/planner-path.test.ts` asserting the returned itinerary minimizes total duration including walk legs and cooldowns, contains one segment when one suffices, and returns exactly one itinerary
- [ ] T033 [P] [US1] Write `tests/unit/planner-failures.test.ts` making every `PlanningFailureReason` reachable and distinguishable, in particular out-of-coverage versus no-station-in-range, and asserting `suggestions` is never empty
- [ ] T034 [P] [US1] Write `tests/unit/planner-invariants.test.ts` asserting `planTrip` never throws on any fixture, including malformed and empty snapshots

### Implementation for User Story 1

- [ ] T035 [US1] Implement candidate pruning and graph construction in `lib/planner.ts`: partition into can-start and can-end, add virtual source and sink walk edges, and a direct source-to-sink walk edge so FR-032 falls out of the same computation
- [ ] T036 [US1] Implement edge costing in `lib/planner.ts`: duration for bike edges, plus the docking cooldown when the edge ends at an intermediate stop rather than the sink
- [ ] T037 [US1] Implement Dijkstra and path reconstruction into `ItineraryStep[]` in `lib/planner.ts`
- [ ] T038 [US1] Implement failure detection and `Suggestion` generation in `lib/planner.ts`, distinguishing out-of-coverage from no-station-in-range per FR-029a and FR-029b
- [ ] T039 [US1] Expose the single entry point `planTrip` in `lib/planner.ts` and confirm the whole module is pure, with no clock and no network
- [ ] T040 [P] [US1] Implement `components/SearchField.tsx`: debounced Photon queries biased to the service area, superseded requests cancelled, result count capped, explicit message on failure
- [ ] T041 [P] [US1] Implement origin selection in `components/PlannerShell.tsx`: current location read only after mount, manual entry, and map click, with manual and map click fully usable when geolocation is denied
- [ ] T042 [US1] Implement `components/ItineraryList.tsx` as an exhaustive switch over `ItineraryStep['kind']`, rendering walk, bike, and dock steps in order
- [ ] T043 [US1] Render the itinerary on the map in `components/MapView.tsx`: the route line and a marker per docking stop, without resetting the view
- [ ] T044 [US1] Wire `components/PlannerShell.tsx` to call `planTrip` and render either the itinerary or the failure with its suggestions
- [ ] T045 [US1] Display the stop count and total estimated duration in `components/ItineraryList.tsx`, worded as estimates with no to-the-minute arrival time

**Checkpoint**: User Story 1 is fully functional and independently testable. This is the MVP.

---

## Phase 4: User Story 2 - See how much free window each segment burns (Priority: P2)

**Goal**: Every bike segment shows what share of the free window it consumes, and a tight segment is distinguishable at a glance without reading numbers or perceiving colour

**Independent Test**: Render a fixed itinerary with one comfortable and one near-limit segment and verify both encodings are present, that the tight one stands out with colour removed, and that walk legs are excluded from the budget

### Tests for User Story 2 (REQUIRED for lib/ changes) ⚠️

- [ ] T046 [P] [US2] Write `tests/unit/budget.test.ts` asserting `budgetShare` is clamped to `[0, 1]` and that `budgetStatus` thresholds are stable and derived from the same source as the share

### Implementation for User Story 2

- [ ] T047 [US2] Implement `budgetShare` and `budgetStatus` in `lib/budget.ts` as the single source of the thresholds
- [ ] T048 [US2] Implement `components/SegmentBudget.tsx` with three redundant encodings driven by `lib/budget.ts`: proportional fill length, colour band, and a short non-numeric text label
- [ ] T049 [US2] Expose the text label to assistive technology in `components/SegmentBudget.tsx` so budget status is never colour-only (FR-018b)
- [ ] T050 [US2] Present walk legs separately in `components/ItineraryList.tsx`, labelled as not consuming the free window
- [ ] T051 [P] [US2] Write `tests/unit/segment-budget.test.tsx` asserting the accessible text label is present for every segment and that bar length and label cannot disagree

**Checkpoint**: budget consumption is legible numerically, proportionally, and without colour

---

## Phase 5: User Story 3 - Tune the assumptions and watch the plan react (Priority: P2)

**Goal**: Adjusting the free limit, safety margin, cycling speed, or maximum walking distance recomputes the itinerary without losing map position or zoom and without a reload

**Independent Test**: From a computed itinerary, change one parameter and verify the plan updates in place while map centre and zoom are unchanged

### Implementation for User Story 3

- [ ] T052 [US3] Implement `components/ParameterPanel.tsx` exposing the free limit, safety margin, cycling speed, and maximum walking distance, with the conservative defaults from `lib/params.ts`
- [ ] T053 [US3] Debounce continuous controls in `components/ParameterPanel.tsx` so dragging queues no redundant computations and the interface stays responsive (FR-022a)
- [ ] T054 [US3] Recompute on parameter change in `components/PlannerShell.tsx` and confirm `components/MapView.tsx` keeps centre and zoom because the map owns its view state in a ref (FR-026)
- [ ] T055 [US3] Surface rejected or corrected parameter sets from `validateParameters` in `components/ParameterPanel.tsx` with an explanation rather than a silent failure (FR-024)
- [ ] T056 [P] [US3] Write `tests/unit/params-recompute.test.ts` asserting that raising the safety margin never yields a segment longer than the new budget

**Checkpoint**: the plan responds to the user's own assumptions without losing context

---

## Phase 6: User Story 4 - See the network before typing anything (Priority: P3)

**Goal**: Opening the app with no input shows the stations around the current view

**Independent Test**: Open the app without entering anything and verify nearby stations appear

### Implementation for User Story 4

- [ ] T057 [US4] Render station markers for the current map view in `components/MapView.tsx` as soon as the snapshot is ready, before any user input (FR-027)
- [ ] T058 [US4] Set a default network-wide view in `components/PlannerShell.tsx` when geolocation is denied or unavailable, keeping manual entry available (FR-003)
- [ ] T059 [P] [US4] Show availability with its snapshot timestamp on station markers, presented as a snapshot rather than a guarantee (FR-014)

**Checkpoint**: the app is informative before it is asked anything

---

## Phase 7: Polish & Cross-Cutting Concerns

- [ ] T060 [P] Calibrate the detour factor by comparing straight-line against real cycling distance for a sample of Montreal pairs, round upward, and record the sample in a comment beside the constant in `lib/params.ts`
- [ ] T061 Write `tests/unit/planner-benchmark.test.ts` over a full-size fixture asserting SC-012's one-second budget. If it fails, escalate in the order recorded in research R11 and justify the step taken in `specs/001-free-window-trip-planner/plan.md` Complexity Tracking
- [ ] T062 [P] Audit every user-facing duration for FR-020: estimates only, no to-the-minute arrival time anywhere
- [ ] T063 [P] Verify operator attribution, feed license, and OpenStreetMap attribution are visible in the running app
- [ ] T064 Verify `npm run build` produces `out/` and that nothing expects a server at runtime
- [ ] T065 Verify a clean clone with zero environment variables and zero accounts reaches a working plan
- [ ] T066 Verify `npm test` passes with the network disabled
- [ ] T067 [P] Rewrite `README.md`, which is still create-next-app boilerplate recommending Vercel. State the zero-cost, no-key setup and the static hosting target. This clears the one ⚠ item left in the constitution's Sync Impact Report
- [ ] T068 Configure Cloudflare Pages: build command `npm run build`, output directory `out`, no environment variables, no functions, no bindings
- [ ] T069 [P] Run `npm run lint` and confirm the rule forbidding React imports inside `lib/` still holds after all feature work

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: no dependencies, start immediately
- **Foundational (Phase 2)**: depends on Setup. BLOCKS all user stories
- **User Story 1 (Phase 3)**: depends on Foundational. No dependency on other stories
- **User Story 2 (Phase 4)**: depends on Foundational. Needs an itinerary to annotate, so it is best demonstrated after US1, though `lib/budget.ts` and its tests can be built in parallel with US1
- **User Story 3 (Phase 5)**: depends on Foundational. Needs a plan to recompute, so best demonstrated after US1
- **User Story 4 (Phase 6)**: depends on Foundational only. Genuinely independent of US1, US2, and US3, and can be built at any point after Phase 2
- **Polish (Phase 7)**: depends on the desired stories being complete

### Critical path inside Foundational

`T009` (types) blocks almost everything else. `T011` (fixtures) blocks every test task. `T010`
(endpoints) blocks `T026` (feed client). Within geometry, `T015` blocks `T035` in US1 because
segment feasibility depends on `cyclingDuration`.

### Within User Story 1

Tests `T031` to `T034` are written first and must fail. Then `T035` to `T039` build the planner in
order, since each stage feeds the next. `T040` and `T041` are independent of the planner and of
each other. `T042` to `T045` depend on `planTrip` existing.

### Parallel Opportunities

- Setup: `T006` and `T007` in parallel
- Foundational: `T013`/`T014` (params), `T015`/`T016` (distance), and `T025` are independent of one
  another once `T009` lands
- US1: all four test tasks `T031` to `T034` in parallel; `T040` and `T041` in parallel with the
  planner implementation
- US4 can be built by a second contributor in parallel with US1, US2, and US3
- Polish: `T060`, `T062`, `T063`, `T067`, and `T069` are all independent

---

## Parallel Example: User Story 1

```bash
# Write all four planner test files together, before any implementation:
Task: "Write tests/unit/planner-graph.test.ts"
Task: "Write tests/unit/planner-path.test.ts"
Task: "Write tests/unit/planner-failures.test.ts"
Task: "Write tests/unit/planner-invariants.test.ts"

# While one contributor builds the planner, another builds the input layer:
Task: "Implement components/SearchField.tsx"
Task: "Implement origin selection in components/PlannerShell.tsx"
```

---

## Implementation Strategy

### MVP First (User Story 1 only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (blocks everything)
3. Complete Phase 3: User Story 1
4. **STOP and VALIDATE**: plan a real Montreal trip that needs two or more segments, and confirm no
   segment exceeds the budget
5. Deploy if ready. The app is already useful at this point

### Incremental Delivery

1. Setup and Foundational, then the network is visible and parsed
2. Add US1, validate, deploy. This is the MVP
3. Add US2, and the plan becomes judgeable rather than merely correct
4. Add US3, and the plan adapts to riders whose assumptions differ from the defaults
5. Add US4, and the app is informative before it is asked anything

### Notes

- Every task touching `lib/` ships with its tests in the same change (Principle III)
- Verify tests fail before implementing
- `lib/` never imports React; `components/` never exports domain logic
- Commit after each task or logical group
- Stop at any checkpoint to validate a story independently
