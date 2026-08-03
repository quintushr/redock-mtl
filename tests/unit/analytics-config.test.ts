import { describe, expect, it } from "vitest";
import {
  ANALYTICS_CONFIG,
  isCollectableHostname,
  readAnalyticsConfig,
  trackerScriptUrl,
} from "@/lib/analytics";

/**
 * When measurement is on, and — far more importantly — when it is off.
 *
 * Off is the default and the only state this repository builds in. The cases
 * that matter most here are therefore the empty ones: they are what a fork gets,
 * and a fork that inherited a website id would be reporting its readers to
 * somebody else's dashboard without anybody choosing that.
 */

const WEBSITE_ID = "e676c9b4-11e4-4ef1-a4d7-87001773e9f2";
const HOST_URL = "https://umami.example.org";

describe("the two settings", () => {
  it("are read when both are set", () => {
    expect(readAnalyticsConfig(WEBSITE_ID, HOST_URL)).toEqual({
      websiteId: WEBSITE_ID,
      hostUrl: HOST_URL,
    });
  });

  it("trim what somebody pasted into a dashboard field", () => {
    expect(readAnalyticsConfig(`  ${WEBSITE_ID} `, ` ${HOST_URL}  `)).toEqual({
      websiteId: WEBSITE_ID,
      hostUrl: HOST_URL,
    });
  });

  it("are off when unset, which is how this repository builds", () => {
    expect(readAnalyticsConfig(undefined, undefined)).toBeNull();
    expect(ANALYTICS_CONFIG).toBeNull();
  });

  it("are off when blank", () => {
    expect(readAnalyticsConfig("", "")).toBeNull();
    expect(readAnalyticsConfig("   ", "   ")).toBeNull();
  });

  it("are off when only one of the two is set", () => {
    // An id with nowhere to report and a host with nothing to report about are
    // both configuration in progress, never a decision to start measuring.
    expect(readAnalyticsConfig(WEBSITE_ID, undefined)).toBeNull();
    expect(readAnalyticsConfig(undefined, HOST_URL)).toBeNull();
  });

  it("are off when the host is not an absolute http(s) URL", () => {
    // The value becomes a script element's `src`. A deployment setting is not a
    // code delivery mechanism.
    for (const hostUrl of [
      "javascript:alert(1)",
      "data:text/javascript,alert(1)",
      "//umami.example.org",
      "umami.example.org",
    ]) {
      expect(readAnalyticsConfig(WEBSITE_ID, hostUrl)).toBeNull();
    }
  });
});

describe("the tracker's address", () => {
  it("is the script under the configured root", () => {
    expect(trackerScriptUrl(HOST_URL)).toBe(
      "https://umami.example.org/script.js",
    );
  });

  it("does not double the slash when the root carries one", () => {
    expect(trackerScriptUrl(`${HOST_URL}/`)).toBe(
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
