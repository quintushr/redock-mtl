"use client";

import { useStrings } from "@/components/LocaleProvider";
import { RETRYABLE_FEED_REASONS, type FeedStatus } from "@/lib/types";

/**
 * What the station feed is doing, when it is the reason there is no plan.
 *
 * A failed feed belongs in the result region, where the reader is already
 * looking, because it *is* the result. Every failure gets a specific message;
 * an empty screen or a raw error is forbidden (FR-030).
 *
 * This module used to export a second notice, `FeedStale`, which qualified a
 * working plan built on an ageing snapshot. It was removed on request. The
 * snapshot's age is still reported, in the panel footer's second row where
 * docs/ui-guidelines.md puts it — but it is now only ever the quiet figure a
 * rider glances at, never a caveat attached to the plan itself. A rider reading
 * an itinerary built on half-hour-old availability is no longer told so where
 * they are looking.
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
  const retryable = RETRYABLE_FEED_REASONS.includes(status.reason);

  return (
    <div role="alert" className="rounded-control border border-edge p-3">
      <p className="text-sm font-medium">{message.title}</p>
      <p className="mt-1 text-xs text-muted">{message.detail}</p>
      {retryable && (
        <button
          type="button"
          className="state-layer mt-2 min-h-11 rounded-control border border-edge px-3 text-xs"
          onClick={onRetry}
        >
          {t.feed.retry}
        </button>
      )}
    </div>
  );
}
