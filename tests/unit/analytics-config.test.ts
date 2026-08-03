import { describe, expect, it } from "vitest";
import {
  isCollectableHostname,
  parseAnalyticsConfig,
  trackerScriptUrl,
} from "@/lib/analytics";
import { DEFAULT_RUNTIME_CONFIG, parseRuntimeConfig } from "@/lib/runtime-config";

/**
 * When measurement is on, and — far more importantly — when it is off.
 *
 * Off is the default and the only state this project's own build ships in. The
 * cases that matter most here are therefore the empty ones: they are what a fork
 * gets, and a fork that inherited a website id would be reporting its readers to
 * somebody else's dashboard without anybody choosing that.
 */

describe("the analytics block", () => {
  const complete = {
    websiteId: "e676c9b4-11e4-4ef1-a4d7-87001773e9f2",
    hostUrl: "https://umami.example.org",
  };

  it("is read when both fields are filled", () => {
    expect(parseAnalyticsConfig(complete)).toEqual(complete);
  });

  it("trims what an operator pasted", () => {
    expect(
      parseAnalyticsConfig({
        websiteId: `  ${complete.websiteId} `,
        hostUrl: ` ${complete.hostUrl}  `,
      }),
    ).toEqual(complete);
  });

  it("is off when the block is missing", () => {
    expect(parseAnalyticsConfig(undefined)).toBeNull();
  });

  it("is off when the fields are blank, which is what config.example.json ships", () => {
    expect(parseAnalyticsConfig({ websiteId: "", hostUrl: "" })).toBeNull();
  });

  it("is off when only half of it is filled", () => {
    // An id with nowhere to report and a host with nothing to report about are
    // both configuration in progress, never a decision to start measuring.
    expect(parseAnalyticsConfig({ websiteId: complete.websiteId })).toBeNull();
    expect(parseAnalyticsConfig({ hostUrl: complete.hostUrl })).toBeNull();
  });

  it("is off when the host is not an absolute http(s) URL", () => {
    // The value becomes a script element's `src`. A configuration file is not a
    // code delivery mechanism.
    for (const hostUrl of [
      "javascript:alert(1)",
      "data:text/javascript,alert(1)",
      "//umami.example.org",
      "umami.example.org",
      "",
    ]) {
      expect(
        parseAnalyticsConfig({ websiteId: complete.websiteId, hostUrl }),
      ).toBeNull();
    }
  });

  it("is off when the block is not an object", () => {
    for (const payload of [null, 42, "on", ["on"], true]) {
      expect(parseAnalyticsConfig(payload)).toBeNull();
    }
  });

  it("is off in a config.json that says nothing about it", () => {
    expect(DEFAULT_RUNTIME_CONFIG.analytics).toBeNull();
    expect(parseRuntimeConfig({}).analytics).toBeNull();
    expect(
      parseRuntimeConfig({ mapStyleUrl: "https://tiles.example.org/s" })
        .analytics,
    ).toBeNull();
  });

  it("reaches the rest of the configuration when it is filled", () => {
    expect(parseRuntimeConfig({ analytics: complete }).analytics).toEqual(
      complete,
    );
  });
});

describe("the tracker's address", () => {
  it("is the script under the configured root", () => {
    expect(trackerScriptUrl("https://umami.example.org")).toBe(
      "https://umami.example.org/script.js",
    );
  });

  it("does not double the slash when the root carries one", () => {
    expect(trackerScriptUrl("https://umami.example.org/")).toBe(
      "https://umami.example.org/script.js",
    );
  });
});

describe("which hosts are counted", () => {
  it("counts a public deployment", () => {
    expect(isCollectableHostname("redock.example.org")).toBe(true);
    expect(isCollectableHostname("203.0.113.10")).toBe(true);
  });

  it("does not count a development machine", () => {
    for (const host of ["localhost", "app.localhost", "127.0.0.1", "::1", "[::1]"]) {
      expect(isCollectableHostname(host)).toBe(false);
    }
  });

  it("does not count a private network", () => {
    // Somebody's home or office. The hostname alone would say more about them
    // than they offered.
    for (const host of [
      "10.0.0.5",
      "172.16.4.2",
      "172.31.255.254",
      "192.168.1.10",
      "169.254.10.1",
      "nas.local",
      "fd00::1",
      "fe80::1",
    ]) {
      expect(isCollectableHostname(host)).toBe(false);
    }
  });

  it("still counts a public address that merely looks close to a private one", () => {
    expect(isCollectableHostname("172.32.0.1")).toBe(true);
    expect(isCollectableHostname("192.169.0.1")).toBe(true);
  });

  it("does not count a document with no host at all", () => {
    expect(isCollectableHostname("")).toBe(false);
  });
});
