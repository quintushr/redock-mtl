"use client";

import { useStrings } from "@/components/LocaleProvider";
import { approximateDuration } from "@/lib/format";
import type { Seconds } from "@/lib/types";

/**
 * The first screen.
 *
 * It used to be one grey sentence saying a plan would appear once two points
 * were entered, which is a statement of vacancy rather than an invitation.
 * docs/ui-guidelines.md asks the opposite, and this screen has a harder job
 * than most empty states: the product's mechanism is not self-evident. Nobody
 * arrives knowing that docking a bike restarts the free window, and without
 * that fact the result makes no sense either.
 *
 * So it teaches exactly one thing, in one sentence, and then shows the shape of
 * the answer using the same rail and the same three markers the itinerary trail
 * uses. A reader who has seen this recognises the result when it arrives, and
 * has already learnt the marker grammar. It is three rows, not a wall of text.
 *
 * The free window is read from the parameters rather than written in, because
 * it is adjustable and a hard-coded "45 min" would start lying the moment
 * someone changed their plan.
 */

function Row({
  marker,
  label,
  note,
  last = false,
}: {
  marker: "start" | "anchor" | "destination";
  label: string;
  note?: string;
  last?: boolean;
}) {
  return (
    <li className="flex gap-3">
      <div
        className="relative flex w-4 shrink-0 justify-center"
        aria-hidden="true"
      >
        <span
          className={[
            "absolute w-[1.5px] bg-line",
            last ? "top-0 h-2" : "inset-y-0",
          ].join(" ")}
        />
        <span
          className={[
            "relative mt-1 h-[9px] w-[9px] rounded-full",
            marker === "destination"
              ? "bg-ink"
              : marker === "anchor"
                ? "border-[1.5px] border-brand bg-panel"
                : "border-[1.5px] border-muted bg-panel",
          ].join(" ")}
        />
      </div>
      <div className="min-w-0 flex-1 pb-3">
        <p className="text-sm">{label}</p>
        {note !== undefined && <p className="text-xs text-muted">{note}</p>}
      </div>
    </li>
  );
}

export default function EmptyState({ freeWindow }: { freeWindow: Seconds }) {
  const t = useStrings();

  return (
    <section aria-label={t.empty.label}>
      <p className="text-base font-medium">{t.empty.title}</p>
      <p className="mt-1 text-sm text-muted">
        {t.empty.lead(approximateDuration(freeWindow, t))}
      </p>

      <ol className="mt-4">
        <Row marker="start" label={t.empty.start} />
        <Row marker="anchor" label={t.empty.anchor} note={t.empty.anchorNote} />
        <Row marker="destination" label={t.empty.destination} last />
      </ol>

      <p className="text-sm">{t.empty.call}</p>
    </section>
  );
}
