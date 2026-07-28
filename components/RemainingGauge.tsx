"use client";

import { useResolve, useStrings } from "@/components/LocaleProvider";
import { roundedMinutes } from "@/lib/format";
import type { RemainingStatus, Seconds } from "@/lib/types";

/**
 * Free window still in hand on arrival, as a reserve that empties.
 *
 * This is the one element docs/ui-guidelines.md allows to be remarkable, and
 * the only place in the interface allowed a three-state colour code. It reads
 * like the charge gauge on an electric vehicle: a full bar reassures, an empty
 * one alarms, and the direction is legible before the number is.
 *
 * Three bands, three colours, and the figure carries its band's colour too. The
 * middle band used to be grey, which on a typical itinerary left the product's
 * signature element with no colour anywhere on screen.
 *
 * These colours are not the accent, and the accent is not one of them. The
 * accent means "this is your route"; these mean "this is how much slack you
 * have". Two questions, two palettes, deliberately.
 *
 * Three redundant encodings, none of which may be the only one (FR-112): the
 * bar length, the colour band, and the figure in words. Colour is never the
 * sole carrier, so the gauge stays readable to someone who cannot tell the
 * colours apart and to a screen reader, which sees no colour and no bar.
 *
 * Nothing is computed here. `remaining`, `status` and `fraction` all arrive
 * from lib/remaining.ts, which is what stops the three encodings disagreeing
 * (FR-115).
 */

const FILL: Record<RemainingStatus, string> = {
  comfortable: "bg-ok",
  neutral: "bg-warn",
  alarming: "bg-alarm",
};

/**
 * The same three hues, dark enough for 12px text.
 *
 * The fills clear the 3:1 a non-text element owes; not one of them clears the
 * 4,5:1 that text owes. Same hue, same saturation, lightness removed until they
 * pass. See app/globals.css.
 */
const FIGURE: Record<RemainingStatus, string> = {
  comfortable: "text-ok-text",
  neutral: "text-warn-text",
  alarming: "text-alarm-text",
};

export default function RemainingGauge({
  remaining,
  status,
  fraction,
}: {
  remaining: Seconds;
  status: RemainingStatus;
  fraction: number;
  /** Present for callers that word the budget alongside; not rendered here. */
  budget?: Seconds;
}) {
  const t = useStrings();
  const say = useResolve();
  const minutes = roundedMinutes(remaining);
  const label = t.gauge.states[status];
  const spoken = say(t.gauge.spoken, { minutes, state: label });

  return (
    <div className="mt-1.5">
      {/* 6px, on a track dark enough to be seen. A gauge whose empty part is
          invisible is a gauge with no scale to read its fill against. */}
      <div
        className="h-1.5 w-full overflow-hidden rounded-full bg-edge"
        role="img"
        aria-label={spoken}
      >
        <div
          className={`h-full rounded-full ${FILL[status]}`}
          // A zero-width bar reads as a rendering bug rather than as "no slack
          // at all", so the sliver stays. It is the alarming colour, which is
          // the correct signal for a segment with nothing in hand.
          style={{ width: `${Math.max(2, Math.round(fraction * 100))}%` }}
        />
      </div>

      {/* The figure is always present. FR-112 and the quality floor in
          docs/ui-guidelines.md both forbid leaving this to colour. */}
      <p className="mt-1 text-xs text-muted">
        <span className={`font-mono font-medium ${FIGURE[status]}`}>
          {say(t.gauge.remaining, { minutes })}
        </span>{" "}
        {t.gauge.onArrival}
        {/* The qualifier stays secondary: the figure is the datum, this only
            says how to feel about it. */}
        <span className="ml-2">{label}</span>
      </p>
    </div>
  );
}
