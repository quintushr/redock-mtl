/**
 * The few icons the interface needs, drawn here.
 *
 * No icon library: docs/ui-guidelines.md forbids a third-party component
 * library, and a dozen glyphs are not a reason to take a dependency. All are
 * decorative in the accessibility sense, because every control and every row
 * that carries one also carries a name in words, so they are hidden from
 * assistive technology rather than described twice.
 *
 * One stroke width, one cap style, one size, one 20×20 box. Mixing those is
 * what makes an interface look assembled rather than designed, and it is why
 * `COMMON` is spread into every glyph below rather than copied. Nothing here
 * takes a size prop: an icon set with per-call sizes is not a set.
 */

const COMMON = {
  width: 20,
  height: 20,
  viewBox: "0 0 20 20",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.5,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
  focusable: false,
};

/** Points down when closed, up when open. Rotation is the caller's business. */
export function ChevronDown({ className }: { className?: string }) {
  return (
    <svg {...COMMON} className={className}>
      <path d="M5 8l5 5 5-5" />
    </svg>
  );
}

/** Clears a field. Never used without a name in words on the control. */
export function Cross({ className }: { className?: string }) {
  return (
    <svg {...COMMON} className={className}>
      <path d="M6 6l8 8M14 6l-8 8" />
    </svg>
  );
}

/** Arms the map: the next tap on it places this end of the trip. */
export function Crosshair({ className }: { className?: string }) {
  return (
    <svg {...COMMON} className={className}>
      <circle cx="10" cy="10" r="4.5" />
      <path d="M10 2v2.5M10 15.5V18M2 10h2.5M15.5 10H18" />
    </svg>
  );
}

/**
 * Opens the settings. Three tracks with a handle each, which is what the
 * controls behind it actually are.
 */
export function Sliders({ className }: { className?: string }) {
  return (
    <svg {...COMMON} className={className}>
      <path d="M3 5.5h14M3 10h14M3 14.5h14" />
      <circle cx="7" cy="5.5" r="1.75" fill="currentColor" stroke="none" />
      <circle cx="13" cy="10" r="1.75" fill="currentColor" stroke="none" />
      <circle cx="8.5" cy="14.5" r="1.75" fill="currentColor" stroke="none" />
    </svg>
  );
}

/** Asks the station feed again. */
export function Refresh({ className }: { className?: string }) {
  return (
    <svg {...COMMON} className={className}>
      <path d="M16.5 10a6.5 6.5 0 1 1-1.9-4.6" />
      <path d="M16.5 3v3.5H13" />
    </svg>
  );
}

/** Two arrows trading places: the start and the destination swap. */
export function SwapVertical({ className }: { className?: string }) {
  return (
    <svg {...COMMON} className={className}>
      <path d="M6.5 3.5v13M6.5 3.5L4 6M6.5 3.5L9 6" />
      <path d="M13.5 16.5v-13M13.5 16.5L11 14M13.5 16.5L16 14" />
    </svg>
  );
}

/* -------------------------------------------------------------------------
 * The trip's own vocabulary: walk, ride, dock, start, destination.
 *
 * These five carry what the trail used to spell out in a sentence per row.
 * They are one family on purpose — same box, same stroke, same joins — because
 * the row is now icon, name, duration and the icon is the only thing saying
 * *what kind of thing this is*. Five glyphs from five sources would put that
 * job on five different visual languages.
 *
 * The start and the destination are the same two marks in the entry block and
 * in the trail, which is what lets a reader learn the grammar once: a hollow
 * ring is where you are leaving from, a pin is where you are going.
 * ---------------------------------------------------------------------- */

/** A walking leg. Never carries a gauge: walking does not spend the window. */
export function Walk({ className }: { className?: string }) {
  return (
    <svg {...COMMON} className={className}>
      <circle cx="11.25" cy="3.75" r="1.75" />
      <path d="M11.75 7.25 10 11.5l2.25 1.75.75 4" />
      <path d="M10 11.5 7.5 15" />
      <path d="M11.25 8.5 14 10l1.75-.5" />
    </svg>
  );
}

/** A ride. The only leg that spends the free window, so the only one gauged. */
export function Bike({ className }: { className?: string }) {
  return (
    <svg {...COMMON} className={className}>
      <circle cx="5" cy="13.5" r="3.25" />
      <circle cx="15" cy="13.5" r="3.25" />
      <path d="M5 13.5h4l3.5-6.5" />
      <path d="M8 7h2.5l4.5 6.5" />
    </svg>
  );
}

/** An anchor stop. The one thing on the trail this product exists to tell you. */
export function Anchor({ className }: { className?: string }) {
  return (
    <svg {...COMMON} className={className}>
      <circle cx="10" cy="4.2" r="2" />
      <path d="M10 18.3V6.4" />
      <path d="M4.2 10H1.8a8.2 8.2 0 0 0 16.4 0h-2.4" />
    </svg>
  );
}

/** Where the trip begins. Hollow, because you are not there any more. */
export function Origin({ className }: { className?: string }) {
  return (
    <svg {...COMMON} className={className}>
      <circle cx="10" cy="10" r="4.25" />
    </svg>
  );
}

/** Where the trip ends. The pin, in both the entry block and the trail. */
export function Destination({ className }: { className?: string }) {
  return (
    <svg {...COMMON} className={className}>
      <path d="M16.5 8.3c0 5-6.5 9.9-6.5 9.9S3.5 13.3 3.5 8.3a6.5 6.5 0 0 1 13 0" />
      <circle cx="10" cy="8.3" r="2.4" />
    </svg>
  );
}

/** The winning cell of the cost comparison. */
export function Check({ className }: { className?: string }) {
  return (
    <svg {...COMMON} className={className}>
      <path d="M4.5 10.5 8 14l7.5-8" />
    </svg>
  );
}

/**
 * A segment with nothing left in hand on arrival.
 *
 * The gauge used to end in an adjective. The colour band alone would leave the
 * state to colour, which the quality floor forbids, so the alarming band gets a
 * mark of its own instead of a word.
 */
export function Alert({ className }: { className?: string }) {
  return (
    <svg {...COMMON} className={className}>
      <path d="M8.6 2.9 1.6 14.6a1.6 1.6 0 0 0 1.4 2.4h14a1.6 1.6 0 0 0 1.4-2.4L11.4 2.9a1.6 1.6 0 0 0-2.8 0" />
      <path d="M10 7.5v3.3" />
      <path d="M10 14.2h.01" />
    </svg>
  );
}

/**
 * The theme control, in its two states.
 *
 * Each glyph shows the theme the press will *produce*, not the one in force: a
 * moon means "go dark". That is the convention every reader has already learned
 * elsewhere, and the accessible name says it in words either way, so the icon
 * never has to carry the direction alone.
 */
export function Moon({ className }: { className?: string }) {
  return (
    <svg {...COMMON} className={className}>
      <path d="M16.5 11.75A6.75 6.75 0 0 1 8.25 3.5a6.75 6.75 0 1 0 8.25 8.25" />
    </svg>
  );
}

export function Sun({ className }: { className?: string }) {
  return (
    <svg {...COMMON} className={className}>
      <circle cx="10" cy="10" r="3.5" />
      <path d="M10 1.5v2M10 16.5v2M1.5 10h2M16.5 10h2M4 4l1.4 1.4M14.6 14.6 16 16M16 4l-1.4 1.4M5.4 14.6 4 16" />
    </svg>
  );
}

/**
 * A leg whose path was not measured.
 *
 * The same discontinuity the map draws on that segment, so the two readings of
 * "this one was not checked" are the same mark. The status in words rides along
 * beside it for screen readers, which see neither the dashes nor the map.
 */
export function Dashed({ className }: { className?: string }) {
  return (
    <svg {...COMMON} className={className}>
      <path d="M2.5 10h3M8.5 10h3M14.5 10h3" />
    </svg>
  );
}
