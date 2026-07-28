import { describe, expect, it } from "vitest";
import { LINE_STYLE } from "@/components/map-symbols";

/**
 * FR-310: an approximation is never drawn with the confidence of a verified
 * route.
 *
 * This holds by construction today. It is asserted anyway because a later style
 * tweak could equalise the two weights without anyone noticing they had just
 * made a straight line across the river look exactly like a checked path.
 */

describe("traced outweighs approximate", () => {
  for (const mode of ["bike", "walk"] as const) {
    it(`${mode}: traced is strictly heavier`, () => {
      expect(LINE_STYLE[mode].traced.width).toBeGreaterThan(
        LINE_STYLE[mode].approximate.width,
      );
    });

    it(`${mode}: traced is solid and approximate is dashed`, () => {
      // [1, 0] is a solid line in MapLibre's dash array. Anything with a gap is
      // a dash, and the gap is what carries "nobody checked this" at a glance.
      expect(LINE_STYLE[mode].traced.dash[1]).toBe(0);
      expect(LINE_STYLE[mode].approximate.dash[1]).toBeGreaterThan(0);
    });
  }

  it("distinguishes riding from walking within each status", () => {
    // The two modes are told apart by weight and dash, not by a second colour.
    expect(LINE_STYLE.bike.traced.width).toBeGreaterThan(
      LINE_STYLE.walk.traced.width,
    );
    expect(LINE_STYLE.bike.approximate.dash).not.toEqual(
      LINE_STYLE.walk.approximate.dash,
    );
  });

  it("carries no colour at all", () => {
    // The accent is applied once, by the layer. A hue in this table would be a
    // colour code, which docs/ui-guidelines.md forbids on the map.
    const serialised = JSON.stringify(LINE_STYLE);
    expect(serialised).not.toMatch(/#[0-9a-f]{3,8}/i);
    expect(serialised).not.toMatch(/rgb|hsl|color/i);
  });
});
