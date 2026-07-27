# Quickstart: Free-Window Trip Planner

**Feature**: 001-free-window-trip-planner

## Requirements

Node.js and npm. Nothing else. No account, no API key, no `.env` file, no database, no Docker.
If any of those become necessary, Principle II has been violated and the change should be rejected
in review.

## Run it

```bash
git clone <repo>
cd redock-mtl
npm install
npm run dev
```

That is the whole setup. The app fetches public GBFS feeds directly from the browser and renders
keyless map tiles, so it is fully functional on first run.

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Next.js dev server. Errors immediately if any feature requiring a server is used, which is the static-export guardrail |
| `npm run build` | Static export into `out/` |
| `npm test` | Vitest. Watches by default |
| `npm run lint` | ESLint, including the rule forbidding React imports inside `lib/` |

`next start` does not apply under `output: 'export'`. To check the production build, serve the
`out/` directory with any static file server; that is what Cloudflare Pages does.

## Layout

```
app/                  Next.js App Router: layout, the single route, global styles
components/           React UI, thin layer over lib/
lib/                  pure core, unit tested, no React and no DOM
├── types.ts          shared data types
├── geo.ts            distance, duration estimation, hull, ellipse pruning
├── gbfs.ts           feed parsing and station eligibility
├── planner.ts        graph construction and Dijkstra
├── params.ts         defaults and validation
├── budget.ts         free-window share and status thresholds
├── endpoints.ts      every external base URL, isolated on purpose
└── feed-client.ts    fetching and ttl-aware caching (impure, thin)

tests/
├── unit/             Vitest specs mirroring lib/
└── fixtures/         frozen GBFS JSON, committed, never fetched at test time
```

Both `lib/` and `components/` resolve through the `@/*` mapping already in `tsconfig.json`, so
imports read as `@/lib/planner`. The dependency direction is one-way: `components/` imports from
`lib/`, never the reverse.

## Things static export makes non-negotiable

Client Components are prerendered to HTML during `next build`, so at that moment there is no
browser:

- Create the MapLibre instance inside `useEffect`, never during render. Keep it in a ref so a
  re-render cannot reset the view (FR-026).
- Read `navigator.geolocation` only after mount, and never block on it (FR-003).
- Fetch feeds after mount. A render-time fetch would bake a stale snapshot into the shipped HTML.

Unavailable by design, and all of them things this feature does not need: rewrites, redirects,
headers, cookies, Server Actions, request-reading Route Handlers, and `next/image` with the default
loader.

## Capturing fixtures

Fixtures are captured once, by hand, and committed. Tests never hit the network.

1. Fetch the provider's GBFS feeds and save the raw JSON under `tests/fixtures/`.
2. Trim to a representative subset that still covers the cases the contract requires: a station
   with docks but no bikes, a non-operational station, an e-bike-only station, and enough
   geographic spread to force a multi-segment trip.
3. Record the capture date in a sibling `README.md`, plus the feed URLs and the license.
4. Do not re-capture on every run. Frozen means frozen; a test that changes when the network
   changes is not a unit test.

## Verifying a change against the constitution

Before opening a pull request:

- `npm run build` produces `out/` and nothing expects a server at runtime.
- A clean clone with no environment variables reaches a working plan.
- `npm test` passes with the network disabled.
- No new runtime dependency, or one justified in the pull request.
- Durations read as estimates; no to-the-minute arrival time appears anywhere.
- Operator attribution and feed license are still visible.

## Deployment

Cloudflare Pages, build command `npm run build`, output directory `out`. No environment variables,
no server-side functions, no bindings. Any of those would mean the deployment has drifted from
Principle I.
