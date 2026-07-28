import type { Station } from "@/lib/types";

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
 */
export function readTokens(): MapTokens {
  const style = getComputedStyle(document.documentElement);
  const read = (name: string, fallback: string): string => {
    const value = style.getPropertyValue(name).trim();
    return value === "" ? fallback : value;
  };
  return {
    ink: read("--ink", "#17171a"),
    brand: read("--brand", "#e0402b"),
    panel: read("--panel", "#ffffff"),
    muted: read("--muted", "#6e6e6b"),
    line: read("--line", "#e4e4e0"),
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
