"use client";

import { t } from "@/lib/strings";
import type { FeedStatus } from "@/lib/types";

/**
 * What the station feed is doing, in two pieces that belong in two places.
 *
 * A feed that failed is the reason there is no plan, so it belongs in the
 * result region, where the reader is already looking for the answer. How fresh
 * a working snapshot is belongs at the bottom: it qualifies a result the reader
 * has already read, and it used to sit between the fields and the itinerary,
 * pushing the answer down the panel on every consultation.
 *
 * Every failure gets a specific message. An empty screen or a raw error is
 * forbidden (FR-030).
 */

/** The alert. Null unless the feed actually failed. */
export function FeedFailure({ status }: { status: FeedStatus }) {
  if (status.state !== "unavailable") return null;
  const message = t.feed.unavailable[status.reason];

  return (
    <div role="alert" className="rounded-control border border-line p-3">
      <p className="text-sm font-medium">{message.title}</p>
      <p className="mt-1 text-xs text-muted">{message.detail}</p>
    </div>
  );
}

/** How old the figures are. Null while there is nothing to qualify. */
export function FeedFreshness({ status }: { status: FeedStatus }) {
  if (status.state === "loading") {
    return (
      <p className="text-xs text-muted" role="status">
        {t.feed.loading}
      </p>
    );
  }

  if (status.state === "unavailable") return null;

  // FR-014: availability is a snapshot at a stated moment, never a promise.
  const time = status.snapshot.observedAt.toLocaleTimeString("fr-CA", {
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div>
      {status.state === "stale" && (
        // A stale plan clearly labelled beats no plan at all.
        <p role="status" className="mb-1 text-xs font-medium">
          {t.feed.stale(Math.round(status.age / 60))}
        </p>
      )}
      <p className="text-xs text-muted">{t.feed.freshness(time)}</p>
    </div>
  );
}
