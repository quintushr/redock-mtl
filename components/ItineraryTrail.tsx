"use client";

import { useStrings } from "@/components/LocaleProvider";
import RemainingGauge from "@/components/RemainingGauge";
import { approximateDuration, formatDistance } from "@/lib/format";
import { gaugeFraction } from "@/lib/remaining";
import type { Strings } from "@/lib/strings";
import type {
  Itinerary,
  ItineraryStep,
  PlanningParameters,
  Station,
} from "@/lib/types";

/**
 * The itinerary as one continuous list (FR-116).
 *
 * Anchor stops are steps in their own right, at the same rank as the start and
 * the destination (FR-117). They are not annotations on another row and not
 * markers that only exist on the map. docs/ui-guidelines.md is explicit: the
 * trail reads top to bottom as a single unbroken list.
 *
 * Two kinds of entry share that list:
 *
 *   node  a place you are at      start, an anchor stop, the destination
 *   leg   a thing you do to move  a walk, a ride
 *
 * The rail runs through both, which is what makes it read as one journey rather
 * than as two interleaved lists.
 *
 * There is no arrival time anywhere in this component, and adding one would
 * break FR-138 and constitution principle IV.
 */

type Entry =
  | { kind: "start" }
  | { kind: "destination" }
  | { kind: "anchor"; stationId: string; cooldown: number }
  | { kind: "walk"; step: Extract<ItineraryStep, { kind: "walk" }> }
  | { kind: "ride"; step: Extract<ItineraryStep, { kind: "bike" }> };

/**
 * Flattens the domain's step list into the trail's entry list.
 *
 * The planner emits a docking stop immediately before the ride that leaves it,
 * so the anchor node lands between its two rides without any reordering here.
 */
function toEntries(steps: ItineraryStep[]): Entry[] {
  const entries: Entry[] = [{ kind: "start" }];

  for (const step of steps) {
    // Exhaustive switch on the discriminant: a new step type becomes a compile
    // error rather than a silently skipped row.
    switch (step.kind) {
      case "walk":
        entries.push({ kind: "walk", step });
        break;
      case "bike":
        entries.push({ kind: "ride", step });
        break;
      case "dock":
        entries.push({
          kind: "anchor",
          stationId: step.stationId,
          cooldown: step.cooldown,
        });
        break;
    }
  }

  entries.push({ kind: "destination" });
  return entries;
}

/**
 * The rail and, for a node, its marker.
 *
 * Three shapes, so a node's role never depends on its position alone (FR-118):
 * a hollow dot with a neutral border is the start, a hollow dot with an accent
 * border is an anchor stop, a filled dot is the destination.
 */
function Rail({
  marker,
  first,
  last,
}: {
  marker: "start" | "anchor" | "destination" | null;
  first: boolean;
  last: boolean;
}) {
  return (
    <div className="relative flex w-4 shrink-0 justify-center" aria-hidden="true">
      <span
        className={[
          "absolute w-[1.5px] bg-edge",
          first ? "top-2 bottom-0" : last ? "top-0 h-2" : "inset-y-0",
        ].join(" ")}
      />
      {/*
      An anchor stop is the one thing on this trail the product exists to
      tell you about, so it is the one marker that carries the accent and
      the one that is larger than the rest: 13px against 9px. The shape
      grammar of docs/ui-guidelines.md is otherwise unchanged, hollow at the
      start, hollow with an accent ring at a stop, filled at the end.
      */}
      {marker !== null && (
        <span
          className={[
            "relative rounded-full",
            marker === "anchor"
              ? "mt-0.5 h-[13px] w-[13px] border-2 border-brand bg-panel"
              : "mt-1 h-[9px] w-[9px]",
            marker === "destination"
              ? "bg-ink"
              : marker === "start"
                ? "border-[1.5px] border-muted bg-panel"
                : "",
          ].join(" ")}
        />
      )}
    </div>
  );
}

function EntryRow({
  entry,
  first,
  last,
  stationName,
  params,
  t,
}: {
  entry: Entry;
  first: boolean;
  last: boolean;
  stationName: (id: string) => string;
  params: PlanningParameters;
  t: Strings;
}) {
  const marker =
    entry.kind === "start" || entry.kind === "anchor" || entry.kind === "destination"
      ? entry.kind
      : null;

  return (
    <li className="flex gap-3">
      <Rail marker={marker} first={first} last={last} />
      <div className="min-w-0 flex-1 pb-4">{content()}</div>
    </li>
  );

  function content() {
    switch (entry.kind) {
      case "start":
        return <p className="text-sm font-medium">{t.trail.start}</p>;

      case "destination":
        return <p className="text-sm font-medium">{t.trail.destination}</p>;

      case "anchor":
        return (
          <>
            <p className="text-sm font-medium">
              {stationName(entry.stationId)}
            </p>
            <p className="text-xs text-muted">
              {t.trail.anchor(approximateDuration(entry.cooldown, t))}
              {/* FR-114: the wait costs time but buys a fresh window. */}
              <span className="ml-1">{t.trail.anchorResets}</span>
            </p>
          </>
        );

      case "walk":
        // FR-114: walking never spends the free window, so it carries no gauge
        // and says so rather than leaving the reader to infer it.
        return (
          <>
            <p className="text-sm">
              {entry.step.toStationId !== null
                ? t.trail.walkTo(stationName(entry.step.toStationId))
                : t.trail.walkToDestination}
            </p>
            <p className="text-xs text-muted">
              {approximateDuration(entry.step.duration, t)} ·{" "}
              {formatDistance(entry.step.distance, t)}
              <span className="ml-1">{t.trail.walkFree}</span>
            </p>
          </>
        );

      case "ride":
        // The only entry that carries a gauge, because riding is the only thing
        // that spends the free window (FR-108, FR-114).
        return (
          <>
            <p className="text-sm">
              {t.trail.rideTo(stationName(entry.step.toStationId))}
            </p>
            <p className="text-xs text-muted">
              {approximateDuration(entry.step.duration, t)} ·{" "}
              {formatDistance(entry.step.distance, t)}
            </p>
            <RemainingGauge
              remaining={entry.step.remaining}
              status={entry.step.remainingStatus}
              fraction={gaugeFraction(entry.step.remaining, params)}
            />
          </>
        );
    }
  }
}

export default function ItineraryTrail({
  itinerary,
  stations,
  params,
}: {
  itinerary: Itinerary;
  stations: Station[];
  /** For the gauge's denominator only. No figure is recomputed here. */
  params: PlanningParameters;
}) {
  const t = useStrings();
  const names = new Map(stations.map((s) => [s.id, s.name]));
  const stationName = (id: string): string =>
    names.get(id) ?? t.trail.unknownStation(id);

  const entries = toEntries(itinerary.steps);

  return (
    <>
      <ol aria-label={t.trail.label}>
        {entries.map((entry, index) => (
          <EntryRow
            key={index}
            entry={entry}
            first={index === 0}
            last={index === entries.length - 1}
            stationName={stationName}
            params={params}
            t={t}
          />
        ))}
      </ol>

      {/*
        The caveat in words, next to the list it qualifies, because the map
        cannot carry it: docs/ui-guidelines.md allows no second container over
        the map, and a dashed line alone does not say why it is dashed.
      */}
      <p className="text-xs text-muted">{t.trail.traceIsIndicative}</p>
    </>
  );
}
