import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PATH_CACHE_MAX_ENTRIES } from "@/lib/endpoints";
import {
  purgeStoredPaths,
  readStoredPath,
  storedPathCount,
  writeStoredPath,
} from "@/lib/path-store";
import type { TracedPath } from "@/lib/types";

/**
 * The persistent path store.
 *
 * Every one of these cases is a way a real browser fails: a private window that
 * throws on access, a full quota, a stale schema, a corrupted value. None of
 * them may reach the rider as an error. The store's contract is that it either
 * hands back a path or hands back nothing, and never throws either way.
 */

const path = (length: number): TracedPath => ({
  coordinates: [
    { lat: 45.5017, lon: -73.5673 },
    { lat: 45.5088, lon: -73.554 },
  ],
  length,
  profile: "bike",
});

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

describe("round trip", () => {
  it("stores and reads a path", () => {
    writeStoredPath("s:1>2:bike", path(1909));
    const read = readStoredPath("s:1>2:bike");
    expect(read).not.toBeNull();
    expect(read?.length).toBe(1909);
    expect(read?.profile).toBe("bike");
    expect(read?.coordinates).toHaveLength(2);
  });

  it("returns null for a key never written", () => {
    expect(readStoredPath("s:9>9:bike")).toBeNull();
  });

  it("preserves coordinates to about a metre", () => {
    writeStoredPath("s:1>2:bike", path(1909));
    const read = readStoredPath("s:1>2:bike");
    expect(read?.coordinates[0].lat).toBeCloseTo(45.5017, 4);
    expect(read?.coordinates[0].lon).toBeCloseTo(-73.5673, 4);
  });

  it("counts what it holds", () => {
    expect(storedPathCount()).toBe(0);
    writeStoredPath("s:1>2:bike", path(100));
    writeStoredPath("s:2>3:bike", path(200));
    expect(storedPathCount()).toBe(2);
  });

  it("purges everything it owns", () => {
    localStorage.setItem("unrelated-key", "someone else's data");
    writeStoredPath("s:1>2:bike", path(100));
    purgeStoredPaths();
    expect(storedPathCount()).toBe(0);
    // Purging our cache must not clear the rider's other browser state.
    expect(localStorage.getItem("unrelated-key")).toBe("someone else's data");
  });
});

describe("eviction", () => {
  it("stays at or below the cap", () => {
    for (let i = 0; i < PATH_CACHE_MAX_ENTRIES + 25; i += 1) {
      writeStoredPath(`s:${i}>${i + 1}:bike`, path(100 + i));
    }
    expect(storedPathCount()).toBeLessThanOrEqual(PATH_CACHE_MAX_ENTRIES);
  });

  it("evicts least recently used, not least recently written", () => {
    for (let i = 0; i < PATH_CACHE_MAX_ENTRIES; i += 1) {
      writeStoredPath(`s:${i}>${i + 1}:bike`, path(100 + i));
    }
    // Touch the oldest entry so it is no longer the least recently used.
    vi.setSystemTime(new Date(Date.now() + 60_000));
    expect(readStoredPath("s:0>1:bike")).not.toBeNull();

    // Overflow the cap. The entry we just read must survive.
    for (let i = 0; i < 10; i += 1) {
      writeStoredPath(`s:new${i}>x:bike`, path(999));
    }
    expect(readStoredPath("s:0>1:bike")).not.toBeNull();

    vi.useRealTimers();
  });
});

describe("failure is never an exception", () => {
  it("survives a quota error on write", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      const error = new Error("quota");
      error.name = "QuotaExceededError";
      throw error;
    });
    expect(() => writeStoredPath("s:1>2:bike", path(100))).not.toThrow();
  });

  it("survives a SecurityError on read, as in a locked-down private window", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("denied", "SecurityError");
    });
    expect(() => readStoredPath("s:1>2:bike")).not.toThrow();
    expect(readStoredPath("s:1>2:bike")).toBeNull();
  });

  it("survives localStorage being absent entirely", () => {
    const original = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      get() {
        throw new Error("no storage in this context");
      },
    });

    expect(readStoredPath("s:1>2:bike")).toBeNull();
    expect(() => writeStoredPath("s:1>2:bike", path(100))).not.toThrow();
    expect(storedPathCount()).toBe(0);
    expect(() => purgeStoredPaths()).not.toThrow();

    if (original !== undefined) {
      Object.defineProperty(globalThis, "localStorage", original);
    }
  });

  it("discards a malformed blob under a valid key", () => {
    writeStoredPath("s:1>2:bike", path(100));
    // Reach past the store to corrupt exactly one entry, the way a half-written
    // value or a foreign extension would.
    const key = Object.keys(localStorage).find((k) => k.includes("s:1>2:bike"));
    expect(key).toBeDefined();
    localStorage.setItem(key!, "{ not json");
    expect(readStoredPath("s:1>2:bike")).toBeNull();
  });

  it("discards an entry written under a different schema version", () => {
    writeStoredPath("s:1>2:bike", path(100));
    const key = Object.keys(localStorage).find((k) => k.includes("s:1>2:bike"));
    const stored = JSON.parse(localStorage.getItem(key!)!) as { v: number };
    localStorage.setItem(key!, JSON.stringify({ ...stored, v: stored.v + 99 }));
    expect(readStoredPath("s:1>2:bike")).toBeNull();
  });

  it("discards an entry whose coordinates are the wrong shape", () => {
    writeStoredPath("s:1>2:bike", path(100));
    const key = Object.keys(localStorage).find((k) => k.includes("s:1>2:bike"));
    localStorage.setItem(key!, JSON.stringify({ v: 1, c: [1, 2, 3], m: 100, t: 0 }));
    expect(readStoredPath("s:1>2:bike")).toBeNull();
  });
});
