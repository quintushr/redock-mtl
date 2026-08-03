import { describe, expect, it } from "vitest";
import { normalizePagePath } from "@/lib/analytics";

/**
 * The one function standing between a rider's addresses and a third-party
 * server.
 *
 * These are not tests of a formatting helper. Umami's default behaviour is to
 * report the full URL of every page view by itself, and this application turned
 * that off precisely because its URLs can carry an origin and a destination. If
 * a future change re-introduces a query parameter or a fragment carrying what
 * somebody typed, this file is what fails — before anybody's address reaches a
 * dashboard.
 *
 * So each case below is a leak that would otherwise have happened, not a shape
 * that happens to be convenient to normalise.
 */

const SITE = "https://redock.example.org";

describe("a URL carrying an address", () => {
  it("keeps the page and drops the query string", () => {
    expect(
      normalizePagePath(
        `${SITE}/?from=1234+rue+Sainte-Catherine+Ouest&to=405+rue+Sherbrooke+Est`,
      ),
    ).toBe("/");
  });

  it("drops it on any page, not only the root", () => {
    const path = normalizePagePath(`${SITE}/planifier?from=6600+rue+Hochelaga`);
    expect(path).toBe("/planifier");
    expect(path).not.toContain("Hochelaga");
  });
});

describe("a URL with a fragment", () => {
  it("keeps the page and drops the fragment", () => {
    expect(normalizePagePath(`${SITE}/#reglages`)).toBe("/");
  });

  it("drops a fragment used to carry endpoints", () => {
    // The obvious next place to put a shared plan, and the one a "we only strip
    // the query string" reading would have leaked.
    expect(
      normalizePagePath(`${SITE}/#from=45.5017,-73.5673&to=45.5088,-73.554`),
    ).toBe("/");
  });
});

describe("a URL with coordinates", () => {
  it("drops them from the query string", () => {
    expect(normalizePagePath(`${SITE}/?lat=45.5017&lon=-73.5673`)).toBe("/");
  });

  it("drops them however they are spelled", () => {
    expect(
      normalizePagePath(`${SITE}/?origin=45.5017%2C-73.5673#to=45.5088`),
    ).toBe("/");
  });
});

describe("a plain page URL", () => {
  it("reports the root as itself", () => {
    expect(normalizePagePath(`${SITE}/`)).toBe("/");
    expect(normalizePagePath(SITE)).toBe("/");
  });

  it("accepts a bare path, which is what the router hands over", () => {
    expect(normalizePagePath("/")).toBe("/");
    expect(normalizePagePath("/planifier")).toBe("/planifier");
  });

  it("treats a trailing slash as the same page", () => {
    expect(normalizePagePath(`${SITE}/planifier/`)).toBe("/planifier");
    expect(normalizePagePath(`${SITE}//`)).toBe("/");
  });
});

describe("anything else", () => {
  it("answers a path instead of throwing inside a page view", () => {
    expect(normalizePagePath("")).toBe("/");
    // Percent-encoded by the URL parser rather than rejected. What matters is
    // that nothing throws: a page view is not allowed to break a page.
    expect(normalizePagePath("¯\\_(ツ)_/¯").startsWith("/")).toBe(true);
  });

  it("never answers with a query string or a fragment, whatever it is given", () => {
    const inputs = [
      `${SITE}/?q=6600 rue Hochelaga`,
      `${SITE}/planifier#from=45.5,-73.5`,
      "//evil.example.org/planifier?to=chez+moi",
      "https://redock.example.org",
      "not a url at all",
      "/?a=1#b=2",
    ];

    for (const input of inputs) {
      const path = normalizePagePath(input);
      expect(path).not.toContain("?");
      expect(path).not.toContain("#");
      expect(path.startsWith("/")).toBe(true);
    }
  });
});
