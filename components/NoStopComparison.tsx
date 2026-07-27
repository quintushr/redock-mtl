"use client";

import { useState } from "react";
import { approximateDuration } from "@/lib/format";
import type { NoStopRide } from "@/lib/types";

/**
 * The same trip ridden without any stop, and what it would cost.
 *
 * This is the most direct demonstration the product has: two stops and a
 * cooldown, or a fee. Showing both and saying nothing more lets the rider
 * decide, which is the only useful thing to do with that trade.
 *
 * It stays open across a parameter change and recomputes with the plan
 * (FR-135). Closing itself the moment the rider moves the safety margin would
 * shut the comparison exactly when they are trying to see the margin's effect
 * on the price, which is the one reason to have both open at once.
 *
 * Nothing is computed here. The ride arrives from lib/pricing.ts.
 */

function formatMoney(amount: number): string {
  return `$${amount.toFixed(2)}`;
}

/** Signed, and worded rather than signed with a character. */
function describeDelta(seconds: number): string {
  const magnitude = approximateDuration(Math.abs(seconds));
  if (Math.abs(seconds) < 60) return "about the same time";
  return seconds < 0 ? `${magnitude} faster` : `${magnitude} slower`;
}

export default function NoStopComparison({
  noStop,
  overageRate,
  stopCount,
}: {
  /** Null when the plan contains no ride to compare (FR-132). */
  noStop: NoStopRide | null;
  overageRate: number;
  stopCount: number;
}) {
  const [shown, setShown] = useState(false);

  // A trip that already needs no stop has nothing to reveal: it is the no-stop
  // trip, and the summary has already said it is free.
  if (stopCount === 0) return null;

  return (
    <div className="mt-4 border-t border-line pt-3">
      <button
        type="button"
        className="text-xs underline"
        aria-expanded={shown}
        onClick={() => setShown((current) => !current)}
      >
        {shown ? "Hide" : "What if I ride it without stopping?"}
      </button>

      {shown &&
        (noStop === null ? (
          <p className="mt-2 text-xs text-muted">
            There is no ride to compare: this trip is walked end to end.
          </p>
        ) : (
          <div className="mt-2">
            <p className="text-sm">
              <span className="font-mono font-medium">
                {approximateDuration(noStop.duration)}
              </span>{" "}
              in one go, {describeDelta(noStop.deltaAgainstPlan)} than{" "}
              {stopCount === 1 ? "the stop" : "the stops"}.
            </p>

            <p className="mt-1 text-sm">
              {noStop.cost === 0 ? (
                <>Still free: it stays inside the free window.</>
              ) : (
                <>
                  You would pay{" "}
                  <span className="font-mono font-medium">
                    {formatMoney(noStop.cost)}
                  </span>{" "}
                  for the {approximateDuration(noStop.overage)} over the window.
                </>
              )}
            </p>

            {/* FR-130: the amount states the assumptions it rests on. */}
            <p className="mt-1 text-xs text-muted">
              Estimated, before taxes, at {formatMoney(overageRate)} per minute.
              Change that rate in the assumptions below.
            </p>
          </div>
        ))}
    </div>
  );
}
