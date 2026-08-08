"use client";

import { useLanguage, useResolve, useStrings } from "@/components/LocaleProvider";
import { Check } from "@/components/icons";
import { approximateDuration, formatMoney } from "@/lib/format";
import { summaryCase } from "@/lib/pricing";
import type { Itinerary, NoStopRide, PlanningParameters } from "@/lib/types";

/**
 * The one-glance answer: what the stops save, how long, how many.
 *
 * This is the first thing in the result region and, on a narrow viewport, the
 * only thing visible while the panel is collapsed. It therefore has to answer
 * the whole question on its own — which now includes the question the product
 * exists to answer.
 *
 * On the comparison. It used to be three labelled figures and two sentences,
 * one of them arithmetic the reader had to perform in their head. It is two
 * cells now, per the "Comparaison de coût" section of docs/ui-guidelines.md:
 * side by side, equal width, the winning one tinted and ticked, the losing one
 * struck through. Which is cheaper is legible before either number is read,
 * which is the whole point of not writing it as a sentence.
 *
 * The block sits above the total duration, not below it. It is the product's
 * argument; the total is the answer to a question the reader already knew they
 * had.
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
 * things below is true, and this component draws it.
 */

/**
 * One side of the comparison.
 *
 * `tone` is what the cell means, not how it looks: the winning side is the one
 * the reader should take, the losing side is the one they are being shown the
 * price of, and neutral is both sides when the stops change nothing.
 *
 * The tint is a translucent lay of the state colour over whatever is beneath,
 * never an opaque colour typed in by hand. That is what keeps the two cells
 * reading as the same surface at two weights instead of as two materials.
 */
function Cell({
  tone,
  label,
  amount,
  note,
}: {
  tone: "winning" | "losing" | "neutral";
  label: string;
  amount: string;
  /** A second datum under the amount. The direct ride's time, on the losing side. */
  note?: string;
}) {
  const winning = tone === "winning";

  return (
    <div
      className={[
        "min-w-0 rounded-control border p-2",
        winning ? "border-ok-wash-line bg-ok-wash" : "border-edge",
      ].join(" ")}
    >
      <p className="flex h-5 items-center gap-1 text-xs text-muted">
        {winning && (
          <span className="shrink-0 text-ok-deep">
            <Check />
          </span>
        )}
        <span className="truncate">{label}</span>
      </p>

      {/* Monospace, because amounts are data and these two are read against
          each other. A proportional font makes two prices of the same length
          different widths, which is the one thing a comparison cannot afford. */}
      <p
        className={[
          "mt-1 truncate font-mono text-base leading-tight font-medium",
          winning
            ? "text-ok-deep"
            : tone === "losing"
              ? "text-muted line-through"
              : "text-ink",
        ].join(" ")}
      >
        {amount}
      </p>

      {note !== undefined && (
        <p className="truncate font-mono text-xs text-muted">{note}</p>
      )}
    </div>
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
      {/*
        The block that carries the argument, and the first thing in the result
        region. It keeps a floor even while empty, so the amounts arriving
        displaces nothing below them (FR-408a).

        78px is the resolved block's own height, not a guess: 1px border, 8px
        pad, a 20px label row, 4px, a 20px amount, a 16px note, 8px pad, 1px
        border. Every other case of `SummaryCase` is one or two lines of 14px
        and fits inside it. jsdom has no layout, so this is the part verified by
        hand.
      */}
      <div className="min-h-[78px]">
        {result.kind === "pending" && (
          <p className="text-sm text-muted" role="status">
            {t.summary.pricingPending}
          </p>
        )}

        {result.kind === "no-stop-needed" &&
          (result.cost === 0 ? (
            <p className="text-sm">{t.summary.noStopNeeded}</p>
          ) : (
            <p className="text-sm">
              {t.summary.noStopOverBefore}{" "}
              <span className="font-mono font-medium">
                {formatMoney(result.cost, lang)}
              </span>{" "}
              {t.summary.noStopOverAfter}
            </p>
          ))}

        {/*
          Stops that save nothing.

          docs/ui-guidelines.md says the two cells go neutral here and a single
          label states it. They are not drawn at all, and that is a deliberate
          departure worth recording. `SummaryCase` hands this branch one figure,
          not a pair: the branch is *defined* by the direct ride costing
          nothing, so the second cell could only be a zero this component typed
          in itself, restating a domain invariant in a render body. Two
          identical zeros under a tick-free heading is also the reading FR-406a
          names outright — a pair of matching figures invites the reader to hunt
          for the mistake and answers a question nobody asked.

          What the guideline is actually protecting is that the reader be told,
          not made to infer it from a zero. The label does that.
        */}
        {result.kind === "nothing-saved" && (
          <p className="text-sm">{t.summary.savesNothing}</p>
        )}

        {result.kind === "comparison" && (
          <div className="grid grid-cols-2 gap-2">
            <Cell
              tone="winning"
              label={t.summary.withStops}
              amount={formatMoney(result.costs.planned, lang)}
            />
            {/*
              The losing side carries the direct ride's time as well as its
              price, because the stops cost time and save money and a reader
              choosing between them needs both halves of that trade (FR-410).
              It used to be a sentence built around a signed delta; the delta
              is now the gap between this figure and the total below it, both
              set in the same monospace column so they subtract by eye.
            */}
            <Cell
              tone="losing"
              label={t.summary.withoutStops}
              amount={formatMoney(result.costs.withoutStops, lang)}
              note={approximateDuration(result.directDuration, t)}
            />
          </div>
        )}
      </div>

      {/* Monospace, because durations are data: they align down the trail and
          the digits must not dance while a value recomputes. */}
      <p className="mt-2 font-mono text-[30px] leading-none font-medium md:mt-3">
        {approximateDuration(itinerary.totalDuration, t)}
      </p>

      {stops > 0 && (
        <p className="mt-1 text-sm md:mt-1.5">
          {say(t.summary.stops, { count: stops })}
        </p>
      )}

      {/*
        Nothing follows the stop count.

        Two lines used to: the pricing assumptions (mechanical bike, the free
        window, the per-minute rate, taxes excluded) and the standing note that
        the durations are estimates rather than arrival times. Both were removed
        on request, and both are worth recording as gone rather than moved,
        because each was answering something.

        The assumptions were FR-407: they are what let a reader reconcile "3,46
        $" against the operator's own published price. Without them the amount
        is a number this application asserts, and the free window and rate it
        rests on are only discoverable by opening the settings. The estimate
        line was principle IV and FR-138. The figures are still rounded to five
        minutes and still cannot produce a clock time, so nothing here has
        become a promise — but the interface no longer says so.
      */}
    </section>
  );
}
