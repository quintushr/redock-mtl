# Implementation Plan: Result-First Planner Panel

**Branch**: `002-refonte-affichage-resultat` | **Date**: 2026-07-27 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/002-refonte-affichage-resultat/spec.md`

## Summary

Invert the planner panel: the result comes first, the assumptions collapse to one line beneath it.
Restate every free-window figure as time *remaining* on arrival rather than time consumed, behind a
proportional gauge. Rebuild the shell as a full-frame map under a single overlay panel, anchored to
the bottom below 1024 px and to the left above. Add a no-stop comparison that prices the same ride
without its anchor stops.

Technically this is a display-layer rewrite with one small, authorised extension into the domain:
remaining time is computed in `lib/remaining.ts`, attached to each bike segment by
`buildItinerary`, and unit tested. The route search itself is not touched. Three display components
are deleted and replaced; nothing old survives beside the new.

`docs/ui-guidelines.md` is authoritative on every interface question. Where this plan and that
document disagree, that document wins, and its "Interdits" section is a review checklist.

## Technical Context

**Language/Version**: TypeScript 5, React 19.2.4, Next.js 16.2.12 (App Router). Read from
`node_modules/*/package.json` on 2026-07-27.

**Primary Dependencies**: next, react, react-dom, maplibre-gl, tailwindcss. **None added, none
removed.** `vitest` 4.1.10, `@testing-library/react` 16.3.2 and `jsdom` 29.1.1 are already
devDependencies, so the required unit test costs nothing new.

**Storage**: None. Planning parameters live in React state, as today.

**Testing**: `vitest run` over `tests/unit/`, jsdom environment, frozen fixtures in
`tests/fixtures/`. No network. Layout and camera behaviour are not testable here and are verified
by hand against `quickstart.md` (see research R6).

**Target Platform**: Modern browsers, static export, no runtime server.

**Project Type**: Client-side web application.

**Performance Goals**: Unchanged from feature 001, a plan under one second on a mid-range phone.
The existing 150 ms debounce on parameter changes is kept, and now also covers the no-stop
comparison, which FR-135 requires to recompute live.

**Constraints**: Zero operating cost, zero API keys, GBFS `ttl` honoured, computation in-browser.
Feature-specific: no new dependency; the route search is off limits; a two-stop itinerary must be
fully readable at 700 px of viewport height; the panel must work from 360 px wide.

**Scale/Scope**: ~900 Montreal stations. Itineraries are short, typically 3 to 9 steps.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Gate | Principle | Pass? | Notes |
|------|-----------|-------|-------|
| No backend, database, serverless function, or paid/metered service is introduced | I. Zero Operating Cost | [x] | Presentation only. The overage rate is a local constant, not a fetched tariff. |
| All computation runs in the browser; build still produces a static export | I. Zero Operating Cost | [x] | No change to the build. `MapView` stays a client-only dynamic import for the same prerender reason as today. |
| Feature works with zero API keys and zero accounts; any keyed integration is optional and degrades cleanly | II. No Mandatory API Keys | [x] | No new external call at all. Clarification Q1 rejected the pricing feed precisely to keep this true. |
| Calculation logic lands in pure modules (no network, no DOM, no global state) with unit tests over frozen JSON fixtures | III. Pure, Tested Domain Core | [x] | `lib/remaining.ts` and `lib/pricing.ts` are pure, with `tests/unit/remaining.test.ts` and `tests/unit/pricing.test.ts`. No component recomputes either. |
| Durations shown as estimates, never to-the-minute arrivals; influencing parameters are user-visible and adjustable with conservative defaults | IV. Honest Estimates | [x] | See the note below on the parameter disclosure and on the pre-tax rate. |
| GBFS `ttl` honored, responses cached client-side, attribution and license displayed, only public documented endpoints called, feed failure degrades cleanly | V. Respect for Data Sources | [x] | Untouched. `FeedNotice` keeps its place in the panel; the restructure must not let it push the itinerary below the fold. |
| New runtime dependencies are justified, or none were added | Technology Constraints | [x] | None added. |

**Note on principle IV.** Moving eight parameters behind a disclosure is grouping, not hiding:
every one stays visible and adjustable, and FR-127 restores all defaults in one action. This is the
same trade `ParameterPanel` already makes today with its advanced section; the change is which
parameters sit at which level. The new `overageRate` default is the operator's published pre-tax
figure and is labelled pre-tax rather than grossed up, which understates the final bill by the
Quebec tax rate. That is a deliberate, recorded choice, argued in research R3, and it is the one
place this feature is less conservative than principle IV's default reading. It is mitigated by
labelling and by the rate being adjustable.

*Re-check status after Phase 1 design:* **passed**. Phase 1 added no dependency, no endpoint and no
impure module. The one item worth re-stating is that deleting `lib/budget.ts` removes a tested pure
module; its replacement `lib/remaining.ts` is tested to at least the same depth, so domain coverage
does not regress.

## Project Structure

### Documentation (this feature)

```text
specs/002-refonte-affichage-resultat/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output, including the checks jsdom cannot make
├── contracts/
│   └── ui-contracts.md  # Phase 1 output: component and domain module contracts
├── checklists/
│   └── requirements.md  # From /speckit-specify
├── spec.md
└── tasks.md             # Phase 2 output, NOT created by /speckit-plan
```

### Source Code (repository root)

The real layout is flat `lib/*.ts` and `components/*.tsx`, not the `lib/core` and `lib/gbfs`
subdirectories the template sketches. Following the template here would mean moving files the brief
forbids touching.

```text
app/
├── layout.tsx                  # untouched
├── globals.css                 # MODIFY: colour tokens and type roles from docs/ui-guidelines.md
└── page.tsx                    # untouched

components/
├── PlannerShell.tsx            # MODIFY: full-frame map under one overlay panel, new content order
├── PlannerPanel.tsx            # NEW: the single panel, anchoring only differs by breakpoint
├── TripSummary.tsx             # NEW: total duration, stop count, cost
├── ItineraryTrail.tsx          # NEW: one continuous list, anchor stops at full rank
├── RemainingGauge.tsx          # NEW: proportional fill, three states, never colour alone
├── AssumptionsLine.tsx         # NEW: one closed line, safety margin at first level, rest nested
├── NoStopComparison.tsx        # NEW: same ride without stops, duration, amount, delta
├── ItineraryList.tsx           # DELETE
├── SegmentBudget.tsx           # DELETE
├── ParameterPanel.tsx          # DELETE
├── MapView.tsx                 # untouched behaviour; mounted once, stable tree position
├── SearchField.tsx             # untouched
└── FeedNotice.tsx              # untouched

lib/
├── remaining.ts                # NEW: remaining free time, three-state banding, gauge fraction
├── pricing.ts                  # NEW: overage cost of a ride, pure
├── budget.ts                   # DELETE: consumed-share module, superseded (research R1)
├── planner.ts                  # MODIFY: buildItinerary only. Search, graph, heap untouched.
├── types.ts                    # MODIFY: BikeSegment fields, RemainingStatus, NoStopRide
├── params.ts                   # MODIFY: add overageRate + its validation. Existing defaults kept.
└── geo.ts, gbfs.ts, feed-client.ts, geocode.ts, endpoints.ts   # untouched

tests/
├── unit/
│   ├── remaining.test.ts        # NEW: the arithmetic, the reset at each stop, the bands
│   ├── pricing.test.ts          # NEW: overage cost, zero below the window
│   ├── itinerary-trail.test.tsx # NEW: replaces segment-budget.test.tsx
│   ├── budget.test.ts           # DELETE with its module
│   ├── segment-budget.test.tsx  # DELETE with its components
│   └── planner-*.test.ts, geo-*.test.ts, gbfs-*.test.ts, params*.test.ts, geocode.test.ts
│                                # untouched except where they assert the two removed fields
└── fixtures/                    # untouched

docs/ui-guidelines.md            # untouched, authoritative
```

**Structure Decision**: Display work lands in `components/`. The one domain extension lands in two
new pure modules, `lib/remaining.ts` and `lib/pricing.ts`, each with a unit test over plain
constructed itineraries, plus the existing frozen fixtures where a snapshot is needed.
`lib/planner.ts` changes only inside `buildItinerary`, which runs after the search has already
produced a path.

## Phase 1 design summary

- **Data model**: [data-model.md](./data-model.md). `BikeSegment` loses `budgetShare` and
  `budgetStatus`, gains `remaining` and `remainingStatus`. `PlanningParameters` gains `overageRate`.
  A new `NoStopRide` is constructed, not searched.
- **Contracts**: [contracts/ui-contracts.md](./contracts/ui-contracts.md). Signatures for the two
  new domain modules and props for the six new components, plus the accessibility contract for the
  gauge.
- **Verification**: [quickstart.md](./quickstart.md). Includes the checks jsdom cannot make and the
  "Interdits" review pass.

## Order of work

1. **Prerequisite, not a task**: get the feature 001 implementation into this branch (research R8).
   Nothing below can run until then.
2. Domain first: `lib/remaining.ts`, `lib/pricing.ts`, their tests, then the `types.ts`,
   `params.ts` and `buildItinerary` changes, then delete `lib/budget.ts` and its test. The suite
   must be green here, before a single component is written.
3. Shell: `PlannerShell` restructured to full-frame map plus `PlannerPanel`, with `MapView` mounted
   once at a stable tree position. Content order per FR-102.
4. Result region: `TripSummary`, `ItineraryTrail`, `RemainingGauge`. Delete `ItineraryList` and
   `SegmentBudget` in the same change that introduces their replacements.
5. Assumptions: `AssumptionsLine`. Delete `ParameterPanel` in the same change.
6. Comparison: `NoStopComparison`, wired to recompute live.
7. Verification pass against `quickstart.md`, including the "Interdits" checklist.

Steps 4 and 5 each delete their predecessor in the same change, so no old display component ever
sits beside its replacement.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| The brief forbids touching planning logic and its tests, yet this plan edits `lib/planner.ts`, `lib/types.ts`, `lib/params.ts` and deletes `lib/budget.ts` with its test | The brief's own "extension de la logique" clause requires remaining time to be computed in the planning module and exposed in the itinerary structure. That is impossible without touching `buildItinerary` and `types.ts`. `budget.ts` computes consumed share, which FR-109 forbids displaying, so it is dead by construction. | Leaving `budgetShare` and `budgetStatus` in place was rejected: it is the "code d'affichage existant qui survit en parallèle" the brief forbids, hidden one layer deeper in the domain structure. The route search, pruning, graph, Dijkstra and every failure path remain untouched, as do all of `geo`, `gbfs`, `feed-client`, `geocode` and their tests. |
| The `overageRate` default understates the billed amount by the Quebec tax rate | It is the operator's published figure, so a rider can reconcile it against BIXI's own pricing page. Principle IV prefers conservative defaults. | Grossing the default up to a tax-inclusive 0.2185 was rejected: a number matching no published price reads as an error and undermines the credibility the comparison exists to create. Mitigated by labelling the amount pre-tax (FR-130) and by the rate being adjustable (FR-133). |
