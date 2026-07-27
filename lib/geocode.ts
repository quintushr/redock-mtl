import type { LatLon } from "./types";

/**
 * Turning geocoder answers into something a rider can read, and reading a
 * coordinate pair typed by hand.
 *
 * Pure by construction (principle III): this module knows what a Photon feature
 * looks like and what a human needs to see, and nothing about fetching or
 * rendering. `SearchField` is the only caller and holds no shaping logic.
 *
 * Photon's shape was captured from the live endpoint on 2026-07-26 and is
 * frozen in `tests/fixtures/photon-housenumber.json`. The fields that matter
 * here: `housenumber` and `street` arrive as separate properties, and a plain
 * street address carries no `name` at all. Building a label from `name`,
 * `street` and `city` alone therefore drops the street number entirely and
 * renders every address on a street identically, which is the same as not
 * supporting street numbers.
 */

/** The kind of place a result denotes, as Photon classifies it. */
export type PlaceKind =
  | "house"
  | "street"
  | "locality"
  | "district"
  | "city"
  | "county"
  | "state"
  | "country"
  | "other";

export interface GeocodeSuggestion {
  /** What the result is: "1000 Rue De La Gauchetière Ouest". */
  primary: string;
  /** Where it is: "Ville-Marie, Montréal, Québec". Possibly empty. */
  secondary: string;
  kind: PlaceKind;
  position: LatLon;
}

const KINDS: readonly PlaceKind[] = [
  "house",
  "street",
  "locality",
  "district",
  "city",
  "county",
  "state",
  "country",
  "other",
];

/** Human wording for the badge on a suggestion row. */
export const KIND_LABELS: Record<PlaceKind, string> = {
  house: "Address",
  street: "Street",
  locality: "Place",
  district: "District",
  city: "City",
  county: "Region",
  state: "Region",
  country: "Country",
  other: "Place",
};

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

function kindOf(value: unknown): PlaceKind {
  const raw = text(value);
  const found = KINDS.find((kind) => kind === raw);
  return found ?? "other";
}

/**
 * The street line, number included.
 *
 * The number goes in front of the street for the anglophone and Québécois
 * convention this network serves. Photon also returns a `housenumber` with no
 * `street` for some nodes; that is not addressable on its own, so it is dropped
 * rather than shown as a bare number.
 */
function streetLine(
  housenumber: string | null,
  street: string | null,
): string | null {
  if (street === null) return null;
  return housenumber === null ? street : `${housenumber} ${street}`;
}

/** Case-insensitive de-duplication that keeps the first spelling seen. */
function unique(parts: (string | null)[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of parts) {
    if (part === null) continue;
    const key = part.toLocaleLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(part);
  }
  return out;
}

function toSuggestion(feature: unknown): GeocodeSuggestion | null {
  if (typeof feature !== "object" || feature === null) return null;
  const { geometry, properties } = feature as {
    geometry?: unknown;
    properties?: unknown;
  };

  const coordinates = (geometry as { coordinates?: unknown } | null)
    ?.coordinates;
  if (!Array.isArray(coordinates) || coordinates.length < 2) return null;
  const [lon, lat] = coordinates;
  if (typeof lon !== "number" || typeof lat !== "number") return null;
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;

  const props = (properties ?? {}) as Record<string, unknown>;
  const name = text(props.name);
  const street = streetLine(text(props.housenumber), text(props.street));
  const city = text(props.city);
  const district = text(props.district);
  const county = text(props.county);
  const state = text(props.state);
  const country = text(props.country);
  const postcode = text(props.postcode);

  // A named place leads with its name and keeps the street as context; a plain
  // address leads with the street line, which is the only thing identifying it.
  const primary = name ?? street ?? city ?? district ?? state ?? country;
  if (primary === null) return null;

  const context = unique([
    primary === street ? null : street,
    district,
    city ?? county,
    postcode,
    state,
    country,
  ]).slice(0, 4);

  return {
    primary,
    secondary: context.join(", "),
    kind: kindOf(props.type),
    position: { lat, lon },
  };
}

/**
 * Reads a Photon FeatureCollection.
 *
 * Total: a malformed payload yields an empty list rather than an exception, so
 * a provider changing its shape degrades to "search unavailable" instead of
 * breaking the page (principle II, FR-030).
 */
export function parseGeocoderResults(payload: unknown): GeocodeSuggestion[] {
  if (typeof payload !== "object" || payload === null) return [];
  const features = (payload as { features?: unknown }).features;
  if (!Array.isArray(features)) return [];

  const out: GeocodeSuggestion[] = [];
  const seen = new Set<string>();
  for (const feature of features) {
    const suggestion = toSuggestion(feature);
    if (suggestion === null) continue;
    // Photon happily returns the same address twice from different OSM
    // objects; two identical rows are a choice the user cannot make.
    const key = `${suggestion.primary}|${suggestion.secondary}`.toLocaleLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(suggestion);
  }
  return out;
}

/**
 * A coordinate pair typed by hand, in "lat, lon" order.
 *
 * This is the guaranteed input path of FR-002 alongside the map click: it works
 * with the geocoder unreachable, which its operator explicitly does not
 * guarantee. Accepts a comma, a semicolon, or whitespace as the separator, and
 * a leading + on either number.
 *
 * The decimal separator must be a dot. Accepting a decimal comma would make
 * "45,5 -73,6" and "45, 5" indistinguishable, and silently planning from the
 * wrong point is worse than rejecting the input.
 */
export function parseCoordinates(input: string): LatLon | null {
  const match = /^\s*([+-]?\d+(?:\.\d+)?)\s*[,;\s]\s*([+-]?\d+(?:\.\d+)?)\s*$/.exec(
    input,
  );
  if (match === null) return null;

  const lat = Number(match[1]);
  const lon = Number(match[2]);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;

  return { lat, lon };
}

/**
 * Coordinates as shown in an input once a point has been set from the map.
 *
 * Five decimals is about a metre, which is finer than anything this planner
 * claims; more digits would suggest a precision the estimate does not have
 * (principle IV). Round-trips through `parseCoordinates`.
 */
export function formatCoordinates(point: LatLon): string {
  const trim = (value: number): string =>
    String(Number(value.toFixed(5)));
  return `${trim(point.lat)}, ${trim(point.lon)}`;
}
