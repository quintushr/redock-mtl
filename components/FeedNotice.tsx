"use client";

import { t } from "@/lib/strings";
import type { FeedAttribution, FeedStatus } from "@/lib/types";

/**
 * Feed state and the operator credit.
 *
 * Every failure gets a specific message. An empty screen or a raw error is
 * forbidden (FR-030), and the operator credit plus the snapshot timestamp are a
 * standing obligation under constitution principle V.
 */

function Attribution({
  attribution,
  observedAt,
}: {
  attribution: FeedAttribution;
  observedAt: Date;
}) {
  // FR-014: availability is a snapshot at a stated moment, never a promise.
  const time = observedAt.toLocaleTimeString("fr-CA", {
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <p className="text-xs text-muted">
      {t.feed.snapshot(attribution.operatorName, time)}
      {attribution.licenseUrl !== null && (
        <>
          {" · "}
          <a
            className="underline"
            href={attribution.licenseUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            {attribution.licenseName ?? "licence"}
          </a>
        </>
      )}
    </p>
  );
}

export default function FeedNotice({ status }: { status: FeedStatus }) {
  if (status.state === "loading") {
    return (
      <p className="text-xs text-muted" role="status">
        {t.feed.loading}
      </p>
    );
  }

  if (status.state === "unavailable") {
    const message = t.feed.unavailable[status.reason];
    return (
      <div role="alert" className="rounded-control border border-line p-3">
        <p className="text-sm font-medium">{message.title}</p>
        <p className="mt-1 text-xs text-muted">{message.detail}</p>
      </div>
    );
  }

  const { snapshot } = status;

  return (
    <div>
      {status.state === "stale" && (
        // A stale plan clearly labelled beats no plan at all.
        <p role="status" className="mb-1 text-xs font-medium">
          {t.feed.stale(Math.round(status.age / 60))}
        </p>
      )}
      <Attribution
        attribution={snapshot.attribution}
        observedAt={snapshot.observedAt}
      />
    </div>
  );
}
