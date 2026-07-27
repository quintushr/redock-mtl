"use client";

import { roundedMinutes } from "@/lib/format";
import { t } from "@/lib/strings";
import type { RemainingStatus, Seconds } from "@/lib/types";

/**
 * Free window still in hand on arrival, as a reserve that empties.
 *
 * This is the one element docs/ui-guidelines.md allows to be remarkable, and
 * the only place in the interface allowed a three-state colour code. It reads
 * like the charge gauge on an electric vehicle: a full bar reassures, an empty
 * one alarms, and the direction is legible before the number is.
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
  neutral: "bg-muted",
  alarming: "bg-warn",
};

const TEXT: Record<RemainingStatus, string> = {
  comfortable: "text-ok",
  neutral: "text-muted",
  alarming: "text-warn",
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
  const minutes = roundedMinutes(remaining);
  const label = t.gauge.states[status];
  const spoken = t.gauge.spoken(minutes, label);

  return (
    <div className="mt-1.5">
      <div
        className="h-2 w-full overflow-hidden rounded-full bg-line"
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
        <span className="font-mono">{t.gauge.remaining(minutes)}</span>{" "}
        {t.gauge.onArrival}
        <span className={`ml-2 font-medium ${TEXT[status]}`}>{label}</span>
      </p>
    </div>
  );
}
