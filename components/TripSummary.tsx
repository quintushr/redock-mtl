"use client";

import { useStrings } from "@/components/LocaleProvider";
import { approximateDuration } from "@/lib/format";
import type { Itinerary } from "@/lib/types";

/**
 * The one-glance answer: how long, how many stops, what it costs (FR-105).
 *
 * This is the first thing in the result region and, on a narrow viewport, the
 * only thing visible while the panel is collapsed. It therefore has to answer
 * the whole question on its own.
 *
 * On cost: a planned itinerary is always free. The planner only builds edges
 * whose ride fits the segment budget, so every segment it returns is inside the
 * free window by construction. Saying "free" is a fact about the plan, not a
 * price calculation, which is why nothing here needs the overage rate. What a
 * ride *without* the stops would cost is a different question, and
 * NoStopComparison answers it.
 */
export default function TripSummary({ itinerary }: { itinerary: Itinerary }) {
  const t = useStrings();
  const stops = itinerary.stopCount;

  return (
    <section aria-label={t.summary.label}>
      {/* Monospace, because durations are data: they align down the trail and
          the digits must not dance while a value recomputes. */}
      <p className="font-mono text-[30px] leading-none font-medium">
        {approximateDuration(itinerary.totalDuration, t)}
      </p>

      <p className="mt-2 text-sm">
        {stops === 0 ? t.summary.noStops : t.summary.stops(stops)}
      </p>

      {/* Principle IV: say plainly that these are estimates. */}
      <p className="mt-1 text-xs text-muted">{t.summary.estimate}</p>
    </section>
  );
}
