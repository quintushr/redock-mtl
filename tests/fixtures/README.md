# Test fixtures

Frozen provider output. Tests read these and never touch the network.

Everything below describes the GBFS set unless stated otherwise; the non-GBFS
files are `photon-housenumber.json` and the four `brouter-*.json`, documented at
the end.

## Provenance and licensing

**None of this is ours, and none of it is MIT.**

The repository's [LICENSE](../../LICENSE) is MIT and covers the code this project
wrote. It does not and cannot cover the files in this directory: they are captured
output from three third parties, committed verbatim so the suite can run offline.

| Source | What came from it | Regime |
|---|---|---|
| The operator's GBFS feed (`Bixi_MTL`) | every `montreal-*.json`, `gbfs-discovery.json`, and the `empty-*` / `malformed-*` envelopes derived from them | The operator's. `system_information` publishes an empty `license_url`, so no licence is declared at source; treated as available for interoperability and used here only to test a parser |
| Photon (komoot), over OpenStreetMap | `photon-housenumber.json` | OpenStreetMap data, **ODbL** |
| BRouter, over OpenStreetMap | the four `brouter-*.json` | Engine MIT, geometry from OpenStreetMap, **ODbL** |

Two things follow, and they are the reason this section exists rather than being
assumed:

1. **Do not treat these as example data you may relicense.** Copying a fixture
   into another project carries its own regime with it, not this repository's.
2. **The ODbL attribution obligation is on the running application, not on this
   directory.** `components/MapAttribution.tsx` discharges it. Nothing in a test
   fixture satisfies a credit that a reader has to be able to see.

Recapture rather than hand-edit. Every quirk listed further down was found in live
data, and a fixture edited by hand to make a test pass stops being evidence of
anything.

## Files

| File | Contents |
|---|---|
| `gbfs-discovery.json` | the discovery document, four feeds |
| `montreal-station-information.json` | 100 stations, trimmed from 1106 at capture time |
| `montreal-station-status.json` | matching status rows for the same 100 |
| `montreal-vehicle-types.json` | full catalogue, 5 types |
| `montreal-system-information.json` | full, unmodified |
| `empty-station-information.json` | valid envelope, zero stations |
| `empty-station-status.json` | valid envelope, zero stations |
| `malformed-station-status.json` | a station row missing every required field |
| `brouter-trekking.json` | one bike route, the `trekking` profile |
| `brouter-hiking.json` | the same pair on `hiking-beta`, the foot profile |
| `brouter-corridor.json` | a long route across the corridor the station set follows |
| `brouter-malformed.json` | a well-formed envelope with nothing usable in it |

## What the trimmed set deliberately covers

Selected from live data so the cases are real rather than invented. The counts
below were recomputed from the committed files on 2026-07-30 and total 100; an
earlier version of this table described a 52-station draft that no longer exists,
and the corridor selection documented in the next section is what replaced it.

- **93 healthy stations** holding at least one mechanical bike, forming the
  corridor described below.
- **2 stations with free docks but zero mechanical bikes.** This is the case the
  whole design turns on: usable as an intermediate stop (FR-011a), not usable as
  the first pickup (FR-011). 110 such stations existed at capture time.
- **2 e-bike-only stations**, for FR-031's "no mechanical bike nearby, but
  e-bikes are present" message. 47 existed at capture time.
- **3 non-operational stations**, for FR-013.

To recount after a recapture, cross-reference `vehicle_types_available` against
the type catalogue rather than reading `num_bikes_available`; quirk 3 below is why.

## Real-data quirks these fixtures preserve

These are not synthetic. They were found in the live feed and are kept on
purpose, because code that does not survive them will not survive production.

1. **Stations at (0, 0).** 12 of the 1106 stations sit at null island. Two are in
   this fixture (ids `36` and `304`). All 12 happened to have `is_installed: 0`
   at capture time, but the parser must reject invalid coordinates on their own
   merits rather than relying on that coincidence. An unfiltered (0, 0) would
   stretch the convex hull across the Atlantic and destroy both the service-area
   test (FR-029a) and the ellipse pruning.

2. **`is_installed`, `is_renting`, `is_returning` are integers, not booleans.**
   The feed sends `1` and `0`. A naive `Boolean(value)` works, but a strict
   `=== true` silently marks every station as non-operational.

3. **`num_bikes_available` includes e-bikes.** It cannot be used to count
   mechanical bikes. Station `1` at capture time reported
   `num_bikes_available: 1` with `num_ebikes_available: 1` and zero mechanical
   bikes in `vehicle_types_available`. Mechanical counts must come from
   `vehicle_types_available` cross-referenced with the vehicle type catalogue.

4. **Two human-powered vehicle types exist.** `9` is `bicycle` + `human`; `14` is
   `cargo_bicycle` + `human`. Only `9` counts as a mechanical bike here. A cargo
   bike is a different product, and treating it as interchangeable would put a
   rider on a vehicle they did not plan for.

5. **`ttl` is 10 seconds** on every feed, which permits polling six times a
   minute. Principle V forbids polling *faster* than the ttl; it does not oblige
   us to poll that fast. `MIN_REFRESH_INTERVAL_SECONDS` in `lib/endpoints.ts`
   holds our own, slower floor.

6. **The `Bixi_MTL` feed carries two cities.** 29 of the 1106 stations are in
   **Sherbrooke**, roughly 130 km east of Montreal. This fixture is deliberately
   restricted to the island of Montreal, because a single convex hull over the
   raw feed spans 160 km and swallows all the countryside in between. See the
   open issue in `research.md`: FR-029a's one-hull service area is the wrong
   model for a feed like this, and coverage detection has to account for it.

## Why the selection is a corridor

The first attempt sampled stations evenly across the island for geographic
spread, which produced a median gap of 4.9 km and a maximum of 20.9 km. The
segment budget at default parameters only reaches 7.1 km, so no multi-segment
plan existed and every planner test failed. The failure was in the fixture, not
the planner.

The current selection is every healthy station within 700 m of a straight line
across the island: 93 corridor stations with a 376 m median gap over 11.3 km.
Dense enough that each hop fits one free window, long enough that a single window
cannot cover the trip.

## `brouter-*.json` (route geometry, not GBFS)

**Captured**: 2026-07-28, from the public BRouter instance reached through
`ROUTING_BASE_URL` in `lib/endpoints.ts`. The responses carry
`creator: "BRouter-1.7.9"` and `name: "redock-mtl"`, the trackname the application
sends so the operator can identify us in their logs.
**Licence**: the engine is MIT; the geometry is derived from OpenStreetMap and is
therefore **ODbL**. `components/MapAttribution.tsx` credits BRouter whenever a
measured path is on screen, which is the obligation these files stand in for
during tests.

`trekking` and `hiking-beta` are the only two profiles the application asks for,
and `lib/endpoints.ts` records why, with the measured speeds of the alternatives
and the list of profile names that return HTTP 500 on that instance. Do not reach
for one of those to fix a failure.

## `photon-housenumber.json` (geocoding, not GBFS)

**Captured**: 2026-07-26
**Endpoint**: <https://photon.komoot.io/api/>
**Query**: `q=1000 rue de la Gauchetière Montreal`, `limit=5`, biased to
(45.5088, -73.5878)
**License**: OpenStreetMap data, ODbL. Photon requires no key and its operator
states availability is not guaranteed, which is why geocoding is optional by
construction in the app.

Kept because of what the five features contain:

1. **Two features carry `housenumber` and `street` but no `name` at all.** This
   is the ordinary street address, and it is the case a label built from
   `name`, `street` and `city` gets wrong: the number is dropped, and both rows
   render as the same string. `lib/geocode.ts` exists to handle this.
2. **The same number on two branches of one street** (`Ouest` and `Est`), so
   the label has to be specific enough to tell them apart.
3. **Named places whose `street` is not the street in their `name`** (feature
   one is named "1000 de la Gauchetière" but sits on Rue Saint-Antoine Ouest),
   so name and street cannot be concatenated blindly.
4. **`city` and `state` spelled inconsistently across features** ("Montréal"
   and "Montreal", "Québec", "Quebec" and "QC"), straight from OpenStreetMap.
