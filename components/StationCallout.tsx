"use client";

import { useEffect } from "react";
import { Cross, Destination, Origin } from "@/components/icons";
import { useResolve, useStrings } from "@/components/LocaleProvider";
import type { PickTarget } from "@/components/MapView";
import type { Station } from "@/lib/types";

/**
 * What a station is, once the reader has asked.
 *
 * Why this exists at all. The station markers carry availability as the length
 * of a ring and nothing else, which is the right density for several hundred
 * points and no use whatever to a reader who has picked one out and wants to
 * know whether to walk to it. On a fine pointer that question used to be
 * answerable by hovering, badly — a title attribute at best. On a touch screen
 * it was not answerable at all, and the quality floor is explicit that anything
 * a hover reveals must be reachable by tap.
 *
 * It is a container over the map, which docs/ui-guidelines.md otherwise allows
 * exactly one of. See the amendment dated 2026-07-29 in that document: the ban
 * exists to stop *standing* furniture accumulating over the map, and this is
 * summoned by a tap on a specific point, anchored to that point, and dismissed
 * by a tap anywhere else. Nothing about it is permanent, and it replaces the
 * availability legend the ban removed rather than reinstating it.
 *
 * No shadow and no tip, per the same document: a 1px border and the panel
 * surface, which is the treatment every other container here gets.
 *
 * The two actions are the reason this is worth a container rather than a
 * tooltip. A rider who has found the station they want should not have to close
 * this, remember which dot it was, and tap the map again to place a point on it.
 */
export default function StationCallout({
  station,
  onUse,
  onClose,
}: {
  station: Station;
  /** Places an endpoint on this station. The shell owns what that means. */
  onUse: (target: PickTarget, station: Station) => void;
  onClose: () => void;
}) {
  const t = useStrings();
  const say = useResolve();

  /**
   * Escape closes it.
   *
   * The two action buttons are in the document and therefore in the tab order,
   * so a keyboard reader can land inside this and must have a way out that is
   * not "tab past the end of it". Not a focus trap: this is not modal, the map
   * and the panel behind it stay usable, and trapping focus in a bubble the
   * reader did not open deliberately would be worse than leaving it open.
   */
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  /**
   * Availability, in words rather than as a ring.
   *
   * Both halves, because they answer different questions: mechanical bikes
   * decide whether this station can start a ride, free docks decide whether it
   * can end one. Mechanical only — the free window does not apply to an e-bike,
   * which is why the markers ignore them too.
   *
   * These are the counts the feed reported, not the counts the planner would
   * rely on: the reserves in the settings are a planning discipline, and
   * subtracting them here would mean showing a rider fewer bikes than the
   * station has.
   */
  const bikes = say(t.station.bikes, { count: station.mechanicalBikesAvailable });
  const docks = say(t.station.docks, { count: station.docksAvailable });

  return (
    <div
      // `dialog` would promise modality this deliberately does not have, and
      // `group` with a name is what a non-modal disclosure of one thing is.
      role="group"
      aria-label={say(t.station.details, { name: station.name })}
      className="w-56 rounded-panel border border-edge bg-panel p-3 text-ink"
    >
      <div className="flex items-start gap-2">
        <p className="min-w-0 flex-1 text-sm leading-5 font-medium [overflow-wrap:anywhere]">
          {station.name}
        </p>
        <button
          type="button"
          className="state-layer -m-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-control text-muted"
          aria-label={t.station.close}
          onClick={onClose}
        >
          <Cross />
        </button>
      </div>

      {/*
        Two lines, not a sentence and not a three-colour badge. The figure is the
        information; the noun after it says which figure it is.
      */}
      <p className="mt-2 font-mono text-xs text-muted">{bikes}</p>
      <p className="font-mono text-xs text-muted">{docks}</p>

      <div className="mt-3 flex gap-2">
        <button
          type="button"
          className="state-layer flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-control border border-edge px-2 text-xs"
          onClick={() => onUse("origin", station)}
        >
          <span className="text-muted" aria-hidden="true">
            <Origin />
          </span>
          {t.station.useAsOrigin}
        </button>
        <button
          type="button"
          className="state-layer flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-control border border-edge px-2 text-xs"
          onClick={() => onUse("destination", station)}
        >
          <span className="text-brand" aria-hidden="true">
            <Destination />
          </span>
          {t.station.useAsDestination}
        </button>
      </div>
    </div>
  );
}
