# Implementation Plan: [FEATURE]

**Branch**: `[###-feature-name]` | **Date**: [DATE] | **Spec**: [link]

**Input**: Feature specification from `/specs/[###-feature-name]/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command. See `.specify/templates/plan-template.md` for the execution workflow.

## Summary

[Extract from feature spec: primary requirement + technical approach from research]

## Technical Context

<!--
  Project-wide defaults are pre-filled below from the constitution and
  package.json. Override a line only when this feature genuinely differs, and say
  why. Do not introduce a value that violates the Constitution Check gates.
-->

**Language/Version**: TypeScript 5, React 19, Next.js 16.2.12 (App Router). Versions
are authoritative in `package.json`; read `node_modules/next/dist/docs/` before using
an unfamiliar Next.js API.

**Primary Dependencies**: next, react, react-dom, tailwindcss. Any addition must be
justified here.

**Storage**: Browser-local only (no server, no database). N/A if the feature stores nothing.

**Testing**: Unit tests over pure domain modules, run against frozen JSON fixtures
committed to the repo. No network in tests.

**Target Platform**: Modern browsers. Static hosting only, no runtime server.

**Project Type**: Client-side web application (static export).

**Performance Goals**: [feature-specific, e.g., plan computed in <500ms on a mid-range
phone for the Montreal network]

**Constraints**: Zero operating cost, zero mandatory API keys, GBFS `ttl` honored,
computation in-browser. [add feature-specific constraints]

**Scale/Scope**: [feature-specific, e.g., ~900 Montreal stations, single network at a time]

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Answer each gate for this feature. Any "no" must either change the design or be
recorded in Complexity Tracking below with the simpler alternative that was rejected.

| Gate | Principle | Pass? | Notes |
|------|-----------|-------|-------|
| No backend, database, serverless function, or paid/metered service is introduced | I. Zero Operating Cost | [ ] | |
| All computation runs in the browser; build still produces a static export | I. Zero Operating Cost | [ ] | |
| Feature works with zero API keys and zero accounts; any keyed integration is optional and degrades cleanly | II. No Mandatory API Keys | [ ] | |
| Calculation logic lands in pure modules (no network, no DOM, no global state) with unit tests over frozen JSON fixtures | III. Pure, Tested Domain Core | [ ] | |
| Durations shown as estimates, never to-the-minute arrivals; influencing parameters are user-visible and adjustable with conservative defaults | IV. Honest Estimates | [ ] | |
| GBFS `ttl` honored, responses cached client-side, attribution and license displayed, only public documented endpoints called, feed failure degrades cleanly | V. Respect for Data Sources | [ ] | |
| New runtime dependencies are justified, or none were added | Technology Constraints | [ ] | |

*Re-check status after Phase 1 design:* [pending / passed / violations recorded below]

## Project Structure

### Documentation (this feature)

```text
specs/[###-feature]/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── contracts/           # Phase 1 output (/speckit-plan command)
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)
<!--
  The layout below is the project default: a single static Next.js app with the
  calculation logic isolated in pure modules. Expand it with the real paths this
  feature touches. There is no backend directory and none may be added
  (Principle I).
-->

```text
app/                     # Next.js App Router: routes, layouts, UI components (thin layer)

lib/
├── core/                # Pure domain modules: geometry, graph, planning.
│                        # No network, no DOM, no global state (Principle III).
├── gbfs/                # Feed fetching, parsing, ttl-aware caching (Principle V).
└── ui/                  # Browser-only helpers that are not domain logic

tests/
├── unit/                # Unit tests for lib/core, over frozen fixtures
└── fixtures/            # Committed JSON fixtures. Never fetched at test time.

public/                  # Static assets
```

**Structure Decision**: [Name the directories this feature adds or changes, and state
which calculation lives in `lib/core/` and which fixtures cover it]

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| [e.g., 4th project] | [current need] | [why 3 projects insufficient] |
| [e.g., Repository pattern] | [specific problem] | [why direct DB access insufficient] |
