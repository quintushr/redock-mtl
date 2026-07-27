"use client";

import { useState } from "react";
import { t } from "@/lib/strings";

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
 * The two rest positions below 1024px.
 *
 * Ceilings, not heights. 65dvh is the maximum docs/ui-guidelines.md sets, and a
 * maximum is not a target: a panel holding two fields and one line of hint has
 * no business occupying half the viewport and burying the map behind blank
 * white. The collapsed ceiling is what shows the endpoint fields and the trip
 * summary, which is the "how long, how many stops, is it free" question the
 * summary exists to answer without expanding anything.
 */
const COLLAPSED = "max-h-[45dvh]";
const EXPANDED = "max-h-[65dvh]";

export default function PlannerPanel({
  children,
  footer,
}: {
  children: React.ReactNode;
  /**
   * Pinned below the scroll container, so it is visible at either rest
   * position and whatever the reader has scrolled to. This is where the map
   * credits live, and displaying those is a licence obligation rather than a
   * courtesy, which is why they are not simply the last thing in the scroll.
   */
  footer?: React.ReactNode;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <section
      aria-label={t.panel.label}
      className={[
        // Anchoring below 1024px: a sheet on the bottom edge, square at the
        // bottom because there is nothing to round against the viewport edge.
        "absolute inset-x-0 bottom-0 z-10 flex flex-col",
        "rounded-t-panel border-t border-line bg-panel",
        expanded ? EXPANDED : COLLAPSED,
        // Anchoring at 1024px and above: left, fixed width, 16px margins,
        // rounded on all four corners.
        //
        // `bottom-auto` is the point: anchoring both edges stretched the panel
        // over the whole viewport height whatever it contained, which is how a
        // desktop reader got a white column with its content in the top third.
        // The panel is as tall as what it holds, and stops at the viewport.
        "lg:top-4 lg:right-auto lg:bottom-auto lg:left-4 lg:w-[380px]",
        "lg:max-h-[calc(100dvh-2rem)] lg:rounded-panel lg:border",
        // The ceiling is the only thing that animates, and only when the reader
        // has not asked for stillness.
        "motion-safe:transition-[max-height] motion-safe:duration-200",
      ].join(" ")}
    >
      {/*
        The handle belongs to the bottom anchoring, not to the content, which is
        why it is the one thing hidden at the wide breakpoint. At that width
        there are no rest positions to move between.
      */}
      <button
        type="button"
        className="flex min-h-11 w-full shrink-0 items-center justify-center lg:hidden"
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

      {/*
        The scroll container is a stable node. Opening the assumptions expands a
        region inside it; it never swaps this element out, because a swap loses
        the reading position (FR-122).
      */}
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pt-2 pb-4 lg:pt-4">
        {children}
      </div>

      {footer !== undefined && (
        <div className="shrink-0 border-t border-line px-4 py-2">{footer}</div>
      )}
    </section>
  );
}
