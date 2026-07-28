---

description: "Task list for 003-maintainable-i18n"
---

# Tasks: Maintainable Translation System

**Input**: Design documents from `/specs/003-maintainable-i18n/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/i18n-contracts.md](./contracts/i18n-contracts.md)

**Tests**: Required, and not optional here. `lib/i18n/resolve.ts` and `lib/i18n/coverage.ts` are pure domain modules under Constitution Principle III. Beyond that, the spec makes the checks themselves the deliverable: FR-211 through FR-217a, FR-202b and FR-222a are all tests, so they appear as implementation tasks rather than as an optional layer over one.

**Organization**: Grouped by user story. Read the Dependencies section before starting — two stories are deliberately merged into one phase, for a reason that would otherwise look like an oversight.

**Revision**: Corrected after `/speckit-analyze` (findings C1, A1, A2, G1, G2). `unreferenced` moved out of the pure module; `coverageOf` takes trees as arguments; `lib/format.ts` signature changes are now explicit and scoped into the component tasks; T015 added to pin preference behaviour before the rewrite.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1, US2, US3, US4)
- Include exact file paths in descriptions

## Path Conventions

The repository's `lib/` is flat, not split into `core/`, `gbfs/`, `ui/` as the template's default suggests. Per [plan.md](./plan.md):

- **UI / routes**: `app/`, `components/`
- **Pure domain modules**: `lib/`, and `lib/i18n/` for this feature. No React, no DOM, no global state, no filesystem — enforced by `eslint.config.mjs` and by Principle III
- **Tests and fixtures**: `tests/unit/`, `tests/fixtures/`
- **Build-time scripts**: `scripts/` — the only place allowed to read the source tree
- No backend directory exists and none may be added (Principle I)

---

## ⚠️ Read this before starting

**One ordering in this feature cannot be recovered from.** T002 captures the exact
current output of every wording entry. It is the only evidence that FR-222 holds. The
moment `lib/strings.ts` is edited, that evidence is gone and cannot be reconstructed.

**T002 must land before any task that writes to `lib/strings.ts`, `lib/format.ts`, or
any component.** If you find yourself past T002 with an uncommitted edit to one of
those, stash it and finish T002 first.

---

## Phase 1: Setup & Baseline Capture

**Purpose**: Preserve the evidence that nothing a rider reads changes (FR-222a)

- [X] T001 Create `scripts/i18n-capture.mjs` that imports `lib/strings.ts`, walks both bundles, calls every function-valued entry with committed sample arguments, and writes a sorted JSON map of dotted path to rendered string for each language. Sample arguments per [research.md](./research.md) R8: counts of 0, 1 and 2 for every count-dependent entry; durations of 45 min, exactly 2 h, and 2 h 30 min; and fixed values for place name, rate, margin, time and station id
- [X] T002 Run `node scripts/i18n-capture.mjs`, commit the result as `tests/fixtures/i18n-baseline.json`, and verify it contains an entry for all ~200 leaf paths in both `fr` and `en`. **Gate: no later task may begin until this file is committed**
- [X] T003 [P] Add a paragraph to `tests/fixtures/README.md` recording that `i18n-baseline.json` is temporary migration evidence, names the task that deletes it (T037), and states why keeping it would violate FR-222b

**Checkpoint**: The current wording is captured. Everything after this is verifiable.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The pure machinery, as new files that nothing imports yet. Nothing in this phase changes what a rider sees or breaks the build.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [X] T004 [P] Create `lib/i18n/types.ts` defining `LanguageId`, `PluralCategory`, `PluralMessage` (with `other` required), `Message`, `MessageValues` and the `Messages` tree type, per [contracts/i18n-contracts.md](./contracts/i18n-contracts.md) Part 1. The type must admit strings and plural maps only, so that FR-207 is enforced by the compiler rather than by review
- [X] T005 [P] Create `lib/i18n/languages.ts` with `LanguageDescriptor`, `REFERENCE`, the `LANGUAGES` registry of descriptors, `describe()` and `isLanguageId()`. Descriptors only, no wording, so this file stays independent of the migration. Include `formatting: "fr-CA"` and `"en-CA"`, which is where `units.locale` goes (FR-220)
- [X] T006 Create `lib/i18n/resolve.ts` implementing `fill()`, `plural()`, `leafPaths()` and `placeholders()`. `fill` is single-pass so a substituted value is never rescanned; an unknown placeholder is left as written rather than blanked. `plural` selects through `Intl.PluralRules` and falls back to `other`
- [X] T007 [P] Create `tests/unit/i18n-resolve.test.ts` covering: substitution with one and several placeholders; a value containing braces not injecting a placeholder; an unknown placeholder left visible; `Intl.PluralRules` selecting `one` for French zero and `other` for English zero; and a four-category language (`pl` → `one`, `few`, `many`, `other`) resolving correctly, which is FR-219 and SC-008
- [X] T008 Create `lib/i18n/coverage.ts` implementing `coverageOf(reference, candidate, intentionallyIdentical)` and `passes()`. **Trees enter as arguments; the module reads no registry and no files.** Computes `missing`, `orphaned`, `placeholderMismatch`, `suspectedUntranslated`, `total` and `translated` only. `unreferenced` is deliberately *not* here — deciding it requires scanning source files, which Principle III forbids a domain module from doing; it lives in the report script (T023)
- [X] T009 [P] Create `tests/unit/i18n-coverage.test.ts` over small hand-written trees, asserting each blocking condition is detected and reported with the entry path: a missing leaf, an orphaned leaf, a dropped placeholder, an invented placeholder, an undeclared identical string, and a declared identical string passing

**Checkpoint**: The machinery exists and is tested. Nothing uses it yet, and the app is unchanged.

---

## Phase 3: User Story 2 + User Story 4 — The Migration (Priority: P1 + P2) 🎯 MVP

**Goal**: Every piece of wording lives in a per-language data file. Correcting a sentence becomes a one-file, one-line change, and the checks that keep languages in step run in `npm test`.

**Why these two stories share a phase**: they cannot be separated without leaving the repository in a state that does not compile. The wording files may not contain arithmetic (FR-207), so the hours/minutes split has to move to `lib/format.ts` in the same change that ports the wording. Splitting them would mean either a `fr.ts` that still holds a function, or a `format.ts` calling entries that do not exist yet. Each story keeps its own independent test criteria below.

**Independent Test (US2)**: Ask someone unfamiliar with the repository to correct one French sentence and add its English counterpart. Count the files they open and whether they read any application code.

**Independent Test (US4)**: Change `formatting` on one descriptor in `lib/i18n/languages.ts` and confirm every amount, distance and decimal in the interface follows, with no other edit.

- [X] T010 [US2] Create `lib/i18n/messages/fr.ts` porting all ~200 French entries as data. Convert `summary.stops` and `settings.summaryChanged` to plural maps; convert every function entry to a `{placeholder}` string; write the three duration entries `units.durationHours`, `units.durationMinutes`, `units.durationHoursMinutes`, each carrying its "environ"/"about" hedge (principle IV) and using the invariable unit symbols `min` and `h`, which is why they need no plural map — the full words did, and got 1 wrong; drop `units.locale` (now on the descriptor, T005) and `feed.retryable` (a policy, not wording — move it to T012). Carry every existing comment across as the translator note FR-209 requires
- [X] T011 [US2] Create `lib/i18n/messages/en.ts` with the same leaf paths, declared as `Messages` so a missing or misspelled key is a compile error, plus `intentionallyIdentical` listing `app.name`, `app.city`, `fields.destination`, `trail.destination` and `attribution.stations` per [research.md](./research.md) R7
- [X] T012 [US2] Create `lib/i18n/registry.ts` mapping each descriptor to its module, not exported outside `lib/i18n/` (FR-202), . The retry policy formerly at `feed.retryable` goes to `lib/types.ts` beside the failure reasons it names, not here: it is feed policy, not wording
- [X] T013 [US4] Rewrite the duration path in `lib/format.ts`: `approximateDuration(seconds, t, lang)` performs the hours/minutes split itself and selects among the three entries. **The signature gains the descriptor** — the plural categories of those entries need the language's Intl tag. The rounding, to the minute below ten and to five minutes above, must be copied across unchanged, because principle IV rests on it
- [X] T014 [US4] Change `formatDecimal(value, digits, lang)`, `formatMoney(amount, lang)` and `formatDistance(metres, t, lang)` in `lib/format.ts` to take the Intl tag from the descriptor instead of `t.units.locale`. `roundedMinutes(seconds)` keeps its signature: it is the one language-free function here
- [X] T015 [US2] Before rewriting the provider, pin its current behaviour in `tests/unit/locale-preference.test.tsx`: the switch applies immediately with no reload, survives a simulated reopen by reading back from `localStorage`, sets `document.documentElement.lang` to match, falls back to the default language on an unknown stored value, and still works for the session when `localStorage` throws (FR-204, FR-205, SC-007). These must pass against the current code before T016 changes it
- [X] T016 [US2] Rewrite `components/LocaleProvider.tsx` to resolve wording against the registry, and add a `useLanguage(): LanguageDescriptor` hook so the 92 wording call sites keep reading `t.group.entry` unchanged. The `localStorage` key, the `useSyncExternalStore` reading, the same-tab event and `DocumentLanguage` are unchanged — T015 is what proves it
- [X] T017 [P] [US2] Migrate call sites in `components/PlannerShell.tsx`, `components/PlannerPanel.tsx` and `components/PanelHeader.tsx`. No format-function calls in these three
- [X] T018 [P] [US2] Migrate call sites in `components/TripSummary.tsx`, `components/ItineraryTrail.tsx`, `components/RemainingGauge.tsx` and `components/NoStopComparison.tsx`, including the format-function calls that now take the descriptor: `approximateDuration` ×6, `formatDistance` ×2, `formatMoney` ×2. `RemainingGauge` calls only `roundedMinutes` and needs no descriptor
- [X] T019 [P] [US2] Migrate call sites in `components/SearchField.tsx` and `components/AssumptionsLine.tsx`, including `formatDecimal` ×1 and `approximateDuration` ×2 in `AssumptionsLine`
- [X] T020 [P] [US2] Migrate call sites in `components/MapAttribution.tsx`, `components/FeedNotice.tsx`, `components/EmptyState.tsx` and `components/LanguageToggle.tsx`, including `approximateDuration` ×1 in `EmptyState`. Have `LanguageToggle` derive its buttons from `LANGUAGES` (FR-221)
- [X] T021 [US2] Create `tests/unit/i18n-parity.test.ts` asserting the new system reproduces every entry in `tests/fixtures/i18n-baseline.json` character for character, in both languages, using the same sample arguments as T001. Any difference is a defect unless it is one of the two corrections the plan names
- [X] T022 [US2] Extend `tests/unit/i18n-coverage.test.ts` to run the blocking checks against the real `fr.ts` and `en.ts` through `coverageOf`, with the severity of FR-217a: missing, orphaned, placeholder mismatch and undeclared-identical fail the run
- [X] T023 [US2] Create `scripts/i18n-report.mjs` printing per-language coverage from `coverageOf` plus the **unreferenced scan, which lives here and not in `lib/`** because it reads the source tree (FR-213). Declare the seven computed-access roots from [data-model.md](./data-model.md) so the report does not flag them every run. Add an `i18n:report` entry to `package.json` (FR-216, SC-005)
- [X] T024 [US2] Update the four existing test files that assert on French copy — `tests/unit/language-toggle.test.tsx`, `tests/unit/assumptions-line.test.tsx`, `tests/unit/no-stop-comparison.test.tsx`, `tests/unit/itinerary-trail.test.tsx` — for any entry whose access path changed. `tests/unit/search-field.test.tsx` asserts no French and needs no change. The asserted text itself must not change; if it does, T021 has already failed

**Checkpoint**: `npm test` passes, the parity test proves nothing a rider reads has moved, and a contributor can correct a sentence in one file. `lib/strings.ts` still exists and is still read by `MapView` and `layout` — Phase 4 removes it.

---

## Phase 4: User Story 1 — The Interface Speaks One Language (Priority: P1)

**Goal**: No reachable way to read a fixed language remains, the map markers follow the rider's choice, and a test proves no French reaches an English reader.

**Independent Test**: Set the interface to English, walk every screen and state — empty, planning, result, no-stop comparison, settings expanded and collapsed, and each of the three feed failures — and confirm no French appears in visible copy, in accessible names, or in spoken descriptions.

- [X] T025 [US1] Fix `components/MapView.tsx`: replace the module-level `ENDPOINT_LABEL` constant at lines 66-67 with values read through `useStrings()`, and update existing markers' `aria-label` and `title` in an effect keyed on the language. Update the markers in place — rebuilding them would move the camera, which the file's own note at lines 35-40 warns against
- [X] T026 [US1] Create `lib/i18n/static-metadata.ts` exporting only the page title and description in the default language, and change `app/layout.tsx` to import from it instead of `lib/strings.ts`. Document in the module why this exception exists: a static export ships one document, so its metadata has one language (FR-202a)
- [X] T027 [US1] Delete `lib/strings.ts`. Nothing may import it. This is what makes FR-202 structural rather than a rule someone has to remember
- [X] T028 [US1] Add a file-scoped `no-restricted-imports` block to `eslint.config.mjs` confining `lib/i18n/static-metadata` to `app/layout.tsx`, following the pattern the file already uses to keep React out of `lib/`. Include a message saying to use `useStrings()` instead
- [X] T029 [US1] Create `tests/unit/i18n-language-sweep.test.tsx` rendering every screen and state with the language set to English and failing if any French wording appears in text content or in an accessible name. Derive the French string set from `fr.ts` at test time rather than listing it, so entries added later are covered automatically. Exclude entries in `intentionallyIdentical`, and any French string that is also an English string for another entry

**Checkpoint**: SC-001 holds and is guarded. The defect that motivated this feature cannot recur.

---

## Phase 5: User Story 3 — A Third Language Is a Translation (Priority: P2)

**Goal**: Registering a language is a descriptor and a file. Nothing else changes, and a partial translation degrades to the reference language rather than to blanks.

**Independent Test**: Register a placeholder third language with a partial translation in a test-local registry; confirm the toggle offers it, the interface uses it, untranslated entries fall back to French, and the coverage report names exactly what is missing. No third language ships.

- [X] T030 [US3] Confirm no successor exists to `LOCALES`, `LOCALE_NAMES` and `LOCALE_CODES` — the three parallel exports at the old `lib/strings.ts:23-40` — and that every consumer reads `LANGUAGES` instead (FR-221). T020 did the toggle; this is the sweep for anything else
- [X] T031 [US3] Implement reference-language fallback in the resolution path so an entry absent from the active language renders the reference wording, never a blank and never a dotted path (FR-203). Because every language is in the first load, this needs no request and cannot fail
- [X] T032 [US3] Create `tests/unit/i18n-third-language.test.tsx` registering a partial placeholder language against a test-local registry and asserting: the toggle offers it, the interface renders it, missing entries fall back to French, no blank or raw identifier appears, and `coverageOf` names exactly the missing paths
- [X] T033 [US3] Add a case to `tests/unit/i18n-third-language.test.tsx` wording a count-dependent sentence for a four-category language and asserting each category is reachable, without touching any file outside the test's own message tree (SC-008)

**Checkpoint**: All four stories are functional. The system supports an arbitrary number of languages while shipping two.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Remove the migration scaffolding and verify the constitution still holds

- [X] T034 Run `npm run i18n:report` and confirm both languages report complete, then review the advisory unreferenced list by hand and delete any entry that is genuinely dead — remembering the list is advice, not a verdict (FR-213). **Must run after T037**: while the parity capture still exists, deleting an entry fails it with "gone from the new wording", because the capture records what the old bundle held
- [X] T035 [P] Update `docs/ui-guidelines.md` where it describes the FR / EN entry, pointing at `lib/i18n/messages/` as the place wording lives
- [X] T036 [P] Update `README.md` with a short section on correcting a sentence and adding a language, linking [quickstart.md](./quickstart.md)
- [ ] T037 Delete `tests/unit/i18n-parity.test.ts`, `tests/fixtures/i18n-baseline.json`, `scripts/i18n-capture.mjs`, and the paragraph added by T003 (FR-222b). **Only after T021 has passed at least once** — the capture has served its purpose and keeping it would make every later copy correction a two-file edit
- [X] T038 Verify `npm run build` still produces a working static export in `out/`, and that every language's wording is in the emitted bundle with nothing fetched at runtime (FR-225, Principle I)
- [X] T039 Verify the app runs after a clean clone with zero environment variables and zero accounts (Principle II)
- [X] T040 Verify estimate wording in both languages: durations still read as approximations, no clock time or arrival time is expressible, and the rounding boundaries are unchanged (FR-223, Principle IV)
- [X] T041 Verify attribution and all four feed-failure notices are translated in both languages and covered by the sweep (FR-224, Principle V)
- [ ] T042 Run `npm run lint` and `npm test` clean, then walk [quickstart.md](./quickstart.md) end to end: correct a sentence, add an entry, register a throwaway language, run the report, and delete the throwaway

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: No dependencies. **T002 blocks everything else, irreversibly**
- **Phase 2 (Foundational)**: Depends on T002. New files only, nothing wired — the app builds and behaves identically throughout
- **Phase 3 (US2 + US4)**: Depends on Phase 2. Atomic: the repository does not compile partway through
- **Phase 4 (US1)**: Depends on Phase 3, because `lib/strings.ts` cannot be deleted until everything else has stopped reading it
- **Phase 5 (US3)**: Depends on Phase 2 for the registry and Phase 3 for the wording. Independent of Phase 4 and may run in parallel with it
- **Phase 6 (Polish)**: T037 depends on T021 having passed, and **T034 depends on T037** — deleting a dead entry before the capture is gone breaks the parity test by design. The rest depend on all desired stories

### User Story Dependencies

- **US2 (P1)** and **US4 (P2)**: merged into Phase 3, for the compile-order reason stated there. Each keeps its own independent test criteria
- **US1 (P1)**: depends on US2. The escape hatch cannot be removed before its callers have somewhere else to go. This is the one place priority order and dependency order disagree, and dependency wins
- **US3 (P2)**: depends on US2, independent of US1

```text
T002 ──► Phase 2 ──► Phase 3 (US2 + US4) ──┬──► Phase 4 (US1) ──┐
 capture   machinery    the migration       │                    ├──► Phase 6
                                            └──► Phase 5 (US3) ──┘
```

### Within Each Phase

- Tests for the pure modules (T007, T009) may be written before or alongside their module; both are required to ship together under Principle III
- T015 must pass against the **current** provider before T016 rewrites it. A test written after the rewrite proves only that the rewrite agrees with itself
- Message files (T010, T011) before the registry (T012), which is before the components
- `lib/format.ts` (T013, T014) must land with the message files, not after
- The parity test (T021) is the gate on Phase 3; do not start Phase 4 until it passes

### Parallel Opportunities

- T004, T005 and T007 are independent files and can run together
- T009 can run as soon as T008 exists
- The four component migration tasks T017 through T020 touch disjoint files and can run together once T016 lands
- T035 and T036 are independent documentation files
- Phase 4 and Phase 5 can be worked simultaneously by two people

---

## Parallel Example: Phase 3 component migration

```bash
# After T016 (LocaleProvider) lands, these four touch disjoint files:
Task: "Migrate PlannerShell.tsx, PlannerPanel.tsx, PanelHeader.tsx"
Task: "Migrate TripSummary.tsx, ItineraryTrail.tsx, RemainingGauge.tsx, NoStopComparison.tsx"
Task: "Migrate SearchField.tsx, AssumptionsLine.tsx"
Task: "Migrate MapAttribution.tsx, FeedNotice.tsx, EmptyState.tsx, LanguageToggle.tsx"
```

---

## Implementation Strategy

### MVP (Phases 1 through 3)

1. Capture the baseline — T002, and do not skip it
2. Build the machinery — Phase 2, non-breaking throughout
3. Migrate — Phase 3, atomic
4. **STOP and VALIDATE**: `npm test` green, parity test passing. A contributor can now correct a sentence in one file, which is the maintainability the request asked for
5. Shippable: no rider-visible change, and the checks are live

### Incremental Delivery

1. MVP as above → the maintainability win, with the two known defects still present
2. Phase 4 → the escape hatch is gone and the map markers are fixed. **This is the phase a rider notices**
3. Phase 5 → a third language becomes a translation exercise
4. Phase 6 → scaffolding removed, constitution re-verified

### Notes

- [P] tasks touch different files and have no incomplete dependencies
- Commit after each task or logical group; T002 gets its own commit
- The two corrections this work is allowed to make are the French map marker labels and the CLDR zero-plural category. Any other difference the parity test reports is a mistake, not an improvement
- No runtime dependency is added. If a task seems to want one, re-read [research.md](./research.md) R3 before adding it
- Nothing under `lib/` may read the filesystem. The unreferenced scan lives in `scripts/` for that reason (Principle III)
