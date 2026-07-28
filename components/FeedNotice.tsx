"use client";

import { useResolve, useStrings } from "@/components/LocaleProvider";
import { RETRYABLE_FEED_REASONS, type FeedStatus } from "@/lib/types";

/**
 * What the station feed is doing, in the two pieces that qualify the result.
 *
 * A feed that failed is the reason there is no plan, and a snapshot old enough
 * to be wrong is a caveat on the plan there is. Both belong in the result
 * region, where the reader is already looking. The ordinary age — the figure a
 * rider glances at rather than reacts to — is the panel footer's second row.
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
  const retryable = RETRYABLE_FEED_REASONS.includes(status.reason);

  return (
    <div role="alert" className="rounded-control border border-edge p-3">
      <p className="text-sm font-medium">{message.title}</p>
      <p className="mt-1 text-xs text-muted">{message.detail}</p>
      {retryable && (
        <button
          type="button"
          className="mt-2 min-h-11 rounded-control border border-edge px-3 text-xs hover:bg-paper"
          onClick={onRetry}
        >
          {t.feed.retry}
        </button>
      )}
    </div>
  );
}

/**
 * How stale a working snapshot is, when it is stale enough to say so.
 *
 * The ordinary age lives in the panel footer's second row, where
 * docs/ui-guidelines.md puts it. This is the louder statement, and it stays in
 * the result region: a snapshot old enough to disagree with the stations
 * qualifies the answer rather than the interface, and a rider must not have to
 * look at a footer to learn that the plan they are reading may not hold.
 */
export function FeedStale({ status }: { status: FeedStatus }) {
  const say = useResolve();
  const t = useStrings();
  if (status.state !== "stale") return null;

  // A stale plan clearly labelled beats no plan at all.
  return (
    <p role="status" className="mb-3 text-xs font-medium">
      {say(t.feed.stale, { minutes: Math.round(status.age / 60) })}
    </p>
  );
}
