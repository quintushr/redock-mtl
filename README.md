# redock-mtl

A trip planner for bike-share networks that keeps you inside your
subscription's free window, first target Montreal.

Subscriptions include a free duration per ride. Past it, every minute is billed.
Docking a bike and taking it again after a short cooldown resets that counter, so
a ride too long to be free stays free if it is split into short enough segments.
This app works out where to stop.

Everything runs in your browser. There is no server, no account, and no tracking.

## Run it

```bash
git clone <repo>
cd redock-mtl
npm install
npm run dev
```

That is the whole setup. No `.env` file, no API key, no signup, no database.
The app fetches public station feeds directly from the browser and renders
keyless map tiles, so it is fully functional on first run.

If any of that ever stops being true, the change should be rejected in review.
See the [constitution](.specify/memory/constitution.md).

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Dev server. Errors on any feature needing a server, which is the static-export guardrail |
| `npm run build` | Static export into `out/` |
| `npm test` | Vitest over the pure modules, against frozen fixtures, no network |
| `npm run test:watch` | Same, in watch mode |
| `npm run lint` | ESLint, including the rule keeping React out of `lib/` |
| `npm run i18n:report` | What each language is missing, and which entries nothing reads |

`next start` does not apply: the build is a static export. To check a production
build, serve `out/` with any static file server.

## Layout

```
app/            Next.js App Router: layout, the single route, global styles
components/     React UI, a thin layer over lib/
lib/            pure core: no React, no DOM, no global state
  types.ts        shared data types
  geo.ts          distance, duration estimation, hull, ellipse pruning
  gbfs.ts         feed parsing, station eligibility, service area
  planner.ts      graph construction and Dijkstra; entry point planTrip
  params.ts       defaults and validation
  budget.ts       free-window share and status thresholds
  endpoints.ts    every external URL, isolated on purpose
  feed-client.ts  fetching and ttl-aware caching (the one impure module)
tests/
  unit/         Vitest specs mirroring lib/
  fixtures/     frozen station JSON, committed, never fetched at test time
```

The dependency direction is one way: `components/` imports from `lib/`, never
the reverse. A lint rule enforces it.

## How the planning works

Candidate stations are pruned with an ellipse whose foci are the origin and the
destination. The survivors form a graph where an edge exists only if that
segment fits the free window, and edge cost is the ride plus the docking
cooldown. Then plain Dijkstra.

Plain Dijkstra is enough because docking fully resets the counter: the free
window is a per-edge feasibility filter, not a resource accumulated along the
path. There is no residual state to propagate, so no multi-criteria search is
needed.

One consequence is worth knowing. Only the **first** station needs an available
mechanical bike. Every later stop only needs a **free dock**, because you take
back the same bike you just docked.

Durations come from great-circle distance times a calibrated detour factor,
divided by your speed. There is no routing engine: shipping a street graph to
the browser would break both the one-second budget and the static deployment.

## Estimates are estimates

Durations are approximations and the interface says so. There is no arrival
time anywhere in the app, and adding one would be a bug.

Every value that affects the result is visible and adjustable: free window,
safety margin, cycling speed, walking speed, maximum walk, docking cooldown,
unlock-and-dock time, bike and dock reserves, and the detour factor. Defaults are
conservative rather than flattering. Availability is a snapshot with its
timestamp shown, never a reservation.

## Data sources

All three are keyless, and all three are used on their operators' terms.

| Source | Used for | Required |
|---|---|---|
| The network's public GBFS feeds | Station positions and live availability | Yes |
| OpenFreeMap vector tiles | The map | No, the planner works without it |
| Photon (komoot) | Address search | No, map click and manual entry always work |

Feeds are cached client-side and never polled faster than their declared `ttl`,
nor faster than the app's own slower floor. Operator attribution and licence are
shown in the interface. Only public, documented endpoints are called.

If the station feed is unavailable, stale, or out of season, the app says so
explicitly and keeps working. It never shows a blank screen or a raw error.

## Deploying

Static hosting only. Any host that serves a directory of files will do.

For Cloudflare Pages, the project settings are:

| Setting | Value |
|---|---|
| Build command | `npm run build` |
| Build output directory | `out` |
| Environment variables | none |
| Functions | none |
| Bindings | none |

Needing any of those last three would mean the deployment has drifted away from
running at zero cost.

## Translating

Every string the interface shows lives in `lib/i18n/messages/`, one file per
language, grouped by the part of the interface it belongs to. They hold data and
nothing else: no code, no arithmetic, no conditions.

**To correct a sentence**, open the file for that language, find the entry,
change the text, leave the key alone. One file, one line. You do not need to read
any application code, and you do not touch the other language.

**To add a language**, copy `lib/i18n/messages/fr.ts`, translate it, and add a
descriptor to `LANGUAGES` in `lib/i18n/languages.ts`:

```ts
{ id: "es", name: "Español", code: "ES", formatting: "es-MX" }
```

That is the whole procedure. The toggle picks the language up from that list;
nothing else has a list to update.

`npm test` will tell you what is left: entries you have not translated, entries
you left identical to the French without saying so, and placeholders you dropped
or invented. Each names the entry and what to do about it. `npm run i18n:report`
prints the same thing as a summary whenever you want it.

Two things worth knowing before you start:

- **Counts use plural maps, never a comparison against 1.** French puts zero in
  the singular and English in the plural, and a language may have four forms
  where French has two. Write the categories your language actually uses;
  `Intl.PluralRules` picks between them.
- **Durations always carry their hedge** — "environ", "about". They are
  estimates, and the constitution requires them to say so.

The full guide is in
[specs/003-maintainable-i18n/quickstart.md](specs/003-maintainable-i18n/quickstart.md).

## Contributing

Read the [constitution](.specify/memory/constitution.md) first. It is short, and
it is binding: zero operating cost, no mandatory API keys, a pure and tested
domain core, honest estimates, and respect for the data sources.

Practical consequences when you open a pull request:

- Changes under `lib/` ship with their tests in the same change.
- Interface text goes in `lib/i18n/messages/`, never inline in a component. A
  test renders every screen in English and fails on any French it finds.
- No new runtime dependency without a justification in the pull request.
- `npm run build` must still produce `out/` with nothing expecting a server.
- A clean clone with no environment variables must still reach a working plan.

Design documents live in [specs/001-free-window-trip-planner/](specs/001-free-window-trip-planner/):
the specification, the plan, the research decisions with their rejected
alternatives, and the task list.
