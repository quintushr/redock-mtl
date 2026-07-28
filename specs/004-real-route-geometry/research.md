# Phase 0 Research: Real Route Geometry

**Feature**: 004-real-route-geometry | **Date**: 2026-07-28

Every claim below about the routing service was verified against the live endpoint or its
source on 2026-07-28. Nothing here is written from memory. Re-verify rather than trusting
this document's age.

---

## R1: The path source

**Decision**: the public BRouter instance at `https://brouter.de/brouter`, GeoJSON output.

**Verified on 2026-07-28** by direct request:

```text
GET https://brouter.de/brouter?lonlats=-73.5673,45.5017|-73.5540,45.5088
      &profile=trekking&alternativeidx=0&format=geojson

HTTP/1.1 200 OK
Server: nginx/1.18.0 (Ubuntu)
Content-Type: application/vnd.geo+json; charset=utf-8
Content-Disposition: attachment; filename="brouter.geojson"
Access-Control-Allow-Origin: *
```

- **No credential of any kind.** No account, no key, no token. Principle II holds.
- **`Access-Control-Allow-Origin: *`** is served on the response, so the browser can call it
  directly. No proxy, therefore no server, therefore principle I holds. This is the same
  property `lib/endpoints.ts` already records for the GBFS feeds and OpenFreeMap.
- **BRouter is MIT licensed** (README, github.com/abrensch/brouter). The data is
  OpenStreetMap under ODbL, which the application already credits for its map tiles.
- Instance version reported in the payload: `"creator": "BRouter-1.7.9"`.

**Alternatives considered**:

| Source | Rejected because |
|---|---|
| OSRM demo server | No cycling profile on the public instance. `lib/params.ts` already records this: the detour factor was calibrated against OSRM's *driving* profile for exactly this reason. Drawing a car route and calling it a bike route is the defect this feature exists to fix. |
| GraphHopper Directions API | Requires an API key. Principle II, disqualified outright. |
| Valhalla / FOSSGIS public instance | Viable on capability, but BRouter's profile set is bicycle-first and its usage is dominated by exactly this kind of client. Kept as the documented fallback the override in R3 points at. |
| Routing in the browser over a downloaded network | Out of scope in the spec, and a Montreal-sized routable graph is megabytes per visit. Contradicts the "plan appears immediately" requirement it was meant to serve. |

---

## R2: Profiles

**Decision**: `trekking` for bike segments, `hiking-beta` for walk legs.

**Verified on 2026-07-28**, same station pair (1.7-1.9 km in central Montreal), one request per
profile:

| `profile=` | HTTP | `track-length` | `total-time` | implied speed | points |
|---|---|---|---|---|---|
| `trekking` | 200 | 1909 m | 354 s | 19.4 km/h | 86 |
| `fastbike` | 200 | 1889 m | 357 s | 19.0 km/h | 86 |
| `safety` | 200 | 1861 m | 367 s | 18.2 km/h | 105 |
| `shortest` | 200 | 1684 m | 1229 s | 4.9 km/h | 124 |
| `hiking-beta` | 200 | 1697 m | 1210 s | 5.1 km/h | 134 |
| `walking` | **500** | — | — | — | — |
| `foot` | **500** | — | — | — | — |
| `trekking-fast` | **500** | — | — | — | — |
| `hiking-mountain-beta` | **500** | — | — | — | — |
| `hiking-low-networks-beta` | **500** | — | — | — | — |

`walking` and `foot` do not exist on this instance. `hiking-beta` is the pedestrian profile, and
its implied 5.1 km/h confirms it: no bike profile walks.

`trekking` over `safety` for bikes: the three bike profiles agree within 2.5% on distance here,
so the choice is about which streets get drawn, not about the budget. `trekking` is BRouter's
balanced bicycle default and is the profile whose distances the detour factor will be calibrated
against. `safety` biases harder toward separated infrastructure and can lengthen a route
noticeably outside the dense core, which would add stops to trips that do not need them.
The profile name is a named constant beside the base URL, so revisiting this is a one-line edit.

`shortest` is listed only to record that it is not a bike profile in any useful sense despite its
name; its time model is unusable.

---

## R3: Base URL and the optional override

**Decision**: one constant in `lib/endpoints.ts`, overridable at build time by an optional
`NEXT_PUBLIC_ROUTING_BASE_URL`.

`lib/endpoints.ts` already exists for exactly this and states its own rule: "Changing a provider
must be a single-file edit." The BRouter entry joins the GBFS, tile and geocoder entries there.

The override mechanism is constrained by the static export. Verified in
`node_modules/next/dist/docs/01-app/02-guides/environment-variables.md`: only `NEXT_PUBLIC_`
variables reach the browser, and they are **inlined at build time** — "After being built, your
app will no longer respond to changes to these environment variables." So this is a
build-time override for someone self-hosting a BRouter instance, not a runtime switch, and the
comment beside the constant must say so rather than implying a deploy-time toggle.

Principle II is satisfied because the variable is optional: absent, the constant's default is
used and the application is fully functional. Nothing about the build or the core function
requires it to be set. A missing or malformed value must fall back to the default rather than
producing a broken URL.

---

## R4: Response shape

**Decision**: read `features[0].geometry.coordinates` for the path, and
`features[0].properties["track-length"]` for the length. Ignore `total-time`.

Verified payload structure:

```json
{ "type": "FeatureCollection",
  "features": [ { "type": "Feature",
      "properties": {
        "creator": "BRouter-1.7.9", "name": "brouter_trekking_0",
        "track-length": "1909", "filtered ascend": "17", "plain-ascend": "-7",
        "total-time": "354", "total-energy": "33811", "cost": "4526",
        "messages": [ ... ] },
      "geometry": { "type": "LineString",
        "coordinates": [[-73.567269, 45.50174, 41], ...] } } ] }
```

Three things worth recording:

1. **The numbers are strings.** `"track-length": "1909"`, not `1909`. The parser coerces and
   rejects anything non-finite, in the manner `lib/gbfs.ts` already uses for the feeds.
2. **Coordinates are `[lon, lat, elevation]`**, three components. MapLibre tolerates the third,
   but `LatLon` in `lib/types.ts` is a named pair specifically so the two cannot be swapped, so
   the parser converts and drops elevation rather than passing tuples around.
3. **`total-time` is discarded.** BRouter's time comes from its own speed model — 19.4 km/h for
   `trekking` against the app's conservative 15 km/h default. Principle IV requires every value
   that influences a displayed duration to be user-adjustable, and BRouter's internal speed model
   is not something the rider can see or change. So the traced **distance** is what gets injected,
   and the duration is recomputed through the rider's own `cyclingSpeed` and `segmentOverhead`.
   This is a deliberate narrowing of the user's "fonction de mesure de durée": the injected
   function measures geometry, and duration stays derived from the rider's parameters.

---

## R5: Payload size

**Measured on 2026-07-28** for the same 1.9 km route:

| Request | Bytes |
|---|---|
| `format=geojson` | 23 092 |
| `format=geojson&timode=0` | 23 092 |
| `format=geojson&profile:processUnusedTags=0` | 23 092 |
| `format=gpx` | 7 221 |

The `messages` array (68 rows for this route, one per shape node, each carrying way tags, node
tags, cost and energy) is roughly two thirds of the GeoJSON payload, and neither parameter tried
suppresses it.

**Decision**: keep GeoJSON as specified, discard `messages` on parse, and let the persistent
cache carry the cost. A station pair is fetched once, ever. What is *stored* is the reduced form
from R6, not the wire payload, so 23 KB on the wire becomes roughly 1.5-2 KB at rest.

Recorded rather than acted on: if payload ever becomes the binding constraint, GPX is a 3x
reduction and carries the same two fields in its extensions block. That would be a change to the
parser only, behind the same module boundary.

---

## R6: Caching

**Decision**: `localStorage`, one entry per station pair per profile, storing a reduced form.

- **Key**: the two station identifiers and the profile. Station-to-station geometry is invariant,
  which is what makes persistence correct rather than merely convenient (FR-329a). The pair is
  ordered as travelled: BRouter routes one-ways, so A→B and B→A are different paths and must not
  share a key.
- **Value**: the coordinate list rounded to 5 decimals (about a metre, the same precision
  `formatCoordinates` already treats as the app's floor), the length in metres, the profile, and
  a schema version. `messages`, elevation, energy and cost are dropped.
- **Size**: about 90 points at ~20 bytes gives ~1.8 KB per entry. A cap of 500 entries is roughly
  1 MB, comfortably inside the ~5 MB `localStorage` gives, and 500 station pairs is far more than
  one rider's habitual trips.
- **Eviction**: least-recently-used, applied on write. A `QuotaExceededError` is caught and
  treated as "cache unavailable", never as a routing failure.
- **Purge**: a control in the assumptions panel, per FR-329a.
- **Invalidation**: entries carry a schema version; a bump discards the store. A stored path is
  not reused for a station pair whose stations are no longer in the snapshot (FR-329c).

`localStorage` over IndexedDB: the values are small and the access pattern is a synchronous
lookup on a handful of keys per plan. IndexedDB would add an async layer and a schema for no
benefit at this size. This is the application's first use of browser storage; nothing else
persists today.

**Walk legs are not persisted** (FR-329b). Their endpoints are arbitrary points, so a persistent
store keyed on coordinates grows without bound and is almost never hit twice. They are held in a
module-level `Map` for the session, keyed on rounded coordinates and profile, which is what
FR-328 actually needs: a trip consulted twice in one sitting issues no second request.

---

## R7: Identifying the application to the operator

**Decision**: pass `trackname=redock-mtl` on every request. **Do not send a custom header.**

The user's direction asked for an application identifier in a request header. Verified on
2026-07-28 that this cannot work against this instance:

```text
OPTIONS /brouter?... HTTP/1.1
Origin: https://example.org
Access-Control-Request-Method: GET
Access-Control-Request-Headers: x-app-id

HTTP/1.1 200 OK
Access-Control-Allow-Origin: *
[body: the GeoJSON route]
```

The server does not implement preflight. It answers `OPTIONS` with the route itself and returns
neither `Access-Control-Allow-Headers` nor `Access-Control-Allow-Methods`. A custom request
header makes the request non-simple, so the browser would preflight it, find no
`Access-Control-Allow-Headers: x-app-id`, and **fail the request**. Adding the header would not
identify us; it would disable the feature. `User-Agent` is a forbidden header name in `fetch` and
cannot be set from a browser at all.

What works instead, and is enough for the operator to find us:

1. **`trackname=redock-mtl`** — read by `ServerHandler` (verified in
   `brouter-server/src/main/java/btools/server/request/ServerHandler.java`, which reads `profile`,
   `format`, `trackname`, `exportWaypoints`, `exportCorrectedWaypoints`). The README states the
   server logs the full HTTP request per routing call, so the name appears in the operator's logs.
2. **The `Referer` header**, which the browser sends automatically and which identifies the
   deployed site without any custom header.
3. **Contact details in the repository README**, beside the existing attribution.

---

## R8: Usage policy and request volume

BRouter publishes no numeric rate limit. The absence of a published limit is not permission
(principle V), and `lib/endpoints.ts` already sets the precedent in its GBFS comment: a declared
`ttl` of 10s permits six requests a minute and the application refuses to take it up.

**Decision**, matching the user's direction:

- Requests are issued only for the steps of a **displayed** itinerary. Never for candidate
  stations, never for graph edges. A plan with two stops is 3 bike segments plus 2 walk legs, so
  at most 5 requests, minus whatever the cache already holds.
- No request on hover, on keystroke, or on map movement.
- The parameter debounce already in `PlannerShell` (150 ms) gates the plan, and fetching is
  driven off the settled plan, so dragging a slider cannot queue requests.
- Requests for a superseded plan are aborted via `AbortSignal`, the pattern `feed-client.ts`
  already uses.
- One in-flight request per key, collapsed the way `loadStationSnapshot` collapses concurrent
  callers.
- A failed request is not retried automatically. The segment stays approximate; a retry is the
  user's next plan.

The worst realistic case is a rider dragging the safety margin across values that each produce a
different set of anchor stations. Bounded by the debounce, by aborting superseded plans, and by
the cache filling as they go.

---

## R9: Injecting measured geometry into the planner

**Decision**: `planTrip` takes an optional geometry lookup; absent, behaviour is byte-identical.

`planner.ts` builds bike edges from `cyclingDuration(from.position, to.position, params)`, which
resolves to `haversine × detourFactor / cyclingSpeed`. The lookup replaces the distance term for
the pairs it knows and nothing else:

```ts
type MeasuredDistance = (fromStationId: string, toStationId: string) => Metres | undefined;
```

Three properties matter:

1. **Purity is preserved.** The function is an argument. `planner.ts` gains no import, no fetch,
   no global. Principle III holds, and the existing planner tests keep passing unchanged because
   the parameter is optional.
2. **Correction falls out of the ordinary search.** `planner.ts:243` already drops any edge whose
   ride exceeds the budget (`if (ride > budget) continue`). Feed in a measured distance that pushes
   a segment over, replan, and that edge simply is not in the graph. No repair path, no special
   case, no second algorithm. This is what makes the user's "injectée dans la matrice" the right
   shape.
3. **Termination is structural.** Each correction round adds at least one measured pair, and a
   measured pair either keeps its edge or removes it permanently. The edge set is finite and
   monotonically shrinking, so the loop terminates. A hard cap of 3 rounds is kept anyway
   (FR-319), because a rider watching their plan rearrange four times has lost the plot regardless
   of what the theory says.

The sparse-lookup shape matters: the graph holds O(n²) candidate edges and we will only ever have
measurements for the handful on the displayed path. Anything requiring a dense matrix would mean
routing every candidate pair, which R8 forbids.

---

## R10: Rendering

**Decision**: approximate stays dashed and thin; traced becomes solid and full weight. One
`GeoJSON` source swap, no animation.

`MapView.tsx` already has the layer this needs: `route-line` paints `line-color: palette.brand`
with `line-width` and `line-dasharray` read per feature from properties. Today walk legs get
`{width: 2, dash: [1,2]}` and bike segments `{width: 3, dash: [3,2]}`, and the comment at
`MapView.tsx:488` explains precisely why the bike line is dashed:

> A solid 4px line promised a path somebody could follow. A dashed 3px one says what this
> actually is, an estimate.

This feature is what earns the solid line. Traced bike segments become `{width: 4, dash: [1,0]}`,
traced walks `{width: 2.5, dash: [1,0]}`; untraced steps keep exactly what they have now. So the
distinction is weight plus dash pattern, carries no second hue (`docs/ui-guidelines.md` allows the
accent three uses and this is one of them), and survives colour removal. FR-310's "lower visual
weight for an approximation" is satisfied by construction.

The stop markers are a separate source drawn after the line layer, so anchors stay on top of the
geometry and FR-304 holds without further work. FR-305, the path meeting its markers: BRouter
snaps to the nearest routable way, so a path can start a few metres off the station. The parser
prepends the station position and appends the destination position to the coordinate list, which
closes the gap and costs nothing.

The word for the itinerary list comes from the i18n registry built in feature 003; no string is
written into a component (FR-202).

---

## R11: Open question carried into implementation

FR-335 is unresolved: whether calibration moves the detour factor automatically or proposes the
move. It belongs to US6, priority P3, and no story above it depends on the answer. The
recommendation, for whenever it is settled: apply automatically in the conservative direction
only (observations that say reality is worse than assumed), propose the optimistic direction. That
is the reading of principle IV that costs a rider the least when the estimate is wrong, and it is
the asymmetry `lib/params.ts` already argues for when it takes the 75th percentile rather than
the median. Recording it here rather than deciding it silently.

---

## R12: Routing the corridor between stations, not between endpoints

**Decision**: request the corridor between the displayed plan's **pickup and drop-off stations**,
not between the rider's origin and destination.

The origin and destination are where the rider is standing; the ride starts and ends at stations.
Routing between the endpoints would put the two walking legs inside the corridor and shift every
station's projection along it by a few hundred metres at each end, which is exactly where the
pickup and drop-off candidates sit.

It also avoids a chicken-and-egg: the stations are already known, because phase 1 has already
produced a plan. There is nothing to guess.

---

## R13: How many pairs one corridor informs

**Re-measured 2026-07-28**, against `tests/fixtures/brouter-corridor.json` and
`tests/fixtures/montreal-station-information.json`, both committed. Every figure below is
reproducible from the repository with no network:

| Band | Stations within it | Pairs it yields |
|---|---|---|
| 50 m | 19 | 171 |
| 100 m | 19 | 171 |
| 150 m | 23 | 253 |
| 250 m | 30 | 435 |

Against the 4 or 5 pairs a plan measures directly today. One well-chosen request is worth more than
fifty poorly chosen ones, which is the whole argument for US7.

**These are floors, not estimates of the real network.** The committed snapshot is a trimmed subset
of the Montreal feed; the live network is an order of magnitude denser, so a real corridor sits
above every row here. A floor is the right thing to justify a constant on: `CORRIDOR_BAND` has to
earn its request on the worst case, not the best.

**Decision**: a 150 m band. The count keeps rising past it, but so does the access error (R14), and
the pairs added beyond 150 m are stations the rider would have to leave the corridor to reach.

*Corrected 2026-07-28: the first version of this table was measured on a 12.8 km corridor that was
never committed, and read 21 stations at 100 m and 26 at 150 m. It justified a shipped constant with
a measurement nobody could repeat. The corridor above is the one in `tests/fixtures/`, so T077 can
check this table rather than take it on trust.*

---

## R14: Is an along-route distance a good proxy for the real ride?

**Not reliably, and the failure is in the dangerous direction.** This is the finding that shaped the
design, and it contradicts what this document would have said if it had been written from intuition
rather than measured.

Six pairs on the corridor above, comparing `along-route + 2x access offset at each end` against
BRouter's own route between the same two stations:

| Offsets | Estimated | Real | Error |
|---|---|---|---|
| 109 m / 112 m | 4252 m | 4179 m | +1.8% |
| 112 m / 36 m | 1209 m | 1268 m | **-4.6%** |
| 36 m / 25 m | 499 m | 445 m | +12.2% |
| 25 m / 2 m | 432 m | 545 m | **-20.7%** |
| 2 m / 28 m | 502 m | 488 m | +2.8% |
| 28 m / 1 m | 6424 m | 6385 m | +0.6% |

Median +1.8%, but **two of six underestimate**, one by a fifth. The intuition that a sub-path of a
route must bound the direct route between its ends is wrong, and the offsets are near zero in the
worst case, so the access approximation is not the cause. One-way streets are: the corridor is
traversable in the direction it was computed, and a rider going between two of its points may have
to leave it and come back.

An optimistic distance is the one error principle IV forbids, because it makes a segment look like
it fits inside the free window when it does not, which is the single failure this product exists to
prevent.

**Decision**: a corridor distance is used only where it is **larger** than what the straight-line
model already says:

```
measured(a, b) = max(alongRoute + access, haversine(a, b) x detourFactor)
```

This needs no calibration constant and cannot be wrong in the dangerous direction: today's estimate
is the floor, and the corridor may only reveal that a pair is *worse* than assumed. That is exactly
the case US7 exists for, since barriers are where the detour factor fails. Where the corridor
suggests a pair is cheaper than the estimate, it is ignored and nothing is lost, because that is the
behaviour shipping today.

**Alternatives rejected**:

| Approach | Rejected because |
|---|---|
| Trust the along-route distance as measured | Two of six samples optimistic, one by 21%. |
| Inflate it by a safety factor | Needs a constant fitted to six samples, and would make the median 20-30% pessimistic, adding stops to trips that do not need them. |
| Restrict to stations within 30 m of the line | The worst underestimate had offsets of 25 m and 2 m. Band width is not the lever. |
| Gather a larger sample and fit a factor | Worth doing before ever relaxing the rule above, but not a prerequisite: `max` is safe with no sample at all. |

**Sample size**: six pairs, one corridor, one city. Enough to disprove the upper-bound assumption,
not enough to fit a constant. The `max` rule is chosen precisely because it does not need one.

---

## R15: Where the corridor phase belongs

**Decision**: a third pure module, `lib/route-corridor.ts`, feeding the existing
`MeasuredDistance` seam.

Nothing new is needed in the planner: `planTrip` already takes a sparse measured-distance lookup,
and that is exactly what a corridor produces, only with hundreds of entries instead of two. The
refinement state machine already knows how to replan and how to carry measurements between rounds.

So the corridor is a pure function from (route geometry, stations) to a lookup:

```
corridorDistances(path, stations, params) -> Map<pair, Metres>
```

Projection onto a polyline, cumulative length, and the `max` rule of R14 are all arithmetic. No
network, no React, no state. It is tested against a committed corridor fixture in the same way the
parser is tested against a committed BRouter response.

---

## R16: Not a correction

A plan recomputed from corridor distances must not use the wording of FR-316.

Nothing was invalidated. The first plan was an estimate and said so on every leg; a better estimate
arriving is the feature working as designed, not a promise being broken. Reusing the correction
notice here would put "your plan was corrected" on most trips, and the warning that matters, a
segment that genuinely no longer fits the free window, would be lost in the noise of one that cries
wolf. FR-344 states this; `corrections` stays at zero for a corridor replan.
