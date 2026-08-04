"use client";

import { useEffect, useState } from "react";
import { fetchPath } from "@/lib/routing";
import type { LatLon } from "@/lib/types";

/**
 * The traced path from the origin straight to the destination.
 *
 * Not a route anybody rides. It is a *ruler*: `planTrip` uses it to estimate the
 * distance between two stations that both sit near it, instead of multiplying a
 * great-circle distance by one scalar factor. The reasoning, and the measurements
 * behind it, are on `corridorDistance` in lib/geo.ts.
 *
 * One request per pair of endpoints, and only when both are set. That is the cost
 * of one segment of the itinerary, spent on a plan that is measurably better from
 * its first draw rather than after a correction round, so it does not widen the
 * footprint this project keeps on a courtesy service (principle V). It goes
 * through `fetchPath`, so it sits inside the same request ceiling and the same
 * session cache as everything else: swapping the endpoints back and forth costs
 * nothing after the first time.
 *
 * Null is a normal, permanent state rather than a loading artefact. If the router
 * is unreachable, or the pair is implausible, or the ceiling has been reached,
 * the planner gets no corridor and estimates exactly as it did before. Nothing
 * here may be allowed to prevent a plan.
 *
 * No `stations` argument on purpose. The corridor is a property of where the
 * rider is going, not of the network, so a feed refresh must not re-request it.
 */
export function useCorridor(
  origin: LatLon | null,
  destination: LatLon | null,
): LatLon[] | null {
  /**
   * The path, carrying the pair it was fetched for.
   *
   * Keyed rather than cleared. Clearing on a new pair would mean a `setState` in
   * the effect body, which cascades an extra render and which React's lint rule
   * rightly rejects; holding the key and comparing on the way out gets the same
   * guarantee for free. A corridor for a superseded pair is never returned, so a
   * slow answer for an old destination cannot reach the planner.
   */
  const [entry, setEntry] = useState<{ key: string; path: LatLon[] } | null>(
    null,
  );

  const key =
    origin === null || destination === null
      ? null
      : `${origin.lat},${origin.lon}|${destination.lat},${destination.lon}`;

  useEffect(() => {
    if (origin === null || destination === null || key === null) return;

    const controller = new AbortController();
    let live = true;

    /*
     * `profile: "bike"`, and no `stations` field. The ends are arbitrary points
     * the rider chose, so this is deliberately outside the persistent path store
     * (FR-329b): a key built from two arbitrary coordinates would grow without
     * bound for a hit rate near zero. Session reuse is what it needs, and what
     * `fetchPath` already gives it.
     */
    void fetchPath(
      { from: origin, to: destination, profile: "bike" },
      controller.signal,
    ).then((path) => {
      if (!live || path === null) return;
      setEntry({ key, path: path.coordinates });
    });

    return () => {
      live = false;
      controller.abort();
    };
  }, [origin, destination, key]);

  return entry !== null && entry.key === key ? entry.path : null;
}
