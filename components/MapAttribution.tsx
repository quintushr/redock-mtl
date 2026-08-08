"use client";

import { useEffect, useId, useState } from "react";
import { useStrings } from "@/components/LocaleProvider";
import { Cross, Info } from "@/components/icons";
import { MAP_ATTRIBUTION, ROUTING_ATTRIBUTION } from "@/lib/endpoints";
import type { FeedAttribution } from "@/lib/types";

/**
 * The credits: the map's, and the operator whose station feed this reads.
 *
 * Displaying both is an obligation rather than a courtesy, the first by the tile
 * licences and the second by constitution principle V.
 *
 * On the map, which docs/ui-guidelines.md is explicit about: it does not belong
 * to the panel footer, and the footer has exactly three rows that are not these.
 * It spent a while in that footer because MapLibre's own control sat behind the
 * sheet below 1024px. The fix for a covered credit is to put it where nothing
 * covers it, not to move it into the one part of the panel that never scrolls.
 *
 * So it is placed against whichever edge the panel is not on, and that differs
 * by breakpoint because the panel's anchoring does:
 *
 *   < 768px   the panel is a bottom sheet, up to 80dvh   → top of the map
 *   >= 768px  the panel is a 380px card on the left      → bottom right
 *
 * That 80dvh is a constraint running the other way as well, and PlannerPanel
 * says so: this box carries z-20 against the panel's z-10, so a taller sheet
 * would not cover it, it would be overdrawn by it. The expanded ceiling is set
 * to leave the band this occupies free.
 *
 * It wraps rather than truncating. A credit with an ellipsis in it is not a
 * credit.
 *
 * ---
 *
 * Below 768px it is folded behind a button, and that is a departure from what
 * this file used to say — "it may never be scrolled away, collapsed, truncated
 * or covered" — so it is worth stating why it is a legitimate one rather than a
 * convenience.
 *
 * The OSM Foundation's own attribution guidelines permit exactly this shape:
 *
 *   "If the attribution has been collapsed, the user must still be able to find
 *    the licence information if they look for it, for example from an '(i)'
 *    button in the corner of the map or an 'About' option in a menu."
 *
 * https://osmfoundation.org/wiki/Licence/Attribution_Guidelines
 *
 * What the rule protects is that a reader who looks can find; it never required
 * that a reader who is not looking be made to read. On a phone this box is four
 * lines of 12px text — measured at 88px tall on a 360px width — standing over
 * the map, and one of those lines is the routing privacy note rather than a
 * credit at all. That is a quarter of the map above the sheet spent on text
 * nobody reads twice.
 *
 * So: a button that names what it holds, in the corner of the map, and the full
 * text on the first press. Three things make it a fold rather than a burial —
 * the label is "Crédits et licences" and not "Infos", the trigger is a
 * permanent fixture of the map rather than something that appears on a
 * gesture, and every link inside is the same link it was.
 *
 * From 768px nothing folds. The card leaves the bottom right of the map empty
 * and the box costs nothing there, so it stays permanently open and the trigger
 * is not rendered at all.
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
  const [open, setOpen] = useState(false);
  const id = useId();

  /*
   * Escape closes, the same key that closes the settings and the station
   * callout. Bound only while it is open, so this listens for nothing on the
   * screen a reader spends their time on.
   */
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  /**
   * Where both the trigger and the box sit: the corner of the map the panel is
   * not on. Shared so the box opens exactly where the button was rather than
   * near it.
   */
  const anchor = [
    "absolute z-20",
    // Below 768px: the top edge, clear of the sheet at either rest position
    // and of a notch.
    "top-[calc(env(safe-area-inset-top)+0.5rem)] left-2",
    // From 768px: the bottom right, clear of the panel's 380px card.
    "md:top-auto md:right-2 md:bottom-2 md:left-auto",
  ].join(" ");

  return (
    <>
      {/*
        The trigger, and only below 768px — `md:hidden` rather than a second
        render path, because at that width the box below is permanently open and
        a control that closes what cannot be closed is a control that lies.

        Rendered only while closed. Open, the box takes this exact position and
        carries its own dismissal, so leaving this underneath would put two
        controls in one corner doing opposite things.

        44px, like every other target in this interface, and it looks like the
        box it opens — same border, same surface, same radius — because it is
        that box folded up rather than a new piece of furniture.
      */}
      {!open && (
        <button
          type="button"
          className={[
            anchor,
            "state-layer flex h-11 w-11 items-center justify-center md:hidden",
            "rounded-control border border-edge bg-panel/95 text-muted",
          ].join(" ")}
          aria-expanded={false}
          aria-controls={id}
          aria-label={t.attribution.credits}
          title={t.attribution.credits}
          onClick={() => setOpen(true)}
        >
          <Info />
        </button>
      )}

      <p
        id={id}
        className={[
          anchor,
          "max-w-[calc(100%-1rem)] rounded-control border border-edge",
          // Opaque rather than tinted: this sits on satellite tiles and street
          // tiles and has to stay legible on both.
          "bg-panel/95 px-2 py-1 text-xs leading-relaxed text-muted",
          "md:max-w-[min(28rem,calc(100%-396px-1.5rem))]",
          // Folded below 768px until asked for; never folded from it, where the
          // corner it occupies is empty anyway.
          open ? "" : "hidden",
          "md:block",
        ].join(" ")}
      >
        {/*
          The dismissal, inside the text it dismisses and floated into it so the
          lines wrap around rather than reserving a column. Below 768px only:
          from there nothing folded, so there is nothing to put back.
        */}
        <button
          type="button"
          className="state-layer float-right -mt-0.5 -mr-1 ml-1 flex h-8 w-8 items-center justify-center rounded-control text-muted md:hidden"
          aria-label={t.attribution.creditsHide}
          title={t.attribution.creditsHide}
          onClick={() => setOpen(false)}
        >
          <Cross />
        </button>
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
    </>
  );
}
