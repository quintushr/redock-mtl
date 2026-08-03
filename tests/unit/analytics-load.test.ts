import { afterEach, describe, expect, it, vi } from "vitest";
import { startAnalytics } from "@/lib/analytics";

/**
 * What actually reaches the network, and — the default case — what does not.
 *
 * jsdom is enough for all of it: `startAnalytics` takes its window as an
 * argument, so there is no global to stub and no request to intercept. The
 * tracker itself is never loaded here; what is asserted is the element this
 * module creates, the payload it hands over, and the silence it keeps when the
 * script never arrives.
 */

const CONFIG = {
  websiteId: "e676c9b4-11e4-4ef1-a4d7-87001773e9f2",
  hostUrl: "https://umami.example.org",
};

interface Payload {
  website: string;
  url: string;
}

function fakeWindow(hostname = "redock.example.org") {
  const sent: Payload[] = [];
  const win = {
    document,
    location: { hostname },
    umami: {
      track: (payload: Record<string, string>) => {
        sent.push(payload as unknown as Payload);
      },
    },
  };
  return { win, sent };
}

function trackerScript(): HTMLScriptElement | null {
  return document.querySelector<HTMLScriptElement>(
    'script[data-website-id]',
  );
}

afterEach(() => {
  document.head.querySelectorAll("script").forEach((node) => node.remove());
  vi.restoreAllMocks();
});

describe("with no analytics block, which is the default everywhere", () => {
  it("loads nothing and returns nothing", () => {
    const { win, sent } = fakeWindow();

    expect(startAnalytics(win, null)).toBeNull();
    expect(trackerScript()).toBeNull();
    expect(sent).toEqual([]);
  });
});

describe("on a host that is not counted", () => {
  it("creates no script, so not even the tracker is requested", () => {
    const { win } = fakeWindow("localhost");

    expect(startAnalytics(win, CONFIG)).toBeNull();
    expect(trackerScript()).toBeNull();
  });
});

describe("with an analytics block", () => {
  it("appends one async, deferred script with automatic tracking off", () => {
    const { win } = fakeWindow();

    expect(startAnalytics(win, CONFIG)).not.toBeNull();

    const script = trackerScript();
    expect(script).not.toBeNull();
    expect(script?.src).toBe("https://umami.example.org/script.js");
    expect(script?.async).toBe(true);
    expect(script?.defer).toBe(true);
    expect(script?.getAttribute("data-website-id")).toBe(CONFIG.websiteId);
    expect(script?.getAttribute("data-host-url")).toBe(CONFIG.hostUrl);
    // The attribute the whole module rests on: with automatic tracking on, the
    // tracker reports the full URL by itself and nothing here can stop it.
    expect(script?.getAttribute("data-auto-track")).toBe("false");
    expect(script?.getAttribute("data-exclude-search")).toBe("true");
    expect(script?.getAttribute("data-exclude-hash")).toBe("true");
  });

  it("sends nothing until the tracker has loaded", () => {
    const { win, sent } = fakeWindow();
    const analytics = startAnalytics(win, CONFIG);

    analytics?.trackPage("/");
    expect(sent).toEqual([]);

    trackerScript()?.dispatchEvent(new Event("load"));
    expect(sent).toEqual([{ website: CONFIG.websiteId, url: "/" }]);
  });

  it("sends the page and nothing else, whatever the URL carried", () => {
    const { win, sent } = fakeWindow();
    const analytics = startAnalytics(win, CONFIG);
    trackerScript()?.dispatchEvent(new Event("load"));

    analytics?.trackPage(
      "https://redock.example.org/?from=1234+rue+Sainte-Catherine&lat=45.5017&lon=-73.5673#to=45.5088,-73.554",
    );

    // The whole payload, asserted as a whole on purpose: `toEqual` fails if a
    // field is ever added, which is how a referrer or a title would arrive.
    expect(sent).toEqual([{ website: CONFIG.websiteId, url: "/" }]);
    expect(JSON.stringify(sent)).not.toContain("Sainte-Catherine");
    expect(JSON.stringify(sent)).not.toContain("45.5017");
  });

  it("keeps only the most recent page view while the tracker loads", () => {
    const { win, sent } = fakeWindow();
    const analytics = startAnalytics(win, CONFIG);

    analytics?.trackPage("/");
    analytics?.trackPage("/planifier?to=chez+moi");
    trackerScript()?.dispatchEvent(new Event("load"));

    expect(sent).toEqual([{ website: CONFIG.websiteId, url: "/planifier" }]);
  });

  it("says nothing at all when the tracker never arrives", () => {
    // An ad blocker, an offline reader, a CSP refusing the host. All of them are
    // ordinary, none of them is a defect, and a console error would be visible
    // to somebody who blocked this deliberately.
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const warnings = vi.spyOn(console, "warn").mockImplementation(() => {});

    const { win, sent } = fakeWindow();
    const analytics = startAnalytics(win, CONFIG);

    trackerScript()?.dispatchEvent(new Event("error"));
    expect(() => analytics?.trackPage("/")).not.toThrow();

    expect(sent).toEqual([]);
    expect(errors).not.toHaveBeenCalled();
    expect(warnings).not.toHaveBeenCalled();
  });

  it("survives a tracker that throws", () => {
    const win = {
      document,
      location: { hostname: "redock.example.org" },
      umami: {
        track: () => {
          throw new Error("nope");
        },
      },
    };

    const analytics = startAnalytics(win, CONFIG);
    trackerScript()?.dispatchEvent(new Event("load"));

    expect(() => analytics?.trackPage("/")).not.toThrow();
  });
});
