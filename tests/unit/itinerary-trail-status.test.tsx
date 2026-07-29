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

/**
 * The global claim is gone (FR-311).
 *
 * A line under the list used to say which of three things the map's trace was:
 * every leg measured, some legs measured, or none. It was removed on request,
 * so FR-311's "no global claim may be false for any part" is now satisfied by
 * there being no global claim at all.
 *
 * Pinned as an absence, and worth the two tests: the per-leg mark still reports
 * status row by row, so it would be easy to conclude the map is covered. It is
 * not. Nothing describes the line drawn over the map any more.
 */
describe("nothing claims anything about the map's trace", () => {
  it("says nothing under the list, whatever was traced", () => {
    const { container } = trail([traced, traced, traced]);
    expect(container.textContent).not.toMatch(/sur la carte/i);
  });

  it("says nothing under the list when nothing was traced either", () => {
    const { container } = trail([approximate, approximate, approximate]);
    expect(container.textContent).not.toMatch(/sur la carte/i);
    expect(container.textContent).not.toMatch(/ligne droite/i);
  });
});

/**
 * The status is announced, never drawn as an adjective.
 *
 * docs/ui-guidelines.md: a segment's state is read off the gauge, its colour
 * and a mark, never off a word at the end of a line. A leg whose path was not
 * measured therefore carries the same discontinuity the map draws on it, and
 * the word rides along for screen readers.
 */
describe("the status is a mark on screen and a word in the ear", () => {
  it("draws no status adjective on any row", () => {
    const { container } = trail([traced, approximate, pending]);
    for (const row of screen.getAllByRole("listitem")) {
      const drawn = Array.from(row.querySelectorAll("p"))
        .map((p) => p.textContent)
        .join(" ");
      expect(drawn).not.toContain(fr.trail.pathApproximate);
      expect(drawn).not.toContain(fr.trail.pathPending);
      expect(drawn).not.toContain(fr.trail.pathTraced);
    }
    // The words are in the document all the same, out of sight.
    expect(container.querySelectorAll(".sr-only").length).toBe(3);
  });

  it("marks the legs that were not measured, and only those", () => {
    trail([traced, approximate, pending]);
    const marked = screen
      .getAllByRole("listitem")
      .filter((row) => row.querySelector(".sr-only")?.parentElement?.querySelector("svg"));
    expect(marked).toHaveLength(2);
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
