import { describe, expect, it } from "vitest";
import { convexHull, isInsideBufferedHull } from "@/lib/geo";
import type { LatLon, ServiceArea } from "@/lib/types";

const square: LatLon[] = [
  { lat: 45.4, lon: -73.7 },
  { lat: 45.4, lon: -73.5 },
  { lat: 45.6, lon: -73.5 },
  { lat: 45.6, lon: -73.7 },
];

describe("convexHull degenerate inputs", () => {
  it("returns an empty hull for no points", () => {
    // An out-of-season network has no active stations. Nothing is covered.
    expect(convexHull([])).toEqual([]);
  });

  it("returns the single point for one input", () => {
    const one = [{ lat: 45.5, lon: -73.6 }];
    expect(convexHull(one)).toEqual(one);
  });

  it("returns both points for two inputs", () => {
    const two = [
      { lat: 45.5, lon: -73.6 },
      { lat: 45.55, lon: -73.55 },
    ];
    expect(convexHull(two)).toHaveLength(2);
  });

  it("does not throw on collinear points and encloses no area", () => {
    const collinear = [
      { lat: 45.5, lon: -73.7 },
      { lat: 45.5, lon: -73.6 },
      { lat: 45.5, lon: -73.5 },
    ];
    expect(() => convexHull(collinear)).not.toThrow();
    expect(convexHull(collinear).length).toBeGreaterThanOrEqual(2);
  });

  it("deduplicates identical points", () => {
    const dupes = [
      { lat: 45.5, lon: -73.6 },
      { lat: 45.5, lon: -73.6 },
      { lat: 45.5, lon: -73.6 },
    ];
    expect(convexHull(dupes)).toHaveLength(1);
  });
});

describe("convexHull", () => {
  it("keeps the four corners of a square", () => {
    expect(convexHull(square)).toHaveLength(4);
  });

  it("discards interior points", () => {
    const withInterior = [...square, { lat: 45.5, lon: -73.6 }];
    const hull = convexHull(withInterior);
    expect(hull).toHaveLength(4);
    expect(
      hull.some((p) => p.lat === 45.5 && p.lon === -73.6),
    ).toBe(false);
  });

  it("is unaffected by input order", () => {
    const forward = convexHull(square);
    const reversed = convexHull([...square].reverse());
    expect(new Set(forward.map((p) => `${p.lat},${p.lon}`))).toEqual(
      new Set(reversed.map((p) => `${p.lat},${p.lon}`)),
    );
  });
});

describe("isInsideBufferedHull", () => {
  const area: ServiceArea = { hulls: [convexHull(square)], bufferMetres: 800 };

  it("accepts a point well inside", () => {
    expect(isInsideBufferedHull({ lat: 45.5, lon: -73.6 }, area)).toBe(true);
  });

  it("rejects a point far outside", () => {
    // Quebec City, several hundred kilometres away.
    expect(isInsideBufferedHull({ lat: 46.81, lon: -71.21 }, area)).toBe(false);
  });

  it("accepts a point just outside the edge but within the buffer", () => {
    // Roughly 300 m north of the northern edge, inside the 800 m buffer.
    expect(isInsideBufferedHull({ lat: 45.6027, lon: -73.6 }, area)).toBe(true);
  });

  it("rejects a point beyond the buffer", () => {
    // Roughly 5 km north of the northern edge.
    expect(isInsideBufferedHull({ lat: 45.645, lon: -73.6 }, area)).toBe(false);
  });

  it("covers nothing when the hull is empty", () => {
    // This is what an out-of-season network must look like: no coverage at all,
    // rather than accidental universal coverage.
    const empty: ServiceArea = { hulls: [], bufferMetres: 800 };
    expect(isInsideBufferedHull({ lat: 45.5, lon: -73.6 }, empty)).toBe(false);
  });

  it("treats a single-station network as a buffer circle", () => {
    const single: ServiceArea = {
      hulls: [[{ lat: 45.5, lon: -73.6 }]],
      bufferMetres: 800,
    };
    expect(isInsideBufferedHull({ lat: 45.5, lon: -73.6 }, single)).toBe(true);
    expect(isInsideBufferedHull({ lat: 45.6, lon: -73.6 }, single)).toBe(false);
  });
});
