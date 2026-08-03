"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { type Analytics, startAnalytics } from "@/lib/analytics";
import { configReady } from "@/lib/runtime-config";

/**
 * The only place in this application that starts a tracker or reports a page.
 *
 * Renders nothing, and on a deployment that has not configured measurement it
 * also *does* nothing: `startAnalytics` returns null before creating an element
 * or touching the network, so there is no script tag, no request, and nothing
 * for an ad blocker to have an opinion about. That is the default, here and in
 * every fork.
 *
 * Mounted in app/layout.tsx, after the tree rather than before it, because
 * measurement is the last thing that should compete for the first paint. The
 * script tag is created in an effect for the same reason: it cannot exist until
 * something has already been rendered.
 *
 * Page views are reported from `usePathname`, which is the router's own answer
 * and carries no query string or fragment — and it is still passed through
 * `normalizePagePath` inside `trackPage`, because "the caller already sends a
 * clean value" is exactly the kind of guarantee that stops being true quietly.
 * There is no other call site: tests/unit/analytics-isolation.test.ts fails if
 * one appears.
 */
export default function Analytics() {
  const pathname = usePathname();
  const analytics = useRef<Analytics | null>(null);
  /*
   * Whether a tracker exists, held as state rather than read from the ref,
   * because a ref changing is not a reason for React to re-run the effect
   * below — and the first page view has to be sent by the run that follows the
   * configuration arriving.
   */
  const [started, setStarted] = useState(false);

  useEffect(() => {
    let cancelled = false;

    configReady()
      .then((config) => {
        if (cancelled) return;
        analytics.current = startAnalytics(window, config.analytics);
        if (analytics.current !== null) setStarted(true);
      })
      .catch(() => {
        // `configReady` is total by contract. If that ever stops being true,
        // the answer here is still to measure nothing and say nothing.
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!started) return;
    analytics.current?.trackPage(pathname);
  }, [started, pathname]);

  return null;
}
