"use client";

import type { FeedAttribution, FeedStatus } from "@/lib/types";

/**
 * Feed state and attribution.
 *
 * Every failure gets a specific message. An empty screen or a raw error is
 * forbidden (FR-030), and the operator credit plus the snapshot timestamp are a
 * standing obligation under constitution principle V.
 */

const MESSAGES: Record<string, { title: string; detail: string }> = {
  network: {
    title: "Cannot reach the station data",
    detail:
      "The network feed did not respond. Check your connection and try again; the map and manual entry still work.",
  },
  malformed: {
    title: "The station data could not be read",
    detail:
      "The feed responded but its contents were not in the expected shape. This is a problem at the provider, not with your connection.",
  },
  "out-of-season": {
    title: "The network is out of season",
    detail:
      "The operator is not publishing any active stations right now, so no trip can be planned.",
  },
};

function Attribution({
  attribution,
  observedAt,
}: {
  attribution: FeedAttribution;
  observedAt: Date;
}) {
  return (
    <p className="text-xs text-zinc-500">
      Station data from {attribution.operatorName}
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
      {" · "}
      {/* FR-014: availability is a snapshot at a stated moment, never a promise. */}
      snapshot taken{" "}
      <time dateTime={observedAt.toISOString()}>
        {observedAt.toLocaleTimeString()}
      </time>
      . Availability can change before you arrive.
    </p>
  );
}

export default function FeedNotice({ status }: { status: FeedStatus }) {
  if (status.state === "loading") {
    return (
      <p className="text-sm text-zinc-600" role="status">
        Loading station data…
      </p>
    );
  }

  if (status.state === "unavailable") {
    const message = MESSAGES[status.reason];
    return (
      <div
        role="alert"
        className="rounded-md border border-amber-300 bg-amber-50 p-3"
      >
        <p className="text-sm font-medium">{message.title}</p>
        <p className="mt-1 text-xs text-zinc-700">
          {message.detail}
        </p>
      </div>
    );
  }

  const { snapshot } = status;

  return (
    <div>
      {status.state === "stale" && (
        <p
          role="status"
          className="mb-1 text-xs font-medium text-amber-700"
        >
          {/* A stale plan clearly labelled beats no plan at all. */}
          This data is {Math.round(status.age / 60)} min old and may no longer
          match what is at the docks.
        </p>
      )}
      <Attribution
        attribution={snapshot.attribution}
        observedAt={snapshot.observedAt}
      />
    </div>
  );
}
