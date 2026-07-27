"use client";

import { useStrings } from "@/components/LocaleProvider";
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
export function FeedFailure({
  status,
  onRetry,
}: {
  status: FeedStatus;
  onRetry: () => void;
}) {
  const t = useStrings();
  if (status.state !== "unavailable") return null;
  const message = t.feed.unavailable[status.reason];
  // A season is not something retrying can fix, and a button that cannot work
  // is worse than no button.
  const retryable = t.feed.retryable.includes(status.reason);

  return (
    <div role="alert" className="rounded-control border border-line p-3">
      <p className="text-sm font-medium">{message.title}</p>
      <p className="mt-1 text-xs text-muted">{message.detail}</p>
      {retryable && (
        <button
          type="button"
          className="mt-2 min-h-11 rounded-control border border-line px-3 text-xs hover:bg-paper"
          onClick={onRetry}
        >
          {t.feed.retry}
        </button>
      )}
    </div>
  );
}

/** How old the figures are. Null while there is nothing to qualify. */
export function FeedFreshness({ status }: { status: FeedStatus }) {
  const t = useStrings();

  if (status.state === "loading") {
    return (
      <p className="text-xs text-muted" role="status">
        {t.feed.loading}
      </p>
    );
  }

  if (status.state === "unavailable") return null;

  // FR-014: availability is a snapshot at a stated moment, never a promise.
  const time = status.snapshot.observedAt.toLocaleTimeString(t.units.locale, {
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
