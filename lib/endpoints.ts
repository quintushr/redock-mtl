/**
 * Every external base URL in the application, deliberately isolated in one file.
 *
 * Changing a provider must be a single-file edit. Nothing here is written from
 * memory: each entry was verified against provider documentation on 2026-07-26,
 * and the verification notes live beside it.
 *
 * All three providers are keyless. Adding one that needs an account or an API
 * key would violate constitution principle II.
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
export const GBFS_DISCOVERY_URL = "https://gbfs.velobixi.com/gbfs/2-2/gbfs.json";

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
export const MAP_STYLE_URL = "https://tiles.openfreemap.org/styles/positron";

export const MAP_ATTRIBUTION_SUFFIX = "OpenFreeMap";

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
export const GEOCODER_URL = "https://photon.komoot.io/api/";

/** Milliseconds of quiet before a query is sent. */
export const GEOCODER_DEBOUNCE_MS = 400;

/** Upper bound on results requested per query. */
export const GEOCODER_RESULT_LIMIT = 5;

/** Minimum query length before we bother the endpoint at all. */
export const GEOCODER_MIN_QUERY_LENGTH = 3;
