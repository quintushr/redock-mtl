import { describe, expect, it } from "vitest";
import {
  LABEL_MIN_ZOOM,
  highlightLabelLayout,
  highlightRingPaint,
  routeStationIds,
  stationLabelLayout,
  stationLabelPaint,
  type MapTokens,
} from "@/components/map-symbols";
import { DEFAULT_PARAMETERS, segmentBudget } from "@/lib/params";
import { remainingAfter, remainingStatus } from "@/lib/remaining";
import type { Itinerary } from "@/lib/types";

/**
 * Station names on the map, and the ring that follows the reader's attention.
 *
 * jsdom has no WebGL, so nothing here renders a tile. What is asserted is the
 * layer specification itself, which is where every one of these decisions
 * actually lives — the same reason tests/unit/map-styling.test.ts asserts
 * LINE_STYLE rather than screenshotting a line. A layout property changed by
 * hand is exactly the kind of edit that looks harmless in a diff and silently
 * turns several hundred labels back into an illegible pile.
 */

const params = DEFAULT_PARAMETERS;
const budget = segmentBudget(params);

const tokens: MapTokens = {
  ink: "#17171a",
  brand: "#e0402b",
  panel: "#ffffff",
  muted: "#6e6e6b",
  line: "#e4e4e0",
};

const ride = (from: string, to: string) => ({
  kind: "bike" as const,
  fromStationId: from,
  toStationId: to,
  duration: budget * 0.5,
  distance: 4200,
  remaining: remainingAfter(budget * 0.5, params),
  remainingStatus: remainingStatus(remainingAfter(budget * 0.5, params)),
});

/** Walk to a, ride a→b, dock at b, ride b→c, walk to the destination. */
const oneStop: Itinerary = {
  steps: [
    {
      kind: "walk",
      from: { lat: 45.499, lon: -73.601 },
      to: { lat: 45.5, lon: -73.6 },
      toStationId: "a",
      duration: 240,
      distance: 300,
    },
    ride("a", "b"),
    { kind: "dock", stationId: "b", cooldown: 60 },
    ride("b", "c"),
    {
      kind: "walk",
      from: { lat: 45.54, lon: -73.55 },
      to: { lat: 45.541, lon: -73.552 },
      toStationId: null,
      duration: 180,
      distance: 220,
    },
  ],
  totalDuration: 240 + budget + 60 + 180,
  stopCount: 1,
  freeWindowConsumed: budget,
  snapshotObservedAt: new Date("2026-07-29T05:00:00Z"),
};

describe("which stations belong to the itinerary", () => {
  it("collects every station the trail names, not just the docking stops", () => {
    // The accent is painted on docking stops alone, which is a drawing decision.
    // This set is wider on purpose: the station you pick the bike up at is as
    // much part of the trip as the one you swap at, and a reader looking for
    // "where do I start" is looking for the first one.
    expect([...routeStationIds(oneStop)].sort()).toEqual(["a", "b", "c"]);
  });

  it("is empty when there is no itinerary, rather than throwing", () => {
    expect(routeStationIds(null).size).toBe(0);
  });

  it("holds the last walk's absent station against nothing", () => {
    // toStationId is null on the walk that ends at the destination. A null in
    // this set would become a label for a station that does not exist.
    expect(routeStationIds(oneStop).has("null")).toBe(false);
    for (const id of routeStationIds(oneStop)) expect(typeof id).toBe("string");
  });
});

describe("station names yield to each other", () => {
  const layout = stationLabelLayout() as Record<string, unknown>;

  it("lets MapLibre drop the names that do not fit", () => {
    // The whole mechanism. Set to true, several hundred names at 11px print
    // over each other and the map becomes unreadable at exactly the zoom the
    // reader came to it for.
    expect(layout["text-allow-overlap"]).toBe(false);
    expect(layout["icon-allow-overlap"]).toBe(false);
  });

  it("gives the itinerary's stations priority in a collision", () => {
    // Lower sorts first, and placed-first wins. So the itinerary's stations are
    // 0 and everything else is 1: an incidental station can never suppress the
    // name of a stop the reader is being told to make.
    expect(layout["symbol-sort-key"]).toEqual([
      "case",
      ["get", "onRoute"],
      0,
      1,
    ]);
  });

  it("names the itinerary's stations at every zoom and the rest from 15", () => {
    expect(LABEL_MIN_ZOOM).toBe(15);
    expect(layout["text-field"]).toEqual([
      "step",
      ["zoom"],
      // Below the threshold: a name for a station on the route, and an empty
      // string — which is no symbol at all, and so no collision box — for the
      // rest.
      ["case", ["get", "onRoute"], ["get", "name"], ""],
      LABEL_MIN_ZOOM,
      ["get", "name"],
    ]);
  });

  it("asks only for glyph stacks the basemap style publishes", () => {
    // The style at MAP_STYLE_URL (lib/endpoints.ts) was read on 2026-07-29 and
    // carries three stacks: "Noto Sans Regular", "Noto Sans Italic" and
    // "Noto Sans Bold". Naming anything else draws nothing at all, and draws it
    // silently — no error, no fallback, just no labels.
    expect(layout["text-font"]).toEqual(["Noto Sans Regular"]);
  });

  it("keeps to the secondary type size", () => {
    expect(layout["text-size"]).toBe(11);
  });
});

describe("names carry no hue", () => {
  const paint = stationLabelPaint(tokens) as Record<string, unknown>;

  it("uses ink and muted, and the accent nowhere", () => {
    expect(paint["text-color"]).toEqual([
      "case",
      ["get", "onRoute"],
      tokens.ink,
      tokens.muted,
    ]);
    expect(JSON.stringify(paint)).not.toContain(tokens.brand);
  });

  it("halos the text, because the basemap has its own labels underneath", () => {
    expect(paint["text-halo-color"]).toBe(tokens.panel);
    expect(paint["text-halo-width"]).toBeGreaterThan(0);
  });
});

describe("the cross-highlight is a diameter, not a colour", () => {
  const paint = highlightRingPaint(tokens) as Record<string, unknown>;

  it("draws a ring wider than any station marker", () => {
    // The accent dot on a stop station is radius 7. Anything at or under that
    // would be hidden by the mark it is supposed to be highlighting.
    expect(paint["circle-radius"]).toBeGreaterThan(7);
  });

  it("spends no accent on it", () => {
    // docs/ui-guidelines.md allows the accent three uses on the map and this is
    // not one of them. It is also why the highlight has to be a diameter: there
    // is no fourth colour to reach for.
    expect(JSON.stringify(paint)).not.toContain(tokens.brand);
    expect(paint["circle-stroke-color"]).toBe(tokens.ink);
  });

  it("stays hollow, so the availability ring shows through", () => {
    expect(paint["circle-opacity"]).toBe(0);
    expect(paint["circle-stroke-width"]).toBeGreaterThan(0);
  });
});

describe("the highlighted station's name is never dropped", () => {
  const layout = highlightLabelLayout() as Record<string, unknown>;

  it("overlaps whatever is in its way", () => {
    // The reader pointed at one specific station and asked what it is called.
    // "The label did not fit" is not an answer. Bounded to one symbol, which is
    // why allowing overlap is safe here and nowhere else.
    expect(layout["text-allow-overlap"]).toBe(true);
    expect(layout["text-ignore-placement"]).toBe(true);
  });

  it("shows the name plainly, with no zoom condition on it", () => {
    expect(layout["text-field"]).toEqual(["get", "name"]);
  });
});
