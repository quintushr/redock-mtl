"use client";

import { useState } from "react";
import { useStrings } from "@/components/LocaleProvider";
import PanelHeader from "@/components/PanelHeader";

/**
 * The single panel (FR-140).
 *
 * One component, two anchorings, and nothing else differs between them
 * (FR-143). docs/ui-guidelines.md is explicit that there are not two layouts to
 * maintain: below 1024px the panel is a sheet anchored to the bottom of the
 * viewport, at 1024px and above it is anchored to the left at a fixed width.
 * The children are identical in both cases.
 *
 * No third-party sheet and no gesture library: the guidelines forbid a
 * component library, and two rest positions is a two-value state machine, not a
 * physics problem.
 *
 * `dvh` throughout and never `vh`. The mobile URL bar shows and hides, `vh` does
 * not follow it, and the difference is the bottom of the panel being clipped
 * (FR-144).
 */

/**
 * The two rest positions below 768px.
 *
 * Ceilings, not heights. docs/ui-guidelines.md set 45dvh and 65dvh; both are
 * raised here, and that departure is recorded in that document under
 * "Structure" rather than only in this comment.
 *
 * Neither figure was the reason the trail could not be read — the scroll area
 * below was overflowing its own slot, which is a separate bug fixed at its own
 * site — but both were too small once the furniture around them had grown. On a
 * 390x844 handset, measured rather than reckoned: 44px of handle, 66px of
 * header since the permanent tagline joined it, 121px of footer since the
 * credits row did, 18px of scroll padding. 231px before a word of content, and
 * every one of those additions landed after the two ceilings were written.
 *
 * The collapsed one is not a plain fraction, and that is the point of it. What
 * this position exists to clear is the entry block and the whole summary — 210px
 * of scroll, measured — past furniture whose cost is *fixed in pixels* rather
 * than a share of the screen. One percentage therefore cannot be right twice:
 * a flat 56dvh clears the summary on a 844px handset and cuts 90px off it on a
 * 640px one. So the floor is written in pixels, the outer cap in dvh, and the
 * screen decides which binds:
 *
 *   844px screen   max(56dvh, 452px) = 473  → 56dvh binds, summary clears
 *   640px screen   max(56dvh, 452px) = 452  → 71dvh, summary clears
 *   500px screen   min(72dvh, 452px) = 360  → the 72dvh cap holds
 *
 * 452 and not 440, which is the arithmetic figure. 440 left the summary nine
 * pixels short on a 640px screen, because the entry block and the rules around
 * it do not round the way a sum of nominal heights does. The number is what the
 * browser reported, not what the addition predicted.
 *
 * That cap is what stops the floor from swallowing the map on a very short
 * viewport, where clearing the summary is not worth having no map at all.
 *
 * `framePadding()` in MapView follows the collapsed position, not the expanded
 * one: the route is fitted into the strip the sheet leaves at rest, and
 * expanding is a gesture the reader makes to read the trail and undoes to look
 * at the map.
 *
 * Expanded is 80dvh and not more, and the ceiling there is MapAttribution
 * rather than taste. That credit is drawn against the top of the map below
 * 768px, below the notch, and wraps — measured at 88px tall on a 360px width.
 * It carries z-20 against this panel's z-10, so a taller sheet would not cover
 * it, it would be overdrawn by it: a credit box floating on the panel's own
 * header. At 80dvh the sheet's top edge is 128px down on a 640px screen, clear
 * of it by 32px.
 */
const COLLAPSED = "max-h-[min(72dvh,max(56dvh,28.25rem))]";
const EXPANDED = "max-h-[80dvh]";

/**
 * And the height the settings take, which has to be stated rather than capped.
 *
 * The overlay is absolutely placed, so it contributes nothing to the panel's
 * intrinsic height, and the panel is as tall as its content: with the settings
 * open the height is therefore decided by the *itinerary underneath them*. On a
 * planner nobody has entered a trip into yet, that is the empty state, and nine
 * sliders inherited a window sized for two paragraphs.
 *
 * A definite height is the fix and it is safe here in a way it would not be at
 * rest — the surface is full by construction, so there is no case of a tall
 * white sheet holding two fields.
 */
const SETTINGS = "h-[80dvh]";

export default function PlannerPanel({
  children,
  footer,
  overlay,
  overlayOpen = false,
}: {
  children: React.ReactNode;
  /**
   * Pinned below the scroll container, so it is reachable at either rest
   * position and whatever the reader has scrolled to. Two rows and no more:
   * docs/ui-guidelines.md fixes what may sit here, because every line added to
   * a footer pushes the settings and the refresh a little further out of reach.
   */
  footer?: React.ReactNode;
  /**
   * Drawn over the scroll area, never in it.
   *
   * The settings live here. An expanding region inside the scroll would push
   * the itinerary down under the reader's finger and drop them somewhere they
   * did not choose when it closed; an overlay covers the trail and gives it
   * back untouched, still mounted and still at its own scroll offset (FR-122).
   */
  overlay?: React.ReactNode;
  /**
   * Whether that overlay is currently drawn.
   *
   * The sheet takes `SETTINGS` for as long as it is, and the handle stands
   * down. Nine sliders that stand 1200px tall are otherwise given whatever
   * window the itinerary underneath happened to leave them, which on a planner
   * with no trip in it is the height of the empty state.
   *
   * `expanded` is left untouched while this is true rather than being set, so
   * closing the settings returns the sheet to the position the reader chose
   * instead of to the one the settings needed.
   */
  overlayOpen?: boolean;
}) {
  const t = useStrings();
  const [expanded, setExpanded] = useState(false);

  return (
    <section
      aria-label={t.panel.label}
      className={[
        // Anchoring below 768px: a sheet on the bottom edge, square at the
        // bottom because there is nothing to round against the viewport edge.
        "absolute inset-x-0 bottom-0 z-10 flex flex-col",
        "rounded-t-panel border-t border-edge bg-panel",
        "md:inset-x-auto",
        overlayOpen ? SETTINGS : expanded ? EXPANDED : COLLAPSED,
        // Anchoring at 768px and above: an inset card, 16px on all four
        // sides, rounded on all four corners, as tall as its content and no
        // taller.
        //
        // docs/ui-guidelines.md puts this switch at 1024px and calls
        // everything below it a bottom sheet. It sits at 768px here: a sheet
        // spanning the full width of a tablet, edge to edge, is the layout
        // that produced "the panel touches the edges of the screen". Below
        // 768px the sheet is still a sheet, because a sheet floating clear of
        // the bottom edge is neither sheet nor card.
        //
        // `bottom-auto` is the other half: anchoring both edges stretched the
        // panel over the whole viewport height whatever it contained, which is
        // how a desktop reader got a white column with content in its top
        // third.
        "md:top-4 md:right-auto md:bottom-auto md:left-4 md:w-[380px]",
        "md:h-auto md:max-h-[calc(100dvh-2rem)] md:rounded-panel md:border md:border-edge",
        // The ceiling is the only thing that animates, and only when the reader
        // has not asked for stillness.
        "motion-safe:transition-[max-height] motion-safe:duration-200",
      ].join(" ")}
    >
      {/*
        The handle belongs to the bottom anchoring, not to the content, which is
        why it is the one thing hidden at the wide breakpoint. At that width
        there are no rest positions to move between.

        It also stands down while the settings are drawn. There is nothing to
        move between then either — the sheet is held at its expanded ceiling by
        `tall` — and a control whose `aria-expanded` says false above a sheet
        that is visibly open states the opposite of what is on screen. The way
        out of the settings is the footer row that opened them, which is exactly
        why that row stays visible.
      */}
      {!overlayOpen && (
        <button
          type="button"
          className="flex min-h-11 w-full shrink-0 items-center justify-center md:hidden"
          aria-expanded={expanded}
          onClick={() => setExpanded((open) => !open)}
        >
          <span className="sr-only">
            {expanded ? t.panel.collapse : t.panel.expand}
          </span>
          {/*
            Visible at rest. On a touch screen nothing reveals itself on hover,
            and --line against --panel is 1,27:1, which is a grip nobody sees.
          */}
          <span aria-hidden="true" className="h-1 w-9 rounded-full bg-muted" />
        </button>
      )}

      {/*
        No navigation bar on the planner: docs/ui-guidelines.md merges those
        entries into this header instead, so they cost panel height rather than
        map height.
      */}
      <PanelHeader />

      {/*
        The only thing that scrolls, and a stable node. The settings overlay is
        its sibling rather than its content, so opening them never swaps this
        element out and never moves what is inside it (FR-122).
      */}
      {/*
        A column of its own, so the scroll area below is a flex item rather than
        a percentage of this.

        That distinction is the whole of a bug this panel shipped with. This
        element is sized by flex — correctly, to 241px on a 844px screen — but
        its *specified* `height` stays `auto`, because flex sizing does not set
        the property. A `height: 100%` child therefore had nothing to resolve
        against, fell back to `auto`, and took the height of its content: 405px
        of scroll area inside a 241px box, running under the pinned footer and
        41px off the bottom of the screen, with `scrollHeight === clientHeight`
        so no scrollbar ever appeared and no scrolling was possible. The
        itinerary was not merely cramped, it was rendered where nothing could
        reach it.

        Making it a flex item instead removes the percentage from the chain
        entirely, which is why this holds at any ceiling and needs no definite
        height on the panel — the panel stays as tall as its content, capped.
      */}
      <div className="relative flex min-h-0 flex-1 flex-col">
        {/* `panel-scroll` draws the bar itself; see app/globals.css. The
            platform default is an overlay that fades, which left a full panel
            looking like a panel with nothing below it.

            The vertical padding is smaller below 768px and unchanged from it.
            28px of it on a phone is 15% of the content the collapsed ceiling
            has to give, spent on air at the two edges where the header rule
            above and the footer rule below already separate this from
            everything else. */}
        <div className="panel-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pt-1.5 pb-3 md:pt-4 md:pb-5">
          {children}
        </div>
        {overlay}
      </div>

      {footer}
    </section>
  );
}
