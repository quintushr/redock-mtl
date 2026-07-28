# Implementation Plan: Real Route Geometry

**Branch**: `004-real-route-geometry` | **Date**: 2026-07-28 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/004-real-route-geometry/spec.md`

## Summary

The itinerary is drawn as straight lines between stations, so it crosses the river and the rail
yards and cannot be followed. This feature draws the path a rider can actually take, corrects the
segment durations to match it, and replans when a corrected duration no longer fits the free
window.

The approach, in one sentence: **plan exactly as today, render immediately, then fetch the
geometry of the few segments actually displayed and feed their measured distances back into the
same planner.**

Three properties carry the design:

1. `planTrip` gains one optional sparse lookup and nothing else. Without it the output is
   identical, so the domain core stays pure and every existing test stands (principle III).
2. Correction needs no repair algorithm. `planner.ts:243` already drops any edge over budget;
   inject a measured distance that pushes a segment over, replan, and the edge is gone. The
   corrected itinerary falls out of an ordinary shortest-path run.
3. Station-to-station geometry is invariant, so it is cached persistently and a repeated trip
   costs the provider nothing.

The path source is the public BRouter instance: no key, no account, `Access-Control-Allow-Origin: *`,
MIT-licensed engine over OpenStreetMap data. Every claim about it in `research.md` was verified
against the live endpoint on 2026-07-28.

## Technical Context

**Language/Version**: TypeScript 5, React 19.2.4, Next.js 16.2.12 (App Router). Authoritative in
`package.json`.

**Primary Dependencies**: unchanged. `next`, `react`, `react-dom`, `maplibre-gl`, `tailwindcss`.
**This feature adds no runtime dependency.** The path source is reached with `fetch`, the response
is GeoJSON that MapLibre's existing `route-line` layer already consumes, and the cache is
`localStorage`.

**Storage**: browser-local `localStorage`, new to this codebase. One entry per station pair per
profile, bounded at 500 entries (~1 MB), LRU eviction, user-purgeable. Walk legs are held in
memory for the session only. Nothing leaves the browser but a pair of coordinates per request.

**Testing**: Vitest over pure modules, against committed BRouter fixtures. No test touches the
network. The parser, both plausibility checks, the key function, the duration derivation and the
planner's measured-distance behaviour are all pure and directly testable.

**Target Platform**: modern browsers, static export, no runtime server.

**Project Type**: client-side web application (static export).

**Performance Goals**: first plan display unchanged, under 1 second on a mid-range phone (SC-002,
and SC-012 of feature 001). Every traced path applied within 5 seconds of that display for a
two-stop itinerary on a typical mobile connection (SC-009). At most one request per distinct
displayed step per plan (SC-008).

**Constraints**: zero operating cost, zero mandatory keys, computation in-browser, GBFS `ttl`
honoured. Added here: anchor selection and segmentation must stay computable from station data
alone (FR-325); no request for a station that is a graph candidate rather than a displayed step
(FR-330); no custom request header, because the instance does not answer CORS preflight (R7).

**Scale/Scope**: ~900 Montreal stations. A plan with two stops is 3 bike segments and 2 walk legs,
so at most 5 requests, minus cache hits. Correction rounds capped at 3.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Gate | Principle | Pass? | Notes |
|------|-----------|-------|-------|
| No backend, database, serverless function, or paid/metered service is introduced | I. Zero Operating Cost | [x] | BRouter's public instance serves `Access-Control-Allow-Origin: *` (verified 2026-07-28), so the browser calls it directly and no proxy is needed. No paid tier, no metered quota, no billing relationship to expose the maintainer. |
| All computation runs in the browser; build still produces a static export | I. Zero Operating Cost | [x] | Planning, parsing, plausibility checking, caching and rendering all client-side. No route handler, no server component doing I/O. |
| Feature works with zero API keys and zero accounts; any keyed integration is optional and degrades cleanly | II. No Mandatory API Keys | [x] | No credential exists to supply. `NEXT_PUBLIC_ROUTING_BASE_URL` is an optional build-time override for self-hosters; absent or malformed, the default constant is used. Onboarding is still `clone`, `install`, `dev`. |
| Calculation logic lands in pure modules with unit tests over frozen JSON fixtures | III. Pure, Tested Domain Core | [x] | `lib/route-geometry.ts` is pure and holds every rule. `lib/routing.ts` and `lib/path-store.ts` do I/O and hold no rules. `planner.ts` gains an optional argument, no import. A test asserts no domain module imports either impure module, and that no test hits the network. |
| Durations shown as estimates, never to-the-minute arrivals; influencing parameters user-visible and adjustable with conservative defaults | IV. Honest Estimates | [x] | BRouter's `total-time` is discarded precisely because its speed model is not a rider-adjustable parameter; the measured **distance** is injected and duration recomputed through the rider's own `cyclingSpeed` and `segmentOverhead`. A refined duration that breaks the budget corrects the plan rather than being displayed as valid. Approximate paths stay visually and textually marked as approximate. No arrival time. |
| GBFS `ttl` honoured, responses cached client-side, attribution and licence displayed, only public documented endpoints called, failure degrades cleanly | V. Respect for Data Sources | [x] | The same discipline extended to the new source: requests only for displayed steps, none on hover or keystroke, one in-flight per key, superseded plans aborted, no automatic retry, results persisted so a repeat trip costs nothing. OpenStreetMap (ODbL) and BRouter credited in the panel footer. Every failure degrades to the approximation with its status stated. |
| New runtime dependencies are justified, or none were added | Technology Constraints | [x] | None added. |

*Re-check status after Phase 1 design:* **passed**. The design added `localStorage`, which is
browser-local persistence and explicitly allowed ("Persistence, if any, is browser-local"). One
item is worth naming rather than leaving buried: a pair of coordinates per step leaves the browser
when a path is requested. The constitution's "No user data leaves the browser" governs
persistence, and the application already sends typed queries to a geocoder under the same reading,
but FR-333 requires the application to say so plainly rather than let it pass unremarked.

## Project Structure

### Documentation (this feature)

```text
specs/004-real-route-geometry/
├── plan.md              # This file
├── research.md          # Phase 0: 11 decisions, all verified against the live endpoint
├── data-model.md        # Phase 1: new types, constants, invariants
├── quickstart.md        # Phase 1: run it, check it, what will bite
├── contracts/
│   ├── route-source.md  # The external contract: request, accepted response, every failure
│   └── core-modules.md  # Internal module boundaries and what is forbidden
├── checklists/
│   └── requirements.md
└── tasks.md             # Phase 2 (/speckit-tasks, not created here)
```

### Source Code (repository root)

```text
lib/
├── endpoints.ts         # CHANGED  base URL, profile names, attribution, verification date
├── types.ts             # CHANGED  RouteProfile, TracedPath, PathStatus, StepGeometry,
│                        #          TracedItinerary
├── route-geometry.ts    # NEW      PURE. parse, plausibility, key, duration, anchoring,
│                        #          over-budget detection
├── route-refinement.ts  # NEW      PURE. the orchestration state machine: what to fetch,
│                        #          how a result folds in, whether to replan, when to stop
├── routing.ts           # NEW      IMPURE. fetch, in-flight collapsing, session cache
├── path-store.ts        # NEW      IMPURE. localStorage, LRU, purge
├── planner.ts           # CHANGED  + optional MeasuredDistance argument. No import added.
└── i18n/messages/*      # CHANGED  status wording, correction notice, purge label

components/
├── useTracedItinerary.ts  # NEW    adapter only: useState, one effect, an AbortController.
│                          #        Holds no decision. The only component that may fetch.
├── MapView.tsx            # CHANGED  line weight and dash by status
├── ItineraryTrail.tsx     # CHANGED  status word per leg, correction notice
├── AssumptionsLine.tsx    # CHANGED  purge control in the advanced section
└── PlannerShell.tsx       # CHANGED  wires the hook between plan and display

tests/
├── fixtures/              # NEW  captured BRouter responses (trekking, hiking, malformed)
└── unit/                  # NEW  parse, plausibility, key, planner-measured, path-store
```

**Structure Decision**: the calculation lands in two pure modules. `lib/route-geometry.ts` covers
parsing, both FR-326 plausibility checks, the reuse key, duration derivation, path anchoring and
over-budget detection. `lib/route-refinement.ts` covers the orchestration as a synchronous state
machine: which steps to request, how a resolved request folds into the state, whether a measured
duration forces a replan, and when correction stops. `lib/routing.ts` and `lib/path-store.ts` do
I/O and hold no rules; if a rule appears in either, it belongs in one of the pure modules, which is
the same boundary `feed-client.ts`/`gbfs.ts` already draws.

The refinement state machine is separate from the hook on purpose, and the reason is worth stating
because the obvious implementation gets it wrong. The natural shape for this feature is a `fetch`
inside a `useEffect` in the map component, with the correction loop written inline beside it. That
puts retrieval, caching and the replan decision inside a component that cannot be instantiated
without WebGL, and it makes **the one case this feature exists to handle** — the source returns a
length that pushes a segment past the free window — reachable only through React, jsdom and fake
timers. It would be the least-tested path in the codebase and the most important. With the state
machine extracted, that case is `nextAction(applyPath(state, req, longPath, params), params)`
returning `{kind: "replan"}`, asserted in a plain unit test. `useTracedItinerary.ts` is the only
component permitted to call `routing.ts`, and its body is a `useState`, one effect and an
`AbortController`.

Fixtures are captured BRouter responses, `messages` array included, so the parser is tested
against what the service actually sends rather than against a tidied version of it.

## Sequence

Matching the four steps of the feature direction:

1. **Plan by estimate, unchanged, no network.** `planTrip` called without the lookup. Rendered
   immediately, every step `pending`, every line dashed (FR-321).
2. **Fetch the displayed steps in parallel.** Cache checked first; only misses go out. Bike
   segments use `trekking`, walks use `hiking-beta`. Superseded plans abort (FR-327).
3. **Replace progressively.** Each result swaps its dashed line for a solid one and its estimated
   duration for a measured one, independently of the others, without touching the camera or the
   reading position (FR-322, FR-323).
4. **Correct if a segment broke its budget.** `nextAction` in `lib/route-refinement.ts` returns
   `{kind: "replan"}` carrying a `MeasuredDistance` lookup; the hook dispatches on it and calls
   `planTrip` with it. The over-budget edge is absent from the graph, so the new plan routes
   around it. The rider is told the plan was corrected. `nextAction` returns `exhausted` rather
   than looping once `rounds` reaches `MAX_CORRECTION_ROUNDS` (FR-319). The decision is a pure
   function; the hook only carries it out.

## Complexity Tracking

> No constitution gate failed. Recorded here because each is a place where the design departs from
> what was asked, and the reason should not have to be re-derived at review.

| Departure from the brief | Why | What was rejected |
|---|---|---|
| Application identity goes in `trackname=`, not a request header | Verified 2026-07-28: the instance does not answer CORS preflight, returning the route body to `OPTIONS` with no `Access-Control-Allow-Headers`. A custom header would be preflighted, fail, and disable the feature rather than identify us. `User-Agent` cannot be set from `fetch` at all. | A custom `X-App-Id` header. It does not work here. |
| The planner receives a measured **distance**, not a measured duration | BRouter's `total-time` implies 19.4 km/h against the app's conservative 15 km/h default. Accepting its duration would make a provider's internal speed model an unadjustable parameter that changes a figure the rider reads, which principle IV forbids. | Passing `total-time` through. Rejected on principle IV. |
| Walk legs are cached for the session, not persisted | Their endpoints are arbitrary points, so a persistent store keyed on coordinates grows without bound and is almost never hit twice. Session reuse is what FR-328 actually needs. | Persisting them under rounded coordinates. Unbounded keyspace for a near-zero hit rate. |
| GeoJSON kept despite being 3x larger than GPX (23 092 vs 7 221 bytes, measured) | It is what the brief specified, MapLibre consumes it directly, and the persistent cache means a station pair is fetched once ever. The stored form drops `messages` and is ~1.8 KB. | Switching to GPX. Recorded in research R5 as the lever if payload ever binds. |

## Open Decision

**FR-335** is unresolved: whether calibration moves the detour factor automatically or proposes the
move. It belongs to US6, priority P3. Nothing in US1 through US5 depends on it, so implementation
can proceed through every P1 and P2 story without an answer. The recommendation, if one is wanted:
apply automatically in the conservative direction only, propose the optimistic one. That is the
asymmetry `lib/params.ts` already argues for when it takes the 75th percentile of measured detours
rather than the median.

---

# Addendum: US7, stops chosen along the real corridor

**Added**: 2026-07-28, after US1 through US5 shipped.

## Why this exists

Anchor stops are chosen from `haversine x detourFactor` before anything is known about the real
route. Where that factor is wrong, and it is most wrong exactly where it matters (rivers, rail cuts,
motorway crossings), the stops are chosen wrongly and US3 corrects the plan afterwards. US7 removes
the guess: one route through the corridor the rider will actually ride, and the stops are chosen
along it.

Measured (research R13): on the committed corridor and station fixtures, one corridor passes within
150 m of 23 stations, yielding real distances for **253 station pairs from a single request**,
against the 4 or 5 pairs a plan measures today. That is a floor: the committed snapshot is trimmed,
and the live network is far denser.

## The constraint that was lifted, and the one that was not

FR-325 required anchor selection to be computable from station data alone. **The author lifted it**
on 2026-07-28: a first plan already requires the station feed, so depending on the network for a
*better* plan adds no new class of dependency. FR-325 now guarantees that a routing failure leaves a
*usable* plan, not the best one.

FR-321 was **not** lifted. The estimated plan stays as phase 1, because it is already built and
tested, it holds the immediate display, and it is what remains when the routing service is
unreachable. Lifting FR-325 permits depending on the network; it does not oblige us to delete
working code that costs nothing to keep.

## Sequence

1. **Phase 1**, unchanged: estimated plan, no network, displayed immediately (FR-321).
2. **Phase 2**: one request for the bike route between that plan's pickup and drop-off stations.
   Between the *stations*, not the rider's endpoints: the ride starts and ends at stations, and
   phase 1 has already identified them, so there is no chicken-and-egg (research R12).
3. **Phase 3**, pure arithmetic, no request: project every station within 150 m onto the corridor,
   and derive the distance along it between each pair, plus the cost of leaving and rejoining.
4. **Phase 4**: hand those hundreds of distances to `planTrip` through the `measured` parameter that
   already exists, and recompute. The stops are now chosen knowing the real corridor.

## The finding that shaped the design

An along-route distance is **not** an upper bound on the real ride between two stations. Measured
over six pairs (research R14): median +1.8%, but two of six underestimate, one by 21%, with
near-zero access offsets in the worst case. One-way streets are the cause.

An optimistic distance is the one error principle IV forbids. So a corridor distance is used only
where it exceeds what the straight-line model already says:

```
measured(a, b) = max(alongRoute + access, haversine(a, b) x detourFactor)
```

No calibration constant, and it cannot be wrong in the dangerous direction. Today's estimate is the
floor; the corridor may only reveal that a pair is *worse* than assumed, which is precisely the case
US7 exists for.

## Structure

```text
lib/
├── route-corridor.ts    # NEW  PURE. project onto polyline, along-route distance,
│                        #      access cost, the max rule. No network, no React.
├── route-refinement.ts  # CHANGED  a corridor round between first plan and settling
├── routing.ts           # CHANGED  one corridor request per plan
└── types.ts             # CHANGED  Corridor, CorridorStation

tests/
├── fixtures/brouter-corridor.json   # NEW  a captured 11.2 km corridor, 645 points
└── unit/route-corridor*.test.ts     # NEW  projection, distances, the max rule
```

**Structure Decision**: nothing new is needed in the planner. `planTrip` already takes a sparse
measured-distance lookup, and a corridor is exactly that with hundreds of entries instead of two.
The refinement state machine already knows how to replan and to carry measurements between rounds.
So US7 is one new pure module plus one extra round in an existing loop.

## Constitution Check

| Gate | Principle | Pass? | Notes |
|------|-----------|-------|-------|
| No backend, database, or paid service | I | [x] | One additional request per plan, same keyless public instance. |
| Computation in the browser, static export | I | [x] | Projection and distances are arithmetic in `lib/`. |
| Zero keys, zero accounts | II | [x] | Unchanged. |
| Calculation in pure modules, tested on fixtures | III | [x] | `route-corridor.ts` is pure and tested against a committed corridor. The `max` rule is a pure function with its own test. |
| Estimates honest, never optimistic | IV | [x] | This is the gate that shaped the design. R14 found the naive approach optimistic by up to 21%; the `max` rule makes the corridor incapable of moving an estimate in the flattering direction. |
| Respect for data sources | V | [x] | **One** request buys hundreds of pairs, so this lowers load per unit of accuracy rather than raising it. Counted against the same per-user-request ceiling (FR-330a). |
| No new runtime dependency | Constraints | [x] | None. |

*Re-check after design:* **passed**, with FR-325 amended in the spec rather than silently
reinterpreted, and the amendment carrying its own rationale.

## Complexity Tracking

| Departure | Why | Rejected alternative |
|---|---|---|
| The corridor refines the plan rather than replacing the planner | A pure route-first design cannot reach a station-dense parallel axis when the direct corridor is poor, and turns "no valid segmentation along this line" into a planning failure. | Choosing stops purely along the route, as first proposed. Simpler, but loses optimality and the offline fallback. |
| Corridor distances are clamped by `max` against the existing estimate | Two of six measured pairs were optimistic, one by 21%. | Trusting the along-route figure, or fitting a safety factor to six samples. |
| One extra request per plan | It informs hundreds of pairs, where a direct measurement informs one. | Measuring more pairs directly: the 253 pairs of R13 would be 253 requests. |

## Open

FR-335 (calibration) remains unresolved and still blocks US6 only. US7 does not depend on it, and
makes it less urgent: a corridor gives real distances for the pairs that matter, which is most of
what calibrating the detour factor was meant to buy.
