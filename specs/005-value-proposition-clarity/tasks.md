---

description: "Task list for 005-value-proposition-clarity"
---

# Tasks: Value Proposition Clarity and Data Control

**Input**: Design documents from `/specs/005-value-proposition-clarity/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/](./contracts/)

**Tests**: Unit tests over pure modules are REQUIRED by Constitution Principle III and MUST ship in the same change as the module. This feature's pure additions are `plannedCost` and `summaryCase` in `lib/pricing.ts`. Component tests are included because the spec states acceptance scenarios that only a rendered summary can satisfy, and because `tests/unit/no-stop-comparison.test.tsx` already asserts the figures this feature moves — those assertions must land somewhere before that file is deleted.

**Organization**: Tasks are grouped by user story so each can be implemented, tested and shipped independently.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1, US2, US3)
- Exact file paths in every description

## Path Conventions

This repository does **not** use the template's `lib/core/`, `lib/gbfs/`, `lib/ui/` split. Pure modules sit flat under `lib/` and the three impure ones declare themselves in their own headers (`lib/feed-client.ts`, `lib/routing.ts`, `lib/path-store.ts`). This is the convention feature 001 established and it is recorded in [plan.md](./plan.md#project-structure).

- **UI components**: `components/`
- **Routes and layout**: `app/`
- **Pure domain modules**: `lib/` (no network, no DOM, no global state)
- **Impure modules**: `lib/feed-client.ts`, `lib/routing.ts`, `lib/path-store.ts`, and the new `lib/params-store.ts`
- **Wording**: `lib/i18n/messages/fr.ts` (reference) and `lib/i18n/messages/en.ts`
- **Tests**: `tests/unit/`
- **Frozen fixtures**: `tests/fixtures/` (committed JSON), reached through `tests/unit/fixture.ts`. Principle III requires domain-module tests to run against these, never against the network
- No backend directory exists and none may be added (Principle I)

---

## Phase 1: Setup

**Purpose**: Establish a green baseline so every later failure is attributable to this feature.

- [X] T001 Confirm the working tree is on `005-value-proposition-clarity` and run `npm test`, `npm run lint` and `npm run build`, recording that all three pass before any edit
- [X] T002 Read `docs/ui-guidelines.md` sections "Ordre imposé du panneau", "États de l'écran" and "Pied de panneau" in full, since three of them are amended by this feature and the amendments must be surgical

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The three new types all land in one file. Front-loading them is the only thing that genuinely blocks the story phases — without this, three parallel stories contend on `lib/types.ts`.

**⚠️ CRITICAL**: Complete before starting any user story phase.

- [X] T003 Add `TripCostComparison`, `SummaryCase` and `RefreshOutcome` to `lib/types.ts` per [data-model.md](./data-model.md) §1, §2 and §3, each with the doc comment stating why it exists, placed beside the existing `NoStopRide` and `FeedStatus` groups respectively

Nothing else is foundational. There is deliberately no schema, no migration, no auth and no environment-variable configuration: all four are forbidden by Principles I and II, and this feature needs none of them.

**Checkpoint**: `lib/types.ts` compiles. The three story phases can now proceed in parallel.

---

## Phase 3: User Story 1 - The saving is the headline (Priority: P1) 🎯 MVP

**Goal**: The cost with stops, the cost without stops, and the difference, all in the trip summary at the same level as the total duration, with no interaction and no fold.

**Independent Test**: Plan a trip the planner answers with at least one stop, let the itinerary settle, and read the summary region alone. All three figures are legible there without expanding anything or scrolling past the trail.

### Tests for User Story 1 ⚠️

> Write these first and confirm they fail before implementing.

- [X] T004 [P] [US1] Unit tests for `plannedCost` in `tests/unit/pricing-planned-cost.test.ts`, built on the **frozen fixtures** via `tests/unit/fixture.ts` (Principle III): plan a real trip with `planTrip` over `snapshot` between `westEnd` and `eastEnd` and assert 0, since every planner-built segment is under budget by construction; then assert one segment past the free window returns exactly that segment's overage, using a hand-built literal with a comment recording that no fixture can produce it because it is the output of a correction round; plus `safetyMargin` alone leaving the figure unchanged, `overageRate: 0` returning 0, and a walk-only itinerary returning 0
- [X] T005 [P] [US1] Unit tests for `summaryCase` in `tests/unit/pricing-summary-case.test.ts`, on the same frozen fixtures: one test per row of [data-model.md](./data-model.md) §2's decision table, plus `settled: false` combined with each of the other three inputs to prove precedence, plus `noStop === null` proving it is tested before `noStop.cost` is read, plus an assertion that the `comparison` case carries `directDuration` and `deltaAgainstPlan` (FR-410)
- [X] T006 [P] [US1] Component tests in `tests/unit/trip-summary.test.tsx`: one per case in [contracts/ui-surface.md](./contracts/ui-surface.md)'s table, plus the pending-to-resolved transition asserting nothing above or below is displaced, plus an assertion that no currency string is in the document while `settled` is false, plus the time comparison rendering in the `comparison` case (FR-410), plus a plan whose every path request failed still reaching the resolved state and rendering its amounts (FR-408b, SC-009)

### Implementation for User Story 1

- [X] T007 [P] [US1] Implement `plannedCost(itinerary, params)` in `lib/pricing.ts` per [contracts/core-modules.md](./contracts/core-modules.md), summing `overageCost(step.duration, params)` over bike segments, with a comment recording why it is per segment and not over `totalDuration`
- [X] T008 [US1] Implement `summaryCase(itinerary, noStop, settled, params)` in `lib/pricing.ts` following the decision order in [data-model.md](./data-model.md) §2, carrying `directDuration` and `deltaAgainstPlan` on the `comparison` case so the time figure cannot disagree with the amounts beside it (FR-410), with a comment recording why the decision order is load-bearing (depends on T007)
- [X] T009 [P] [US1] Rewrite the `summary` group in `lib/i18n/messages/fr.ts`: `noStops` and both plural forms of `stops` currently assert "Ce trajet est gratuit", which FR-404 forbids; add keys for the three amounts, the assumptions line (free window, rate, mechanical bike assumed, taxes excluded), the pending state, the two one-sentence cases, **and** the time comparison — migrate `noStop.inOneGo`, `faster`, `slower` and `sameTime` here rather than letting T042 delete them, since FR-410 requires that figure to survive. Keep tutoiement, matching `empty.lead`
- [X] T010 [US1] Mirror every key from T009 into `lib/i18n/messages/en.ts` (depends on T009)
- [X] T011 [US1] Rewrite `components/TripSummary.tsx` to accept `noStop`, `settled` and `params`, call `summaryCase`, and render one of the four cases. It decides nothing; it words what the function returned. Remove the comment at lines 14-19 asserting a planned trip is always free (depends on T008, T010)
- [X] T012 [US1] Hold the amounts' space in the pending state at the same height as the resolved block, so their arrival displaces nothing, in `components/TripSummary.tsx` (depends on T011)
- [X] T013 [US1] In `components/PlannerShell.tsx`, pass `noStop`, `traced?.settled ?? false` and the debounced `settled` params to `TripSummary`, memoising the summary case on the same `settled` value the existing `noStop` memo uses so no figure can derive from superseded parameters (FR-408), and remove the `NoStopComparison` import and its render site (depends on T011)
- [X] T014 [US1] Delete `components/NoStopComparison.tsx` and `tests/unit/no-stop-comparison.test.tsx`, having confirmed T006 covers every figure the deleted test asserted. **After** T013, never before: deleting the file while `PlannerShell` still imports it breaks the build (depends on T006, T013)
- [X] T015 [US1] Amend `docs/ui-guidelines.md`: restate "un trajet à deux arrêts est intégralement lisible sans défilement sur un écran de 700px de haut" as applying to the expanded panel, and record that at the collapsed rest position the summary is what must be fully visible while the trail falls below the fold (FR-402a)
- [ ] T016 [US1] Verify by hand at the collapsed rest position on a 700px-tall viewport that the three amounts **and** the assumptions line are visible without scrolling or expanding (SC-002)

**Checkpoint**: US1 is fully functional and testable on its own. The amounts reflect the reader's parameters within a session; making them survive a reload is Phase 6, which US1 does not depend on.

---

## Phase 4: User Story 2 - A first-time reader understands the idea (Priority: P2)

**Goal**: One sentence under the product name, permanent, naming BIXI; the fuller explanation still filling the result region until a trip exists.

**Independent Test**: Load with no endpoints. A sentence under the product name states what the application does and why stopping saves money; the block below occupies the region rather than sitting as a note above emptiness. Plan a trip: the block gives way, the sentence does not move.

### Tests for User Story 2

- [X] T017 [P] [US2] Component tests in `tests/unit/panel-header.test.tsx`: the sentence renders in every supported language, names BIXI, and is present both with and without a plan
- [X] T018 [P] [US2] Extend `tests/unit/i18n-language-sweep.test.tsx` to cover the new header key, so a language missing it fails the build

### Implementation for User Story 2

- [X] T019 [P] [US2] Add the tagline key to `lib/i18n/messages/fr.ts` under the existing `app` group, conveying "optimise your BIXI trips so that you pay no overage" in tutoiement. The sense is fixed by FR-414; the exact wording is a writing task governed by `docs/ui-guidelines.md`
- [X] T020 [US2] Mirror the tagline into `lib/i18n/messages/en.ts` (depends on T019)
- [X] T021 [US2] Add the subtitle line to `components/PanelHeader.tsx` beneath the existing wordmark row, full width so it wraps rather than truncates, with a comment recording that it is one line of content and that nothing else may join it (depends on T020)
- [X] T022 [US2] Verify `components/EmptyState.tsx` still satisfies FR-415, FR-416 and FR-418 unchanged — it occupies the result region, gives way without a gap, and reads the free window from parameters at line 72 — and adjust only if one of the three fails
- [X] T023 [US2] Confirm no control, menu entry or overlay was added anywhere for recalling the explanation (FR-417), including that `components/PanelFooter.tsx` still has exactly two rows
- [X] T024 [US2] Amend `docs/ui-guidelines.md`: "États de l'écran" — "Vide : deux champs de saisie, rien d'autre" is superseded for the result region by FR-415; and the panel header description gains the permanent subtitle line
- [ ] T025 [US2] Verify by hand in every supported language, at the panel's narrowest width, that the sentence is fully legible and never ends in an ellipsis (FR-419a)

**Checkpoint**: US1 and US2 both work independently.

---

## Phase 5: User Story 3 - The rider renews the availability data (Priority: P3)

**Goal**: Pressing refresh actually fetches once the floor has elapsed, and says how long remains when it has not.

**Independent Test**: Note the age in the footer. Press refresh immediately: nothing is fetched and the row states the remaining wait. Wait past 60 seconds, press again: a request goes out and the age drops.

### Tests for User Story 3 ⚠️

- [X] T026 [P] [US3] Unit tests for `requestRefresh` in `tests/unit/feed-refresh.test.ts`: inside the floor returns `ok: false` with a positive `waitSeconds` and issues **no** fetch; past the floor returns `ok: true` and issues exactly one; concurrent calls collapse onto one request; a failing fetch with a cached snapshot returns `ok: true` carrying the stale snapshot. Use `clearFeedCache()` for isolation between cases
- [X] T027 [P] [US3] Extend `tests/unit/panel-footer.test.tsx`: a refused refresh words the remaining wait in row 2, the in-flight state disables the button, and the footer still has exactly two rows; and assert that a successful refresh returning different availability re-drives the plan and the amounts derived from it (FR-425)

### Implementation for User Story 3

- [X] T028 [US3] Implement `requestRefresh()` in `lib/feed-client.ts` per [contracts/core-modules.md](./contracts/core-modules.md), owning the floor check itself with the same `max(snapshot.ttl, MIN_REFRESH_INTERVAL_SECONDS)` expression already at line 96, returning the remainder as `waitSeconds` rather than fetching. Record in the comment why `force: true` is not the fix (it bypasses the floor entirely, per [research.md](./research.md) §R4)
- [X] T029 [P] [US3] Add the refusal wording to `lib/i18n/messages/fr.ts` under the existing `feed` group, stating that the data is as new as it is allowed to be and how long remains
- [X] T030 [US3] Mirror the refusal wording into `lib/i18n/messages/en.ts` (depends on T029)
- [X] T031 [US3] In `components/PlannerShell.tsx`, route the footer's refresh through `requestRefresh` and hold the refusal for display, leaving the **initial** load on `loadStationSnapshot()` unchanged (depends on T028)
- [X] T032 [US3] Display the refusal in `components/PanelFooter.tsx` row 2 itself — no alert, no toast, no third row, since `docs/ui-guidelines.md` closes the footer to one (depends on T030, T031)
- [ ] T033 [US3] Verify with the network panel open that pressing refresh repeatedly never produces more than one request per 60 seconds (SC-008)

**Checkpoint**: All three user stories are independently functional.

---

## Phase 6: Parameter Persistence (serves US1's FR-405)

**Purpose**: Make the amounts belong to the reader on the second visit as well as the first. This is the scope the clarification session added; it is placed after the story phases because US1 is independently testable without it, and it is placed before Polish because it carries functional requirements and its own success criteria (SC-011, SC-012).

### Tests ⚠️

- [X] T034 [P] Unit tests for `lib/params-store.ts` in `tests/unit/params-store.test.ts`, one per row of [data-model.md](./data-model.md) §4's read table: round trip, absent key, unparseable JSON, wrong schema version, a field missing or non-numeric, a set that parses but fails `validateParameters` returning the corrected set silently, and `localStorage` throwing on property access. Model the last case on `tests/unit/path-store.test.ts`

### Implementation

- [X] T035 Create `lib/params-store.ts` with `readStoredParameters`, `writeStoredParameters` and `clearStoredParameters` per [contracts/core-modules.md](./contracts/core-modules.md), under key `redock:params:v1`. Reuse the `storage()` shape from `lib/path-store.ts:56` — the property read goes **inside** the try, because the access itself can throw. Every function is total (depends on T034)
- [X] T036 Hydrate parameters in `components/PlannerShell.tsx` from an effect after mount, never during render, since the build has no reader and a render-time read is a hydration mismatch. Same shape as the deferred first `Date.now()` at `components/PanelFooter.tsx:121-135` (depends on T035)
- [X] T037 Persist parameters in `components/PlannerShell.tsx` off the debounced `settled` value rather than off `parameters`, so a dragged slider writes once rather than on every frame (depends on T036)
- [X] T038 In `components/SettingsOverlay.tsx`, make reset also call `clearStoredParameters()` rather than storing the defaults, so a later change to a documented default reaches the reader instead of being masked by a stored copy of the old one (FR-412a) (depends on T035)
- [ ] T039 Verify by hand: change the free window and the overage rate, reload, and confirm both the values and the amounts survive; then reset and confirm the key is gone rather than holding the defaults (SC-011)
- [ ] T040 Verify by hand in a private window, or with storage blocked for the origin, that the planner works normally, parameters behave as a session value, and no error is shown (SC-012, FR-413c)

**Checkpoint**: The amounts survive a reload.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [X] T041 [P] Run `npm run i18n:report` and resolve anything it flags, including entries left unreferenced by the deletion of `NoStopComparison`
- [X] T042 [P] Remove the **disclosure** keys orphaned by T014 from both `lib/i18n/messages/fr.ts` and `lib/i18n/messages/en.ts` — `noStop.reveal`, `noStop.hide` and `noStop.nothingToCompare` describe a fold that no longer exists. Do **not** remove `inOneGo`, `faster`, `slower` or `sameTime`: T009 migrated them because FR-410 requires the time comparison to survive. Confirm they are referenced from the summary before deleting anything
- [X] T043 Confirm `grep -rn "force: true" components/` returns nothing, so no component can bypass the refresh floor (Principle V)
- [X] T044 Confirm `TripSummary` is never handed a hard-coded `settled` value; the deferral rests entirely on `TracedItinerary.settled` and a literal `true` would remove FR-408a silently with nothing else failing
- [X] T045 Verify `npm run build` still produces a working static export (Principle I)
- [X] T046 Verify the app runs after a clean clone with zero environment variables and zero accounts (Principle II)
- [X] T047 Verify estimate wording: no to-the-minute arrival anywhere, every amount states its assumptions beside it, and no amount changes on its own once shown (Principle IV, SC-010)
- [ ] T048 Run every scenario in [quickstart.md](./quickstart.md) end to end
- [X] T049 Run `npm test` and `npm run lint` clean, and confirm the three `docs/ui-guidelines.md` amendments from T015 and T024 are all present

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: no dependencies
- **Foundational (Phase 2)**: depends on Setup — blocks all story phases, because all three new types share one file
- **US1 (Phase 3)**, **US2 (Phase 4)**, **US3 (Phase 5)**: each depends only on Foundational. They touch disjoint components and can run in parallel
- **Persistence (Phase 6)**: depends on Foundational. Independent of US2 and US3; strengthens US1 but US1 ships without it
- **Polish (Phase 7)**: depends on every phase above that is being shipped

### Cross-story file contention

Three files are touched by more than one phase and are the only real serialisation risk:

| File | Phases | Note |
|---|---|---|
| `lib/i18n/messages/fr.ts` and `en.ts` | US1, US2, US3, Polish | Different key groups (`summary`, `app`, `feed`), so conflicts are textual rather than semantic |
| `components/PlannerShell.tsx` | US1 (T013), US3 (T031), Persistence (T036, T037) | Different concerns in different parts of the component |

Neither is a design problem, but two people working in parallel should not both edit `PlannerShell.tsx` at once.

### Within each story

- Tests first, and confirmed failing, before the implementation they cover
- Pure functions before the components that call them
- Reference language (`fr.ts`) before the mirror (`en.ts`)
- Wording before the component that renders it

### Parallel Opportunities

- T004, T005, T006 together (three different test files)
- T007 and T009 together (`lib/pricing.ts` and `lib/i18n/messages/fr.ts`)
- T017 and T018 together
- T026 and T027 together
- T041 and T042 together
- Whole phases: US1, US2, US3 and Persistence can all proceed in parallel once T003 lands

---

## Parallel Example: User Story 1

```bash
# Tests first, all three at once:
Task: "Unit tests for plannedCost in tests/unit/pricing-planned-cost.test.ts"
Task: "Unit tests for summaryCase in tests/unit/pricing-summary-case.test.ts"
Task: "Component tests in tests/unit/trip-summary.test.tsx"

# Then the two independent implementations:
Task: "Implement plannedCost in lib/pricing.ts"
Task: "Rewrite the summary group in lib/i18n/messages/fr.ts"
```

---

## Implementation Strategy

### MVP (User Story 1 only)

1. Phase 1: Setup
2. Phase 2: Foundational (T003)
3. Phase 3: User Story 1
4. **Stop and validate**: plan a trip, read the summary, confirm the three figures are there with no interaction
5. Ship

This is the whole product argument, delivered on its own. US2 and US3 both improve the experience around it; neither is needed for it to make sense.

### Incremental Delivery

1. Setup + Foundational → foundation ready
2. US1 → the saving is the headline → **MVP**
3. US2 → the product explains itself
4. US3 → the refresh button works
5. Persistence → the amounts survive a reload
6. Polish

Each step is shippable and none breaks the one before it.

---

## Notes

- `[P]` means different files with no incomplete dependency
- Every task names its file path; none should require reading another task to know where to work
- Confirm each test fails before implementing against it
- Commit after each task or logical group
- Three `docs/ui-guidelines.md` amendments (T015, T024) are part of this feature, not follow-up work. A spec that contradicts a governing document and leaves it standing is one nobody can review
- The two verification tasks most likely to catch a silent regression are T043 (the refresh floor) and T044 (the deferral gate). Neither has a failing test to protect it, which is exactly why they are on the list
