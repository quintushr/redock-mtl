import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import ItineraryTrail from "@/components/ItineraryTrail";
import TripSummary from "@/components/TripSummary";
import { beginRefinement, applyPath, nextAction } from "@/lib/route-refinement";
import { DEFAULT_PARAMETERS, segmentBudget } from "@/lib/params";
import { remainingAfter, remainingStatus } from "@/lib/remaining";
import { messages as fr } from "@/lib/i18n/messages/fr";
import type { Itinerary, Station } from "@/lib/types";

/**
 * FR-325: no essential capability depends on a traced path.
 *
 * The other half of that requirement is checked by hand with brouter.de blocked
 * in devtools. This is the half a test can hold: with every request answered by
 * "no path", the rider still gets a complete itinerary, every figure, and an
 * honest account of what they are looking at.
 *
 * It guards a specific regression. Nothing today reads geometry to decide
 * whether to render a step, but the moment something does, a rider on a train
 * with no signal gets a blank panel instead of a plan.
 */

afterEach(cleanup);

const params = DEFAULT_PARAMETERS;
const budget = segmentBudget(params);

const stations: Station[] = [
  {
    id: "a",
    name: "Station Alpha",
    position: { lat: 45.5, lon: -73.6 },
    capacity: 20,
    mechanicalBikesAvailable: 5,
    ebikesAvailable: 0,
    docksAvailable: 5,
    isInstalled: true,
    isRenting: true,
    isReturning: true,
  },
  {
    id: "b",
    name: "Station Bravo",
    position: { lat: 45.52, lon: -73.58 },
    capacity: 20,
    mechanicalBikesAvailable: 2,
    ebikesAvailable: 0,
    docksAvailable: 8,
    isInstalled: true,
    isRenting: true,
    isReturning: true,
  },
  {
    id: "c",
    name: "Station Charlie",
    position: { lat: 45.54, lon: -73.55 },
    capacity: 20,
    mechanicalBikesAvailable: 2,
    ebikesAvailable: 0,
    docksAvailable: 4,
    isInstalled: true,
    isRenting: true,
    isReturning: true,
  },
];

const ride = (from: string, to: string, seconds: number) => ({
  kind: "bike" as const,
  fromStationId: from,
  toStationId: to,
  duration: seconds,
  distance: 4200,
  remaining: remainingAfter(seconds, params),
  remainingStatus: remainingStatus(remainingAfter(seconds, params)),
});

/** Walk, ride, dock, ride, walk: the canonical one-stop trip. */
const plan: Itinerary = {
  steps: [
    {
      kind: "walk",
      from: { lat: 45.499, lon: -73.601 },
      to: stations[0].position,
      toStationId: "a",
      duration: 240,
      distance: 300,
    },
    ride("a", "b", budget * 0.9),
    { kind: "dock", stationId: "b", cooldown: 60 },
    ride("b", "c", budget * 0.3),
    {
      kind: "walk",
      from: stations[2].position,
      to: { lat: 45.541, lon: -73.552 },
      toStationId: null,
      duration: 180,
      distance: 220,
    },
  ],
  totalDuration: 240 + budget * 0.9 + 60 + budget * 0.3 + 180,
  stopCount: 1,
  freeWindowConsumed: budget * 1.2,
  snapshotObservedAt: new Date("2026-07-28T05:00:00Z"),
};

/** Every request answered with "no path", as if the source were unreachable. */
function everythingFails() {
  let state = beginRefinement(plan, stations);
  for (const request of [...state.outstanding]) {
    state = applyPath(state, request, null, params);
  }
  return state;
}

describe("the source is entirely unreachable", () => {
  it("still settles, rather than waiting forever", () => {
    const state = everythingFails();
    expect(state.traced.settled).toBe(true);
    expect(nextAction(state, params).kind).toBe("settled");
  });

  it("leaves the itinerary exactly as the planner produced it", () => {
    const state = everythingFails();
    expect(state.traced.itinerary.steps).toHaveLength(plan.steps.length);
    expect(state.traced.itinerary.totalDuration).toBeCloseTo(
      plan.totalDuration,
      5,
    );
    expect(state.traced.itinerary.stopCount).toBe(plan.stopCount);
  });

  it("proposes no correction, because nothing was measured", () => {
    const state = everythingFails();
    expect(state.traced.corrections).toBe(0);
    expect(state.measured.size).toBe(0);
  });

  it("renders every step of the trail", () => {
    const state = everythingFails();
    render(
      <ItineraryTrail
        itinerary={state.traced.itinerary}
        geometry={state.traced.geometry}
        stations={stations}
        params={params}
      />,
    );

    // Start, two rides, one anchor, two walks, destination: the whole journey.
    expect(screen.getByText(fr.trail.start)).toBeTruthy();
    expect(screen.getByText(fr.trail.destination)).toBeTruthy();
    expect(screen.getByText("Station Bravo")).toBeTruthy();
    expect(screen.getAllByRole("listitem").length).toBe(7);
  });

  it("renders the summary", () => {
    const state = everythingFails();
    const { container } = render(<TripSummary itinerary={state.traced.itinerary} />);
    // A figure is present. Which figure is TripSummary's own test's business.
    expect(container.textContent?.length).toBeGreaterThan(0);
    expect(container.textContent).not.toMatch(/NaN|undefined/);
  });

  it("says every part is an approximation, and claims nothing more", () => {
    const state = everythingFails();
    render(
      <ItineraryTrail
        itinerary={state.traced.itinerary}
        geometry={state.traced.geometry}
        stations={stations}
        params={params}
      />,
    );

    expect(screen.getByText(fr.trail.traceIsIndicative)).toBeTruthy();
    expect(screen.queryByText(fr.trail.traceAllReal)).toBeNull();
    expect(screen.queryByText(fr.trail.traceMixed)).toBeNull();
    expect(screen.queryByText(new RegExp(fr.trail.pathTraced))).toBeNull();
  });

  it("shows no raw error anywhere", () => {
    const state = everythingFails();
    const { container } = render(
      <ItineraryTrail
        itinerary={state.traced.itinerary}
        geometry={state.traced.geometry}
        stations={stations}
        params={params}
      />,
    );
    // The failure is a routing failure, not the rider's problem, and it has
    // already been said in the plainest terms available: this part is an
    // approximation.
    expect(container.textContent).not.toMatch(/error|Error|undefined|NaN|\[object/);
  });
});

describe("a partial failure is not a total one", () => {
  it("keeps the paths it did get", () => {
    let state = beginRefinement(plan, stations);
    const requests = [...state.outstanding];

    state = applyPath(
      state,
      requests[0],
      {
        coordinates: [plan.steps[0].kind === "walk" ? plan.steps[0].from : stations[0].position, stations[0].position],
        length: 320,
        profile: "foot",
      },
      params,
    );
    for (const request of requests.slice(1)) {
      state = applyPath(state, request, null, params);
    }

    expect(state.traced.geometry[0].status).toBe("traced");
    expect(state.traced.geometry.filter((g) => g.status === "approximate")).toHaveLength(
      3,
    );
    expect(state.traced.settled).toBe(true);
  });
});
