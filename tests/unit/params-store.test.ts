import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  PARAMS_STORAGE_KEY,
  clearStoredParameters,
  readStoredParameters,
  writeStoredParameters,
} from "@/lib/params-store";
import { DEFAULT_PARAMETERS } from "@/lib/params";
import type { PlanningParameters } from "@/lib/types";

/**
 * The reader's own assumptions, kept across visits.
 *
 * Without this the amounts belong to the defaults rather than to the reader:
 * they set their free window and their rate, and both revert the moment they
 * close the tab. That is the whole reason this module exists, and it is why
 * every failure mode below returns null rather than throwing. localStorage
 * throws in a private window, throws when the quota is full, and is absent
 * entirely in some embedded contexts; none of that may reach a rider who never
 * asked for persistence in the first place.
 */

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  // Restore before clearing, not after: a test that mocked the getter into
  // throwing would otherwise blow up in the cleanup itself and take every
  // later test with it.
  vi.restoreAllMocks();
  localStorage.clear();
});

const changed: PlanningParameters = {
  ...DEFAULT_PARAMETERS,
  freeWindow: 30 * 60,
  overageRate: 0.25,
  safetyMargin: 2 * 60,
};

describe("a round trip", () => {
  it("gives back exactly what was stored", () => {
    writeStoredParameters(changed);
    expect(readStoredParameters()).toEqual(changed);
  });

  it("survives values the reader is allowed to choose", () => {
    // Zero is legal for the rate: a subscription that bills nothing by the
    // minute reports a free direct ride, which is true for them.
    const free = { ...DEFAULT_PARAMETERS, overageRate: 0 };
    writeStoredParameters(free);
    expect(readStoredParameters()?.overageRate).toBe(0);
  });
});

describe("nothing to read", () => {
  it("returns null when the key was never written", () => {
    expect(readStoredParameters()).toBeNull();
  });

  it("returns null after the reader resets", () => {
    writeStoredParameters(changed);
    clearStoredParameters();
    expect(readStoredParameters()).toBeNull();
  });

  it("clears the key rather than storing the defaults", () => {
    // FR-412a. A stored copy of today's defaults would mask tomorrow's change
    // to them, for ever, on the machine of every reader who ever pressed reset.
    writeStoredParameters(changed);
    clearStoredParameters();
    expect(localStorage.getItem(PARAMS_STORAGE_KEY)).toBeNull();
  });
});

describe("something unusable to read", () => {
  it("returns null on unparseable JSON, and drops it", () => {
    localStorage.setItem(PARAMS_STORAGE_KEY, "{not json");
    expect(readStoredParameters()).toBeNull();
    expect(localStorage.getItem(PARAMS_STORAGE_KEY)).toBeNull();
  });

  it("returns null on a schema version it does not know", () => {
    localStorage.setItem(
      PARAMS_STORAGE_KEY,
      JSON.stringify({ v: 999, p: changed }),
    );
    expect(readStoredParameters()).toBeNull();
  });

  it("returns null when a field is missing", () => {
    // A partially restored set would mix the reader's choices with defaults
    // they never saw, and the amounts would rest on assumptions nobody held.
    const incomplete: Record<string, number> = { ...changed };
    delete incomplete.freeWindow;

    localStorage.setItem(
      PARAMS_STORAGE_KEY,
      JSON.stringify({ v: 1, p: incomplete }),
    );
    expect(readStoredParameters()).toBeNull();
  });

  it("returns null when a field is not a number", () => {
    localStorage.setItem(
      PARAMS_STORAGE_KEY,
      JSON.stringify({ v: 1, p: { ...changed, cyclingSpeed: "fast" } }),
    );
    expect(readStoredParameters()).toBeNull();
  });

  it("returns null when the payload is not an object at all", () => {
    localStorage.setItem(PARAMS_STORAGE_KEY, JSON.stringify([1, 2, 3]));
    expect(readStoredParameters()).toBeNull();
  });
});

describe("something readable but invalid", () => {
  it("corrects it silently rather than refusing it", () => {
    // FR-413b. The rider cannot see this value and did not just type it, so
    // describeCorrection — which exists to explain a mistake they made — would
    // be reporting a mistake to the wrong person.
    const impossible = { ...DEFAULT_PARAMETERS, safetyMargin: 60 * 60 };
    localStorage.setItem(
      PARAMS_STORAGE_KEY,
      JSON.stringify({ v: 1, p: impossible }),
    );

    const restored = readStoredParameters();
    expect(restored).not.toBeNull();
    expect(restored!.safetyMargin).toBeLessThan(restored!.freeWindow);
  });

  it("corrects a free window that is not a real duration", () => {
    localStorage.setItem(
      PARAMS_STORAGE_KEY,
      JSON.stringify({ v: 1, p: { ...DEFAULT_PARAMETERS, freeWindow: 0 } }),
    );

    const restored = readStoredParameters();
    expect(restored?.freeWindow).toBe(DEFAULT_PARAMETERS.freeWindow);
  });
});

describe("storage that will not cooperate", () => {
  it("survives localStorage being absent entirely", () => {
    // A private window, or an embedded context with no storage at all. Reading
    // the property is itself what throws, which is why the access has to be
    // inside the try rather than before it.
    //
    // Saved and restored by hand rather than through vi.spyOn: a mocked getter
    // that throws would still be in place during cleanup, and the teardown
    // would take every later test in the file down with it.
    const original = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      get() {
        throw new Error("no storage in this context");
      },
    });

    try {
      expect(readStoredParameters()).toBeNull();
      expect(() => writeStoredParameters(changed)).not.toThrow();
      expect(() => clearStoredParameters()).not.toThrow();
    } finally {
      if (original !== undefined) {
        Object.defineProperty(globalThis, "localStorage", original);
      }
    }
  });

  it("swallows a write that cannot complete", () => {
    // A full quota. The parameters still work for this session; only their
    // persistence is lost, and that is not worth an error the rider never
    // asked to see (FR-413c).
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota");
    });

    expect(() => writeStoredParameters(changed)).not.toThrow();
  });

  it("swallows a clear that cannot complete", () => {
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
      throw new Error("denied");
    });

    expect(() => clearStoredParameters()).not.toThrow();
  });
});

describe("what it does not touch", () => {
  it("leaves the path cache and the locale alone", () => {
    localStorage.setItem("redock:path:v1:A>B:bike", "{}");
    localStorage.setItem("redock.locale", "en");

    writeStoredParameters(changed);
    clearStoredParameters();

    expect(localStorage.getItem("redock:path:v1:A>B:bike")).toBe("{}");
    expect(localStorage.getItem("redock.locale")).toBe("en");
  });
});
