# Quickstart: Real Route Geometry

**Feature**: 004-real-route-geometry | **Date**: 2026-07-28

---

## Run it

```bash
npm install
npm run dev          # nothing to configure; no key, no account, no env file
npm test
npm run lint
npm run build        # must still produce a static export
```

The feature needs no environment variable. Setting one is the exception, not the setup:

```bash
# Optional, build-time only. Points at a self-hosted BRouter or another provider.
# NEXT_PUBLIC_ values are inlined at build; the built app ignores later changes.
NEXT_PUBLIC_ROUTING_BASE_URL=https://my-brouter.example/brouter npm run build
```

---

## Check it by hand

The public instance, exactly as the app calls it:

```bash
curl -s 'https://brouter.de/brouter?lonlats=-73.5673,45.5017|-73.5540,45.5088&profile=trekking&alternativeidx=0&format=geojson&trackname=redock-mtl' \
  | python3 -c 'import json,sys; d=json.load(sys.stdin); p=d["features"][0]; print(p["properties"]["track-length"], "m,", len(p["geometry"]["coordinates"]), "points")'
```

Expected: a length in metres and a few dozen points. `profile=hiking-beta` is the walking one;
`walking` and `foot` do not exist on this instance and return 500.

---

## What to look at in the browser

1. Plan a trip across the river. The bike line should cross at a bridge, not through the water.
2. Watch the first paint: the plan is complete and readable **before** any line resolves. Throttle
   the network in devtools to make this obvious.
3. Compare a resolved segment with an unresolved one: solid and heavy against dashed and thin.
4. Reload and plan the same trip. The Network tab should show no request for the station-to-station
   segments. The walk legs are re-requested by design.
5. Block `brouter.de` in devtools. Everything still works; every line is dashed and every leg says
   so in words.
6. Pan the map, then let a path arrive. The camera must not move.

---

## Tests

Everything with logic in it is a pure function and is tested against a committed fixture. No test
touches the network.

| File | Covers |
|---|---|
| `tests/fixtures/brouter-trekking.json` | a real captured response, `messages` included |
| `tests/fixtures/brouter-hiking.json` | the walking profile |
| `tests/fixtures/brouter-malformed.json` | truncated / wrong-shaped payloads |
| `tests/unit/route-geometry-parse.test.ts` | every row of the rejection table in `contracts/route-source.md` |
| `tests/unit/route-geometry-plausibility.test.ts` | both FR-326 checks, at and past their thresholds |
| `tests/unit/route-geometry-key.test.ts` | key identity, and that A→B ≠ B→A |
| `tests/unit/route-geometry-anchor.test.ts` | a snapped path still meets its station markers |
| `tests/unit/route-geometry-budget.test.ts` | which measured durations break the segment budget |
| `tests/unit/route-refinement.test.ts` | state transitions: what to fetch, how a result folds in |
| **`tests/unit/route-refinement-correction.test.ts`** | **the case that matters: a measured length pushes a segment over budget, `nextAction` says replan, the corrected plan drops that edge. Imports only `lib/`. No React.** |
| `tests/unit/route-refinement-sequence.test.ts` | complete plan before any path; results fold in independently; stale results discarded |
| `tests/unit/planner-measured.test.ts` | identical output without the lookup; measured pairs honoured with it |
| `tests/unit/path-store.test.ts` | LRU eviction, quota failure, schema bump, absent storage |
| `tests/unit/routing-boundaries.test.ts` | the six prohibitions, including no `fetch` under `components/` except the adapter |
| `tests/unit/traced-itinerary-degraded.test.tsx` | everything renders with every step forced to `approximate` |
| `tests/unit/map-styling.test.ts` | traced width strictly greater than approximate width, both modes |
| `tests/unit/itinerary-trail-status.test.tsx` | a word per status, in the accessible name |
| `tests/unit/routing-abort.test.ts` | a superseded plan must not poison the segments it had in flight |
| `tests/unit/traced-itinerary-hook.test.tsx` | the adapter end to end, including supersession mid-flight |
| `tests/fixtures/brouter-corridor.json` | a captured 11.2 km corridor, 645 points (US7) |
| `tests/unit/route-corridor-projection.test.ts` | cumulative lengths, projection onto a vertex and onto a segment, the band filter (US7) |
| `tests/unit/route-corridor-distances.test.ts` | along-route distance per pair, access counted twice, stations outside the band (US7) |
| `tests/unit/route-corridor-clamp.test.ts` | the `max` rule, including the measured 21% underestimate of research R14 (US7) |
| `tests/unit/route-refinement-corridor.test.ts` | the corridor round: asked once, degrades to the estimate, replans without claiming a correction (US7) |

Capture a fixture rather than writing one by hand:

```bash
curl -s 'https://brouter.de/brouter?lonlats=-73.5673,45.5017|-73.5540,45.5088&profile=trekking&alternativeidx=0&format=geojson' \
  > tests/fixtures/brouter-trekking.json
```

---

## Where things live

```text
lib/endpoints.ts        # + base URL, profile names, attribution, tuning constants
lib/types.ts            # + RouteProfile, TracedPath, PathStatus, StepGeometry,
                        #   TracedItinerary, MeasuredDistance, RefinementState, NextAction
lib/route-geometry.ts   # NEW, pure: parse, plausibility, key, duration, anchoring
lib/route-refinement.ts # NEW, pure: what to fetch, how a result folds in,
                        #   whether to replan, when to stop. No I/O, no React.
lib/routing.ts          # NEW, impure: fetch, in-flight collapsing, session cache
lib/path-store.ts       # NEW, impure: localStorage, LRU, purge
lib/planner.ts          # + optional measured-distance lookup. No import added.

components/useTracedItinerary.ts   # NEW, adapter only: useState, one effect,
                                   #   AbortController. Holds no decision.
                                   #   The only component allowed to fetch.
components/MapView.tsx             # line weight and dash by status. No I/O.
components/ItineraryTrail.tsx      # status word per leg, correction notice
components/AssumptionsLine.tsx     # purge control
lib/i18n/messages/*                # status wording, correction notice, purge label
```

---

## Things that will bite

- **`lonlats` is longitude first.** `LatLon` is latitude first. Build the URL in one function and
  nowhere else.
- **BRouter returns its numbers as strings.** `"track-length": "1909"`.
- **Coordinates have three components**, the third is elevation. Drop it.
- **Do not add a request header.** The instance does not answer CORS preflight; a custom header
  fails the request instead of identifying you. `trackname=redock-mtl` is the channel that works.
- **Do not use `total-time`.** It is BRouter's speed model, not the rider's parameter.
- **`localStorage` is new to this codebase.** It throws in private windows and when the quota is
  full. Every access is wrapped.
- **Do not fetch from `MapView.tsx`, or from any component but `useTracedItinerary.ts`.** The
  obvious shape for this feature is a `fetch` in a `useEffect` in the map with the correction loop
  inline beside it. It puts the replan decision inside a component that needs WebGL to
  instantiate, which makes the one case this feature exists for testable only through React and
  jsdom. `lib/route-refinement.ts` exists so that case is a plain function call.
  `tests/unit/routing-boundaries.test.ts` fails the build if this drifts.

---

# Addendum: US7, the corridor

## Check it by hand

One corridor between two stations, and what it tells you about everything near it:

```bash
curl -s 'https://brouter.de/brouter?lonlats=-73.6607,45.4483|-73.4966,45.6280&profile=trekking&alternativeidx=0&format=geojson&trackname=redock-mtl' \
  | python3 -c 'import json,sys; f=json.load(sys.stdin)["features"][0]; print(f["properties"]["track-length"], "m,", len(f["geometry"]["coordinates"]), "points")'
```

Committed as `tests/fixtures/brouter-corridor.json`: 11 220 m, 645 points, between the westmost and
eastmost stations of the frozen snapshot. That one geometry is what the corridor tests project
against, so they need no network.

## What to look at in the browser

1. Plan a trip long enough to need a stop. The first plan appears immediately, from the estimate.
2. A moment later the stops may move. That is the corridor arriving and the plan being recomputed
   with real distances. It must **not** say "your plan was corrected": nothing was invalidated
   (FR-344).
3. Plan a trip across a river or a rail cut. This is where the estimate is most wrong and where the
   corridor should change the choice of stops most visibly.
4. Block `brouter.de`. The estimated plan must still appear, be usable, and say every leg is an
   approximation. The corridor is an improvement, never a prerequisite (FR-345).

## Things that will bite

- **An along-route distance is not an upper bound on the real ride.** Measured: optimistic in two of
  six pairs, once by 21%, caused by one-ways rather than by the access approximation. Never trust it
  raw; the clamp in `clampToEstimate` is the whole safety story (FR-346, research R14).
- **The corridor is directional.** It was computed one way. Do not assume a pair of its points is
  reachable in both directions for the same distance.
- **Precompute the cumulative lengths once.** Hundreds of vertices against hundreds of stations is
  the one place in this feature where an accidental O(n³) is easy to write.
- **A corridor replan is not a correction.** `corrections` stays at zero, or the warning that
  matters gets lost in one that cries wolf on every trip.
