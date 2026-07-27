"use client";

import { MAP_ATTRIBUTION } from "@/lib/endpoints";
import { t } from "@/lib/strings";

/**
 * The map credits.
 *
 * Displaying these is a licence obligation, so this is the one piece of the
 * interface that may never be scrolled away, collapsed, or covered. It is
 * rendered by the panel's footer, outside the scroll container, rather than by
 * MapLibre's own control, which the panel covered below 1024px.
 *
 * Nothing here is decorative and nothing here is optional. If it does not fit,
 * the thing that gives way is something else.
 */
export default function MapAttribution() {
  return (
    <p className="text-xs leading-relaxed text-muted">
      {t.attribution.prefix}{" "}
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
    </p>
  );
}
