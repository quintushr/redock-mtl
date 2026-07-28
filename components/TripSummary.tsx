"use client";

import { useLanguage, useResolve, useStrings } from "@/components/LocaleProvider";
import { approximateDuration, formatMoney } from "@/lib/format";
import { summaryCase } from "@/lib/pricing";
import { fill } from "@/lib/i18n/resolve";
import type { Messages } from "@/components/LocaleProvider";
import type {
  Itinerary,
  NoStopRide,
  PlanningParameters,
  TripCostComparison,
} from "@/lib/types";

/**
 * The one-glance answer: how long, how many stops, and what the stops save.
 *
 * This is the first thing in the result region and, on a narrow viewport, the
 * only thing visible while the panel is collapsed. It therefore has to answer
 * the whole question on its own — which now includes the question the product
 * exists to answer.
 *
 * On cost: this component used to state that a planned itinerary is always
 * free, reasoning that the planner only builds edges whose ride fits the free
 * window. That reasoning was sound until measured geometry started replacing
 * estimated durations, and it is now a claim about the past. The amount is
 * computed (FR-404).
 *
 * On the fold: these figures lived behind a disclosure below the itinerary
 * trail, which made the product's own argument to nobody who had not already
 * scrolled past the answer and chosen to open it. There is no fold here and
 * none may be added (FR-403).
 *
 * On waiting: nothing is priced until the itinerary stops being revised. A
 * currency figure reads as exact in a way a duration does not, so one that
 * corrects itself twice while being read undermines exactly the credibility the
 * comparison exists to build. Durations are not held back; they have always
 * been worded as approximations (FR-408a).
 *
 * It decides nothing. `summaryCase` in lib/pricing.ts chose which of the four
 * things below is true, and this component words it.
 */

/** Signed, and worded rather than marked with a character. */
function describeDelta(seconds: number, t: Messages): string {
  const magnitude = approximateDuration(Math.abs(seconds), t);
  if (Math.abs(seconds) < 60) return t.summary.sameTime;
  return fill(seconds < 0 ? t.summary.faster : t.summary.slower, { magnitude });
}

/** One of the three figures. Monospace, because amounts are data. */
function Figure({ label, amount }: { label: string; amount: string }) {
  return (
    <div className="min-w-0">
      <p className="truncate text-xs text-muted">{label}</p>
      <p className="font-mono text-sm font-medium">{amount}</p>
    </div>
  );
}

function Comparison({
  costs,
  directDuration,
  deltaAgainstPlan,
}: {
  costs: TripCostComparison;
  directDuration: number;
  deltaAgainstPlan: number;
}) {
  const t = useStrings();
  const say = useResolve();
  const lang = useLanguage();

  return (
    <>
      {/*
        Three across, side by side, because the comparison *is* the message and
        stacking them would turn it into three unrelated readings.
      */}
      <div className="mt-3 grid grid-cols-3 gap-3">
        <Figure
          label={t.summary.withStops}
          amount={formatMoney(costs.planned, lang)}
        />
        <Figure
          label={t.summary.withoutStops}
          amount={formatMoney(costs.withoutStops, lang)}
        />
        <Figure
          label={t.summary.saved}
          amount={formatMoney(costs.saved, lang)}
        />
      </div>

      {/* FR-410: the stops cost time and save money. Both halves of the trade. */}
      <p className="mt-2 text-sm">
        <span className="font-mono font-medium">
          {approximateDuration(directDuration, t)}
        </span>{" "}
        {say(t.summary.inOneGo, { delta: describeDelta(deltaAgainstPlan, t) })}
      </p>
    </>
  );
}

export default function TripSummary({
  itinerary,
  noStop,
  settled,
  params,
}: {
  itinerary: Itinerary;
  /** Null when the plan holds no ride to compare (FR-409). */
  noStop: NoStopRide | null;
  /** False while route geometry is outstanding or a correction is running. */
  settled: boolean;
  params: PlanningParameters;
}) {
  const t = useStrings();
  const say = useResolve();
  const lang = useLanguage();
  const stops = itinerary.stopCount;

  const result = summaryCase(itinerary, noStop, settled, params);

  return (
    <section aria-label={t.summary.label}>
      {/* Monospace, because durations are data: they align down the trail and
          the digits must not dance while a value recomputes. */}
      <p className="font-mono text-[30px] leading-none font-medium">
        {approximateDuration(itinerary.totalDuration, t)}
      </p>

      {stops > 0 && (
        <p className="mt-2 text-sm">{say(t.summary.stops, { count: stops })}</p>
      )}

      {/*
        The block that carries the argument. It keeps a floor even while empty,
        so the amounts arriving displaces nothing above or below them (FR-408a).
        jsdom has no layout, so this is the part verified by hand.
      */}
      <div className="min-h-[104px]">
        {result.kind === "pending" && (
          <p className="mt-3 text-sm text-muted" role="status">
            {t.summary.pricingPending}
          </p>
        )}

        {result.kind === "no-stop-needed" &&
          (result.cost === 0 ? (
            <p className="mt-3 text-sm">{t.summary.noStopNeeded}</p>
          ) : (
            <p className="mt-3 text-sm">
              {t.summary.noStopOverBefore}{" "}
              <span className="font-mono font-medium">
                {formatMoney(result.cost, lang)}
              </span>{" "}
              {t.summary.noStopOverAfter}
            </p>
          ))}

        {result.kind === "nothing-saved" && (
          <p className="mt-3 text-sm">{t.summary.savesNothing}</p>
        )}

        {result.kind === "comparison" && (
          <Comparison
            costs={result.costs}
            directDuration={result.directDuration}
            deltaAgainstPlan={result.deltaAgainstPlan}
          />
        )}

        {/*
          FR-407: the assumptions sit with the amounts, never behind a fold and
          never deferred to the expanded panel. An amount a reader cannot
          reconcile against the operator's published price reads as an error.
        */}
        {result.kind === "comparison" && (
          <p className="mt-2 text-xs text-muted">
            {say(t.summary.assumptions, {
              window: approximateDuration(params.freeWindow, t),
              rate: formatMoney(params.overageRate, lang),
            })}
          </p>
        )}
      </div>

      {/* Principle IV: say plainly that these are estimates. */}
      <p className="mt-1 text-xs text-muted">{t.summary.estimate}</p>
    </section>
  );
}
