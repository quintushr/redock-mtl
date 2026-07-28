"use client";

import { useStrings } from "@/components/LocaleProvider";
import { MAP_ATTRIBUTION, ROUTING_ATTRIBUTION } from "@/lib/endpoints";
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
  routing = false,
}: {
  /** Null until the feed has answered. */
  stations?: FeedAttribution | null;
  /**
   * Whether a traced path is currently on screen.
   *
   * The routing credit appears only when its work does (FR-332). Crediting a
   * service on a screen that shows nothing of its would be noise, and this
   * footer is already the densest line in the interface.
   */
  routing?: boolean;
}) {
  const t = useStrings();

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
      {routing && (
        <>
          {". "}
          {t.attribution.routing}{" "}
          <a
            className="underline"
            href={ROUTING_ATTRIBUTION.url}
            target="_blank"
            rel="noopener noreferrer"
          >
            {ROUTING_ATTRIBUTION.label}
          </a>
          {/*
            What leaves the browser, said plainly (FR-333). The constitution
            keeps user data in the browser; a pair of coordinates per segment is
            little enough to be acceptable and enough to be worth stating rather
            than assuming nobody would mind.
          */}
          {". "}
          <span>{t.attribution.routingPrivacy}</span>
        </>
      )}
    </p>
  );
}
