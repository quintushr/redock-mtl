import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import ItineraryTrail from "@/components/ItineraryTrail";
import { DEFAULT_PARAMETERS, segmentBudget } from "@/lib/params";
import { remainingAfter, remainingStatus } from "@/lib/remaining";
import type { Itinerary, Station } from "@/lib/types";

/**
 * Station names in the trail: whole, and reachable.
 *
 * Two changes, one row. The name used to be truncated to a single line, which
 * on a 380px panel — 360px at the narrowest the quality floor covers — turned
 * the longest names in the network into a prefix and an ellipsis. A prefix is not
 * a station anyone can find, and the fix is not a tooltip: it is not truncating
 * it. The name is also a control now, because the trail is the only path a
 * keyboard has to the stations drawn on the map.
 *
 * jsdom does not lay out, so nothing here measures a wrap. What it checks is the
 * mechanism the wrap follows from — no `truncate`, a two-line clamp, a breakable
 * overflow — and the fallback for the residual case. The 360px reading itself is
 * by hand, against the longest name below.
 */

afterEach(cleanup);

const params = DEFAULT_PARAMETERS;
const budget = segmentBudget(params);

/**
 * The two longest names in the network, not invented ones.
 *
 * Read on 2026-07-29 from the operator's `station_information` feed, reached
 * through GBFS_DISCOVERY_URL in lib/endpoints.ts: 1102 stations, of which these
 * are the longest at 73 and 69 characters.
 * tests/fixtures/montreal-station-information.json is a 100-station trim whose
 * longest is 53, so it cannot answer "the longest name in the network" and is
 * not used here.
 *
 * The arithmetic, which is why both the clamp and the title exist. At 14px the
 * name column is about 240px at the 360px width the quality floor covers, or
 * roughly 30 characters a line: 73 characters is three lines there, so the clamp
 * cuts and the title is the only thing carrying the rest. On the 380px desktop
 * panel the same name is two lines and nothing is lost. One truncated line lost
 * everything past character 30 at either width, which is what this replaces.
 */
const LONG_NAME =
  "Mairie d'arrondissement de Pierrefonds-Roxboro (St-Léon / de Pierrefonds)";
const LONGER_NAME =
  "Parc du Château-Pierrefonds (de Pierrefonds / du Château-Pierrefonds)";

const stations: Station[] = [
  {
    id: "a",
    name: LONG_NAME,
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
    name: LONGER_NAME,
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
  snapshotObservedAt: new Date("2026-07-29T05:00:00Z"),
};

const trail = (
  overrides: Partial<React.ComponentProps<typeof ItineraryTrail>> = {},
) =>
  render(
    <ItineraryTrail
      itinerary={plan}
      stations={stations}
      params={params}
      {...overrides}
    />,
  );

/** The element carrying a station's name, whichever tag it turned out to be. */
function nameElement(name: string): HTMLElement {
  return screen.getByText(name);
}

describe("a long station name is not truncated (FR-118)", () => {
  it("writes the name out in full", () => {
    trail();
    // Not a prefix, not an ellipsis. The whole string is in the document, which
    // is what a rider needs to match against a sign on a street.
    expect(nameElement(LONG_NAME).textContent).toBe(LONG_NAME);
    expect(nameElement(LONGER_NAME).textContent).toBe(LONGER_NAME);
  });

  it("has dropped single-line truncation entirely", () => {
    const { container } = trail();
    // `truncate` is `overflow: hidden; text-overflow: ellipsis; white-space:
    // nowrap`, and the `nowrap` is the part that made two lines impossible. Its
    // presence anywhere on a name is the defect coming back.
    for (const element of [nameElement(LONG_NAME), nameElement(LONGER_NAME)]) {
      expect(element.className).not.toMatch(/\btruncate\b/);
      expect(element.className).not.toMatch(/whitespace-nowrap/);
    }
    expect(container.innerHTML).not.toMatch(/\btruncate\b/);
  });

  it("allows two lines and then stops", () => {
    trail();
    // A clamp rather than no limit at all: an unbounded name would push the
    // gauge — the one element this product exists for — down the panel.
    expect(nameElement(LONG_NAME).className).toContain("line-clamp-2");
  });

  it("can break a name that has no space to break at", () => {
    trail();
    // Several stations are one unbroken hyphenated token longer than the column,
    // and a word that cannot break does not wrap, it overflows the panel.
    expect(nameElement(LONG_NAME).className).toContain("overflow-wrap:anywhere");
  });

  it("carries the full name in a title as well, never instead", () => {
    trail();
    // For the residual case the clamp cuts. In addition to the two lines, which
    // is the order that matters: a title on a truncated line is the fix this
    // change rejected, because a hover is not available to most readers.
    expect(nameElement(LONG_NAME).getAttribute("title")).toBe(LONG_NAME);
    expect(nameElement(LONGER_NAME).getAttribute("title")).toBe(LONGER_NAME);
  });
});

describe("the duration stays put when a name wraps", () => {
  it("aligns the row to the top rather than to its centre", () => {
    trail();
    const row = nameElement(LONG_NAME).parentElement;
    // Centred, a two-line name would push the duration down half a line. Top
    // alignment is what keeps the figures in a column down the trail.
    expect(row?.className).toContain("items-start");
    expect(row?.className).not.toContain("items-center");
  });

  it("gives the duration the name's line box, so their first lines agree", () => {
    trail();
    const row = nameElement(LONG_NAME).parentElement as HTMLElement;
    const duration = Array.from(row.querySelectorAll("p")).find((p) =>
      /min/.test(p.textContent ?? ""),
    );
    // 12px monospace in a 20px line box, the same box the 14px name gets. Left
    // at its own 16px it would sit 2px higher on the rows that wrap and 2px
    // higher on the ones that do not, which is a column that dances.
    expect(duration?.className).toContain("leading-5");
    expect(nameElement(LONG_NAME).className).toContain("leading-5");
  });

  it("keeps the duration from being squeezed by a long name", () => {
    trail();
    const row = nameElement(LONG_NAME).parentElement as HTMLElement;
    const duration = Array.from(row.querySelectorAll("p")).find((p) =>
      /min/.test(p.textContent ?? ""),
    );
    expect(duration?.className).toContain("shrink-0");
  });
});

describe("a row that names a station is reachable (FR-118a)", () => {
  it("is a button, so a keyboard can get to it", () => {
    trail();
    expect(nameElement(LONG_NAME).tagName).toBe("BUTTON");
  });

  it("says what activating it does, and still contains the visible name", () => {
    trail();
    // WCAG 2.5.3: the accessible name has to contain the visible label, or voice
    // control cannot address the control by what it says.
    const label = nameElement(LONG_NAME).getAttribute("aria-label") ?? "";
    expect(label).toContain(LONG_NAME);
    expect(label).toMatch(/^Centrer la carte sur/);
  });

  it("highlights the station on hover and lets go on leaving", () => {
    const onHighlight = vi.fn();
    trail({ onHighlight });
    fireEvent.mouseEnter(nameElement(LONG_NAME));
    expect(onHighlight).toHaveBeenLastCalledWith("a");
    fireEvent.mouseLeave(nameElement(LONG_NAME));
    expect(onHighlight).toHaveBeenLastCalledWith(null);
  });

  it("highlights it on focus too, so nothing lives at hover only", () => {
    const onHighlight = vi.fn();
    trail({ onHighlight });
    fireEvent.focus(nameElement(LONGER_NAME));
    expect(onHighlight).toHaveBeenLastCalledWith("b");
    fireEvent.blur(nameElement(LONGER_NAME));
    expect(onHighlight).toHaveBeenLastCalledWith(null);
  });

  it("asks for the station on activation, which is the touch path", () => {
    // A touch screen has no hover at all, so this is the only way a reader on
    // one can ask where a step of their trip actually is.
    const onSelect = vi.fn();
    trail({ onSelect });
    fireEvent.click(nameElement(LONGER_NAME));
    expect(onSelect).toHaveBeenCalledWith("b");
  });

  it("marks the highlighted row without spending the accent on it", () => {
    trail({ highlighted: "a" });
    const marked = nameElement(LONG_NAME).className;
    // The state layer, which is the same acknowledgement every other control
    // here uses. Not the accent: docs/ui-guidelines.md reserves it for three
    // things and this is not one of them.
    expect(marked).toContain("bg-state-hover");
    expect(marked).not.toContain("text-brand");
    expect(marked).not.toContain("bg-brand");
    // And the row that is not highlighted carries nothing.
    expect(nameElement(LONGER_NAME).className).not.toContain("bg-state-hover");
  });

  it("stays inert, rather than throwing, when no map is listening", () => {
    trail();
    fireEvent.mouseEnter(nameElement(LONG_NAME));
    fireEvent.click(nameElement(LONG_NAME));
    expect(nameElement(LONG_NAME)).toBeTruthy();
  });
});
