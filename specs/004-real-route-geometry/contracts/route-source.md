# Contract: the external path source

**Feature**: 004-real-route-geometry | **Date**: 2026-07-28

What the application sends, what it accepts back, and what it does with everything else. All of
it verified against the live endpoint on 2026-07-28; see `research.md` R1, R2, R4, R5, R7 for
the raw observations.

---

## Request

```text
GET {ROUTING_BASE_URL}?lonlats={lon},{lat}|{lon},{lat}
                      &profile={providerProfile}
                      &alternativeidx=0
                      &format=geojson
                      &trackname=redock-mtl
```

| Parameter | Value | Note |
|---|---|---|
| `lonlats` | two `lon,lat` pairs separated by `\|` | **Longitude first.** The opposite of `LatLon`, which is why the URL is built in exactly one function. |
| `profile` | `trekking` (bike) or `hiking-beta` (foot) | Provider names. The domain speaks `RouteProfile`; the mapping lives beside the base URL. |
| `alternativeidx` | `0` | The primary path. Alternatives are out of scope. |
| `format` | `geojson` | |
| `trackname` | `redock-mtl` | The only way we can identify ourselves to the operator; a custom header would break CORS. See R7. |

Sent with:

- `signal`: an `AbortSignal` from the plan that requested it. A superseded plan aborts its own
  requests (FR-327).
- **No custom headers.** Verified: the instance does not answer preflight, so any non-simple
  header fails the request outright.
- **No credentials**, no cookies, no `Authorization`. There is no account (principle II).

Never sent:

- for a station that is a graph candidate rather than a displayed step (FR-330)
- on hover, on keystroke, on map pan or zoom
- more than once concurrently for the same `PathKey`
- at all, when the key is already in the store

---

## Response accepted

Status `200`, `Content-Type` beginning `application/vnd.geo+json` or `application/json`, body:

```json
{
  "type": "FeatureCollection",
  "features": [{
    "type": "Feature",
    "properties": { "track-length": "1909", "total-time": "354", "...": "..." },
    "geometry": { "type": "LineString", "coordinates": [[-73.567269, 45.50174, 41]] }
  }]
}
```

Read: `features[0].geometry.coordinates` and `features[0].properties["track-length"]`.

Discarded: `total-time` (R4: BRouter's speed model is not a rider-adjustable parameter, and
principle IV requires that it be), `messages`, `cost`, `total-energy`, both ascend fields, and
the third component of each coordinate.

Coerced: `track-length` arrives as a **string** and is parsed to a finite positive number, in the
manner `lib/gbfs.ts` already coerces feed fields.

---

## Every other response

| Case | Result |
|---|---|
| non-2xx (the instance returns **500** for an unknown profile) | step becomes `approximate` |
| network failure, CORS failure, offline | step becomes `approximate` |
| timeout at `PATH_REQUEST_TIMEOUT_MS` | step becomes `approximate` |
| abort (superseded plan) | discarded, applied to nothing (FR-327) |
| malformed JSON, no `features`, empty `features`, geometry not a `LineString` | step becomes `approximate` |
| fewer than 2 coordinates, or any non-finite / out-of-range value | step becomes `approximate` |
| `track-length` missing, non-numeric, or not positive | step becomes `approximate` |
| endpoints further than `PATH_ENDPOINT_TOLERANCE` from the requested points | rejected, step becomes `approximate` (FR-326) |
| length above `PATH_LENGTH_SANITY_FACTOR` times straight-line | rejected, step becomes `approximate` (FR-326) |

No case throws, no case reaches the user as a raw error, and no case is retried automatically
(FR-324, R8). The parser is total, in the manner `parseGeocoderResults` already is.

---

## Attribution obligations

Displayed in the panel footer beside the existing map and feed credits, using the same
`MapAttribution` surface, and only when a traced path is actually shown (FR-332, SC-011):

- **© OpenStreetMap contributors** — ODbL. Already rendered for the map tiles; the label covers
  this source too and is not duplicated.
- **BRouter** — the routing engine, MIT licensed, linking to `https://brouter.de`.

Recorded in `lib/endpoints.ts` beside the base URL, with the verification date, in the manner
that file already requires of every entry.

---

## Rate discipline

No numeric limit is published. Absence of a published limit is not permission (principle V, and
the precedent `lib/endpoints.ts` sets for the GBFS `ttl`).

- at most one request per distinct displayed step per plan (SC-008)
- **never more than `MAX_REQUESTS_PER_USER_REQUEST` (20) across a whole user request**, correction
  rounds included (FR-330a). A per-plan bound alone is not enough: each correction produces a new
  plan, so a per-plan count resets, and three rounds of five steps would satisfy every other rule
  here while issuing twenty requests. The counter is held in `routing.ts` and reset when the user
  changes an endpoint or a parameter, not when a corrected plan is computed
- station-to-station results persisted, so a repeated trip costs nothing (FR-328)
- concurrent callers for one key collapse onto a single in-flight promise, **except one that has
  already been aborted**. An aborted request resolves to "no path", and handing that to a caller
  from a newer plan tells it the geometry does not exist; the caller then records the segment as
  asked-about and never retries, leaving it a straight line for the life of the plan. The entry is
  removed from the shared table synchronously on abort, not in the `finally` after the await
  settles, which is a microtask too late for a caller in the same tick (FR-327a)
- superseded plans abort
- failures are not retried; the rider's next plan is the retry
- the existing 150 ms parameter debounce in `PlannerShell` gates plan computation, and fetching
  is driven off the settled plan

---

## Substituting a source

`NEXT_PUBLIC_ROUTING_BASE_URL`, optional, **build-time only** — verified in
`node_modules/next/dist/docs/01-app/02-guides/environment-variables.md`: `NEXT_PUBLIC_` values are
inlined at `next build` and the built app does not respond to later changes. Absent, malformed, or
not a valid absolute URL, the constant's default is used and everything works. Nothing about the
build or the core function requires it (principle II).

A different provider means editing `lib/endpoints.ts` and the parser in `lib/routing.ts`, and
nothing else: no domain module knows this contract exists.
