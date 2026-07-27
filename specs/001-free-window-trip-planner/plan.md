# Implementation Plan: Free-Window Trip Planner

**Branch**: `001-free-window-trip-planner` | **Date**: 2026-07-26 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-free-window-trip-planner/spec.md`

## Summary

Plan a bike-share trip that stays inside the subscription's free window by splitting it into
segments short enough to be free, separated by docking stops where the rider re-takes their own
bike after a one-minute cooldown.

Technical approach: the existing Next.js App Router scaffold, switched to static export, with no
backend. GBFS feeds are fetched from the browser after mount and merged into a station snapshot.
Durations are estimated from great-circle distance times a calibrated detour factor divided by the
configured speed, with no routing engine. Candidate stations are pruned by an ellipse with the
origin and destination as foci; the survivors form a graph whose edges exist only when a segment
fits the budget, with edge cost equal to duration plus the docking cooldown. Because docking fully
resets the counter, no residual state propagates along a path, so plain Dijkstra is provably
sufficient. All of this lives in pure modules under `lib/`, unit tested against frozen fixtures;
React is a thin layer above.

## Technical Context

**Language/Version**: TypeScript ^5, React 19.2.4, Next.js 16.2.12 (App Router, static export).
Versions are authoritative in `package.json`. Static export behaviour verified against
`node_modules/next/dist/docs/01-app/02-guides/static-exports.md`.

**Primary Dependencies**: existing `next`, `react`, `react-dom`, `tailwindcss`. One new runtime
dependency, `maplibre-gl` 6.0.0. Test tooling added: `vitest` 4.1.10, `@vitejs/plugin-react` 6.0.4,
`jsdom` 29.1.1, `@testing-library/react` 16.3.2, `@testing-library/dom` 10.4.1,
`vite-tsconfig-paths` 6.1.1. New-package versions read from the npm registry on 2026-07-26.

**Storage**: none. No server, no database, no persistence. Parameters live in React state for this
feature.

**Testing**: Vitest, configured per the framework's own guide at
`node_modules/next/dist/docs/01-app/02-guides/testing/vitest.md`. Pure modules in `lib/` are tested
against frozen GBFS JSON in `tests/fixtures/`, with no network and no DOM. A jsdom environment
covers the thin component tests required by FR-018b.

**Target Platform**: modern browsers, mobile first. Static hosting on Cloudflare Pages serving the
`out/` directory. No runtime server.

**Project Type**: statically exported single-page application.

**Performance Goals**: a plan computed and displayed within 1 second of a request or parameter
change on a mid-range phone (SC-012). Nearby stations visible within 3 seconds of landing (SC-007).

**Constraints**: zero operating cost, zero mandatory API keys, GBFS `ttl` honoured, all computation
in-browser, no routing engine in the feasibility path. Static export additionally forbids rewrites,
redirects, headers, cookies, Server Actions, and request-reading Route Handlers, and prerenders
Client Components at build time, so `window`, `navigator`, and WebGL are reachable only after
mount.

**Scale/Scope**: one network at a time, Montreal first. Station count is whatever the feed
publishes; the ellipse prunes the working set well below it for any single plan.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Gate | Principle | Pass? | Notes |
|------|-----------|-------|-------|
| No backend, database, serverless function, or paid/metered service is introduced | I. Zero Operating Cost | Yes | Nothing server-side. Cloudflare Pages free static hosting. Static export makes the constraint enforceable: `next dev` errors on any server-requiring feature. |
| All computation runs in the browser; build still produces a static export | I. Zero Operating Cost | Yes | `output: 'export'` emits `out/`. This is the mechanism the constitution names, so no amendment is needed. |
| Feature works with zero API keys and zero accounts; any keyed integration is optional and degrades cleanly | II. No Mandatory API Keys | Yes | GBFS, OpenFreeMap tiles, and Photon are all keyless. Tiles and geocoding are optional by construction, with FR-002's other input methods as the guaranteed path. |
| Calculation logic lands in pure modules with unit tests over frozen JSON fixtures | III. Pure, Tested Domain Core | Yes | All of `lib/` is pure except `lib/feed-client.ts`, which holds no logic. A lint rule forbids React imports inside `lib/`. |
| Durations shown as estimates, never to-the-minute arrivals; influencing parameters user-visible and adjustable with conservative defaults | IV. Honest Estimates | Yes | FR-020 and FR-023 carried into `lib/params.ts`, whose defaults each cite their origin. The detour factor is calibrated, not guessed (research R9). |
| GBFS `ttl` honoured, responses cached client-side, attribution and license displayed, only public documented endpoints called, feed failure degrades cleanly | V. Respect for Data Sources | Yes | See [contracts/external-services.md](./contracts/external-services.md). Photon debouncing and OpenStreetMap attribution are treated as the same class of obligation, not GBFS-only. |
| New runtime dependencies are justified, or none were added | Technology Constraints | Yes | One runtime addition, `maplibre-gl`, justified in Complexity Tracking. The rest is test tooling required by Principle III. |

**All gates pass.** The stack matches the constitution's Technology & Deployment Constraints
section as ratified: Next.js App Router, React, TypeScript, Tailwind CSS, static export, static
hosting. No amendment is required and no governance debt is created.

*Re-check after Phase 1 design*: passed. The design added no server-side surface, no key, and no
impure code inside `lib/` beyond the single declared fetch module.

## Project Structure

### Documentation (this feature)

```text
specs/001-free-window-trip-planner/
├── plan.md              # This file
├── spec.md              # Feature specification
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   ├── core-modules.md      # pure module signatures and guarantees
│   └── external-services.md # GBFS, tiles, geocoding: calls, failures, obligations
├── checklists/
│   └── requirements.md
└── tasks.md             # Phase 2 output (/speckit.tasks, not created here)
```

### Source Code (repository root)

```text
app/                     # Next.js App Router
├── layout.tsx           # root layout, Tailwind entry
├── page.tsx             # the single route; renders the client shell
└── globals.css

components/              # React UI, thin layer over lib/
├── PlannerShell.tsx     # 'use client'; owns origin, destination, params, feed status
├── MapView.tsx          # MapLibre instance created in useEffect, kept in a ref;
│                        # draggable start and destination pins

├── ItineraryList.tsx    # exhaustive switch over ItineraryStep['kind']
├── SegmentBudget.tsx    # bar, colour band, and text label, all from lib/budget.ts
├── ParameterPanel.tsx   # debounced controls
├── SearchField.tsx      # debounced geocoding, cancels superseded requests
└── FeedNotice.tsx       # stale, unavailable, out-of-season states

lib/                     # pure core: no React, no DOM, no global state
├── types.ts             # shared data types
├── geo.ts               # haversine, duration estimation, convex hull, ellipse pruning
├── gbfs.ts              # feed parsing, station eligibility, service area
├── planner.ts           # graph construction and Dijkstra; single entry point planTrip
├── params.ts            # conservative defaults and validation
├── budget.ts            # free-window share and status thresholds
├── geocode.ts           # geocoder result labelling, manual coordinate entry
├── endpoints.ts         # every external base URL, isolated for one-file provider swaps
└── feed-client.ts       # fetch and ttl-aware cache; impure by design, logic-free

tests/
├── unit/                # Vitest specs mirroring lib/
└── fixtures/            # frozen GBFS JSON, committed, never fetched at test time

public/                  # static assets
```

**Structure Decision**: the existing scaffold is kept and extended. `lib/` and `components/` sit at
the repository root, reachable as `@/lib/...` and `@/components/...` through the `@/*` mapping
already present in `tsconfig.json`; no new path configuration is needed.

The pure/impure boundary is the directory boundary: everything in `lib/` except `feed-client.ts` is
a pure function, and `components/` may import from `lib/` but never the reverse. The feature's
calculations live in `geo.ts` (distance and duration), `planner.ts` (pruning, graph, shortest
path), `gbfs.ts` (eligibility rules), and `budget.ts` (free-window share), each covered by fixtures
in `tests/fixtures/`.

**Setup changes to existing files**:
- `next.config.ts`: add `output: 'export'`.
- `package.json`: replace the `start` script, which does nothing under static export, with serving
  `out/` from any static file server; add `test` and `test:watch`.
- Add `vitest.config.mts` with `plugins: [tsconfigPaths(), react()]` and
  `test.environment: 'jsdom'`.
- `app/page.tsx`: replace the create-next-app placeholder.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|--------------------------------------|
| `maplibre-gl` added as a runtime dependency | FR-015 requires a map, FR-002 requires setting the origin by clicking it, FR-026 requires it to keep centre and zoom across recomputation, and FR-027 requires browsing stations before any input. Hand-rolling vector tile rendering is not plausible. | A static image map was rejected: it cannot satisfy the click-to-set-origin or free-pan requirements above. |
| Six test packages added | Principle III makes unit tests over frozen fixtures mandatory, so a runner is required. The set is exactly what the framework's own Vitest guide prescribes; `vite-tsconfig-paths` is what makes the existing `@/*` mapping resolve in tests. | None. A test runner is not optional under this constitution, and inventing a different setup than the documented one would create avoidable breakage. |

No other complexity is claimed. Notably **not** taken, to be justified separately if ever needed:
A\* instead of Dijkstra, a web worker, a precomputed distance matrix, a state management library, a
component library, and `next/image`. Research R11 records the escalation order if the SC-012
benchmark fails.
