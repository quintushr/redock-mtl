import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import ItineraryTrail from "@/components/ItineraryTrail";
import { DEFAULT_PARAMETERS, segmentBudget } from "@/lib/params";
import { remainingAfter, remainingStatus } from "@/lib/remaining";
import { messages as fr } from "@/lib/i18n/messages/fr";
import type { Itinerary, Station, StepGeometry, TracedPath } from "@/lib/types";

/**
 * Per-step trace status in words (FR-307, FR-308, FR-309, FR-311).
 *
 * The map carries the distinction as a dash pattern. This is the other half:
 * the words, in the flow of the leg they belong to, so a rider using a screen
 * reader is told which parts of their journey were checked and which were
 * guessed at. Without this half, US1 ships a map where a verified path and a
 * straight line across the river look like the same claim.
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
];

const path: TracedPath = {
  coordinates: [stations[0].position, stations[1].position],
  length: 2400,
  profile: "bike",
};

/** Walk, ride, walk. */
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
    {
      kind: "bike",
      fromStationId: "a",
      toStationId: "b",
      duration: budget * 0.5,
      distance: 4200,
      remaining: remainingAfter(budget * 0.5, params),
      remainingStatus: remainingStatus(remainingAfter(budget * 0.5, params)),
    },
    {
      kind: "walk",
      from: stations[1].position,
      to: { lat: 45.521, lon: -73.579 },
      toStationId: null,
      duration: 180,
      distance: 220,
    },
  ],
  totalDuration: 240 + budget * 0.5 + 180,
  stopCount: 0,
  freeWindowConsumed: budget * 0.5,
  snapshotObservedAt: new Date("2026-07-28T05:00:00Z"),
};

const traced: StepGeometry = { status: "traced", path };
const approximate: StepGeometry = { status: "approximate", path: null };
const pending: StepGeometry = { status: "pending", path: null };

const trail = (geometry: StepGeometry[] | null, corrections = 0) =>
  render(
    <ItineraryTrail
      itinerary={plan}
      geometry={geometry}
      corrections={corrections}
      stations={stations}
      params={params}
    />,
  );

describe("every status has a word", () => {
  it("says so when a leg is traced", () => {
    trail([traced, traced, traced]);
    expect(screen.getAllByText(new RegExp(fr.trail.pathTraced)).length).toBe(3);
  });

  it("says so when a leg is an approximation", () => {
    trail([approximate, approximate, approximate]);
    expect(
      screen.getAllByText(new RegExp(fr.trail.pathApproximate)).length,
    ).toBe(3);
  });

  it("distinguishes 'not yet' from 'no'", () => {
    // The map draws pending and approximate identically, because neither is a
    // checked path. In words the difference matters: one is still coming.
    trail([pending, pending, pending]);
    expect(screen.getAllByText(new RegExp(fr.trail.pathPending)).length).toBe(3);
    expect(screen.queryByText(new RegExp(fr.trail.pathApproximate))).toBeNull();
  });

  it("treats an absent refinement as pending, never as verified", () => {
    trail(null);
    expect(screen.getAllByText(new RegExp(fr.trail.pathPending)).length).toBe(3);
    expect(screen.queryByText(new RegExp(fr.trail.pathTraced))).toBeNull();
  });
});

describe("the status is available to assistive technology (FR-309)", () => {
  it("puts the word in the text flow, not in a title or a colour", () => {
    trail([traced, approximate, pending]);
    const list = screen.getByRole("list");
    // A screen reader walking the list reaches all three words as content of
    // the legs they qualify.
    expect(list.textContent).toContain(fr.trail.pathTraced);
    expect(list.textContent).toContain(fr.trail.pathApproximate);
    expect(list.textContent).toContain(fr.trail.pathPending);
  });
});

describe("no global claim that would be false for any part (FR-311)", () => {
  it("claims the whole route is real only when every leg is", () => {
    trail([traced, traced, traced]);
    expect(screen.getByText(fr.trail.traceAllReal)).toBeTruthy();
  });

  it("says some parts are approximate when statuses are mixed", () => {
    trail([traced, approximate, traced]);
    expect(screen.getByText(fr.trail.traceMixed)).toBeTruthy();
    expect(screen.queryByText(fr.trail.traceAllReal)).toBeNull();
  });

  it("does not claim a real route when one leg is still pending", () => {
    trail([traced, traced, pending]);
    expect(screen.queryByText(fr.trail.traceAllReal)).toBeNull();
  });

  it("keeps the straight-line caveat when nothing is traced", () => {
    trail([approximate, approximate, approximate]);
    expect(screen.getByText(fr.trail.traceIsIndicative)).toBeTruthy();
  });
});

describe("a corrected plan says so (FR-316)", () => {
  it("is silent when nothing was corrected", () => {
    trail([traced, traced, traced], 0);
    expect(screen.queryByText(fr.trail.corrected)).toBeNull();
  });

  it("tells the rider when the plan was recalculated", () => {
    trail([traced, traced, traced], 1);
    const notice = screen.getByText(fr.trail.corrected);
    expect(notice).toBeTruthy();
    // Announced, but not as an interruption: the plan changed, nothing broke.
    expect(notice.getAttribute("role")).toBe("status");
  });
});
