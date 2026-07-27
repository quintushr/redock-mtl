---

description: "Task list for Result-First Planner Panel"
---

# Tasks: Result-First Planner Panel

**Input**: Design documents from `/specs/002-refonte-affichage-resultat/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/ui-contracts.md](./contracts/ui-contracts.md), [quickstart.md](./quickstart.md)

**Tests**: Unit tests for the pure domain modules are REQUIRED by Constitution Principle III and by the feature brief, and MUST ship in the same change as the module. Component tests are included because the spec's accessibility and wording requirements (FR-112, FR-109, FR-138) are otherwise unverifiable. Layout and camera behaviour are NOT unit testable under jsdom and are verified by hand in Phase 7 (research R6).

**Organization**: Tasks are grouped by user story. Phase 2 carries the shell because every story renders inside it.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1, US2, US3, US4)
- Include exact file paths in descriptions

## Path Conventions

The template's `lib/core/` and `lib/gbfs/` split does not exist in this repository. The real layout,
recorded in plan.md, is flat and is what these tasks use. Moving files to match the template would
mean touching modules the brief forbids.

- **UI components**: `components/`
- **Routes and global styles**: `app/`
- **Pure domain modules**: `lib/*.ts` (no network, no DOM, no global state)
- **Tests and fixtures**: `tests/unit/`, `tests/fixtures/`
- No backend directory exists and none may be added (Constitution Principle I)

---

## Phase 1: Setup

**Purpose**: Confirm the tree actually contains what every later task modifies.

- [ ] T001 Verify this branch contains the feature 001 implementation: `components/`, `lib/`, `tests/` and `docs/ui-guidelines.md` all exist, and `package.json` carries `maplibre-gl` and `vitest`. If any is absent, STOP: the branch was cut from `main` and needs `001-free-window-trip-planner` merged or rebased in first (research R8). This is the user's call, not a task to perform unilaterally.
- [ ] T002 Establish a green baseline before changing anything: `npm install && npm test && npm run lint && npm run build`. Record which tests pass, so a later failure is attributable.

**Checkpoint**: The tree builds, the suite is green, and the starting point is known.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The shell every story renders inside. Delivers FR-139 to FR-146 and the content order of FR-101 and FR-102, which is the reported defect. Also satisfies User Story 1 acceptance scenarios 6 to 9.

**CRITICAL**: No story phase can begin until this is complete.

- [ ] T003 [P] Add the colour tokens and the two typographic roles from `docs/ui-guidelines.md` to `app/globals.css`: `--brand`, `--brand-soft`, `--brand-deep`, `--ink`, `--paper`, `--panel`, `--line`, `--muted`, `--ok`, `--warn`, plus the grotesque body family and the monospace family for durations and figures. Weights 400 and 500 only.
- [ ] T004 Create `components/PlannerPanel.tsx`: one component holding the whole interface, anchored to the bottom below 1024 px with two rest positions (collapsed on the summary, expanded on the full trail) capped at 65dvh, and anchored left at a fixed width at 1024 px and above. `dvh` throughout, never `vh`. Rest position is local state; no third-party sheet or gesture library (FR-140, FR-141, FR-142, FR-143, FR-144).
- [ ] T005 Restructure `components/PlannerShell.tsx`: `MapView` becomes a full-frame layer mounted once at a stable tree position, with `PlannerPanel` overlaying it. Content order inside the panel: endpoint entry, feed notice, result region, assumptions (FR-101, FR-102, FR-139, FR-145).
- [ ] T006 Remove the `h1` and the description paragraph from `components/PlannerShell.tsx`. They are removed, not shrunk (FR-146).
- [ ] T007 Remove the `scrollIntoView` call in `arm()` in `components/PlannerShell.tsx`. The map now sits behind the panel rather than above it, so scrolling to it fights the new layout.
- [ ] T008 Verify in `components/PlannerShell.tsx` that `MapView` is not rendered under any conditionally rendered node. A remount rebuilds the MapLibre instance at the default camera and silently breaks FR-123, FR-124 and FR-145 (research R5). Keep the existing `focus` prop with its incrementing `id` as the only way the camera moves.

**Checkpoint**: The map fills the frame, one panel overlays it, no setting appears above the result, and `npm test` is still green because no domain type has changed yet.

---

## Phase 3: User Story 1 - Read the answer without hunting for it (Priority: P1) 🎯 MVP

**Goal**: The summary and the whole itinerary are the first thing on screen, as one continuous list.

**Independent Test**: Set two endpoints producing a two-stop itinerary, load at 700 px tall, and confirm the summary and every step are readable without scrolling with no planning control above them.

### Implementation for User Story 1

- [ ] T009 [P] [US1] Create `components/TripSummary.tsx`: estimated total duration, number of anchor stops, and the cost of the planned trip. Says the trip is already free when `stopCount` is 0 rather than reporting a zero. Durations worded as estimates, no clock time (FR-105, FR-113, FR-138).
- [ ] T010 [US1] Create `components/ItineraryTrail.tsx`: one continuous top-to-bottom list where anchor stops sit at the same rank as the start and the destination, each distinguishable by more than its position, each naming its station. Exhaustive switch on `step.kind` so a new step type is a compile error rather than a dropped row (FR-116, FR-117, FR-118, FR-119).
- [ ] T011 [US1] In `components/ItineraryTrail.tsx`, have walking legs and docking waits state plainly that they do not spend the free window, and carry no gauge (FR-114).
- [ ] T012 [US1] Wire `TripSummary` and `ItineraryTrail` into `components/PlannerShell.tsx`. The empty state invites setting both endpoints rather than reporting an absence; the failure state keeps its cause and its concrete suggestions in the result region with the assumptions still below it (FR-106, FR-107).
- [ ] T013 [US1] Delete `components/ItineraryList.tsx`, `components/SegmentBudget.tsx` and `tests/unit/segment-budget.test.tsx` in the same change that introduces their replacements, so no old display component sits beside the new one (FR-137).
- [ ] T014 [P] [US1] Create `tests/unit/itinerary-trail.test.tsx`: the list is continuous and names its stations, anchor stops are ranked as steps, walk legs say they do not use the free window, docking waits say they reset it, no clock time appears (`not.toMatch(/\b\d{1,2}:\d{2}\b/)`, SC-010), and no planning control precedes the result in DOM order (SC-002).

**Checkpoint**: The answer is readable first, as one list. `budgetShare` and `budgetStatus` still exist in `lib/types.ts` but nothing reads them; Phase 4 removes them.

---

## Phase 4: User Story 2 - See how much free time is left at each step (Priority: P1)

**Goal**: Every ride step reports the free time remaining on arrival, behind a proportional gauge. Nothing anywhere reports time consumed.

**Independent Test**: With a frozen snapshot and fixed parameters, produce an itinerary and verify each free-window-consuming step reports remaining time, that no step reports consumed time or a percentage, and that the gauge fill is proportional to what remains.

### Tests for User Story 2 (REQUIRED, write first and confirm they FAIL)

- [ ] T015 [P] [US2] Create `tests/unit/remaining.test.ts` covering the seven invariants in [contracts/ui-contracts.md](./contracts/ui-contracts.md) Part 1: full budget at zero duration, never negative, never above the budget, falls when the safety margin rises, exact band boundaries at 15 and 5 minutes, `gaugeFraction` monotonic and never `NaN` when `freeWindow === safetyMargin`, and remaining measured against the full budget at every segment rather than accumulating across stops.

### Implementation for User Story 2

- [ ] T016 [US2] Create `lib/remaining.ts` exporting `COMFORTABLE_ABOVE`, `ALARMING_BELOW`, `remainingAfter`, `remainingStatus`, `gaugeFraction` and `remainingLabel`. Pure: no network, no DOM, no global state. This is the single source of the thresholds, as `lib/budget.ts` was for the old bands (FR-115).
- [ ] T017 [US2] In `lib/types.ts`, replace `BudgetStatus` with `RemainingStatus` (`comfortable` | `neutral` | `alarming`), and change `BikeSegment` to drop `budgetShare` and `budgetStatus` and carry `remaining: Seconds` and `remainingStatus: RemainingStatus`.
- [ ] T018 [US2] In `lib/planner.ts`, change `buildItinerary` only, to populate `remaining` and `remainingStatus` from `lib/remaining.ts`. The pruning, graph construction, Dijkstra, binary heap and every failure path stay untouched (FR-136).
- [ ] T019 [US2] Delete `lib/budget.ts` and `tests/unit/budget.test.ts`. It computes consumed share, which FR-109 forbids displaying, and it feeds no routing decision (research R1).
- [ ] T020 [US2] Rename the two removed fields in the fixture literals of `tests/unit/planner-*.test.ts`. If any test needs more than a field rename, STOP and review: the change has reached further than intended, and the route assertions must come through untouched.
- [ ] T021 [P] [US2] Create `components/RemainingGauge.tsx`: horizontal fill from `gaugeFraction()`, three states, the figure always rendered as text, the accessible name carrying both the remaining duration and the non-numeric label from `remainingLabel()`, three distinguishable accessible names, and a fill that stays visible at fraction 0 so an empty gauge does not read as a rendering bug (FR-110, FR-111, FR-112).
- [ ] T022 [US2] Render `RemainingGauge` on each bike step in `components/ItineraryTrail.tsx`, reading `remaining`, `remainingStatus` and `gaugeFraction()` from props. No component recomputes any of them (FR-108, FR-115).
- [ ] T023 [US2] Extend `tests/unit/itinerary-trail.test.tsx`: every bike step reports remaining time, zero steps report consumed time or a consumed percentage (SC-005), and the three states produce three distinguishable accessible names.
- [ ] T024 [US2] Sweep for dead references: `grep -rn "budgetShare\|budgetStatus\|BudgetStatus\|budgetLabel\|SegmentBudget\|ItineraryList" app components lib tests docs` must return nothing.

**Checkpoint**: Remaining time is domain-computed, tested, and displayed. Nothing shows consumed time.

---

## Phase 5: User Story 3 - Change the safety margin without losing your place (Priority: P2)

**Goal**: The assumptions rest as one line below the result, open to the safety margin alone, and never move the reading position or the map.

**Independent Test**: Open the assumptions, change the safety margin, and confirm the itinerary recomputes while scroll position, map centre and map zoom are unchanged.

### Implementation for User Story 3

- [ ] T025 [P] [US3] Create `components/AssumptionsLine.tsx`: at rest exactly one line, placed after the itinerary, stating whether the parameters are at their defaults or have been changed (FR-103, FR-125).
- [ ] T026 [US3] In `components/AssumptionsLine.tsx`, present the safety margin as the only first-level control, with every other parameter inside a group closed by default and opened explicitly. Drive that group from the parameter list rather than a hardcoded set, so a parameter added later (T032's `overageRate`) appears without editing this component (FR-120, FR-121).
- [ ] T027 [US3] Add a single action restoring every assumption to its default, and keep the `validateParameters` correction message so an unusable value is explained with a usable one offered rather than producing an empty result (FR-126, FR-127).
- [ ] T028 [US3] Replace `ParameterPanel` with `AssumptionsLine` in `components/PlannerShell.tsx` and delete `components/ParameterPanel.tsx` in the same change (FR-137).
- [ ] T029 [US3] Confirm the panel's scroll container is a stable node that opening the assumptions expands rather than replaces, and that neither opening the assumptions nor changing a value touches the map camera (FR-122, FR-123, FR-124). Verified by hand per quickstart section 3; jsdom cannot prove it.
- [ ] T030 [P] [US3] Create `tests/unit/assumptions-line.test.tsx`: the closed state renders one line and says whether the defaults are in force, the safety margin is the only first-level control, the nested group is closed by default, opening it exposes every remaining parameter, and reset restores all defaults.

**Checkpoint**: The assumptions are one line at rest, one control when opened, and cost nothing to open.

---

## Phase 6: User Story 4 - Judge whether the stops are worth it (Priority: P3)

**Goal**: One action shows the same ride without stops, its price, and what the stops actually buy.

**Independent Test**: With an itinerary containing at least one anchor stop, trigger the comparison and confirm it reports the no-stop duration, the amount billed, and the time saved or lost.

### Tests for User Story 4 (REQUIRED, write first and confirm they FAIL)

- [ ] T031 [P] [US4] Create `tests/unit/pricing.test.ts` covering the eight invariants in [contracts/ui-contracts.md](./contracts/ui-contracts.md) Part 1, in particular: cost is zero at or below `freeWindow`, cost is measured against `freeWindow` and never against `segmentBudget` (charging our own safety margin would invent a fee), `noStopRide` returns null for a walk-only itinerary, it uses the first bike step's origin and the last bike step's destination on a three-segment itinerary, and `duration` includes `segmentOverhead` exactly once.

### Implementation for User Story 4

- [ ] T032 [US4] In `lib/params.ts`, add `overageRate` to `PlanningParameters` with the default `0.19` CAD per minute before taxes, documented with its source and read date exactly as the other defaults are (verified 2026-07-27 at <https://bixi.com/fr/tarifs/>, research R3). Add its validation to `validateParameters`: negative is corrected to 0, zero is legal.
- [ ] T033 [US4] Create `lib/pricing.ts` exporting `overageCost` and `noStopRide`, pure, built from the plan's own first and last bike steps using the same `lib/geo.ts` helpers the planner uses, so the two are costed identically (FR-128a, FR-128b, FR-131, FR-132).
- [ ] T034 [US4] Add `NoStopRide` to `lib/types.ts` with the fields in [data-model.md](./data-model.md) section 4, including the signed `deltaAgainstPlan`.
- [ ] T035 [P] [US4] Create `components/NoStopComparison.tsx`: the no-stop duration, the amount, and the time saved or lost against the plan. The amount is worded as an estimate, states that it is before taxes, and states the rate it rests on (FR-129, FR-129a, FR-130).
- [ ] T036 [US4] Make the comparison reachable in a single action from the trail, and make dismissing it return the trail unchanged with the map centre and zoom untouched throughout (FR-128, FR-134, SC-007).
- [ ] T037 [US4] Wire the comparison into the existing 150 ms parameter debounce in `components/PlannerShell.tsx` so it recomputes live and stays open across a parameter change, never showing an amount from superseded assumptions and never closing itself under the user's finger (FR-135).
- [ ] T038 [US4] Handle the walk-only plan in `components/NoStopComparison.tsx`: say plainly there is no ride to compare instead of showing an amount, and do not let the comparison survive as an orphan when a parameter change makes the plan fail (FR-132).
- [ ] T039 [US4] Have `components/TripSummary.tsx` show the trip cost now that pricing exists, and keep saying the trip is already free when it needs no stop (FR-105).
- [ ] T040 [P] [US4] Create `tests/unit/no-stop-comparison.test.tsx`: reachable in one action, reports duration and amount and delta, states the pre-tax assumption, and renders the no-ride-to-compare case for a walk-only plan.

**Checkpoint**: All four stories work. The product can now argue its own value.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: The checks that only make sense once everything is in place, including every criterion jsdom cannot prove.

- [ ] T041 [P] Verify `npm run build` still produces a working static export, and that `MapView` is still excluded from prerender.
- [ ] T042 [P] Verify the app runs after a clean clone with zero environment variables and zero accounts (Constitution Principles I and II).
- [ ] T043 Run the manual pass in [quickstart.md](./quickstart.md) section 3: layout at 1280×700 and 360×700 (SC-001, SC-011, SC-012), camera and reading position across parameter changes (SC-004), gauge rankability in greyscale and under a screen reader (SC-006), keyboard navigation and WCAG AA contrast (SC-009), and every spec edge case.
- [ ] T044 Run the "Interdits" checklist from `docs/ui-guidelines.md`, per [quickstart.md](./quickstart.md) section 4. The last item, no display of time consumed rather than time remaining, is the whole point of the feature: check it last and hardest.
- [ ] T045 [P] Confirm no to-the-minute arrival time appears anywhere and that every duration is worded as an estimate (SC-010, Constitution Principle IV).
- [ ] T046 Final gate: `npm run lint && npm test` green, and the T024 dead-reference sweep still returns nothing.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: T001 gates everything. If the branch lacks the 001 implementation, nothing below can run.
- **Foundational (Phase 2)**: Depends on Phase 1. BLOCKS all stories, because every story renders inside `PlannerPanel`.
- **US1 (Phase 3)**: Depends on Phase 2.
- **US2 (Phase 4)**: Depends on Phase 3. This is a real dependency, not a courtesy: T022 adds the gauge to the `ItineraryTrail` that T010 creates, and T013 must have removed `SegmentBudget` before T017 changes the type it reads.
- **US3 (Phase 5)**: Depends on Phase 2 only. Can run in parallel with Phases 3 and 4 by a second developer; it touches `AssumptionsLine` and `ParameterPanel`, which the result-region work does not.
- **US4 (Phase 6)**: Depends on Phase 4 (it reads the itinerary's bike steps) and on T026 if `overageRate` is to appear in the assumptions group without further edits. Within the phase, T031 is written to fail and T032 must land before `lib/pricing.ts` can compile against it.
- **Polish (Phase 7)**: Depends on every story you intend to ship.

### Within Each Story

- Tests marked "write first" MUST fail before their module exists.
- Domain modules before the components that consume them.
- Each replacement component and the deletion of its predecessor land in the same change (T013, T019, T028).

### Parallel Opportunities

- T003 runs alongside T004, different files.
- T009 and T014 run alongside T010, different files.
- T015 and T021 are independent of each other.
- T025 and T030 are independent.
- T031 is written first and left failing while T032 lands.
- Phase 5 (US3) runs in parallel with Phases 3 and 4 for a second developer.
- T041, T042 and T045 run together.

---

## Parallel Example: User Story 2

```bash
# Write the failing domain test and build the gauge component together:
Task: "Create tests/unit/remaining.test.ts with the seven invariants"       # T015
Task: "Create components/RemainingGauge.tsx"                                 # T021

# Then, strictly in order, because they share lib/types.ts and lib/planner.ts:
# T016 -> T017 -> T018 -> T019 -> T020
```

---

## Implementation Strategy

### MVP (Phases 1 to 3)

1. Phase 1: confirm the branch is usable.
2. Phase 2: shell. This alone fixes the reported defect, the inverted hierarchy.
3. Phase 3: User Story 1. The answer is first and reads as one list.
4. **STOP and VALIDATE** against SC-001, SC-002 and SC-008 before going further.

Shipping here is defensible: the complaint is resolved, and the itinerary still reads correctly.
What it does not yet have is the signature element.

### Incremental delivery

1. Phases 1 to 3 → hierarchy fixed → demo.
2. Phase 4 → remaining time and the gauge → demo. **This is the point of the product**; the
   guidelines call it the one thing nobody else does.
3. Phase 5 → assumptions collapse to one line → demo.
4. Phase 6 → the no-stop comparison → demo.
5. Phase 7 → the manual and "Interdits" passes.

### Two developers

After Phase 2: developer A takes Phases 3 then 4 (result region and domain), developer B takes
Phase 5 (assumptions). They meet before Phase 6, which needs A's work.

---

## Notes

- 46 tasks. US1: 6, US2: 10, US3: 6, US4: 10, shared: 14.
- `[P]` means different files with no incomplete dependency.
- The route search is off limits throughout. `lib/planner.ts` is touched once, inside
  `buildItinerary` only (T018). `lib/geo.ts`, `lib/gbfs.ts`, `lib/feed-client.ts`,
  `lib/geocode.ts`, `lib/endpoints.ts` and all their tests are never touched.
- A green suite does not validate this feature. SC-001, SC-004, SC-006, SC-009, SC-011 and SC-012
  are only provable by hand, in T043 and T044.
- `docs/ui-guidelines.md` wins any interface disagreement with these tasks.
