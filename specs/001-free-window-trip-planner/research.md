# Phase 0 Research: Free-Window Trip Planner

**Feature**: 001-free-window-trip-planner
**Date**: 2026-07-26
**Input**: [spec.md](./spec.md), [constitution](../../.specify/memory/constitution.md)

## R1. Build tooling: Next.js static export

**Decision**: keep the existing Next.js 16.2.12 App Router scaffold and enable static export with
`output: 'export'` in `next.config.ts`. Deploy the generated `out/` directory to Cloudflare Pages.

**Rationale**: satisfies Principle I with no server, and keeps the constitution's Technology &
Deployment Constraints section intact, so no amendment is needed and no governance debt is created.
The scaffold, the Tailwind 4 wiring, and the `@/*` path mapping all already exist and work.

**Verified against** `node_modules/next/dist/docs/01-app/02-guides/static-exports.md`:
- `output: 'export'` is the supported mechanism; `next export` was removed in v14.
- The output directory is **`out`**, not `dist`. `distDir` can change it; we will not.
- `next dev` errors when an unsupported feature is used, so the static-export constraint is
  enforced during development rather than discovered at build time. This is a real advantage over
  a plain bundler: the guardrail is automatic.

**Alternatives considered**: Vite with `@vitejs/plugin-react`. Rejected. It would have produced an
equally valid static build, but it contradicts the ratified constitution and would have required a
v1.1.0 amendment plus removal of a working scaffold, for no functional gain.

## R2. Static-export constraints that shape the design

These are not optional style choices; they are enforced by the framework.

**Client Components are prerendered to HTML during `next build`.** `window`, `navigator`, and
`localStorage` do not exist at that moment. Therefore:
- MapLibre may only be instantiated after mount, inside `useEffect`, never during render.
- `navigator.geolocation` may only be read after mount. FR-003's requirement that the app work
  without location permission is aligned with this: nothing may block on geolocation.
- Any persistence must be read after mount, never during render.

**Unsupported and therefore unavailable to us**: rewrites, redirects, headers, proxy, cookies,
Server Actions, Route Handlers that read the request, ISR, and Image Optimization with the default
loader. Two consequences worth stating:
- The GBFS proxy contingency (R6) cannot be implemented as a Next.js rewrite. This is the correct
  outcome: a proxy is a server, and Principle I forbids one. If cross-origin access disappears, the
  app degrades.
- `next/image` with the default loader is unsupported. This feature ships no content images, so the
  simplest course is not to use `next/image` at all. If one is ever needed, set
  `images: { unoptimized: true }` and record why.

**Routing**: the feature is a single route. No dynamic routes, so `generateStaticParams` never
enters the picture.

**Script change**: `next start` is meaningless under `output: 'export'`. Replace it with serving
`out/` through any static file server, which is also what Cloudflare Pages does.

## R3. Dependency versions

**Decision**: keep what `package.json` already pins; add only what is missing. Versions for new
packages read from the npm registry on 2026-07-26 and pinned exactly at install.

Already present, unchanged:

| Package | Version | Role |
|---|---|---|
| next | 16.2.12 | framework, static export |
| react / react-dom | 19.2.4 | UI layer |
| typescript | ^5 | types |
| tailwindcss + @tailwindcss/postcss | ^4 | styling |
| eslint + eslint-config-next | ^9 / 16.2.12 | linting |

To add:

| Package | Version | Role | Ships to browser |
|---|---|---|---|
| maplibre-gl | 6.0.0 | map rendering | yes |
| vitest | 4.1.10 | test runner | no |
| @vitejs/plugin-react | 6.0.4 | JSX transform for Vitest | no |
| jsdom | 29.1.1 | DOM environment for component tests | no |
| @testing-library/react | 16.3.2 | component test helpers | no |
| @testing-library/dom | 10.4.1 | peer of the above | no |
| vite-tsconfig-paths | 6.1.1 | resolves `@/*` inside Vitest | no |

`maplibre-gl` is the only new runtime dependency. Everything else is test tooling.

**Note on TypeScript**: the registry's current major is 7.0.2, but this repo pins `^5` and the
scaffold is built around it. Do not upgrade as a side effect of this feature. A TypeScript major
upgrade is its own change with its own justification.

## R4. Test setup

**Decision**: Vitest with a `vitest.config.mts` at the repo root, per
`node_modules/next/dist/docs/01-app/02-guides/testing/vitest.md`: `plugins: [tsconfigPaths(),
react()]`, `test.environment: 'jsdom'`.

**Rationale**: this is the setup the framework's own documentation prescribes, so it needs no
invention. `vite-tsconfig-paths` is what makes the existing `@/*` mapping resolve inside tests.

**Caveat recorded in the same doc**: Vitest does not support `async` Server Components. This feature
has none; the entire UI is client-side because it depends on browser APIs and live feed data.
Nothing here needs an E2E runner as a result.

**Division of labour**: the pure modules in `lib/` are the ones Principle III makes mandatory to
test, and they need no DOM at all. The jsdom environment exists only for the thin component tests
that cover FR-018b's assistive-technology requirement.

## R5. Styling

**Decision**: Tailwind CSS, already installed and configured. No component library.

**Rationale**: named by the constitution, already wired through `@tailwindcss/postcss`, and keeping
it avoids a change with no functional payoff. No component library keeps the UI thin per
Principle III.

## R6. Map rendering and tiles

**Decision**: MapLibre GL JS against OpenFreeMap's public vector tiles, no key.

**Rationale**: satisfies Principle II directly, since no account exists to create. MapLibre is the
open fork of Mapbox GL JS and needs no token of its own.

**Obligations this creates** (Principle V applies to every data source, not only GBFS):
- OpenStreetMap attribution must be rendered on the map. The exact required attribution string, and
  OpenFreeMap's own attribution and usage terms, must be read from the provider's documentation
  before launch, not inferred.
- The tile and style URLs live in the same isolated constants module as the GBFS base URL.

**Static-export interaction**: MapLibre touches `window` and WebGL, so the map component must be a
Client Component that creates its map instance inside `useEffect`. Server-side prerendering of that
component must produce an empty container.

**Risk**: OpenFreeMap is a free public service with no availability guarantee. If tiles fail, the
map degrades but the planner keeps working, because planning depends on station coordinates rather
than on tiles. This must be structural: no code in `lib/` may import anything from the map layer.

## R7. Geocoding

**Decision**: the public Photon API, keyless, with input debouncing and a location bias toward the
network's service area. Manual entry and map-click entry (FR-002) remain the guaranteed path.

**Rationale**: Photon needs no account, satisfying Principle II. Biasing to the service area makes
short queries usable in Montreal without a full national search.

**Obligations and open items**:
- The exact public instance host and its usage policy must be read and pinned in the constants
  module before implementation. Do not hard-code a host from memory.
- Debouncing is a courtesy obligation under Principle V, not only a UX nicety. A request per
  keystroke against a free public instance is exactly what gets endpoints closed.
- If the instance forbids this use or is unavailable, search degrades and the user falls back to
  FR-002's other two input methods. Search is optional by construction.

## R8. GBFS ingestion

**Decision**: fetch GBFS 2.2 directly from the browser. Merge `station_information` (static
attributes, coordinates, capacity) with `station_status` (live counts and operational flags) on
`station_id`. Identify mechanical bikes by cross-referencing each station's per-vehicle-type
availability against the system's vehicle type catalogue, selecting the human-powered type.

**Rationale**: no backend is permitted, so the browser is the only fetcher. The provider allows
cross-origin requests, which makes this viable without a proxy.

**Open items to verify against the live feed when capturing fixtures, not from memory**:
- The exact field names and shapes for per-station vehicle type availability and for the vehicle
  type catalogue in this provider's 2.2 feed.
- Which propulsion or form-factor value identifies a mechanical bike in this provider's data.
- Whether `ttl` is published per feed or globally, and its value.
- The published license and attribution text.

**Design safeguards**:
- The feed base URL is a single exported constant in `lib/endpoints.ts`.
- Parsing is total: unknown fields ignored, missing optional fields do not throw, malformed input
  yields a typed failure rather than an exception (FR-030).
- Fetching happens in a client component effect, never during render, because static export
  prerenders components at build time and a build-time fetch would bake in stale data.

## R9. Duration estimation without a routing engine

**Decision**: great-circle distance multiplied by a calibrated detour factor, divided by the
configured speed. Both the detour factor and the speed are named constants with conservative
defaults, exposed as user-adjustable parameters where the spec requires it (FR-021).

**Rationale**: a client-side routing engine over street data would mean shipping a large graph to
the browser, at odds with the one-second budget (SC-012) and with a static deployment. The spec
promises honest estimates (FR-020), not turn-by-turn accuracy, and Principle IV requires
conservative defaults.

**Calibration task**: the detour factor default must be derived by comparing straight-line distance
against real cycling distance for a sample of Montreal origin-destination pairs, then rounded
upward. It must not be picked from memory. Record the sample and the resulting value in a comment
beside the constant.

**Optional enhancement**: an external routing service may draw a prettier polyline. It must never
feed the feasibility calculation, so the plan is identical whether or not it responds. A test
asserts this, which keeps the enhancement genuinely optional under Principle II.

## R10. Planning algorithm

**Decision**: prune candidate stations with an ellipse whose foci are the origin and destination,
build a directed graph over the survivors, and run plain Dijkstra.

**Correctness argument for plain Dijkstra**: docking fully resets the free-window counter, so no
residual budget carries across a stop. The free-window rule is therefore a per-edge feasibility
filter, not a resource accumulated along the path. With additive non-negative edge costs and no
state to propagate, the problem reduces to a single-objective shortest path. No multi-criteria or
resource-constrained search is needed.

**Graph construction**, derived from the spec's station rules:
- Partition stations into *can-start* (mechanical bike available above the reserve, FR-011) and
  *can-end* (free docks above the reserve, FR-012). Stations failing FR-013's operational flags are
  excluded from both.
- A virtual source connects by walk edges to *can-start* stations within the maximum walking
  distance. Only the first pickup needs an available bike (FR-011a).
- Bike edges run from any station to a *can-end* station, and exist only if the estimated segment
  duration is at or below the free limit minus the safety margin (FR-004).
- Intermediate stations need free docks only, since the rider re-takes their own bike. Every
  *can-end* station is therefore a valid continuation point with no further condition.
- A virtual sink is reached by walk edges from *can-end* stations within the maximum walking
  distance.
- A direct source-to-sink walk edge represents walking the whole way, so FR-032 falls out of the
  same computation rather than needing a special case.

**Edge costs**: bike edges cost their estimated duration, plus the docking cooldown when the edge
ends at an intermediate stop rather than at the sink. Walk edges cost their walking duration. This
makes Dijkstra's objective exactly FR-009's "total estimated duration including walking legs and
docking stops".

**Ellipse pruning**: a station can only lie on a route whose total travel distance is bounded, so
stations whose summed distance to the two foci exceeds that bound cannot appear on any admissible
path. The bound derives from the maximum total trip duration the parameters allow. Pruning must be
provably conservative: it may only remove stations no admissible path could use. This gets a
dedicated property test, because a false negative is a correctness bug rather than a slow path.

**Alternatives considered**:
- *A\* with a straight-line heuristic*: valid, deferred. Dijkstra over the pruned set is expected to
  meet SC-012, and adding a heuristic before measuring would be unjustified complexity.
- *Precomputed all-pairs matrix*: rejected. It would need recomputing on every parameter change,
  which is the common case in US3.

## R11. Meeting the one-second budget (SC-012)

**Decision**: measure before optimising. Ship Dijkstra over the pruned graph with a benchmark test
over a full-size fixture that fails if a plan exceeds the budget.

**Rationale**: SC-012 is a testable claim, so it gets a test rather than an assumption. If the
benchmark fails, the recorded escalation order is A\*, then a web worker, each justified in
Complexity Tracking when taken.

## R12. State management

**Decision**: `useState` plus React context. No state library.

**Rationale**: the state is small and mostly local: origin, destination, parameters, current plan,
feed status. Principle III keeps derivation in pure modules, so components hold inputs and results
rather than derived state.

**Map state note**: FR-026 requires map centre and zoom to survive a parameter change. The MapLibre
instance must own its view state rather than being driven by React state, so a re-render cannot
reset it. This is precisely the failure that requirement guards against, and it is also why the map
instance is created once in an effect and kept in a ref.
