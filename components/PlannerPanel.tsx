"use client";

import { useEffect, useRef, useState } from "react";
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

  /**
   * A height the reader set with their finger, in pixels, or null for neither.
   *
   * Null is the ordinary state and the two rest positions govern it. A number
   * means the handle was dragged, and from then until the next tap or the next
   * resize the sheet is wherever they put it. The two are not rival mechanisms:
   * the rest positions are what a tap moves between and what the sheet opens
   * at, and this is the reader overruling both for a trip whose trail happens to
   * be four steps long or fourteen.
   *
   * Carried to CSS as a custom property rather than as an inline `height`,
   * which is not a detail. An inline style beats every class, so a pixel height
   * written that way would follow the panel to the desktop card, where the
   * sheet does not exist and the height is the content's business. As a variable
   * it is read by a utility that `md:h-auto` can override in the ordinary way.
   */
  const [sheet, setSheet] = useState<number | null>(null);
  const panel = useRef<HTMLElement | null>(null);

  /**
   * The gesture in progress: where it started, how tall the sheet was then, and
   * whether it has moved far enough to be a drag rather than a tap.
   *
   * A ref and not state, because none of it is rendered and all of it changes
   * on every pointer event. Re-rendering the panel sixty times a second to
   * record a cursor position is how a drag comes to feel like a drag on a
   * different device.
   */
  const drag = useRef<{ y: number; height: number; moved: boolean } | null>(
    null,
  );

  /**
   * The same "a finger is on the handle" fact, as state, because the render
   * needs it: it is what suspends the ceiling's transition. The ref above
   * carries the gesture and the render may not read a ref, so the one bit of it
   * that reaches the markup is lifted out and set once, when the gesture first
   * crosses the slop, rather than on every move.
   */
  const [dragging, setDragging] = useState(false);

  /** How far a finger may travel and still have been a tap. */
  const TAP_SLOP = 4;

  /**
   * What the drag may not go outside.
   *
   * The floor is the entry block, the header and the footer — below it the sheet
   * would be furniture with nothing in it. The ceiling is the same 80dvh the
   * expanded position stops at, and for the same reason: the map credits are
   * drawn against the top of the map and carry a higher stacking order, so a
   * taller sheet is overdrawn by them rather than covering them.
   */
  const bounds = (): { min: number; max: number } => ({
    min: 260,
    max: Math.round(window.innerHeight * 0.8),
  });

  const clamp = (value: number): number => {
    const { min, max } = bounds();
    return Math.min(max, Math.max(min, value));
  };

  const onPointerDown = (
    event: React.PointerEvent<HTMLButtonElement>,
  ): void => {
    const height = panel.current?.getBoundingClientRect().height;
    if (height === undefined) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { y: event.clientY, height, moved: false };
  };

  const onPointerMove = (
    event: React.PointerEvent<HTMLButtonElement>,
  ): void => {
    const current = drag.current;
    if (current === null) return;
    // Upward is taller: the sheet grows from the bottom edge it is anchored to,
    // so the delta is inverted against the pointer's own axis.
    const delta = current.y - event.clientY;
    if (!current.moved) {
      if (Math.abs(delta) <= TAP_SLOP) return;
      current.moved = true;
      setDragging(true);
    }
    setSheet(clamp(current.height + delta));
  };

  /**
   * A gesture that never moved is a tap, and a tap toggles.
   *
   * Handled here rather than in `onClick` so the two cannot both fire: a click
   * event follows a pointer sequence whatever it did in between, and a drag that
   * ended anywhere would otherwise also toggle the rest position it had just
   * been dragged away from.
   */
  const onPointerUp = (): void => {
    const current = drag.current;
    drag.current = null;
    setDragging(false);
    if (current === null || current.moved) return;
    setSheet(null);
    setExpanded((open) => !open);
  };

  /**
   * The same adjustment for a keyboard, because a drag is a pointer gesture and
   * the quality floor does not accept a control that only exists for one.
   *
   * A step of 48px is about a row of the trail, which is the unit a reader is
   * actually asking for when they want a little more of it.
   */
  const onKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>): void => {
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
    const height = panel.current?.getBoundingClientRect().height;
    if (height === undefined) return;
    event.preventDefault();
    setSheet(clamp(height + (event.key === "ArrowUp" ? 48 : -48)));
  };

  /**
   * A pixel height stops meaning what it meant when the viewport changes size,
   * so a rotation or a desktop window drag hands the sheet back to its rest
   * positions rather than leaving it at a figure chosen against a screen that no
   * longer exists.
   */
  useEffect(() => {
    const onResize = (): void => setSheet(null);
    window.addEventListener("resize", onResize);
    window.addEventListener("orientationchange", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("orientationchange", onResize);
    };
  }, []);

  return (
    <section
      ref={panel}
      aria-label={t.panel.label}
      style={
        sheet === null
          ? undefined
          : ({ "--sheet": `${sheet}px` } as React.CSSProperties)
      }
      className={[
        // Anchoring below 768px: a sheet on the bottom edge, square at the
        // bottom because there is nothing to round against the viewport edge.
        "absolute inset-x-0 bottom-0 z-10 flex flex-col",
        "rounded-t-panel border-t border-edge bg-panel",
        "md:inset-x-auto",
        /*
          A dragged height is a `height`, and `max-height` outranks it. So while
          one is set the ceiling is raised to the expanded position — the same
          figure the drag is clamped to in `bounds()` — and the clamp is what
          actually governs. Without that, dragging up from the collapsed
          position would stop dead at the collapsed ceiling with the finger
          still moving.
        */
        sheet !== null
          ? "h-[var(--sheet)] " + EXPANDED
          : overlayOpen
            ? SETTINGS
            : expanded
              ? EXPANDED
              : COLLAPSED,
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
        // has not asked for stillness — and not at all while a finger is on the
        // handle, where a 200ms ease would arrive at each height a fifth of a
        // second after the finger left it.
        dragging
          ? "transition-none"
          : "motion-safe:transition-[max-height] motion-safe:duration-200",
      ].join(" ")}
    >
      {/*
        The handle belongs to the bottom anchoring, not to the content, which is
        why it is the one thing hidden at the wide breakpoint. At that width
        there are no rest positions to move between.

        It also stands down while the settings are drawn. There is nothing to
        move between then either — the sheet is held at a firm height — and a
        control whose `aria-expanded` says false above a sheet that is visibly
        open states the opposite of what is on screen. The way out of the
        settings is the footer row that opened them, which is exactly why that
        row stays visible.

        It does two things, and the second is new: a tap still moves between the
        two rest positions, and a drag puts the sheet wherever the finger leaves
        it. docs/ui-guidelines.md set two rest positions and no more, and that
        rule was written for a sheet that could not be dragged at all — the
        positions are still what a tap moves between and what the sheet opens
        at. What the drag adds is the case neither position fits, which on a
        trail whose length is the reader's trip rather than a fixed design is
        most of them.

        `touch-action: none` is what makes it a drag rather than a page scroll:
        without it the browser claims the vertical axis for its own scrolling
        before the first move event arrives.
      */}
      {!overlayOpen && (
        <button
          type="button"
          className="flex min-h-11 w-full shrink-0 touch-none items-center justify-center md:hidden"
          aria-expanded={expanded}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onKeyDown={onKeyDown}
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
