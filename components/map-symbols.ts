// Type-only, so nothing from the map library is loaded at run time: this module
// is read by unit tests in jsdom, where there is no WebGL.
import type {
  CircleLayerSpecification,
  SymbolLayerSpecification,
} from "maplibre-gl";
import type { Itinerary, Station } from "@/lib/types";

/**
 * The map's visual vocabulary, drawn rather than declared.
 *
 * docs/ui-guidelines.md is explicit about the station treatment, and it is the
 * one part of the interface a plain circle layer cannot express:
 *
 *   Station quelconque      petit point neutre, opacité réduite
 *   Disponibilité           anneau partiellement rempli, sans teinte
 *   Station de l'itinéraire accent, diamètre supérieur
 *   Station inutilisable    point creux, sans remplissage
 *
 * A partially filled ring is an arc whose length carries the quantity. No hue
 * is involved at any level, which is the point: the map shows several hundred
 * stations, and colouring them by availability both destroys legibility and
 * competes with the accent, which that document reserves for three uses.
 *
 * This file draws, so it lives beside the component rather than in lib/:
 * constitution principle III keeps lib/ free of the DOM.
 */

/**
 * How a route step is drawn, by whether its real path is known (FR-310).
 *
 * Traced is solid and full weight; approximate stays dashed and thin. The
 * bike segment used to be dashed unconditionally, and the comment explaining
 * why was right: a solid 4px line promises a path somebody could follow, and a
 * straight line between two stations is not one. This feature is what earns the
 * solid line, and it is drawn only for geometry the router returned and we
 * checked.
 *
 * The two differ by weight and dash pattern, never by hue. docs/ui-guidelines.md
 * allows the accent exactly three uses on the map, and a second colour here
 * would be a colour code. It also means the distinction survives a greyscale
 * render, which FR-308 requires.
 *
 * `pending` draws as `approximate`: neither is a path anybody has checked. The
 * itinerary tells them apart in words, where the difference between "not yet"
 * and "no" is what a rider actually needs.
 */
export const LINE_STYLE = {
  bike: {
    traced: { width: 4, dash: [1, 0] },
    approximate: { width: 3, dash: [3, 2] },
  },
  walk: {
    traced: { width: 2.5, dash: [1, 0] },
    approximate: { width: 2, dash: [1, 2] },
  },
} as const;

/** How many mechanical bikes fill the ring completely. */
const FULL_AT = 4;

export const RING_LEVELS = [0, 1, 2, 3, 4] as const;
export type RingLevel = (typeof RING_LEVELS)[number];

export const ringIcon = (level: RingLevel): string => `station-${level}`;

/**
 * Which ring a station gets.
 *
 * Level 0 is the hollow dot the guidelines give to an unusable station, and a
 * station is unusable to this planner when it cannot lend a mechanical bike:
 * out of service, not renting, or holding only e-bikes, to which the free
 * window does not apply.
 */
export function ringLevel(station: Station): RingLevel {
  if (!station.isInstalled || !station.isRenting) return 0;
  const bikes = Math.min(FULL_AT, Math.max(0, station.mechanicalBikesAvailable));
  return bikes as RingLevel;
}

export interface MapTokens {
  ink: string;
  brand: string;
  panel: string;
  muted: string;
  line: string;
}

/**
 * The palette, read from the document rather than repeated here.
 *
 * MapLibre paints on a canvas and cannot resolve a CSS custom property, so the
 * values have to be handed to it as literals. Reading them from :root keeps
 * app/globals.css the single source, and keeps this file from becoming a
 * second, silently diverging copy of the palette.
 *
 * The `--map-*` set, deliberately, and not the themed tokens these used to
 * read. Those now change with the dark theme; the basemap does not, because it
 * is external raster tiles drawn by someone else and they are light whatever
 * this interface is doing. A route station carries a --panel ring to lift it
 * off the streets underneath, and reading the themed token would paint that
 * ring near-black on a pale map — a dark halo, which is exactly backwards.
 *
 * The fallbacks stay the light values for the same reason, and are reached only
 * when the stylesheet has not applied.
 */
export function readTokens(): MapTokens {
  const style = getComputedStyle(document.documentElement);
  const read = (name: string, fallback: string): string => {
    const value = style.getPropertyValue(name).trim();
    return value === "" ? fallback : value;
  };
  return {
    ink: read("--map-ink", "#17171a"),
    brand: read("--map-brand", "#e0402b"),
    panel: read("--map-panel", "#ffffff"),
    muted: read("--map-muted", "#6e6e6b"),
    line: read("--map-line", "#e4e4e0"),
  };
}

// ---------------------------------------------------------------------------
// Station names
// ---------------------------------------------------------------------------

/**
 * The zoom a station's name starts being drawn at.
 *
 * Below this the map is a network diagram: several hundred points, of which
 * MapLibre could place maybe a dozen names, chosen by whichever tile was parsed
 * first. A dozen arbitrary names is worse than none — it reads as though those
 * twelve stations were somehow special. At 15 the reader has come down to the
 * streets they are planning through and the names are the answer to "which one
 * is that".
 *
 * The stations of the itinerary are exempt and carry their name at every zoom;
 * see `stationLabelLayout`.
 */
export const LABEL_MIN_ZOOM = 15;

/**
 * Which stations the itinerary actually touches.
 *
 * Every station the trail names: the one walked to, the ones ridden between,
 * the ones docked at. Deliberately wider than the `stops` source the accent is
 * painted on, which holds docking stops only — the first and last stations of a
 * trip are as much part of it as an anchor in the middle, and a reader looking
 * for "where do I pick the bike up" is looking for the first one.
 *
 * Pure, and takes an itinerary rather than a map: it decides nothing about
 * drawing, only about which features the drawing applies to.
 */
export function routeStationIds(itinerary: Itinerary | null): Set<string> {
  const ids = new Set<string>();
  if (itinerary === null) return ids;

  for (const step of itinerary.steps) {
    switch (step.kind) {
      case "walk":
        if (step.toStationId !== null) ids.add(step.toStationId);
        break;
      case "bike":
        ids.add(step.fromStationId);
        ids.add(step.toStationId);
        break;
      case "dock":
        ids.add(step.stationId);
        break;
    }
  }

  return ids;
}

/**
 * How station names are placed.
 *
 * Three things are happening here and they are all load-bearing.
 *
 * `text-field` is a zoom step over a per-feature case rather than the layer's
 * `minzoom`, because the two populations have different thresholds: a station on
 * the itinerary is named at every zoom, everything else from LABEL_MIN_ZOOM. An
 * empty string is not a label MapLibre draws small — it is no symbol at all, so
 * it takes up no collision box and cannot suppress a neighbour's name.
 *
 * `text-allow-overlap: false` is what makes this legible. Several hundred names
 * at 11px overlap constantly, and MapLibre's collision grid drops the ones that
 * do not fit. That is the whole mechanism: the reader gets as many names as the
 * viewport can carry, and gets more of them by zooming.
 *
 * `symbol-sort-key` decides who wins a collision, and the itinerary's stations
 * win. Lower sorts first and placed-first wins, so they are 0 and everything
 * else is 1. Without this an incidental station could suppress the name of a
 * stop the reader is being told to make.
 *
 * The honest limit of that last one: it gives the itinerary's stations priority
 * over every other station, not immunity. Two of them can still collide with
 * each other, which in practice takes a zoom low enough that segments minutes
 * apart are tens of pixels apart. The alternative — a second layer for them with
 * overlap allowed — trades a dropped name for two names printed over each other,
 * which is worse and reads as a fault. The reader always has the trail, where
 * every one of these names is written out whatever the map is doing.
 */
export function stationLabelLayout(): SymbolLayerSpecification["layout"] {
  return {
    "text-field": [
      "step",
      ["zoom"],
      ["case", ["get", "onRoute"], ["get", "name"], ""],
      LABEL_MIN_ZOOM,
      ["get", "name"],
    ],
    // The style's own glyph stacks, verified against
    // https://tiles.openfreemap.org/styles/positron: "Noto Sans Regular",
    // "Noto Sans Italic", "Noto Sans Bold". Naming a font the style has no
    // glyphs for draws nothing at all, silently.
    //
    // Regular for both populations, deliberately: docs/ui-guidelines.md allows
    // two weights and the itinerary's stations are already distinguished by
    // always being drawn, by their accent dot and by their text colour.
    "text-font": ["Noto Sans Regular"],
    "text-size": 11,
    // Below the dot, so the name never sits on the ring that carries
    // availability. Offsets are in ems, so 0.9 is about 10px at this size.
    "text-anchor": "top",
    "text-offset": [0, 0.9],
    // 8 ems, so a long station name breaks over two lines rather than reserving
    // a collision box wide enough to suppress everything beside it.
    "text-max-width": 8,
    "text-padding": 2,
    "text-allow-overlap": false,
    "icon-allow-overlap": false,
    "symbol-sort-key": ["case", ["get", "onRoute"], 0, 1],
  };
}

/**
 * The names' colour.
 *
 * No hue: --map-ink for a station on the itinerary, --map-muted for the rest,
 * which is the same secondary-text relationship the panel uses. The halo is the
 * panel colour and it is not decoration — 11px grey text over a basemap that
 * carries its own street names and building fills is unreadable without one.
 */
export function stationLabelPaint(
  tokens: MapTokens,
): SymbolLayerSpecification["paint"] {
  return {
    "text-color": ["case", ["get", "onRoute"], tokens.ink, tokens.muted],
    "text-halo-color": tokens.panel,
    "text-halo-width": 1.5,
    "text-halo-blur": 0.5,
  };
}

/**
 * The cross-highlight ring, drawn around whichever station the reader is
 * pointing at — in the trail or on the map.
 *
 * Diameter and nothing else. docs/ui-guidelines.md reserves the accent for the
 * trace, the stop stations and the active state of a control, so highlighting by
 * hue would either spend the accent on a fourth thing or introduce a second
 * colour to the map. A larger ring is legible at a glance, survives a greyscale
 * render, and does not compete with the accent that is already on the stops.
 *
 * Hollow: `circle-opacity: 0` keeps the availability ring underneath visible
 * through it, so highlighting a station does not hide what it holds.
 */
export function highlightRingPaint(
  tokens: MapTokens,
): CircleLayerSpecification["paint"] {
  return {
    "circle-radius": 13,
    "circle-opacity": 0,
    "circle-stroke-width": 2,
    "circle-stroke-color": tokens.ink,
    "circle-stroke-opacity": 0.6,
  };
}

/**
 * The highlighted station's name, always drawn.
 *
 * A second layer rather than a property of the one above, because this one
 * overlaps on purpose: the reader has pointed at a specific station and asked
 * what it is called, and answering "the label did not fit" is not an answer.
 * Overlapping is bounded to one symbol, which is why it is safe here and
 * nowhere else.
 *
 * MapView removes the same station from the collision-managed layer while this
 * is up, so the name is never printed twice over itself.
 */
export function highlightLabelLayout(): SymbolLayerSpecification["layout"] {
  return {
    "text-field": ["get", "name"],
    "text-font": ["Noto Sans Regular"],
    "text-size": 11,
    "text-anchor": "top",
    // Further down than the collision-managed layer's 0.9: the ring is radius 13
    // with a 2px stroke, so a name at 0.9em would sit on top of it. 1.5em is
    // about 16px at this size, which clears it.
    "text-offset": [0, 1.5],
    "text-max-width": 8,
    "text-allow-overlap": true,
    "text-ignore-placement": true,
  };
}

const SIZE = 32;
const RATIO = 2;
const CENTRE = SIZE / 2;
const RING_RADIUS = 9;
const DOT_RADIUS = 3;
const STROKE = 2.5;

/** Reduced opacity, so several hundred of these read as texture, not as data. */
const TRACK_ALPHA = 0.18;
const MARK_ALPHA = 0.55;

function withAlpha(context: CanvasRenderingContext2D, alpha: number): void {
  context.globalAlpha = alpha;
}

/**
 * One station marker, as an image MapLibre can place.
 *
 * Returns null where there is no canvas, which is every test environment: the
 * caller then simply adds no image, and the layer draws nothing rather than
 * throwing.
 */
export function ringImage(
  level: RingLevel,
  tokens: MapTokens,
): ImageData | null {
  const canvas = document.createElement("canvas");
  canvas.width = SIZE;
  canvas.height = SIZE;
  const context = canvas.getContext("2d");
  if (context === null) return null;

  context.strokeStyle = tokens.ink;
  context.fillStyle = tokens.ink;
  context.lineWidth = STROKE;
  context.lineCap = "butt";

  // The track: the ring a station always has, whatever it holds.
  withAlpha(context, TRACK_ALPHA);
  context.beginPath();
  context.arc(CENTRE, CENTRE, RING_RADIUS, 0, Math.PI * 2);
  context.stroke();

  withAlpha(context, MARK_ALPHA);

  if (level > 0) {
    // The filled part, clockwise from twelve o'clock, so a fuller ring reads
    // as more without reading the number.
    const start = -Math.PI / 2;
    context.beginPath();
    context.arc(
      CENTRE,
      CENTRE,
      RING_RADIUS,
      start,
      start + (Math.PI * 2 * level) / FULL_AT,
    );
    context.stroke();
  }

  context.beginPath();
  context.arc(CENTRE, CENTRE, DOT_RADIUS, 0, Math.PI * 2);
  if (level === 0) {
    // Hollow: nothing to lend here.
    context.lineWidth = 1.5;
    context.stroke();
  } else {
    context.fill();
  }

  return context.getImageData(0, 0, SIZE, SIZE);
}

export const RING_PIXEL_RATIO = RATIO;

/**
 * An endpoint pin.
 *
 * Not MapLibre's own `Marker` colour, which draws a teardrop pin: the
 * guidelines forbid pins outright, and they define the marker grammar by shape
 * rather than by hue. This is the same grammar the itinerary trail uses, so a
 * reader learns it once: hollow is where you start, filled is where you finish.
 */
export function endpointElement(
  target: "origin" | "destination",
  tokens: MapTokens,
): HTMLElement {
  const element = document.createElement("div");
  element.style.width = "20px";
  element.style.height = "20px";
  element.style.borderRadius = "9999px";
  element.style.boxSizing = "border-box";
  element.style.border = `2.5px solid ${tokens.ink}`;
  element.style.background =
    target === "destination" ? tokens.ink : tokens.panel;
  element.style.cursor = "grab";
  return element;
}
