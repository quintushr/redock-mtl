# Implementation Plan: Value Proposition Clarity and Data Control

**Branch**: `005-value-proposition-clarity` | **Date**: 2026-07-28 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/005-value-proposition-clarity/spec.md`

## Summary

Make the saving the headline, explain the product in one permanent sentence, and make the refresh
button actually refresh.

Three of the four pieces already exist as computation and are merely hidden or mis-wired: the
no-stop comparison is a tested pure function shown behind a collapsed fold *below* the itinerary
trail; the explanation is an empty-state block that vanishes for good once a plan appears; the
refresh control calls the feed loader without the one argument that would make it fetch. The fourth
piece is new and was added during clarification: planning parameters do not survive a reload, so an
amount computed from "the reader's tariff" reverts to the documented default the moment they close
the tab.

The technical approach follows from that. Two new pure functions in `lib/pricing.ts` — one to cost
the plan itself, one to decide which of four things the summary is saying — plus one new storage
module modelled on the existing path store, plus one new entry point on the feed client that makes
the courtesy floor impossible to bypass from the UI. The components then get simpler, not more
complex: `NoStopComparison` is deleted outright, along with its disclosure state, and the summary
words what a pure function decided.

## Technical Context

**Language/Version**: TypeScript 5, React 19.2.4, Next.js 16.2.12 (App Router). Versions
authoritative in `package.json`.

**Primary Dependencies**: next, react, react-dom, tailwindcss, maplibre-gl. **No addition.** This
feature adds no runtime dependency; `Intl` covers currency formatting and is already used
(`lib/format.ts:150`).

**Storage**: Browser-local only. One new `localStorage` key, `redock:params:v1`, holding the
reader's planning parameters. Deliberately a different root from `redock:path:`, because the
settings overlay's purge control clears that whole prefix and purging cached geometry must not reset
a reader's tariff.

**Testing**: Vitest 4.1.10 with jsdom. Unit tests over the pure additions against inline fixtures;
component tests via `@testing-library/react`. No network in tests; `clearFeedCache()` already exists
for isolation.

**Target Platform**: Modern browsers. Static export, no runtime server.

**Project Type**: Client-side web application (static export).

**Performance Goals**: Unchanged. The additions are arithmetic over an itinerary of a handful of
steps and one synchronous storage read at mount; neither is measurable against the existing plan
computation.

**Constraints**: Zero operating cost, zero mandatory API keys, GBFS `ttl` honoured, computation
in-browser. Feature-specific: the on-demand refresh must not become a way to poll a courtesy feed
faster than the project's own 60s floor, which is what shapes the `requestRefresh` contract; and the
deferral of amounts must be bounded, which R1 establishes it is.

**Scale/Scope**: ~900 Montréal stations, single network. Six components touched, two pure modules
extended, one storage module added, one component deleted.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Gate | Principle | Pass? | Notes |
|------|-----------|-------|-------|
| No backend, database, serverless function, or paid/metered service is introduced | I. Zero Operating Cost | [x] | Nothing added. The amounts are arithmetic over data already in the browser; the tariff is a local constant the reader edits. |
| All computation runs in the browser; build still produces a static export | I. Zero Operating Cost | [x] | Parameter hydration happens in a post-mount effect, never during render, so the prerendered HTML stays the defaults and the export is unaffected. |
| Feature works with zero API keys and zero accounts; any keyed integration is optional and degrades cleanly | II. No Mandatory API Keys | [x] | No new endpoint. Tariff values are read from the operator's published page by a maintainer and committed; never fetched at runtime. |
| Calculation logic lands in pure modules with unit tests over frozen fixtures | III. Pure, Tested Domain Core | [x] | `plannedCost` and `summaryCase` go in `lib/pricing.ts`, pure and tested without a renderer. The four-case decision is deliberately *not* a chain of conditionals in `TripSummary`. |
| Durations shown as estimates; influencing parameters user-visible, adjustable, conservative defaults | IV. Honest Estimates | [x] | See the note below — this gate does real work here. |
| GBFS `ttl` honoured, responses cached, attribution shown, only public documented endpoints, failure degrades cleanly | V. Respect for Data Sources | [x] | See the note below — this gate also does real work here. |
| New runtime dependencies justified, or none added | Technology Constraints | [x] | None added. |

**Principle IV in detail.** This feature puts currency figures on the screen, and a currency figure
reads as exact in a way a duration does not. Three things carry the honesty:

- The amounts are deferred until the itinerary stops being revised (FR-408a to FR-408c). A price
  that corrects itself twice while being read is the failure mode this principle exists to prevent,
  and the clarification session chose deferral over live updating for exactly that reason.
- The assumptions sit beside the amount, not behind a fold: free window, rate, mechanical bike
  assumed, taxes excluded (FR-407, FR-411, FR-412). `lib/params.ts:104-123` already records that the
  0.19 CAD default is pre-tax and understates the bill by roughly 15%, and states why that trade was
  taken; the interface now has to say so where the reader is looking.
- Both parameters that move the figures remain user-adjustable, and they now persist, which is what
  makes "the tariff in force for the reader" true on the second visit as well as the first.

**Principle V in detail.** The refresh is the one place this feature could do harm. `force` already
exists on `loadStationSnapshot` and bypasses the floor *entirely* (`lib/feed-client.ts:94`); wiring
it to a button would hand a reader a way to poll a courtesy endpoint as fast as they can tap. The
design therefore adds `requestRefresh`, which owns the floor check itself and returns a refusal as a
value. Constitution compliance stops depending on a caller remembering to check first. The floor
stays at 60s against BIXI's declared `ttl: 10`, which is stricter than the feed permits.

*Re-check status after Phase 1 design:* **passed.** No gate changed status. The design added no
dependency, no endpoint and no server-side anything; the two widenings that came out of
clarification (deferral, parameter persistence) both landed inside principles III and IV rather
than against them.

## Project Structure

### Documentation (this feature)

```text
specs/005-value-proposition-clarity/
├── plan.md              # This file
├── spec.md              # Feature specification
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/
│   ├── core-modules.md  # lib/ signatures and obligations
│   └── ui-surface.md    # What the reader sees, and the guideline amendments
├── checklists/
│   └── requirements.md  # Spec quality checklist
└── tasks.md             # Phase 2 output (/speckit-tasks — NOT created here)
```

### Source Code (repository root)

The layout below is the repository as it actually is. It does not match the template's
`lib/core/`, `lib/gbfs/`, `lib/ui/` sketch: this project keeps its pure modules flat under `lib/`
and marks the impure ones in their own headers, a convention established by feature 001 and
unchanged since. Following the template here would mean moving files this feature has no business
moving.

```text
lib/
├── pricing.ts           # EXTENDED: + plannedCost, + summaryCase. Pure.
├── params-store.ts      # NEW: browser-local parameter persistence. Impure, total.
├── feed-client.ts       # EXTENDED: + requestRefresh. Impure (one of three).
├── types.ts             # EXTENDED: + TripCostComparison, SummaryCase, RefreshOutcome
├── params.ts            # unchanged (validateParameters reused on hydration)
├── format.ts            # unchanged (formatMoney already exists)
└── i18n/messages/
    ├── fr.ts            # EXTENDED: new keys; summary.* and noStop.* rewritten
    └── en.ts            # EXTENDED: same keys

components/
├── TripSummary.tsx      # REWRITTEN: renders one of four cases
├── NoStopComparison.tsx # DELETED: FR-403 removes the fold it exists for
├── PanelHeader.tsx      # EXTENDED: permanent one-line subtitle
├── EmptyState.tsx       # adjusted: unchanged job, verified against FR-415/416/418
├── PanelFooter.tsx      # EXTENDED: refresh calls requestRefresh; refusal worded in row 2
├── SettingsOverlay.tsx  # EXTENDED: reset also clears the stored key
└── PlannerShell.tsx     # EXTENDED: hydrate/persist params, pass `settled`, rewire refresh

tests/unit/
├── pricing-planned-cost.test.ts   # NEW
├── pricing-summary-case.test.ts   # NEW
├── params-store.test.ts           # NEW
├── feed-refresh.test.ts           # NEW
├── trip-summary.test.tsx          # NEW: one per case, plus the transition
└── no-stop-comparison.test.tsx    # DELETED with the component

docs/
└── ui-guidelines.md     # AMENDED: three points, listed in contracts/ui-surface.md
```

**Structure Decision**: The two calculations this feature adds — costing a plan, and deciding what
the summary says — both live in `lib/pricing.ts`, which is already pure and already tested. The
four-case decision is the one worth insisting on: written as conditionals inside `TripSummary` it
would be untestable without a renderer and would drift from the tests that currently assert the
figures.

Both are domain modules, so Principle III applies in full: their tests run against the frozen JSON
fixtures already committed under `tests/fixtures/`, reached through `tests/unit/fixture.ts`, which
exports a parsed `snapshot` plus the `westEnd`/`eastEnd`/`near` helpers. Itineraries under test are
produced by running `planTrip` over that snapshot, the same way `tests/unit/planner-path.test.ts`
and the rest of the domain suite do. Hand-built literals are used only where a fixture cannot
express the case — an itinerary whose segment has been pushed past the free window by measured
geometry has no frozen input, since it is the *output* of a correction round — and each such literal
states in a comment why no fixture could produce it.

`tests/unit/no-stop-comparison.test.tsx` is deliberately **not** the model here. It builds
`NoStopRide` literals, which is correct for a component test asserting what renders and wrong for a
domain test asserting what is computed.

`lib/params-store.ts` is impure by necessity and is written to the contract `lib/path-store.ts`
already established: total, returns null rather than throwing, survives a private window and a full
quota. It holds no rules — what to store and when to look is the caller's decision.

## Complexity Tracking

> No constitution violations. This section is empty by design.

One thing deserves recording even though it is not a violation: the feature grew twice during
clarification, from "move three figures and fix a button" to also include deferring the amounts and
persisting the whole parameter set. Both additions are load-bearing rather than incidental —
without deferral the headline figure revises itself while being read, and without persistence
FR-405 is true only until the tab closes — and both were the reader's explicit choice, recorded in
the spec's Clarifications section with the alternatives that were rejected.

The net change in component complexity is negative: one component is deleted, one piece of
disclosure state disappears, and the conditional logic that replaces it lives in a pure function
with its own tests.
