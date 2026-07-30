/**
 * Every external base URL in the application, deliberately isolated in one file.
 *
 * Changing a provider must be a single-file edit. Nothing here is written from
 * memory: each entry was verified against provider documentation on 2026-07-26,
 * and the verification notes live beside it.
 *
 * All three providers are keyless. Adding one that needs an account or an API
 * key would violate constitution principle II.
 *
 * On the four service URLs and who reads them. They are the *defaults* now, not
 * the values in force: lib/runtime-config.ts can replace any of them from a
 * config.json fetched at start-up, which is what lets a self-hosted image be
 * pointed at another provider without being rebuilt. They are gathered into
 * DEFAULT_SERVICE_ENDPOINTS at the bottom of this file, and nothing outside
 * runtime-config.ts should read them directly — a caller that does gets the
 * default even when the reader configured something else, and nothing fails
 * loudly enough for anyone to notice. Everything else here is a constant of this
 * application rather than of its deployment (the ttl floor, the detour bounds,
 * the request budget) and is imported straight from here as before.
 */

// ---------------------------------------------------------------------------
// GBFS station feeds (required)
// ---------------------------------------------------------------------------

/**
 * BIXI Montréal, GBFS 2.2.
 *
 * Source: the MobilityData GBFS systems catalogue
 * (https://github.com/MobilityData/gbfs/blob/master/systems.csv), system id
 * `Bixi_MTL`. Verified 2026-07-26.
 *
 * Verified at the same time:
 * - `Access-Control-Allow-Origin: *` is served, so the browser can fetch this
 *   directly and no proxy is needed (which is just as well: a proxy is a server,
 *   and principle I forbids one).
 * - Every feed declares `ttl: 10` and `version: "2.2"`.
 * - Feeds are published per language under `/en/` and `/fr/`.
 */
const GBFS_DISCOVERY_URL_DEFAULT =
  "https://gbfs.velobixi.com/gbfs/2-2/gbfs.json";

/**
 * The feeds we consume, by their GBFS `name` in the discovery document. We
 * resolve URLs through discovery rather than hard-coding them, so a provider
 * reorganising its paths does not break us.
 */
export const REQUIRED_GBFS_FEEDS = [
  "station_information",
  "station_status",
  "vehicle_types",
  "system_information",
] as const;

export type RequiredGbfsFeed = (typeof REQUIRED_GBFS_FEEDS)[number];

/**
 * The provider declares `ttl: 10`, which permits polling every ten seconds.
 * Principle V says never poll *faster* than the ttl; it does not oblige us to
 * poll that fast, and hammering a courtesy endpoint six times a minute is
 * exactly the behaviour that gets public feeds closed. We therefore refresh on
 * demand and never more often than this floor.
 */
export const MIN_REFRESH_INTERVAL_SECONDS = 60;

/**
 * Attribution shown in the UI (principle V).
 *
 * `system_information` was inspected on 2026-07-26 and its `operator` and
 * `license_url` fields are both empty strings, so the feed does not carry its
 * own attribution. These values are therefore held here rather than parsed, and
 * must be revisited if the provider starts publishing them.
 */
export const GBFS_FALLBACK_ATTRIBUTION = {
  operatorName: "BIXI Montréal",
  operatorUrl: "http://montreal.bixi.com",
  licenseName: null,
  licenseUrl: null,
} as const;

// ---------------------------------------------------------------------------
// Map tiles (optional: the planner works without them)
// ---------------------------------------------------------------------------

/**
 * OpenFreeMap public instance. Verified 2026-07-26 at https://openfreemap.org
 * and https://openfreemap.org/quick_start/: "There's no registration, no user
 * database, no API keys, and no cookies", and "there are no limits on the number
 * of map views or requests".
 *
 * Attribution: MapLibre adds the required OpenStreetMap and OpenMapTiles
 * attribution automatically from the style document. The OpenFreeMap credit is
 * optional per the provider, and we render it anyway.
 */
const MAP_STYLE_URL_DEFAULT = "https://tiles.openfreemap.org/styles/positron";

/**
 * The map credits, rendered by the panel rather than by MapLibre.
 *
 * MapLibre's own attribution control sits in a corner of the map, and the panel
 * covers the bottom of the frame below 1024px, so the credits it draws are
 * hidden exactly where most riders are. Displaying them is a licence
 * obligation, not a courtesy, so they moved into the panel's footer, which is
 * visible whatever the panel's rest position and whatever the reader has
 * scrolled to.
 *
 * Read on 2026-07-27 from the `attribution` field of the style's TileJSON,
 * https://tiles.openfreemap.org/planet, not written from memory. Re-check it
 * there rather than trusting this comment's age. The style's second source,
 * Natural Earth raster relief, is public domain and requires no credit.
 */
export const MAP_ATTRIBUTION = [
  { label: "OpenFreeMap", url: "https://openfreemap.org" },
  { label: "© OpenMapTiles", url: "https://www.openmaptiles.org/" },
  {
    label: "© OpenStreetMap",
    url: "https://www.openstreetmap.org/copyright",
  },
] as const;

// ---------------------------------------------------------------------------
// Geocoding (optional: manual entry and map click are the guaranteed path)
// ---------------------------------------------------------------------------

/**
 * Photon, run by komoot on OpenStreetMap data. Verified 2026-07-26 at
 * https://photon.komoot.io/: no API key required.
 *
 * Stated policy, quoted: "You can use the API for your project, but please be
 * fair - extensive usage will be throttled" and "We do not guarantee for the
 * availability and usage might be subject of change in the future."
 *
 * Being fair is a hard requirement here, not a nicety (principle V). Callers
 * MUST debounce, cancel superseded requests, and cap the result count. Because
 * availability is explicitly not guaranteed, geocoding is optional by
 * construction: FR-002's map-click and manual entry remain fully functional
 * when this endpoint is unreachable.
 */
const GEOCODER_URL_DEFAULT = "https://photon.komoot.io/api/";

/** Milliseconds of quiet before a query is sent. */
export const GEOCODER_DEBOUNCE_MS = 400;

/** Upper bound on results requested per query. */
export const GEOCODER_RESULT_LIMIT = 5;

/** Minimum query length before we bother the endpoint at all. */
export const GEOCODER_MIN_QUERY_LENGTH = 3;

// ---------------------------------------------------------------------------
// Route geometry (optional: the planner works without it)
// ---------------------------------------------------------------------------

/**
 * BRouter, the public instance run by Arndt Brenschede. Verified 2026-07-28 by
 * direct request, not written from memory:
 *
 *   GET https://brouter.de/brouter?lonlats=-73.5673,45.5017|-73.5540,45.5088
 *         &profile=trekking&alternativeidx=0&format=geojson
 *   -> 200, Content-Type: application/vnd.geo+json
 *   -> Access-Control-Allow-Origin: *
 *   -> creator "BRouter-1.7.9"
 *
 * No account, no API key, no token, so principle II holds. The wildcard CORS
 * header is what makes a proxy unnecessary, and a proxy is a server, which
 * principle I forbids.
 *
 * The engine is MIT licensed; the data is OpenStreetMap under ODbL, which we
 * already credit for the map tiles.
 *
 * No rate limit is published. That is not permission (principle V). See
 * MAX_REQUESTS_PER_USER_REQUEST below and lib/routing.ts for the discipline we
 * impose on ourselves instead.
 */
const ROUTING_BASE_URL_DEFAULT = "https://brouter.de/brouter";

/**
 * Optional override, for someone self-hosting BRouter or pointing at another
 * provider.
 *
 * Build-time only. Verified in
 * node_modules/next/dist/docs/01-app/02-guides/environment-variables.md:
 * NEXT_PUBLIC_ values are inlined at `next build`, and "after being built, your
 * app will no longer respond to changes to these environment variables". This
 * is not a deploy-time toggle and must not be documented as one.
 *
 * Optional by construction (principle II): unset, empty, or unparseable falls
 * back to the default and everything works. Nothing about the build or the core
 * function requires it.
 */
function resolveRoutingBaseUrl(): string {
  const override = process.env.NEXT_PUBLIC_ROUTING_BASE_URL;
  if (override === undefined || override.trim() === "") {
    return ROUTING_BASE_URL_DEFAULT;
  }
  try {
    // Throws on anything that is not an absolute URL, which is the only
    // validation that matters here.
    new URL(override);
    return override;
  } catch {
    return ROUTING_BASE_URL_DEFAULT;
  }
}

const ROUTING_BASE_URL_DEFAULT_RESOLVED = resolveRoutingBaseUrl();

/**
 * Our vocabulary to the provider's. The domain speaks "bike" and "foot"; only
 * this map knows what BRouter calls them, so changing provider does not ripple
 * into the domain.
 *
 * Measured 2026-07-28 on the same 1.7-1.9 km pair in central Montreal:
 *
 *   trekking      1909 m / 354 s   -> 19.4 km/h   bike, BRouter's balanced default
 *   fastbike      1889 m / 357 s   -> 19.0 km/h   bike, road-biased
 *   safety        1861 m / 367 s   -> 18.2 km/h   bike, infrastructure-biased
 *   hiking-beta   1697 m / 1210 s  ->  5.1 km/h   foot
 *   shortest      1684 m / 1229 s  ->  4.9 km/h   not a usable bike profile
 *
 * `walking`, `foot`, `trekking-fast`, `hiking-mountain-beta` and
 * `hiking-low-networks-beta` all return HTTP 500 on this instance. They do not
 * exist; do not "fix" a failure by reaching for one.
 *
 * `trekking` over `safety` for bikes: the three bike profiles agree within 2.5%
 * on distance here, so the choice decides which streets get drawn rather than
 * the budget. `trekking` is the balanced default and is the profile the detour
 * factor will be calibrated against. `safety` leans harder on separated
 * infrastructure and lengthens routes outside the dense core, which would add
 * stops to trips that do not need them.
 */
export const ROUTING_PROFILES = {
  bike: "trekking",
  foot: "hiking-beta",
} as const;

/**
 * Sent as `trackname` on every request so the operator can identify us in their
 * logs and get in touch. The README carries contact details.
 *
 * This is deliberately not a request header, and that is not a style choice.
 * Verified 2026-07-28: the instance does not implement CORS preflight. It
 * answers OPTIONS with the route body and returns neither
 * Access-Control-Allow-Headers nor Access-Control-Allow-Methods. A custom header
 * would make the request non-simple, the browser would preflight it, and the
 * request would fail. Adding a header would not identify us, it would disable
 * the feature. `User-Agent` cannot be set from fetch at all.
 */
export const ROUTING_TRACKNAME = "redock-mtl";

/**
 * Credits shown whenever a traced path is displayed (principle V).
 *
 * OpenStreetMap is already credited for the tiles and is not duplicated; only
 * the routing engine is added here.
 */
export const ROUTING_ATTRIBUTION = {
  label: "BRouter",
  url: "https://brouter.de",
} as const;

/**
 * How far a returned path's end may sit from a *station* we asked about before
 * we stop believing it (FR-326).
 *
 * BRouter snaps to the nearest routable way, and a station on a plaza or set
 * back in a park can legitimately snap 100 m to the nearest street. Past 150 m
 * this stops being a snap and starts being a path between two other places.
 */
export const PATH_ENDPOINT_TOLERANCE = 150;

/**
 * The same, for an end that is an arbitrary point rather than a station.
 *
 * Deliberately looser, because the two cases are not alike. A station is placed
 * on a street by an operator. A rider's origin is wherever they tapped, which
 * may be the middle of a park, a campus, or a building footprint, and the
 * nearest way a person can actually walk on can be a few hundred metres off
 * without anything being wrong. Holding both to the station figure rejects
 * perfectly good walking routes.
 */
export const PATH_ENDPOINT_TOLERANCE_POINT = 500;

/**
 * How much longer than the crow flies a path may be before we reject it
 * (FR-326).
 *
 * The detour factor's own measurement, recorded in lib/params.ts, put the
 * observed maximum at 1.96 over 30 real station pairs between 700 m and 7 km.
 * Four times straight-line is far outside that distribution and means the router
 * went around something we should not silently draw as a route.
 */
export const PATH_LENGTH_SANITY_FACTOR = 4.0;

/**
 * Slack added to that bound, in metres, before the ratio is applied.
 *
 * A ratio alone is the wrong instrument at short range, and using one on its own
 * was a real defect: a 40 m walk whose footpath goes around a building is 200 m,
 * which is five times the crow-flies distance and entirely correct. Two stations
 * 80 m apart on opposite sides of a divided boulevard are a 500 m ride. Both were
 * being rejected as implausible, so the shorter legs of a trip silently fell back
 * to a straight line while the longer ones traced.
 *
 * 400 m is about one Montreal block plus a crossing: enough to absorb a detour
 * around an obstacle at close range, small enough that it disappears into the
 * ratio on any leg long enough for the ratio to mean something.
 */
export const PATH_LENGTH_ABSOLUTE_SLACK = 400;

/**
 * Per-request timeout. Matches the geolocation timeout in PlannerShell: past
 * eight seconds the rider has read their plan and moved on.
 */
export const PATH_REQUEST_TIMEOUT_MS = 8000;

/**
 * How many times a plan may be corrected before we stop and say so (FR-319).
 *
 * Termination is already structural: each round measures at least one more pair,
 * and a measured pair either keeps its edge or loses it permanently, so the edge
 * set shrinks monotonically over a finite graph. This cap is not there for the
 * theory. It is there because a rider watching their itinerary rearrange four
 * times has lost the plot regardless of what the theory says.
 */
export const MAX_CORRECTION_ROUNDS = 3;

/**
 * Ceiling on requests across one user request, correction rounds included
 * (FR-330a).
 *
 * A per-plan bound is not enough, and the reason is worth spelling out: each
 * correction produces a *new* plan, so a per-plan counter resets. Three rounds
 * of five steps would satisfy every other rule we impose while issuing twenty
 * requests to a service that has never asked us for anything. Twenty is that
 * worst case made explicit rather than reached by accident. The cache means the
 * realistic number is far lower.
 *
 * Reset when the rider changes an endpoint or a parameter, never when a
 * corrected plan is computed.
 */
export const MAX_REQUESTS_PER_USER_REQUEST = 20;

/**
 * Entries kept in the persistent path store.
 *
 * Measured ~1.8 KB per entry in the reduced form (about 90 points at 5 decimals
 * plus a length), so 500 entries is roughly 1 MB against a typical 5 MB
 * localStorage quota. 500 station pairs is far more than one rider's habitual
 * trips.
 */
export const PATH_CACHE_MAX_ENTRIES = 500;

/** Bump to discard every stored path. */
export const PATH_CACHE_SCHEMA_VERSION = 1;

// ---------------------------------------------------------------------------
// The four addresses a deployment may change
// ---------------------------------------------------------------------------

/**
 * What runs when there is no config.json, which includes the public deployment.
 *
 * Read by lib/runtime-config.ts and by nothing else. The reason for the single
 * reader is stated at the top of this file: a component reading one of these
 * directly would get the default even on a deployment that had configured
 * something else, and would keep working, so nobody would find out.
 *
 * These are the *only* four. The rest of this file is arithmetic and policy —
 * the refresh floor, the plausibility bounds, the request budget — and none of
 * it is a deployment's business to move: a self-hoster pointing at their own
 * BRouter still owes the same courtesy to it that we owe the public instance.
 *
 * `routingBaseUrl` keeps the build-time NEXT_PUBLIC_ROUTING_BASE_URL override as
 * its default rather than dropping it. The two are not rivals and the order is
 * deliberate: config.json beats the env var beats the literal. Someone building
 * their own bundle can still bake in their instance, and someone running the
 * published image can still override it without building anything, which is the
 * case the env var never could serve.
 */
export const DEFAULT_SERVICE_ENDPOINTS = {
  stationsFeedUrl: GBFS_DISCOVERY_URL_DEFAULT,
  routingBaseUrl: ROUTING_BASE_URL_DEFAULT_RESOLVED,
  geocoderUrl: GEOCODER_URL_DEFAULT,
  mapStyleUrl: MAP_STYLE_URL_DEFAULT,
} as const;
