import { describe, expect, it } from "vitest";
import {
  DEFAULT_PARAMETERS,
  segmentBudget,
  validateParameters,
} from "@/lib/params";
import type { PlanningParameters } from "@/lib/types";

const withParams = (patch: Partial<PlanningParameters>): PlanningParameters => ({
  ...DEFAULT_PARAMETERS,
  ...patch,
});

describe("DEFAULT_PARAMETERS", () => {
  it("is internally consistent", () => {
    expect(validateParameters(DEFAULT_PARAMETERS)).toEqual({ ok: true });
  });

  it("leaves a usable segment budget", () => {
    expect(segmentBudget(DEFAULT_PARAMETERS)).toBeGreaterThan(0);
    expect(segmentBudget(DEFAULT_PARAMETERS)).toBeLessThan(
      DEFAULT_PARAMETERS.freeWindow,
    );
  });

  it("is conservative rather than optimistic (constitution principle IV)", () => {
    // A share bike at more than 20 km/h would be an optimistic assumption, and
    // an optimistic speed is what produces segments that quietly overrun.
    expect(DEFAULT_PARAMETERS.cyclingSpeed).toBeLessThan(20 * (1000 / 3600));
    // Walking faster than 5 km/h would understate the approach walk.
    expect(DEFAULT_PARAMETERS.walkingSpeed).toBeLessThan(5 * (1000 / 3600));
    // A street route is never shorter than a straight line.
    expect(DEFAULT_PARAMETERS.detourFactor).toBeGreaterThan(1);
    // Some margin must be set aside, or the free window is spent exactly.
    expect(DEFAULT_PARAMETERS.safetyMargin).toBeGreaterThan(0);
  });
});

describe("segmentBudget", () => {
  it("is the free window less the safety margin", () => {
    const params = withParams({ freeWindow: 2700, safetyMargin: 300 });
    expect(segmentBudget(params)).toBe(2400);
  });
});

describe("validateParameters", () => {
  it("never throws, whatever it is handed", () => {
    const nonsense = withParams({
      freeWindow: Number.NaN,
      cyclingSpeed: -1,
      detourFactor: 0,
      segmentOverhead: -3.5,
    });
    expect(() => validateParameters(nonsense)).not.toThrow();
  });

  it("rejects a safety margin equal to the free window and returns a usable correction", () => {
    const params = withParams({ freeWindow: 2700, safetyMargin: 2700 });
    const result = validateParameters(params);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toMatch(/safety margin/i);
    // The correction must actually be usable, not merely different (FR-024).
    expect(segmentBudget(result.corrected)).toBeGreaterThan(0);
    expect(validateParameters(result.corrected)).toEqual({ ok: true });
  });

  it("rejects a safety margin larger than the free window", () => {
    const result = validateParameters(
      withParams({ freeWindow: 600, safetyMargin: 1200 }),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(segmentBudget(result.corrected)).toBeGreaterThan(0);
  });

  it("rejects a detour factor below 1, because streets are not shortcuts", () => {
    const result = validateParameters(withParams({ detourFactor: 0.8 }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.corrected.detourFactor).toBeGreaterThanOrEqual(1);
  });

  it.each([
    ["cycling speed", { cyclingSpeed: 0 }],
    ["walking speed", { walkingSpeed: 0 }],
    ["free window", { freeWindow: 0 }],
  ])("rejects a zero %s", (_label, patch) => {
    const result = validateParameters(withParams(patch));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(validateParameters(result.corrected)).toEqual({ ok: true });
  });

  /*
   * "Rejects negative and fractional reserves" stood here. `bikeReserve` and
   * `dockReserve` no longer exist: the planner reads no station count, so a
   * reserve on one could only be a control that changed nothing. The validation
   * that remains covers every parameter that is still on screen.
   */

  it("returns a correction rather than mutating the input", () => {
    const params = withParams({ freeWindow: 2700, safetyMargin: 2700 });
    const before = { ...params };
    validateParameters(params);
    expect(params).toEqual(before);
  });
});
