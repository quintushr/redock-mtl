"use client";

import { useState } from "react";
import { useStrings } from "@/components/LocaleProvider";
import { ChevronDown } from "@/components/icons";
import { approximateDuration, formatMoney } from "@/lib/format";
import type { Strings } from "@/lib/strings";
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

/** Signed, and worded rather than signed with a character. */
function describeDelta(seconds: number, t: Strings): string {
  const magnitude = approximateDuration(Math.abs(seconds), t);
  if (Math.abs(seconds) < 60) return t.noStop.sameTime;
  return seconds < 0
    ? t.noStop.faster(magnitude)
    : t.noStop.slower(magnitude);
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
  const t = useStrings();
  const [shown, setShown] = useState(false);

  // A trip that already needs no stop has nothing to reveal: it is the no-stop
  // trip, and the summary has already said it is free.
  if (stopCount === 0) return null;

  return (
    <div className="mt-4 border-t border-edge pt-3">
      <button
        type="button"
        className="-mx-2 flex min-h-11 w-full items-center gap-1.5 rounded-control px-2 text-left text-xs underline hover:bg-paper"
        aria-expanded={shown}
        onClick={() => setShown((current) => !current)}
      >
        <ChevronDown
          className={[
            "shrink-0 text-muted",
            shown ? "rotate-180" : "",
            "motion-safe:transition-transform motion-safe:duration-150",
          ].join(" ")}
        />
        {shown ? t.noStop.hide : t.noStop.reveal}
      </button>

      {shown &&
        (noStop === null ? (
          <p className="mt-2 text-xs text-muted">
            {t.noStop.nothingToCompare}
          </p>
        ) : (
          <div className="mt-2">
            <p className="text-sm">
              <span className="font-mono font-medium">
                {approximateDuration(noStop.duration, t)}
              </span>{" "}
              {t.noStop.inOneGo(describeDelta(noStop.deltaAgainstPlan, t))}
            </p>

            <p className="mt-1 text-sm">
              {noStop.cost === 0 ? (
                t.noStop.stillFree
              ) : (
                <>
                  {t.noStop.wouldPayBefore}{" "}
                  <span className="font-mono font-medium">
                    {formatMoney(noStop.cost, t)}
                  </span>{" "}
                  {t.noStop.wouldPayAfter(approximateDuration(noStop.overage, t))}
                </>
              )}
            </p>

            {/* FR-130: the amount states the assumptions it rests on. */}
            <p className="mt-1 text-xs text-muted">
              {t.noStop.rateNote(formatMoney(overageRate, t))}
            </p>
          </div>
        ))}
    </div>
  );
}
