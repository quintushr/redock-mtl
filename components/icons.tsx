/**
 * The few icons the interface needs, drawn here.
 *
 * No icon library: docs/ui-guidelines.md forbids a third-party component
 * library, and four glyphs are not a reason to take a dependency. All are
 * decorative in the accessibility sense, because every control that carries one
 * also carries a name in words, so they are hidden from assistive technology
 * rather than described twice.
 *
 * One stroke width, one cap style, one size. Mixing those is what makes an
 * interface look assembled rather than designed.
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
