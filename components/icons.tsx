/**
 * The two icons the interface needs, drawn here.
 *
 * No icon library: docs/ui-guidelines.md forbids a third-party component
 * library, and two glyphs are not a reason to take a dependency. Both are
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

/** Two arrows trading places: the start and the destination swap. */
export function SwapVertical({ className }: { className?: string }) {
  return (
    <svg {...COMMON} className={className}>
      <path d="M6.5 3.5v13M6.5 3.5L4 6M6.5 3.5L9 6" />
      <path d="M13.5 16.5v-13M13.5 16.5L11 14M13.5 16.5L16 14" />
    </svg>
  );
}
