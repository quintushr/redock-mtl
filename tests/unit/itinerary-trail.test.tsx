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
    // A row no longer opens with the verb; the rail's icon is the verb. What is
    // left is where the row takes you, and the two rides say Bravo then
    // Charlie.
    expect(text[2]).toMatch(/Station Bravo/);
    expect(text[4]).toMatch(/Station Charlie/);
  });

  /**
   * "Une ligne du fil comporte au maximum: une icône, un nom, une durée."
   *
   * The rows used to open with a sentence and close with a second line of
   * qualifiers. Nothing in the list is a sentence now: the longest thing on a
   * row is a station name.
   */
  it("writes no sentence in any row", () => {
    render(<ItineraryTrail itinerary={oneStop} stations={stations} params={params} />);
    for (const item of screen.getAllByRole("listitem")) {
      // The gauge's spoken name is an aria-label, not row text.
      expect(item.textContent ?? "").not.toMatch(/\b(jusqu'à|Ancre|entame|remet)\b/);
    }
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
    expect(screen.queryByText("Station Bravo")).toBeNull();
  });
});

/**
 * What used to be said, and is not any more (FR-114).
 *
 * "La marche n'entame pas la fenêtre gratuite" and "ancrer remet la fenêtre
 * gratuite à zéro" were printed on every row they applied to, then moved into a
 * legend under the list, then removed with the legend on request.
 *
 * These tests pin the *absence*, deliberately. Both facts are the mechanism the
 * product rests on, so if either ever comes back it should come back on purpose
 * and in one place, not by someone re-adding a qualifier to a row and starting
 * the whole cycle again.
 */
describe("the free-window rules are stated nowhere (FR-114)", () => {
  it("keeps them out of the rows", () => {
    render(<ItineraryTrail itinerary={oneStop} stations={stations} params={params} />);
    expect(screen.getByRole("list").textContent).not.toMatch(
      /fenêtre gratuite/i,
    );
  });

  /**
   * There are buttons in the trail now — every row carrying a station is one,
   * because that is the keyboard's only path to the map's stations. So this
   * checks what it always meant to check rather than counting buttons: nothing
   * in the trail discloses anything. A legend, a fold, an "explain this" is a
   * control with an expanded state, and there is none.
   */
  it("offers no legend to open", () => {
    render(<ItineraryTrail itinerary={oneStop} stations={stations} params={params} />);
    for (const control of screen.queryAllByRole("button")) {
      expect(control.getAttribute("aria-expanded")).toBeNull();
      expect(control.getAttribute("aria-controls")).toBeNull();
    }
  });

  /**
   * The rows that are buttons, and the rows that are not.
   *
   * The start and the destination are places the reader named; the last walk's
   * target is the destination, which the next row already names. None of the
   * three is a station on the map, so none of them can centre the map on one.
   */
  it("makes a control of every row that names a station, and of no other", () => {
    render(<ItineraryTrail itinerary={oneStop} stations={stations} params={params} />);
    // Walk to Alpha, ride to Bravo, anchor at Bravo, ride to Charlie.
    expect(screen.queryAllByRole("button")).toHaveLength(4);
    expect(
      screen.queryAllByRole("button").map((control) => control.textContent),
    ).toEqual([
      "Station Alpha",
      "Station Bravo",
      "Station Bravo",
      "Station Charlie",
    ]);
  });

  it("states them nowhere else in the trail either", () => {
    const { container } = render(
      <ItineraryTrail itinerary={oneStop} stations={stations} params={params} />,
    );
    expect(container.textContent).not.toMatch(/n'entame pas la fenêtre/i);
    expect(container.textContent).not.toMatch(/remet la fenêtre gratuite/i);
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
    const { container } = render(<TripSummary itinerary={oneStop} noStop={null} settled params={params} />);
    expect(container.textContent).not.toMatch(/\b\d{1,2}:\d{2}\b/);
  });

  /**
   * The total is still rounded and still cannot be a clock time, but it no
   * longer says either thing out loud: "environ" and the standing "Durées
   * estimées" line were both removed on request. This is what is left of
   * FR-113 and principle IV in the summary — coarseness, and nothing else.
   */
  it("rounds the total rather than announcing a precise one", () => {
    const { container } = render(
      <TripSummary itinerary={oneStop} noStop={null} settled params={params} />,
    );
    const text = container.textContent ?? "";
    expect(text).not.toMatch(/environ/i);
    expect(text).not.toMatch(/durées estimées/i);
    // The one-stop fixture totals a shade over 51 minutes; it is reported at a
    // five-minute step, never at the minute.
    // No trailing \b: textContent runs the total straight into the stop count.
    expect(text).toMatch(/\b(50|55) min/);
  });
});

describe("TripSummary answers the whole question (FR-105)", () => {
  it("states the stop count", () => {
    render(<TripSummary itinerary={oneStop} noStop={null} settled params={params} />);
    expect(screen.getByText(/1 arrêt/i)).toBeTruthy();
  });

  it("no longer claims a planned trip is free on principle", () => {
    // It used to, reasoning from how the plan was built. Measured geometry can
    // push a segment past the free window, so the amount is computed now and
    // the unconditional claim is gone (FR-404).
    render(<TripSummary itinerary={oneStop} noStop={null} settled params={params} />);
    expect(screen.queryByText(/ce trajet est gratuit/i)).toBeNull();
  });

  it("says no stops are needed rather than reporting a zero", () => {
    render(<TripSummary itinerary={noStop} noStop={null} settled params={params} />);
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

  /**
   * The bands, now that the figure is measured against the whole free window
   * rather than against the usable budget.
   *
   * The 90%-of-budget ride is 36 minutes and leaves 9 on a 45 minute window, so
   * it is neutral, not alarming. That is the point of the change: the planner
   * will not build a segment that leaves a rider genuinely short, so a segment
   * it built should not be dressed as an emergency. See the note in
   * lib/remaining.ts.
   */
  it("gives the tight ride and the comfortable one different accessible names", () => {
    render(
      <ItineraryTrail itinerary={oneStop} stations={stations} params={params} />,
    );
    const [tight, comfortable] = screen
      .getAllByRole("img")
      .map((g) => g.getAttribute("aria-label"));
    expect(tight).not.toBe(comfortable);
    expect(tight).toMatch(/correct/i);
    expect(comfortable).toMatch(/confortable/i);
  });

  it("reserves the alarming band for a segment that actually overruns", () => {
    // Only reachable when measured geometry pushed a ride past its budget and
    // correction gave up. Under the old denominator every ride near its budget
    // looked like this, which is what made the band mean nothing.
    const overrun: Itinerary = {
      ...oneStop,
      steps: [ride("a", "b", params.freeWindow - 60)],
      stopCount: 0,
    };
    render(
      <ItineraryTrail itinerary={overrun} stations={stations} params={params} />,
    );
    expect(screen.getByRole("img").getAttribute("aria-label")).toMatch(
      /risqué/i,
    );
  });

  /**
   * FR-112 asks that the band never rest on colour alone. It used to be met by
   * printing the adjective at the end of every gauge line, which is exactly
   * what "Densité verbale" rules out: a state told in a word rather than shown.
   *
   * Three carriers now, none of them colour on its own: the figure in minutes,
   * the bar's fill, and a mark on the alarming band. The adjective survives in
   * the gauge's accessible name, for the reader who sees none of the three.
   */
  it("carries the state without colour and without an adjective (FR-112)", () => {
    const { container } = render(
      <ItineraryTrail itinerary={oneStop} stations={stations} params={params} />,
    );

    // Not drawn anywhere in the trail.
    expect(container.textContent).not.toMatch(/risqué|confortable|correct/i);

    // Still announced, and still telling the two rides apart.
    const spoken = screen
      .getAllByRole("img")
      .map((gauge) => gauge.getAttribute("aria-label") ?? "");
    expect(spoken.some((label) => /correct/i.test(label))).toBe(true);
    expect(spoken.some((label) => /confortable/i.test(label))).toBe(true);

    // And the alarming band carries a mark of its own, so the band is not the
    // colour alone for a reader who can see the bar but not the hue.
    expect(container.querySelectorAll("svg").length).toBeGreaterThan(0);
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
      /^0 min/i,
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
        <TripSummary itinerary={oneStop} noStop={null} settled params={params} />
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
