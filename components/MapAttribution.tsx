"use client";

import { MAP_ATTRIBUTION } from "@/lib/endpoints";
import { t } from "@/lib/strings";
import type { FeedAttribution } from "@/lib/types";

/**
 * The credits: the map's, and the operator whose station feed this reads.
 *
 * Displaying both is an obligation rather than a courtesy, the first by the
 * tile licences and the second by constitution principle V. This is therefore
 * the one piece of the interface that may never be scrolled away, collapsed or
 * covered, which is why it is rendered in the panel's pinned footer and not by
 * MapLibre's own control, which the panel covered below 1024px.
 *
 * If something has to give for want of room, it is not this.
 */
export default function MapAttribution({
  stations,
}: {
  /** Null until the feed has answered. */
  stations?: FeedAttribution | null;
}) {
  return (
    <p className="text-xs leading-relaxed text-muted">
      {t.attribution.map}{" "}
      {MAP_ATTRIBUTION.map((credit, index) => (
        <span key={credit.url}>
          {index > 0 && " · "}
          <a
            className="underline"
            href={credit.url}
            target="_blank"
            rel="noopener noreferrer"
          >
            {credit.label}
          </a>
        </span>
      ))}
      {stations !== null && stations !== undefined && (
        <>
          {". "}
          {t.attribution.stations} {stations.operatorName}
          {stations.licenseUrl !== null && (
            <>
              {" · "}
              <a
                className="underline"
                href={stations.licenseUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                {stations.licenseName ?? "licence"}
              </a>
            </>
          )}
        </>
      )}
    </p>
  );
}
