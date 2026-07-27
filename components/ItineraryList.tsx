"use client";

import SegmentBudget from "@/components/SegmentBudget";
import type { Itinerary, ItineraryStep, Station } from "@/lib/types";

/**
 * The itinerary as an ordered step list.
 *
 * Durations are always approximations (FR-020). There is no arrival time
 * anywhere in this component, and adding one would break both FR-020 and
 * constitution principle IV.
 */

/**
 * Rounds to a coarse figure and words it as an estimate. Never a precise
 * minute count, because a precise number reads as a promise.
 */
function approximate(seconds: number): string {
  const minutes = seconds / 60;
  if (minutes < 1) return "under a minute";
  if (minutes < 10) return `about ${Math.round(minutes)} min`;
  // Beyond ten minutes, round to five so the figure cannot be mistaken for a
  // measurement.
  return `about ${Math.round(minutes / 5) * 5} min`;
}

function formatDistance(metres: number): string {
  return metres < 1000
    ? `${Math.round(metres / 10) * 10} m`
    : `${(metres / 1000).toFixed(1)} km`;
}

function Step({
  step,
  stationName,
}: {
  step: ItineraryStep;
  stationName: (id: string) => string;
}) {
  // Exhaustive switch on the discriminant: a new step type becomes a compile
  // error rather than a silently skipped row.
  switch (step.kind) {
    case "walk":
      return (
        <li className="border-l-2 border-dashed border-zinc-300 py-3 pl-4 dark:border-zinc-700">
          <p className="text-sm font-medium">
            Walk{" "}
            {step.toStationId !== null
              ? `to ${stationName(step.toStationId)}`
              : "to your destination"}
          </p>
          <p className="text-xs text-zinc-600 dark:text-zinc-400">
            {approximate(step.duration)} · {formatDistance(step.distance)}
            {/* FR-019: walking never spends the free window. */}
            <span className="ml-2 italic">does not use the free window</span>
          </p>
        </li>
      );

    case "dock":
      return (
        <li className="border-l-2 border-dashed border-zinc-300 py-3 pl-4 dark:border-zinc-700">
          <p className="text-sm font-medium">
            Dock at {stationName(step.stationId)}, then take the same bike again
          </p>
          <p className="text-xs text-zinc-600 dark:text-zinc-400">
            {approximate(step.cooldown)} wait
            <span className="ml-2 italic">resets the free window</span>
          </p>
        </li>
      );

    case "bike":
      return (
        <li className="border-l-2 border-solid border-zinc-400 py-3 pl-4 dark:border-zinc-500">
          <p className="text-sm font-medium">
            Ride to {stationName(step.toStationId)}
          </p>
          <p className="text-xs text-zinc-600 dark:text-zinc-400">
            {approximate(step.duration)} · {formatDistance(step.distance)}
          </p>
          <SegmentBudget
            share={step.budgetShare}
            status={step.budgetStatus}
            durationLabel={approximate(step.duration)}
          />
        </li>
      );
  }
}

export default function ItineraryList({
  itinerary,
  stations,
}: {
  itinerary: Itinerary;
  stations: Station[];
}) {
  const names = new Map(stations.map((s) => [s.id, s.name]));
  const stationName = (id: string): string => names.get(id) ?? `station ${id}`;

  return (
    <section aria-label="Itinerary">
      <header className="mb-3">
        <p className="text-lg font-semibold">
          {approximate(itinerary.totalDuration)} in total
        </p>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          {itinerary.stopCount === 0
            ? "No stops needed"
            : `${itinerary.stopCount} ${itinerary.stopCount === 1 ? "stop" : "stops"} to stay inside the free window`}
        </p>
        <p className="mt-1 text-xs text-zinc-500">
          {/* Principle IV: say plainly that these are estimates. */}
          Durations are estimates, not arrival times.
        </p>
      </header>

      <ol>
        {itinerary.steps.map((step, index) => (
          <Step key={index} step={step} stationName={stationName} />
        ))}
      </ol>
    </section>
  );
}
