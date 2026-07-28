"use client";

import { useStrings } from "@/components/LocaleProvider";
import { MAP_ATTRIBUTION, ROUTING_ATTRIBUTION } from "@/lib/endpoints";
import type { FeedAttribution } from "@/lib/types";

/**
 * The credits: the map's, and the operator whose station feed this reads.
 *
 * Displaying both is an obligation rather than a courtesy, the first by the tile
 * licences and the second by constitution principle V. It may never be scrolled
 * away, collapsed, truncated or covered. If something has to give for want of
 * room, it is not this.
 *
 * On the map, which docs/ui-guidelines.md is explicit about: it does not belong
 * to the panel footer, and the footer has exactly two rows that are not these.
 * It spent a while in that footer because MapLibre's own control sat behind the
 * sheet below 1024px. The fix for a covered credit is to put it where nothing
 * covers it, not to move it into the one part of the panel that never scrolls.
 *
 * So it is placed against whichever edge the panel is not on, and that differs
 * by breakpoint because the panel's anchoring does:
 *
 *   < 768px   the panel is a bottom sheet, up to 65dvh   → top of the map
 *   >= 768px  the panel is a 380px card on the left      → bottom right
 *
 * It wraps rather than truncating. A credit with an ellipsis in it is not a
 * credit.
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
    <p
      className={[
        "absolute z-20 max-w-[calc(100%-1rem)] rounded-control border border-edge",
        // Opaque rather than tinted: this sits on satellite tiles and street
        // tiles and has to stay legible on both.
        "bg-panel/95 px-2 py-1 text-xs leading-relaxed text-muted",
        // Below 768px: the top edge, clear of the sheet at either rest position
        // and of a notch.
        "top-[calc(env(safe-area-inset-top)+0.5rem)] left-2",
        // From 768px: the bottom right, clear of the panel's 380px card.
        "md:top-auto md:right-2 md:bottom-2 md:left-auto md:max-w-[min(28rem,calc(100%-396px-1.5rem))]",
      ].join(" ")}
    >
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
