/**
 * Audience measurement, off unless a deployment asks for it, and structurally
 * unable to say where anybody is going.
 *
 * The whole reason this file needs to exist rather than being a script tag in
 * the document: Umami tracks page views by itself and sends the *full* URL when
 * it does. This application's URLs can carry an origin and a destination typed
 * by a rider — today they do not, tomorrow a shared-plan link would — and the
 * constitution's promise is that nothing a rider enters leaves their browser.
 * An automatic tracker breaks that promise the day someone adds a query
 * parameter, silently, and nobody finds out because the app keeps working.
 *
 * So automatic tracking is turned off at the script tag (`data-auto-track`), and
 * a page view is something this module sends on purpose, with a path it decided
 * rather than a URL it read. `normalizePagePath` is where that decision lives:
 * it is pure, it has its own tests, and it answers with a page path and nothing
 * else — the query string and the fragment are gone before anything is sent.
 *
 * What this sends, in full: a website id and a page path.
 * No address, no coordinate, no station name, no query string, no fragment, no
 * cookie, no localStorage, no identifier of any kind. Umami's own tracker reads
 * `localStorage` once (its `umami.disabled` escape hatch) and writes neither it
 * nor a cookie; that was verified by reading the shipped script, not from
 * memory — see the note on `TRACKER_SCRIPT_FILE`.
 *
 * Configured by two environment variables and nothing else. They are read at
 * build time, which is the whole of the setup: set them where the build runs,
 * deploy, done. Unset — the default, and what a fork gets — is off.
 *
 * Isolated on purpose. `components/Analytics.tsx` is the only importer, and
 * `tests/unit/analytics-isolation.test.ts` fails the build if a second one
 * appears, or if anything else reaches for `window.umami` and goes around the
 * normalisation.
 *
 * Impure, like `lib/feed-client.ts` and `lib/runtime-config.ts`, and confined
 * the same way: every function here that touches a document or a window takes
 * it as an argument, so the tests need no browser beyond the one jsdom already
 * provides and no network at all.
 */

/**
 * The site, and where its Umami lives.
 *
 * Both are required together: an id without a host has nowhere to report and a
 * host without an id has nothing to report about, and half a configuration must
 * never be treated as "on".
 */
export interface AnalyticsConfig {
  /** Umami's identifier for the site. Goes out with every page view. */
  readonly websiteId: string;
  /** Root of the Umami instance, absolute http(s). Serves the script and receives the events. */
  readonly hostUrl: string;
}

/**
 * The file the tracker is served as, appended to the configured root.
 *
 * `/script.js` is what Umami serves, verified 2026-08-03 by fetching
 * https://cloud.umami.is/script.js (200, 4.6 KB) and reading it rather than
 * trusting the documentation. Three things in that source shape this module:
 *
 * - `data-auto-track="false"` skips the whole automatic path: no initial page
 *   view, no `history.pushState` interception, no click listener, no
 *   performance observer. `window.umami.track` is still installed, which is what
 *   makes manual reporting possible without the automatic kind.
 * - `track(object)` sends that object and nothing else. It does *not* merge the
 *   tracker's default payload, so the URL, the referrer, the title and the
 *   screen size are absent unless we put them there. We put none of them there.
 * - Events go to `${hostUrl}/api/send`, which is the address the CSP has to
 *   allow in `connect-src`.
 */
const TRACKER_SCRIPT_FILE = "script.js";

/**
 * Only used to give a relative path something to be relative to. Never
 * contacted, never sent, and deliberately in the reserved `.invalid` TLD so that
 * it cannot become a real host by accident.
 */
const PATH_BASE = "http://normalise.invalid";

/**
 * A URL or a path, reduced to a page path.
 *
 * Pure, total, and the one thing standing between a rider's addresses and a
 * third-party server. It keeps the pathname and drops everything else — the
 * query string and the fragment go with it, which is where an origin and a
 * destination would arrive: `?from=...`, `#from=...`.
 *
 * Every page view goes through this, including ones whose caller already holds a
 * clean value. "The caller sends a clean path" is exactly the kind of guarantee
 * that stops being true quietly.
 */
export function normalizePagePath(input: string): string {
  let pathname: string;

  try {
    pathname = new URL(input, PATH_BASE).pathname;
  } catch {
    // Not a URL and not a path. Nothing legitimate arrives here, and the root is
    // a better answer than a throw inside a page-view call.
    return "/";
  }

  // A trailing slash is the same page; "/" is the one that must survive it.
  const trimmed = pathname.replace(/\/+$/, "");
  return trimmed === "" ? "/" : trimmed;
}

/**
 * Whether a host is one whose visits are worth counting.
 *
 * Pure, so the rule is testable, and applied *before* the script tag is created
 * so a machine that fails it issues no request at all — not to the tracker, not
 * for the tracker.
 *
 * Development and private deployments are excluded for two separate reasons.
 * They would make the figures wrong, which is the boring one. The other is that
 * a private address is somebody's home network or somebody's office, and a
 * hostname of `nas.local` arriving at a dashboard is information about a person
 * that they did not offer.
 */
export function isCollectableHostname(hostname: string): boolean {
  // location.hostname brackets an IPv6 literal; the brackets are not the host.
  const host = hostname.trim().toLowerCase().replace(/^\[/, "").replace(/\]$/, "");

  // A document opened from a file has no host.
  if (host === "") return false;

  if (host === "localhost" || host.endsWith(".localhost")) return false;
  // mDNS. Every name on a local network ends in it.
  if (host.endsWith(".local")) return false;

  if (host === "::1" || host === "0:0:0:0:0:0:0:1") return false;
  // Unique-local (fc00::/7) and link-local (fe80::/10).
  if (/^f[cd][0-9a-f]{0,2}:/.test(host)) return false;
  if (/^fe[89ab][0-9a-f]?:/.test(host)) return false;

  const octets = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (octets !== null) {
    const first = Number(octets[1]);
    const second = Number(octets[2]);

    // 0.0.0.0/8 unspecified, 127/8 loopback, RFC 1918, RFC 3927 link-local.
    if (first === 0 || first === 127 || first === 10) return false;
    if (first === 172 && second >= 16 && second <= 31) return false;
    if (first === 192 && second === 168) return false;
    if (first === 169 && second === 254) return false;
  }

  return true;
}

/**
 * Two settings turned into a configuration, or null.
 *
 * Null is the default and the normal state: unset, empty, half-filled or
 * nonsense all mean the same thing, which is that this deployment measures
 * nothing. There is deliberately no partial acceptance and no built-in fallback
 * — unlike the service URLs in lib/endpoints.ts, which have defaults, because a
 * missing tile server is a degraded map and a missing website id is a decision.
 *
 * `hostUrl` is held to absolute http(s), and that is a security boundary rather
 * than tidiness: this string becomes the `src` of a script element, so a
 * `javascript:` value would be arbitrary code with a deployment setting as its
 * delivery mechanism. Same rule, same reason, as `readUrl` in
 * lib/runtime-config.ts.
 *
 * Pure and takes its two strings as arguments, so the tests exercise every case
 * without touching `process.env` or rebuilding anything.
 */
export function readAnalyticsConfig(
  websiteId: string | undefined,
  hostUrl: string | undefined,
): AnalyticsConfig | null {
  const id = typeof websiteId === "string" ? websiteId.trim() : "";
  const host = typeof hostUrl === "string" ? hostUrl.trim() : "";

  if (id === "" || host === "") return null;

  let parsed: URL;
  try {
    parsed = new URL(host);
  } catch {
    return null;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;

  return { websiteId: id, hostUrl: host };
}

/**
 * The configuration this build was made with. Null on a build that set neither
 * variable, which is every build of this repository as it stands.
 *
 * Read here and nowhere else, and written out in full rather than looked up by
 * name: `next build` replaces the literal `process.env.NEXT_PUBLIC_*` text with
 * the value, so an indexed read would be replaced by nothing at all. Verified in
 * node_modules/next/dist/docs/01-app/02-guides/environment-variables.md, which
 * also states the consequence worth knowing — "after being built, your app will
 * no longer respond to changes to these environment variables". Changing either
 * one is a rebuild, not a restart. On a host that builds on every deploy, which
 * is what this project deploys to, that distinction costs nothing.
 *
 * The `NEXT_PUBLIC_` prefix is not decoration: it is what makes a value reach
 * the browser at all, and it means the website id ends up readable in the
 * bundle. That is correct for what this is. A Umami website id identifies a
 * dashboard, not a secret, and the browser has to send it with every page view
 * regardless.
 */
export const ANALYTICS_CONFIG: AnalyticsConfig | null = readAnalyticsConfig(
  process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID,
  process.env.NEXT_PUBLIC_UMAMI_HOST_URL,
);

/** Where the tracker is fetched from, given the configured root. */
export function trackerScriptUrl(hostUrl: string): string {
  return `${hostUrl.replace(/\/+$/, "")}/${TRACKER_SCRIPT_FILE}`;
}

/** The one call this application makes into the tracker. */
interface UmamiTracker {
  track: (payload: Record<string, string>) => void;
}

interface AnalyticsWindow {
  umami?: UmamiTracker;
  document: Document;
  location: { hostname: string };
}

/** What a caller gets when measurement is on. */
export interface Analytics {
  /**
   * Report a page view for a URL or path, normalised first, always.
   *
   * Takes the raw value rather than a path the caller prepared, so that no call
   * site is in a position to hand over something unnormalised.
   */
  trackPage: (input: string) => void;
}

/**
 * Start measuring, or decide not to.
 *
 * Returns null — having done nothing, requested nothing and defined nothing —
 * whenever the configuration is absent or the host is not one we count. That
 * null is the default state of this application and of every fork of it.
 *
 * When it does start: one script element, `async` and `defer`, appended after
 * the first render by the only component that calls this. Nothing waits for it.
 * A page view asked for before the script has loaded is held, singly, and sent
 * on load; if the script never loads — offline, blocked by an ad blocker, host
 * misconfigured, CSP refusing it — the held value is simply never sent, no
 * error is raised, nothing is logged, and no reader sees a difference. That is a
 * requirement rather than an accident: measurement is the least important thing
 * on the page and must never be visible in the console of somebody who blocked
 * it on purpose.
 */
export function startAnalytics(
  win: AnalyticsWindow,
  config: AnalyticsConfig | null,
): Analytics | null {
  if (config === null) return null;
  if (!isCollectableHostname(win.location.hostname)) return null;

  const doc = win.document;
  let loaded = false;
  /** The most recent page view waiting for the script. One, not a queue. */
  let pending: string | null = null;

  const send = (path: string): void => {
    const tracker = win.umami;
    if (tracker === undefined || typeof tracker.track !== "function") return;
    try {
      /*
       * An object, and every field of it written here.
       *
       * The tracker's `track(object)` form sends exactly what it is given: none
       * of its defaults are merged in, so `url`, `referrer`, `title` and
       * `screen` are absent because they are not in this literal. The referrer
       * is the one worth naming — on an in-app navigation it would be this
       * application's own previous URL, which is precisely the string this
       * module exists to keep inside the browser.
       */
      tracker.track({ website: config.websiteId, url: path });
    } catch {
      // A tracker that throws is not a reason for a page to misbehave.
    }
  };

  const flush = (): void => {
    if (!loaded || pending === null) return;
    const path = pending;
    pending = null;
    send(path);
  };

  const script = doc.createElement("script");
  script.async = true;
  script.defer = true;
  script.src = trackerScriptUrl(config.hostUrl);
  script.setAttribute("data-website-id", config.websiteId);
  script.setAttribute("data-host-url", config.hostUrl);
  /*
   * The attribute this whole module is built around. Without it the tracker
   * reports the full URL on load and again on every `pushState`, and neither of
   * those goes through `normalizePagePath`.
   */
  script.setAttribute("data-auto-track", "false");
  /*
   * Belt and braces, both inert while auto-tracking is off and both kept on
   * purpose: they neutralise the tracker's own URL handling at the source, so
   * the day an upgrade changes when the automatic path runs, a query string and
   * a fragment still cannot leave.
   */
  script.setAttribute("data-exclude-search", "true");
  script.setAttribute("data-exclude-hash", "true");
  /* A reader who has asked not to be tracked is not tracked. */
  script.setAttribute("data-do-not-track", "true");

  script.addEventListener("load", () => {
    loaded = true;
    flush();
  });
  script.addEventListener("error", () => {
    // Blocked, offline, or no such host. Deliberately silent.
  });

  (doc.head ?? doc.documentElement).appendChild(script);

  return {
    trackPage(input: string): void {
      pending = normalizePagePath(input);
      flush();
    },
  };
}
