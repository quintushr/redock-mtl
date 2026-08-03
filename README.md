# Redock

**A trip planner that keeps your BIXI ride inside the free window.** Montreal
first; the planner itself is general over any GBFS network.

[![CI](https://github.com/quintushr/redock-mtl/actions/workflows/ci.yml/badge.svg)](https://github.com/quintushr/redock-mtl/actions/workflows/ci.yml)
[![Licence: MIT](https://img.shields.io/badge/licence-MIT-blue.svg)](LICENSE)
[![Container](https://img.shields.io/badge/ghcr.io-redock--mtl-blue.svg)](https://github.com/quintushr/redock-mtl/pkgs/container/redock-mtl)

A BIXI subscription includes 45 minutes per trip. Past that, every minute is
billed at 19¢ before taxes.

> Docking a bike and taking it again after a short cooldown resets that counter.
> So a ride too long to be free stays free if it is split into short enough
> segments.

This app works out where to stop. Everything runs in your browser: no server, no
account, no cookie, and nothing to sign up for. Where you are going is never sent
anywhere it is not needed to draw your route. If any of that ever stops being
true, the change should be rejected in review. See the
[constitution](.specify/memory/constitution.md).

A deployment may switch on cookieless page-view counting, which ships **off** and
is off in this repository. What it can send is a page path and nothing else — no
address, no coordinate, no query string, by construction rather than by policy.

Not affiliated with BIXI Montréal. The two figures above are the operator's
published prices, read on 2026-07-27 from
[bixi.com/tarifs](https://bixi.com/fr/tarifs/), and both are adjustable in the app.

## What it does

- **Splits the ride** into segments that each fit the free window, and names the
  station to dock at between them.
- **Shows what is left, never what is spent.** Every step reports the free time
  you will still have on arrival, as a gauge you can read without reading the
  number.
- **Prices the alternative**, so the saving is a figure rather than a claim: what
  the planned trip costs, against what riding straight through would.
- **Draws the real streets**, and is honest about which segments were measured and
  which are still straight-line estimates.
- **Says when it does not know.** A stale feed, an unreachable service or a
  network out of season is stated plainly, and the app keeps working.
- **French and English**, switchable in one click and remembered.

Only the **first** station needs an available mechanical bike. Every later stop
needs only a **free dock**, because you take back the bike you just docked. That
single asymmetry is most of why this works.

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
  remaining.ts    free-window share and status thresholds
  pricing.ts      what a plan costs, and what it saves
  format.ts       durations, distances and money, by locale
  corrections.ts  wording a rejected parameter set back to the reader
  geocode.ts      address parsing and geocoder result labelling
  route-geometry.ts   parsing, plausibility, keys, duration from a real path
  route-refinement.ts the refinement state machine: what to fetch, whether to
                      replan, when to stop. Pure and synchronous on purpose.
  endpoints.ts    every external URL and tuning constant, isolated on purpose
  i18n/           the wording, one file per language, plus coverage checks
  runtime-config.ts  /config.json read at start-up (impure)
  feed-client.ts  fetching and ttl-aware caching (impure)
  routing.ts      route geometry: fetch, session cache, request ceiling (impure)
  path-store.ts   browser-local store of station-to-station geometry (impure)
  params-store.ts browser-local store of the reader's planning parameters (impure)
  analytics.ts    optional page-view counting: path normalisation, the host
                  rules, and the one call that reaches the tracker (impure,
                  off unless two env vars are set, one importer)
tests/
  unit/         Vitest specs mirroring lib/
  fixtures/     frozen provider JSON, committed, never fetched at test time
```

The dependency direction is one way: `components/` imports from `lib/`, never the
reverse. A lint rule enforces it.

## How the planning works

Candidate stations are pruned with an ellipse whose foci are the origin and the
destination. The survivors form a graph where an edge exists only if that segment
fits the free window, and edge cost is the ride plus the docking cooldown. Then
plain Dijkstra.

Plain Dijkstra is enough because docking fully resets the counter: the free window
is a per-edge feasibility filter, not a resource accumulated along the path. There
is no residual state to propagate, so no multi-criteria search is needed.

Durations start from great-circle distance times a calibrated detour factor,
divided by your speed, then get replaced by the measured length of a real path as
those arrive. No street graph is shipped to the browser: that would break both the
one-second budget and the static deployment.

Every value that affects the result is visible and adjustable, and the defaults
are conservative rather than flattering: free window, safety margin, cycling and
walking speed, maximum walk, docking cooldown, unlock-and-dock time, bike and dock
reserves, the detour factor, and the overage rate. Durations are announced as
estimates, there is no arrival time anywhere in the app, and adding one would be a
bug. Availability is a snapshot with its timestamp shown, never a reservation.

## Data sources

All four are keyless, and all four are used on their operators' terms.

| Source | Used for | Required |
|---|---|---|
| BIXI's public GBFS feeds | Station positions and live availability | Yes |
| OpenFreeMap vector tiles | The map | No, the planner works without it |
| Photon (komoot) | Address search | No, map click and manual entry always work |
| BRouter | The real path between two points | No, the plan falls back to a straight-line estimate |

Only public, documented endpoints are called, and operator attribution and licence
are shown in the interface. Feeds are cached client-side and never polled faster
than their declared `ttl`, nor faster than the app's own slower floor.

The same restraint applies to the two optional services, and none of them
publishes a rate limit: the absence of one is not permission. Paths are requested
only for segments actually on screen, at most once per segment per plan, under a
hard ceiling across a whole user request, never on hover or keystroke, never
retried automatically, and stored in the browser so a repeated trip costs the
service nothing. Requesting a path sends the two ends of that segment to BRouter,
which is stated in the interface rather than left for someone to discover.

## Deploying

Static hosting only. Any host that serves a directory of files will do.

For Cloudflare Pages, the project settings are:

| Setting | Value |
|---|---|
| Build command | `npm run build` |
| Build output directory | `out` |
| Environment variables | none required, two optional for [audience measurement](#audience-measurement) |
| Functions | none |
| Bindings | none |

Needing a function or a binding would mean the deployment has drifted away from
running at zero cost. The same settings work on Vercel, which builds the same
static export.

CI also fails if the build output grows past a stated ceiling. The number and the
reasoning live in `.github/workflows/ci.yml`; the short version is that a
browser-only planner stops being free to use long before it stops being free to
host, and weight is how that happens without anyone deciding it.

## Self-hosting

You do not need this to use the project, since the public deployment is free and
keyless. It is here so that a fork can run its own copy, and so that the four
external services can be pointed somewhere else.

```bash
docker run --rm -p 8080:8080 ghcr.io/quintushr/redock-mtl:latest
```

Then open <http://localhost:8080>. `nginx` runs unprivileged inside the container
and listens on 8080, so nothing needs root and no capability is added. There is a
liveness endpoint at `/healthz`.

Tags, all of them naming one image built for `linux/amd64` and `linux/arm64`:

| Tag | What it is |
|---|---|
| `latest` | The tip of `main` |
| `dev` | The tip of `dev` |
| `1.2.3`, `1.2`, `1` | A released tag, at three levels of precision |
| `sha-abc1234` | An exact commit. Use this if you want a build that cannot move |

### Changing the services it talks to

Build-time environment variables cannot do this. `next build` inlines every
`NEXT_PUBLIC_*` value into the bundle, so an image built against one geocoder is an
image that talks to that geocoder forever, and passing `-e` to `docker run` has no
effect whatsoever.

The image therefore reads `/config.json` from its own web root when the page loads.
Replace it with a volume mount and restart; nothing is rebuilt:

```bash
cp config.example.json config.json
# edit config.json

docker run --rm -p 8080:8080 \
  -v "$(pwd)/config.json:/usr/share/nginx/html/config.json:ro" \
  ghcr.io/quintushr/redock-mtl:latest
```

Every key is optional, and each one falls back on its own:

```json
{
  "stationsFeedUrl": "https://gbfs.velobixi.com/gbfs/2-2/gbfs.json",
  "routingBaseUrl": "https://brouter.de/brouter",
  "geocoderUrl": "https://photon.komoot.io/api/",
  "mapStyleUrl": "https://tiles.openfreemap.org/styles/positron"
}
```

- A key that is missing, blank, not a string, or not an absolute `http`/`https`
  URL falls back to the value the image was built with, that key alone, leaving the
  other three as they were. So a config file that only changes the tile server is
  one line long, and a typo in one entry cannot silently move the rest.
- Keys the build does not recognise are ignored, `_comment` included.
- **The application starts without this file.** A missing, unreachable or
  unparseable `config.json` is a supported state, not a degraded one: it is how the
  public deployment runs, where there is no such file at all.
- `nginx` serves it with `Cache-Control: no-store`, and the browser requests it the
  same way, so an edit is live on the next reload rather than whenever a cache
  happens to expire.

Pointing `stationsFeedUrl` at another city's GBFS feed is the interesting one, and
it is only half a port: the planner is general over any GBFS network, but the free
window, the docking cooldown and the overage rate are BIXI's, and they are defaults
in the settings rather than anything read from a feed. Change them in the settings
overlay, or in `lib/params.ts` for your own build.

If you are hosting the static files yourself without the container, put
`config.json` beside `index.html` and serve it with `Cache-Control: no-store`.
Everything above applies unchanged; the container is only a web server with that
one header already set.

## Translating

Every string the interface shows lives in `lib/i18n/messages/`, one file per
language, grouped by the part of the interface it belongs to. They hold data and
nothing else: no code, no arithmetic, no conditions.

**To correct a sentence**, open the file for that language, find the entry, change
the text, leave the key alone. One file, one line. You do not need to read any
application code, and you do not touch the other language.

**To add a language**, copy `lib/i18n/messages/fr.ts`, translate it, and add a
descriptor to `LANGUAGES` in `lib/i18n/languages.ts`:

```ts
{ id: "es", name: "Español", code: "ES", formatting: "es-MX" }
```

That is the whole procedure. The toggle picks the language up from that list;
nothing else has a list to update.

`npm test` will tell you what is left: entries you have not translated, entries you
left identical to the French without saying so, and placeholders you dropped or
invented. Each names the entry and what to do about it. `npm run i18n:report`
prints the same thing as a summary whenever you want it.

Two things worth knowing before you start:

- **Counts use plural maps, never a comparison against 1.** French puts zero in the
  singular and English in the plural, and a language may have four forms where
  French has two. Write the categories your language actually uses;
  `Intl.PluralRules` picks between them.
- **Durations always carry their hedge**, "environ" and "about". They are
  estimates, and the constitution requires them to say so.

The full guide is in
[specs/003-maintainable-i18n/quickstart.md](specs/003-maintainable-i18n/quickstart.md).

## Contributing

Read the [constitution](.specify/memory/constitution.md) first. It is short, and it
is binding: zero operating cost, no mandatory API keys, a pure and tested domain
core, honest estimates, and respect for the data sources.

Practical consequences when you open a pull request:

- Changes under `lib/` ship with their tests in the same change.
- Interface text goes in `lib/i18n/messages/`, never inline in a component. A test
  renders every screen in English and fails on any French it finds.
- No new runtime dependency without a justification in the pull request.
- `npm run build` must still produce `out/` with nothing expecting a server.
- A clean clone with no environment variables must still reach a working plan.

CI runs four gates on every pull request and on `main` and `dev`, in this order.
Run them locally first and there are no surprises:

```bash
npm run lint && npm run typecheck && npm test && npm run build
```

Design documents live in [specs/001-free-window-trip-planner/](specs/001-free-window-trip-planner/):
the specification, the plan, the research decisions with their rejected
alternatives, and the task list.

## Licence

The code is **MIT**. See [LICENSE](LICENSE). Fork it, host it, sell it, no
attribution to this repository required.

That covers the code and only the code, and the distinction matters more here than
in most projects: almost nothing this application puts on the screen belongs to it.
Three regimes coexist in this repository, and MIT is one of them.

| What | Regime |
|---|---|
| Everything under `app/`, `components/`, `lib/`, `scripts/`, `tests/unit/` | MIT, this repository |
| Map tiles, route geometry, geocoding results, all fetched at runtime | OpenStreetMap data, **ODbL**. Not ours to relicense |
| Station availability, fetched at runtime | The operator's, under their terms |
| Captured provider output under `tests/fixtures/` | Redistributed third-party data. See [tests/fixtures/README.md](tests/fixtures/README.md#provenance-and-licensing) |

Practical consequences if you fork this:

- **The runtime attribution is not decoration and not optional.**
  `components/MapAttribution.tsx` credits OpenFreeMap, OpenMapTiles and
  OpenStreetMap on the map, and BRouter whenever a measured path is on screen. ODbL
  requires it. `docs/ui-guidelines.md` also forbids truncating it, which is why it
  wraps rather than ellipsing. Removing it to tidy the map is a licence breach, not
  a design choice.
- **The committed fixtures are not MIT.** They are extracts of the operator's GBFS
  feed, of Photon's output and of BRouter's, kept frozen so the tests never touch
  the network. MIT is this repository's grant over its own work and cannot grant
  anything over theirs.
- **"BIXI" is the operator's trademark**, and no licence here changes that. This
  project is not affiliated with, endorsed by, or connected to the operator in any
  way. If you fork it and publish it, say so plainly wherever a reader could
  mistake yours for theirs.
- **Pointing the app at another city** puts you under that operator's terms rather
  than these. See the Self-hosting section above; the code is general over GBFS, the
  permissions are not.
