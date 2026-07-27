import { parseStationSnapshot } from "@/lib/gbfs";
import type { FeedAttribution, LatLon, Station, StationSnapshot } from "@/lib/types";

import information from "../fixtures/montreal-station-information.json";
import status from "../fixtures/montreal-station-status.json";
import vehicleTypes from "../fixtures/montreal-vehicle-types.json";
import systemInformation from "../fixtures/montreal-system-information.json";

/**
 * Shared fixture loading. Frozen JSON only; nothing here touches the network.
 */

export const FALLBACK_ATTRIBUTION: FeedAttribution = {
  operatorName: "BIXI Montréal",
  licenseUrl: null,
  licenseName: null,
};

export const snapshot: StationSnapshot = (() => {
  const result = parseStationSnapshot(
    information,
    status,
    vehicleTypes,
    systemInformation,
    FALLBACK_ATTRIBUTION,
  );
  if (!result.ok) throw new Error("fixture must parse");
  return result.value;
})();

export const operationalStations: Station[] = snapshot.stations.filter(
  (s) => s.isInstalled && s.isRenting && s.isReturning,
);

/** Operational stations sorted west to east along the captured corridor. */
export const corridor: Station[] = [...operationalStations].sort(
  (a, b) => a.position.lon - b.position.lon,
);

export const westEnd: LatLon = corridor[0].position;
export const eastEnd: LatLon = corridor[corridor.length - 1].position;

/** A point just off a station, so the plan needs a real approach walk. */
export const near = (point: LatLon, dLat = 0.0015): LatLon => ({
  lat: point.lat + dLat,
  lon: point.lon,
});
