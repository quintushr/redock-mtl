"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { MAX_CORRECTION_ROUNDS } from "@/lib/endpoints";
import { planTrip } from "@/lib/planner";
import { pathKey } from "@/lib/route-geometry";
import { purgeStoredPaths, storedPathCount } from "@/lib/path-store";
import { clearRoutingCache, fetchPath, resetRequestBudget } from "@/lib/routing";
import {
  applyPath,
  beginCorrection,
  beginRefinement,
  nextAction,
} from "@/lib/route-refinement";
import type {
  Itinerary,
  LatLon,
  PathKey,
  PlanResult,
  PlanningParameters,
  RefinementState,
  RoutingRequest,
  StationSnapshot,
  TracedItinerary,
  TracedPath,
} from "@/lib/types";

/**
 * An adapter, and nothing more.
 *
 * It decides nothing: not which step to fetch, not whether a path is
 * acceptable, not whether a duration breaks the budget, not when to stop. Every
 * one of those is a pure function in lib/route-refinement.ts, where it is tested
 * without React, without jsdom and without a network.
 *
 * That division is the thing to preserve. The obvious version of this feature
 * puts a fetch in the map's own effect with the correction loop inline beside
 * it, and it works right up until someone needs to test the case the feature
 * exists for. tests/unit/routing-boundaries.test.ts fails the build if this
 * drifts back.
 *
 * What is held and what is derived is the second thing keeping this file small.
 * The only state is the list of answers the network has given. The refinement,
 * the refined durations and any corrected plan are all recomputed from that list
 * by pure functions during render. There is nothing to keep in sync, so there is
 * no effect writing state that another effect reads back.
 */

/** One request the network has answered. `path === null` means "no path". */
interface Resolved {
  request: RoutingRequest;
  path: TracedPath | null;
}

/**
 * Empties every path this application is holding, stored and in-session
 * (FR-329a).
 *
 * It lives here rather than in the settings component because this module is
 * the one place permitted to reach lib/routing.ts, and a settings panel
 * importing the fetch layer to clear it would be the first crack in that rule.
 * Both caches go together: clearing the persisted paths while leaving the
 * session's would report zero while still drawing them.
 */
export function purgeCachedPaths(): void {
  purgeStoredPaths();
  clearRoutingCache();
}

/** How many paths are stored, for the purge control's label. */
export function cachedPathCount(): number {
  return storedPathCount();
}

export function useTracedItinerary(
  plan: PlanResult | null,
  snapshot: StationSnapshot | null,
  params: PlanningParameters,
  /** Needed only to replan; the hook never chooses a route itself. */
  endpoints?: { origin: LatLon | null; destination: LatLon | null },
): TracedItinerary | null {
  const itinerary = plan !== null && plan.ok ? plan.itinerary : null;
  const stations = snapshot?.stations;
  const origin = endpoints?.origin ?? null;
  const destination = endpoints?.destination ?? null;

  /**
   * The answers in hand, tagged with the plan they belong to.
   *
   * Tagged rather than cleared by an effect, so a plan change discards them in
   * the same render that introduced it. An effect would leave one render in
   * which last trip's geometry is folded into this trip's itinerary.
   */
  const [answers, setAnswers] = useState<{
    plan: Itinerary | null;
    list: Resolved[];
  }>({ plan: itinerary, list: [] });

  const resolved = useMemo(
    () => (answers.plan === itinerary ? answers.list : []),
    [answers, itinerary],
  );

  /**
   * The refinement, derived.
   *
   * Open over the plan, fold in every answer received, and ask what to do. If
   * the answer is "replan", do it and go round again: the corrected plan is
   * itself refined from the same answers, and any step it shares with the
   * previous plan is already resolved. `nextAction` returns `exhausted` rather
   * than `replan` once the cap is reached, so this terminates.
   *
   * All of it is pure, which is why it can be a useMemo rather than a sequence
   * of effects writing to one another.
   */
  const state = useMemo<RefinementState | null>(() => {
    if (itinerary === null || stations === undefined) return null;

    let current = beginRefinement(itinerary, stations);

    for (let round = 0; round <= MAX_CORRECTION_ROUNDS; round += 1) {
      for (const answer of resolved) {
        current = applyPath(current, answer.request, answer.path, params);
      }

      const action = nextAction(current, params);
      if (action.kind !== "replan") break;
      if (origin === null || destination === null || snapshot === null) break;

      // The measurements go in, the over-budget edge falls out of the graph,
      // and the corrected plan is an ordinary shortest path (FR-316, FR-318).
      const corrected = planTrip(
        origin,
        destination,
        snapshot,
        params,
        action.measured,
      );
      if (!corrected.ok) break;

      current = beginCorrection(current, corrected.itinerary, stations);
    }

    return current;
  }, [itinerary, stations, resolved, params, origin, destination, snapshot]);

  /**
   * What has already been asked for, and for which plan.
   *
   * A ref, because none of it renders and because the fetch callbacks that read
   * it outlive the render that created them. Touched only inside effects.
   */
  const run = useRef<{
    plan: Itinerary | null;
    keys: Set<PathKey>;
    controller: AbortController | null;
  }>({ plan: null, keys: new Set(), controller: null });

  /**
   * Carry out whatever the state machine asks for.
   *
   * The only thing this effect does is I/O. It writes state from the fetch's
   * own callback, which is what an effect is for: synchronising with an
   * external system.
   */
  useEffect(() => {
    if (run.current.plan !== itinerary) {
      // Whatever the previous plan had in flight belongs to a plan nobody is
      // looking at any more (FR-327).
      run.current.controller?.abort();
      run.current = {
        plan: itinerary,
        keys: new Set(),
        controller: new AbortController(),
      };
      // A new plan is a new user request, so the request budget starts over. It
      // is deliberately not reset per correction: that is the hole the ceiling
      // exists to close (FR-330a).
      resetRequestBudget();
    }

    if (state === null) return;

    const action = nextAction(state, params);
    if (action.kind !== "fetch") return;

    const { keys, controller } = run.current;
    const mine = itinerary;

    for (const request of action.requests) {
      const key = pathKey(request);
      if (keys.has(key)) continue;
      keys.add(key);

      void fetchPath(request, controller?.signal).then((path) => {
        // An answer for a plan the rider has moved on from lands nowhere.
        if (run.current.plan !== mine) return;
        // Each answer folds in on its own, so a slow segment never holds up a
        // fast one (FR-322).
        setAnswers((current) =>
          current.plan === mine
            ? { plan: mine, list: [...current.list, { request, path }] }
            : { plan: mine, list: [{ request, path }] },
        );
      });
    }
  }, [state, params, itinerary]);

  // Abort on unmount, so a request cannot outlive the component that wanted it.
  useEffect(() => () => run.current.controller?.abort(), []);

  return state?.traced ?? null;
}

export default useTracedItinerary;
