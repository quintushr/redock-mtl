import { convexHull, haversineMetres } from "./geo";
import type {
  FeedAttribution,
  LatLon,
  Metres,
  ParseResult,
  ServiceArea,
  Station,
  StationSnapshot,
} from "./types";

/**
 * GBFS 2.2 parsing and station eligibility rules.
 *
 * Everything here is pure. Fetching lives in feed-client.ts.
 *
 * Parsing is total: input is `unknown`, unknown fields are ignored, missing
 * optional fields do not throw, and malformed input returns a typed failure
 * (FR-030). A thrown error here would surface as a raw error in the UI.
 */

// ---------------------------------------------------------------------------
// Defensive readers
// ---------------------------------------------------------------------------

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const asArray = (value: unknown): unknown[] =>
  Array.isArray(value) ? value : [];

const asString = (value: unknown): string | null =>
  typeof value === "string" ? value : null;

const asFiniteNumber = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

const asCount = (value: unknown): number => {
  const n = asFiniteNumber(value);
  return n === null || n < 0 ? 0 : Math.floor(n);
};

/**
 * The feed sends 1 and 0, not true and false, for the operational flags. A
 * strict `=== true` would mark every station non-operational, which is the kind
 * of bug that produces an empty map and no explanation.
 */
const asFlag = (value: unknown, fallback: boolean): boolean => {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  return fallback;
};

/**
 * Coordinates must be validated on their own merits.
 *
 * The live feed carries stations at (0, 0). They all happened to be flagged
 * uninstalled at capture time, but relying on that coincidence is fragile: one
 * unfiltered null-island station stretches the service-area hull across the
 * Atlantic and wrecks both coverage detection and ellipse pruning.
 */
const isUsablePosition = (position: LatLon): boolean =>
  Number.isFinite(position.lat) &&
  Number.isFinite(position.lon) &&
  Math.abs(position.lat) <= 90 &&
  Math.abs(position.lon) <= 180 &&
  // Null island is never a real station.
  !(position.lat === 0 && position.lon === 0);

// ---------------------------------------------------------------------------
// Vehicle types
// ---------------------------------------------------------------------------

/**
 * Vehicle type ids that count as a mechanical bike: human propulsion and a
 * plain bicycle form factor.
 *
 * Cargo bicycles are human-powered too and are deliberately excluded. A cargo
 * bike is a different product with different handling, and quietly substituting
 * one would put a rider on a vehicle they did not plan for.
 *
 * Ids are never hard-coded; they are always derived from the feed's catalogue.
 */
export function mechanicalVehicleTypeIds(vehicleTypes: unknown): Set<string> {
  const ids = new Set<string>();
  const data = isRecord(vehicleTypes) ? vehicleTypes.data : null;
  const list = isRecord(data) ? asArray(data.vehicle_types) : [];

  for (const entry of list) {
    if (!isRecord(entry)) continue;
    const id = asString(entry.vehicle_type_id);
    if (id === null) continue;
    if (
      asString(entry.propulsion_type) === "human" &&
      asString(entry.form_factor) === "bicycle"
    ) {
      ids.add(id);
    }
  }
  return ids;
}

/**
 * Counts mechanical bikes at a station.
 *
 * `num_bikes_available` cannot be used: it includes e-bikes. A station in the
 * captured fixture reports one bike available, which is an e-bike, and zero
 * mechanical bikes.
 */
function countMechanical(status: Record<string, unknown>, mechanicalIds: Set<string>): number {
  let total = 0;
  for (const entry of asArray(status.vehicle_types_available)) {
    if (!isRecord(entry)) continue;
    const id = asString(entry.vehicle_type_id);
    if (id !== null && mechanicalIds.has(id)) total += asCount(entry.count);
  }
  return total;
}

// ---------------------------------------------------------------------------
// Snapshot parsing
// ---------------------------------------------------------------------------

/**
 * Merges station_information and station_status into a snapshot.
 *
 * Stations present in only one feed are dropped rather than half-populated, and
 * stations with unusable coordinates are dropped outright.
 */
export function parseStationSnapshot(
  information: unknown,
  status: unknown,
  vehicleTypes: unknown,
  systemInfo: unknown,
  fallbackAttribution: FeedAttribution,
): ParseResult<StationSnapshot> {
  const infoData = isRecord(information) ? information.data : null;
  const statusData = isRecord(status) ? status.data : null;

  if (!isRecord(infoData) || !Array.isArray(infoData.stations)) {
    return {
      ok: false,
      error: "malformed",
      detail: "station_information is missing its data.stations array",
    };
  }
  if (!isRecord(statusData) || !Array.isArray(statusData.stations)) {
    return {
      ok: false,
      error: "malformed",
      detail: "station_status is missing its data.stations array",
    };
  }

  const mechanicalIds = mechanicalVehicleTypeIds(vehicleTypes);

  const statusById = new Map<string, Record<string, unknown>>();
  for (const entry of statusData.stations) {
    if (!isRecord(entry)) continue;
    const id = asString(entry.station_id);
    if (id !== null) statusById.set(id, entry);
  }

  const stations: Station[] = [];
  for (const entry of infoData.stations) {
    if (!isRecord(entry)) continue;

    const id = asString(entry.station_id);
    if (id === null) continue;

    const live = statusById.get(id);
    if (live === undefined) continue; // present in one feed only

    const lat = asFiniteNumber(entry.lat);
    const lon = asFiniteNumber(entry.lon);
    if (lat === null || lon === null) continue;

    const position: LatLon = { lat, lon };
    if (!isUsablePosition(position)) continue;

    stations.push({
      id,
      name: asString(entry.name) ?? id,
      position,
      capacity: asFiniteNumber(entry.capacity),
      mechanicalBikesAvailable: countMechanical(live, mechanicalIds),
      ebikesAvailable: asCount(live.num_ebikes_available),
      docksAvailable: asCount(live.num_docks_available),
      // Absent flags default to unavailable: assuming a station works when the
      // feed does not say so would be the optimistic reading, and principle IV
      // says be conservative.
      isInstalled: asFlag(live.is_installed, false),
      isRenting: asFlag(live.is_renting, false),
      isReturning: asFlag(live.is_returning, false),
    });
  }

  const lastUpdated =
    asFiniteNumber(isRecord(status) ? status.last_updated : null) ??
    asFiniteNumber(isRecord(information) ? information.last_updated : null);

  if (lastUpdated === null) {
    return {
      ok: false,
      error: "malformed",
      detail: "no last_updated timestamp on either station feed",
    };
  }

  const ttl = asFiniteNumber(isRecord(status) ? status.ttl : null) ?? 0;

  return {
    ok: true,
    value: {
      stations,
      // GBFS publishes POSIX seconds; the local clock is never consulted, so a
      // stale feed cannot masquerade as fresh (FR-014).
      observedAt: new Date(lastUpdated * 1000),
      ttl: Math.max(0, ttl),
      attribution: parseAttribution(systemInfo, fallbackAttribution),
    },
  };
}

/**
 * Reads attribution from system_information, falling back to the values held in
 * endpoints.ts.
 *
 * The fallback is not theoretical: this provider publishes an empty `operator`
 * and an empty `license_url`, so the feed carries no attribution of its own.
 */
export function parseAttribution(
  systemInfo: unknown,
  fallback: FeedAttribution,
): FeedAttribution {
  const data = isRecord(systemInfo) ? systemInfo.data : null;
  if (!isRecord(data)) return fallback;

  const nonEmpty = (value: unknown): string | null => {
    const s = asString(value);
    return s !== null && s.trim() !== "" ? s : null;
  };

  return {
    operatorName:
      nonEmpty(data.operator) ?? nonEmpty(data.name) ?? fallback.operatorName,
    licenseUrl: nonEmpty(data.license_url) ?? fallback.licenseUrl,
    licenseName: nonEmpty(data.license_id) ?? fallback.licenseName,
  };
}

// ---------------------------------------------------------------------------
// Eligibility
// ---------------------------------------------------------------------------

/** FR-013: a station must be installed, renting, and returning to be used. */
export function isOperational(station: Station): boolean {
  return station.isInstalled && station.isRenting && station.isReturning;
}

/**
 * Whether a station can hand over a bike, and whether it can take one back.
 *
 * Both are now the same question, and the answer is the station's *service
 * status* rather than its current contents. This is a deliberate reversal, and
 * it is worth stating plainly because it changes what a plan means.
 *
 * A plan is made before the trip, and a count read now is not a count that will
 * hold when the rider arrives forty minutes later. Planning against live
 * occupancy produces an itinerary that is precise about a moment already gone:
 * it will route around a station that is empty now and full by the time anyone
 * reaches it, and it will happily send a rider to one that is full now and
 * empty on arrival. The occupancy is real information, but it is information
 * about the present, and a route is a statement about the future.
 *
 * So availability leaves the calculation and stays on the map, where the ring
 * around each marker still shows what that station holds and the callout still
 * gives the figures. The rider sees it and decides; the planner does not
 * pretend to.
 *
 * What is still consulted is `isOperational`: installed, renting and returning.
 * That is not occupancy, it is whether the station is in service at all, and a
 * station the operator has taken out of service is not somewhere anybody can be
 * sent whatever the counts say.
 *
 * The consequence to be honest about: a rider can now be sent to a first station
 * that has no mechanical bike at that instant. The map says so before they set
 * off, and the alternative was worse, because the old behaviour also failed and
 * failed silently, by planning a detour around a station that had refilled.
 */
export function canStartSegment(station: Station): boolean {
  return isOperational(station);
}

/**
 * FR-011a: this is also the only condition for continuing a trip from a
 * station, since the bike the rider docks is the bike they take again.
 */
export function canEndSegment(station: Station): boolean {
  return isOperational(station);
}

// ---------------------------------------------------------------------------
// Service area
// ---------------------------------------------------------------------------

/**
 * Distance beyond which two stations are treated as belonging to separate
 * networks.
 *
 * Chosen from the data: within Montreal, neighbouring stations sit a few
 * hundred metres apart and the largest gap inside the city is well under this.
 * Sherbrooke is 130 km away. Anything between 10 and 50 km would separate them
 * equally well, so the value is not delicate; 15 km simply leaves room for a
 * sparse suburban fringe without bridging to another city.
 */
export const CLUSTER_SEPARATION_METRES = 15_000;

/**
 * Groups stations into clusters by single linkage: two stations are in the same
 * cluster when a chain of stations no more than CLUSTER_SEPARATION_METRES apart
 * connects them.
 *
 * Quadratic in the station count, which is fine at this scale and runs once per
 * snapshot rather than once per plan.
 */
function clusterPositions(positions: LatLon[]): LatLon[][] {
  const parent = positions.map((_, i) => i);

  const find = (i: number): number => {
    let root = i;
    while (parent[root] !== root) root = parent[root];
    while (parent[i] !== root) [i, parent[i]] = [parent[i], root];
    return root;
  };

  for (let i = 0; i < positions.length; i++) {
    for (let j = i + 1; j < positions.length; j++) {
      if (find(i) === find(j)) continue;
      if (haversineMetres(positions[i], positions[j]) <= CLUSTER_SEPARATION_METRES) {
        parent[find(i)] = find(j);
      }
    }
  }

  const groups = new Map<number, LatLon[]>();
  positions.forEach((position, i) => {
    const root = find(i);
    const group = groups.get(root);
    if (group === undefined) groups.set(root, [position]);
    else group.push(position);
  });

  return [...groups.values()];
}

/**
 * FR-029a: the service area is the footprint of the network's active stations,
 * extended by a buffer.
 *
 * One hull per cluster, not one hull overall. The BIXI feed carries Montreal
 * and Sherbrooke, 130 km apart; a single hull would span 160 km and declare all
 * the countryside between them covered, so a user standing in a field would be
 * told they are in coverage and then handed a routing failure. That is exactly
 * the confusion FR-029b exists to prevent.
 *
 * Built from operational stations only, so an out-of-season network yields no
 * hulls and therefore covers nothing.
 */
export function buildServiceArea(
  stations: Station[],
  bufferMetres: Metres,
): ServiceArea {
  const active = stations.filter(isOperational).map((s) => s.position);
  if (active.length === 0) return { hulls: [], bufferMetres };
  return {
    hulls: clusterPositions(active).map(convexHull),
    bufferMetres,
  };
}
