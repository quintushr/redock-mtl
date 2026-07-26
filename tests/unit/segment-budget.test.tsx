import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import SegmentBudget from "@/components/SegmentBudget";
import ItineraryList from "@/components/ItineraryList";
import { budgetShare, budgetStatus } from "@/lib/budget";
import { DEFAULT_PARAMETERS, segmentBudget } from "@/lib/params";
import type { Itinerary, Station } from "@/lib/types";

/**
 * FR-018b under assistive technology (T051).
 *
 * A screen reader sees no colour and no bar. If the budget status is not in the
 * accessible name, it does not exist for that user, and the requirement that a
 * tight segment be distinguishable would be met only for sighted users with
 * unimpaired colour vision.
 */

afterEach(cleanup);

const params = DEFAULT_PARAMETERS;
const budget = segmentBudget(params);

const renderShare = (seconds: number) => {
  const share = budgetShare(seconds, params);
  const status = budgetStatus(share);
  render(
    <SegmentBudget share={share} status={status} durationLabel="about 20 min" />,
  );
  return { share, status };
};

describe("SegmentBudget exposes status as text", () => {
  it("puts the non-numeric label in the accessible name", () => {
    renderShare(budget * 0.95);
    const meter = screen.getByRole("img");
    expect(meter.getAttribute("aria-label")).toMatch(/tight/i);
  });

  it("distinguishes a comfortable segment from a tight one in text alone", () => {
    const { unmount } = render(
      <SegmentBudget
        share={budgetShare(budget * 0.2, params)}
        status={budgetStatus(budgetShare(budget * 0.2, params))}
        durationLabel="about 5 min"
      />,
    );
    const comfortable = screen.getByRole("img").getAttribute("aria-label");
    unmount();

    renderShare(budget * 0.95);
    const tight = screen.getByRole("img").getAttribute("aria-label");

    expect(comfortable).not.toBe(tight);
    expect(comfortable).toMatch(/comfortable/i);
    expect(tight).toMatch(/tight/i);
  });

  it("states the proportion, not only the duration (FR-017)", () => {
    renderShare(budget * 0.5);
    expect(screen.getByRole("img").getAttribute("aria-label")).toMatch(
      /percent/i,
    );
    expect(screen.getByText(/50%/)).toBeTruthy();
  });

  it("keeps the bar visible even at a near-zero share", () => {
    // A zero-width bar reads as a rendering bug rather than as a short segment.
    const { container } = render(
      <SegmentBudget share={0} status="comfortable" durationLabel="under a minute" />,
    );
    const fill = container.querySelector("div > div");
    expect(fill).toBeTruthy();
    expect((fill as HTMLElement).style.width).not.toBe("0%");
  });
});

describe("ItineraryList marks what does not use the free window (FR-019)", () => {
  const stations: Station[] = [
    {
      id: "a",
      name: "Station A",
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
      name: "Station B",
      position: { lat: 45.52, lon: -73.58 },
      capacity: 20,
      mechanicalBikesAvailable: 0,
      ebikesAvailable: 0,
      docksAvailable: 8,
      isInstalled: true,
      isRenting: true,
      isReturning: true,
    },
  ];

  const itinerary: Itinerary = {
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
        duration: budget * 0.9,
        distance: 4200,
        budgetShare: budgetShare(budget * 0.9, params),
        budgetStatus: budgetStatus(budgetShare(budget * 0.9, params)),
      },
      { kind: "dock", stationId: "b", cooldown: 60 },
      {
        kind: "bike",
        fromStationId: "b",
        toStationId: "a",
        duration: budget * 0.3,
        distance: 1400,
        budgetShare: budgetShare(budget * 0.3, params),
        budgetStatus: budgetStatus(budgetShare(budget * 0.3, params)),
      },
      {
        kind: "walk",
        from: stations[0].position,
        to: { lat: 45.498, lon: -73.603 },
        toStationId: null,
        duration: 180,
        distance: 220,
      },
    ],
    totalDuration: 240 + budget * 0.9 + 60 + budget * 0.3 + 180,
    stopCount: 1,
    freeWindowConsumed: budget * 1.2,
    snapshotObservedAt: new Date("2026-07-26T05:00:00Z"),
  };

  it("labels walk legs as not using the free window", () => {
    render(<ItineraryList itinerary={itinerary} stations={stations} />);
    expect(
      screen.getAllByText(/does not use the free window/i).length,
    ).toBeGreaterThanOrEqual(2);
  });

  it("says the cooldown resets the window rather than spending it", () => {
    render(<ItineraryList itinerary={itinerary} stations={stations} />);
    expect(screen.getByText(/resets the free window/i)).toBeTruthy();
  });

  it("shows the stop count and a total worded as an estimate", () => {
    render(<ItineraryList itinerary={itinerary} stations={stations} />);
    expect(screen.getByText(/1 stop/i)).toBeTruthy();
    expect(screen.getByText(/in total/i).textContent).toMatch(/about/i);
  });

  it("never displays an arrival time (FR-020)", () => {
    const { container } = render(
      <ItineraryList itinerary={itinerary} stations={stations} />,
    );
    // No clock time anywhere: an "arrive at 14:32" reads as a promise.
    expect(container.textContent).not.toMatch(/\b\d{1,2}:\d{2}\b/);
    expect(container.textContent).toMatch(/estimates, not arrival times/i);
  });

  it("renders both budget bars, one per ride", () => {
    render(<ItineraryList itinerary={itinerary} stations={stations} />);
    const bars = screen.getAllByRole("img");
    expect(bars).toHaveLength(2);
    // The tight ride and the comfortable one must read differently.
    const labels = bars.map((bar) => bar.getAttribute("aria-label"));
    expect(labels[0]).not.toBe(labels[1]);
  });

  it("names the stations rather than showing raw ids", () => {
    render(<ItineraryList itinerary={itinerary} stations={stations} />);
    const list = screen.getByRole("list");
    expect(within(list).getAllByText(/Station [AB]/).length).toBeGreaterThan(0);
  });
});
