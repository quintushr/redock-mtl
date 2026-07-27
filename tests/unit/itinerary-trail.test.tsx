import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import ItineraryTrail from "@/components/ItineraryTrail";
import TripSummary from "@/components/TripSummary";
import { remainingAfter, remainingStatus } from "@/lib/remaining";
import { DEFAULT_PARAMETERS, segmentBudget } from "@/lib/params";
import type { Itinerary, Station } from "@/lib/types";

/**
 * The result region: one continuous list, anchor stops at full rank, and no
 * arrival time anywhere.
 *
 * What these tests can and cannot prove is worth stating. jsdom does not lay
 * out: it has no viewport height, no scrollbars and no computed geometry. So
 * SC-001 (a two-stop trip readable at 700px without scrolling) and SC-006
 * (two gauges rankable without reading the figures) are NOT covered here and
 * are verified by hand against quickstart.md. What is covered is content,
 * ordering, wording and accessible naming.
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
    mechanicalBikesAvailable: 0,
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
const oneStop: Itinerary = {
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
  snapshotObservedAt: new Date("2026-07-26T05:00:00Z"),
};

const noStop: Itinerary = {
  steps: [
    {
      kind: "walk",
      from: { lat: 45.499, lon: -73.601 },
      to: stations[0].position,
      toStationId: "a",
      duration: 240,
      distance: 300,
    },
    ride("a", "c", budget * 0.5),
    {
      kind: "walk",
      from: stations[2].position,
      to: { lat: 45.541, lon: -73.552 },
      toStationId: null,
      duration: 180,
      distance: 220,
    },
  ],
  totalDuration: 240 + budget * 0.5 + 180,
  stopCount: 0,
  freeWindowConsumed: budget * 0.5,
  snapshotObservedAt: new Date("2026-07-26T05:00:00Z"),
};

describe("ItineraryTrail is one continuous list (FR-116, FR-117)", () => {
  it("renders exactly one list for the whole journey", () => {
    render(<ItineraryTrail itinerary={oneStop} stations={stations} params={params} />);
    expect(screen.getAllByRole("list")).toHaveLength(1);
  });

  it("opens at the start and closes at the destination", () => {
    render(<ItineraryTrail itinerary={oneStop} stations={stations} params={params} />);
    const items = screen.getAllByRole("listitem");
    expect(items[0].textContent).toMatch(/^Départ/);
    expect(items[items.length - 1].textContent).toMatch(/^Destination/);
  });

  it("gives the anchor stop a row of its own, between its two rides", () => {
    render(<ItineraryTrail itinerary={oneStop} stations={stations} params={params} />);
    const text = screen.getAllByRole("listitem").map((li) => li.textContent);
    // start, walk, ride, anchor, ride, walk, destination
    expect(text).toHaveLength(7);
    expect(text[3]).toMatch(/Station Bravo/);
    expect(text[2]).toMatch(/Roule jusqu'à/);
    expect(text[4]).toMatch(/Roule jusqu'à/);
  });

  it("names its stations rather than showing raw ids", () => {
    render(<ItineraryTrail itinerary={oneStop} stations={stations} params={params} />);
    const list = screen.getByRole("list");
    // Bravo appears twice on purpose: once as the ride that arrives there, once
    // as the anchor stop itself. That repetition is the point of FR-117.
    expect(within(list).getAllByText(/Station Alpha/).length).toBeGreaterThan(0);
    expect(within(list).getAllByText(/Station Bravo/)).toHaveLength(2);
    expect(within(list).getAllByText(/Station Charlie/).length).toBeGreaterThan(0);
    expect(list.textContent).not.toMatch(/station [abc]\b/);
  });

  it("has no anchor row at all when the trip needs no stop", () => {
    render(<ItineraryTrail itinerary={noStop} stations={stations} params={params} />);
    // start, walk, ride, walk, destination
    expect(screen.getAllByRole("listitem")).toHaveLength(5);
    expect(screen.queryByText(/Ancre le vélo ici/i)).toBeNull();
  });
});

describe("What does not spend the free window says so (FR-114)", () => {
  it("labels every walking leg", () => {
    render(<ItineraryTrail itinerary={oneStop} stations={stations} params={params} />);
    expect(
      screen.getAllByText(/n'entame pas la fenêtre gratuite/i).length,
    ).toBeGreaterThanOrEqual(2);
  });

  it("says the docking wait resets the window rather than spending it", () => {
    render(<ItineraryTrail itinerary={oneStop} stations={stations} params={params} />);
    expect(screen.getByText(/remet la fenêtre gratuite à zéro/i)).toBeTruthy();
  });
});

describe("Estimate honesty (FR-113, FR-138, SC-010)", () => {
  it("never renders a clock time in the trail", () => {
    const { container } = render(
      <ItineraryTrail itinerary={oneStop} stations={stations} params={params} />,
    );
    expect(container.textContent).not.toMatch(/\b\d{1,2}:\d{2}\b/);
  });

  it("never renders a clock time in the summary", () => {
    const { container } = render(<TripSummary itinerary={oneStop} />);
    expect(container.textContent).not.toMatch(/\b\d{1,2}:\d{2}\b/);
  });

  it("words the total as an estimate and says so out loud", () => {
    render(<TripSummary itinerary={oneStop} />);
    expect(screen.getByText(/environ/i)).toBeTruthy();
    expect(screen.getByText(/durées estimées/i)).toBeTruthy();
  });
});

describe("TripSummary answers the whole question (FR-105)", () => {
  it("states the stop count and that the trip is free", () => {
    render(<TripSummary itinerary={oneStop} />);
    expect(screen.getByText(/1 arrêt/i)).toBeTruthy();
    expect(screen.getByText(/gratuit/i)).toBeTruthy();
  });

  it("says no stops are needed rather than reporting a zero", () => {
    render(<TripSummary itinerary={noStop} />);
    expect(screen.getByText(/aucun arrêt/i)).toBeTruthy();
    expect(screen.queryByText(/0 stops/)).toBeNull();
  });
});

describe("Remaining, never consumed (FR-108, FR-109, SC-005)", () => {
  it("puts a gauge on every ride and on nothing else", () => {
    render(
      <ItineraryTrail itinerary={oneStop} stations={stations} params={params} />,
    );
    // Two rides in this itinerary, so two gauges. The walks and the docking
    // wait must not have one.
    expect(screen.getAllByRole("img")).toHaveLength(2);
  });

  it("reports what is left on arrival, on every ride", () => {
    render(
      <ItineraryTrail itinerary={oneStop} stations={stations} params={params} />,
    );
    expect(screen.getAllByText(/d'avance à l'arrivée/i)).toHaveLength(2);
  });

  it("never reports time consumed or a consumed percentage", () => {
    const { container } = render(
      <ItineraryTrail itinerary={oneStop} stations={stations} params={params} />,
    );
    const text = container.textContent ?? "";
    expect(text).not.toMatch(/consommé|écoulé/i);
    expect(text).not.toMatch(/%/);
    expect(text).not.toMatch(/\bof the free window\b/);
    // Nor in what a screen reader hears.
    for (const gauge of screen.getAllByRole("img")) {
      const spoken = gauge.getAttribute("aria-label") ?? "";
      expect(spoken).toMatch(/d'avance à l'arrivée/i);
      expect(spoken).not.toMatch(/pour cent|consommé|écoulé/i);
    }
  });

  it("gives the tight ride and the comfortable one different accessible names", () => {
    render(
      <ItineraryTrail itinerary={oneStop} stations={stations} params={params} />,
    );
    const [tight, comfortable] = screen
      .getAllByRole("img")
      .map((g) => g.getAttribute("aria-label"));
    expect(tight).not.toBe(comfortable);
    // The 90%-of-budget ride leaves almost nothing; the 30% one leaves plenty.
    expect(tight).toMatch(/juste/i);
    expect(comfortable).toMatch(/confortable/i);
  });

  it("carries the state in words, not only in colour (FR-112)", () => {
    render(
      <ItineraryTrail itinerary={oneStop} stations={stations} params={params} />,
    );
    expect(screen.getByText(/juste/i)).toBeTruthy();
    expect(screen.getByText(/confortable/i)).toBeTruthy();
  });

  it("keeps a visible sliver when nothing is left, so an empty gauge is not a bug", () => {
    const spent: Itinerary = {
      ...oneStop,
      steps: [ride("a", "b", budget * 2)],
      stopCount: 0,
    };
    const { container } = render(
      <ItineraryTrail itinerary={spent} stations={stations} params={params} />,
    );
    const fill = container.querySelector('[role="img"] > div') as HTMLElement;
    expect(fill).toBeTruthy();
    expect(fill.style.width).not.toBe("0%");
    expect(screen.getByRole("img").getAttribute("aria-label")).toMatch(
      /environ 0 min/i,
    );
  });
});

describe("The result region carries no planning control (SC-002)", () => {
  /**
   * A partial proof, and worth being honest about the limit. Rendering the
   * whole PlannerShell would prove DOM order outright, but it fetches the GBFS
   * feed on mount, and a test that reaches the network is forbidden by
   * principle III. What is proved here is the half that matters most: the
   * result region contains no parameter control of any kind, so no ordering
   * accident can put one above the itinerary. The order itself is checked by
   * hand in quickstart.md.
   */
  it("renders no form control in the trail or the summary", () => {
    const { container } = render(
      <>
        <TripSummary itinerary={oneStop} />
        <ItineraryTrail
          itinerary={oneStop}
          stations={stations}
          params={params}
        />
      </>,
    );
    expect(container.querySelectorAll("input, select, textarea")).toHaveLength(0);
  });
});
