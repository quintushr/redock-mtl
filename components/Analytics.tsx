"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { ANALYTICS_CONFIG, type Analytics, startAnalytics } from "@/lib/analytics";

/**
 * The only place in this application that starts a tracker or reports a page.
 *
 * Renders nothing, and on a build that set neither environment variable it also
 * *does* nothing: `startAnalytics` returns null before creating an element or
 * touching the network, so there is no script tag, no request, and nothing for an
 * ad blocker to have an opinion about. That is the default, here and in every
 * fork.
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

  useEffect(() => {
    // Once per mount, and never during render: creating a DOM node is not
    // something a render is allowed to do, and a static export prerenders this
    // component on a machine with no window at all.
    analytics.current ??= startAnalytics(window, ANALYTICS_CONFIG);
  }, []);

  useEffect(() => {
    analytics.current?.trackPage(pathname);
  }, [pathname]);

  return null;
}
