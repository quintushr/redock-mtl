"use client";

import { budgetLabel } from "@/lib/budget";
import type { BudgetStatus } from "@/lib/types";

/**
 * Free-window consumption for one bike segment.
 *
 * Three redundant encodings (FR-018a): the bar length, the colour band, and a
 * text label. Colour is never the only carrier (FR-018b), so the segment stays
 * readable to someone who cannot distinguish the colours and to a screen reader,
 * which sees no colour at all.
 *
 * All three derive from lib/budget.ts, so they cannot disagree.
 */

const BAR_COLOUR: Record<BudgetStatus, string> = {
  comfortable: "bg-emerald-600",
  moderate: "bg-amber-500",
  tight: "bg-rose-600",
};

const TEXT_COLOUR: Record<BudgetStatus, string> = {
  comfortable: "text-emerald-700 dark:text-emerald-400",
  moderate: "text-amber-700 dark:text-amber-400",
  tight: "text-rose-700 dark:text-rose-400",
};

export default function SegmentBudget({
  share,
  status,
  durationLabel,
}: {
  share: number;
  status: BudgetStatus;
  durationLabel: string;
}) {
  const percent = Math.round(share * 100);
  const label = budgetLabel(status);

  return (
    <div className="mt-1.5">
      <div
        className="h-2 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800"
        role="img"
        aria-label={`${durationLabel}, about ${percent} percent of the free window, ${label}`}
      >
        <div
          className={`h-full rounded-full ${BAR_COLOUR[status]}`}
          style={{ width: `${Math.max(2, percent)}%` }}
        />
      </div>
      <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
        {/* Numbers for those who want them, the label for those who do not. */}
        about {percent}% of the free window
        <span className={`ml-2 font-medium ${TEXT_COLOUR[status]}`}>{label}</span>
      </p>
    </div>
  );
}
