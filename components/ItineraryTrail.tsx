"use client";

import { useResolve, useStrings } from "@/components/LocaleProvider";
import RemainingGauge from "@/components/RemainingGauge";
import { Anchor, Bike, Dashed, Destination, Origin, Walk } from "@/components/icons";
import { approximateDuration } from "@/lib/format";
import { gaugeFraction } from "@/lib/remaining";
import type { Messages } from "@/components/LocaleProvider";
import type {
  Itinerary,
  ItineraryStep,
  PathStatus,
  PlanningParameters,
  Station,
  StepGeometry,
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
 * On density. A row is an icon, a name and a duration, and nothing else. The
 * verb each row used to open with ("Marche jusqu'à", "Roule jusqu'à") is the
 * icon now.
 *
 * The qualifiers that used to trail every row — "n'entame pas la fenêtre
 * gratuite" on each walk, "remet la fenêtre gratuite à zéro" on each stop —
 * went into a legend under the list, and the legend has since been removed on
 * request. They are not stated anywhere any more. That is a real gap and not a
 * tidy-up: those two facts are the mechanism the whole product rests on, and a
 * first-time reader now has to infer from a missing gauge that walking is free,
 * and from a wait with no explanation that docking is what buys the next free
 * window. Nothing in this component or the summary tells them.
 *
 * A segment's state is read off the gauge, its colour, and a mark — never off
 * an adjective at the end of a line. The trace status keeps its word for screen
 * readers, which see neither the mark nor the map, and it is the only text on a
 * row that is not drawn.
 *
 * The line under the list is gone too, removed on request. It said which of
 * three things the map's trace was — every leg measured, some legs measured, or
 * none — and it was the only thing that said so. What remains is the dashed
 * mark on the rows themselves, which reports the same fact per leg but says
 * nothing about the line drawn on the map. So a straight segment across the
 * river now asserts a route nobody checked, and FR-311's requirement that no
 * global claim be false for any part is met only by there no longer being a
 * global claim.
 *
 * There is no arrival time anywhere in this component, and adding one would
 * break FR-138 and constitution principle IV.
 */

type Entry =
  | { kind: "start" }
  | { kind: "destination" }
  | { kind: "anchor"; stationId: string; cooldown: number }
  | {
      kind: "walk";
      step: Extract<ItineraryStep, { kind: "walk" }>;
      status: PathStatus;
    }
  | {
      kind: "ride";
      step: Extract<ItineraryStep, { kind: "bike" }>;
      status: PathStatus;
    };

/**
 * The status word for one leg (FR-307, FR-308, FR-309).
 *
 * Not drawn. It is announced, beside the mark that carries the same claim
 * visually, so a rider who cannot see the dashes is still told which parts of
 * their journey were checked and which were guessed at. This is an accessible
 * name, not a hover: nothing on this row reveals itself to a pointer, because
 * most readers do not have one.
 */
function statusWord(status: PathStatus, t: Messages): string {
  switch (status) {
    case "traced":
      return t.trail.pathTraced;
    case "approximate":
      return t.trail.pathApproximate;
    case "pending":
      return t.trail.pathPending;
  }
}

/**
 * Flattens the domain's step list into the trail's entry list.
 *
 * The planner emits a docking stop immediately before the ride that leaves it,
 * so the anchor node lands between its two rides without any reordering here.
 */
function toEntries(
  steps: ItineraryStep[],
  geometry: StepGeometry[] | null,
): Entry[] {
  const entries: Entry[] = [{ kind: "start" }];

  // Geometry is index-aligned with steps. Absent entirely before a refinement
  // has opened, which reads as "not asked yet" rather than as "no path".
  const statusAt = (index: number): PathStatus =>
    geometry?.[index]?.status ?? "pending";

  steps.forEach((step, index) => {
    // Exhaustive switch on the discriminant: a new step type becomes a compile
    // error rather than a silently skipped row.
    switch (step.kind) {
      case "walk":
        entries.push({ kind: "walk", step, status: statusAt(index) });
        break;
      case "bike":
        entries.push({ kind: "ride", step, status: statusAt(index) });
        break;
      case "dock":
        entries.push({
          kind: "anchor",
          stationId: step.stationId,
          cooldown: step.cooldown,
        });
        break;
    }
  });

  entries.push({ kind: "destination" });
  return entries;
}

/**
 * The rail, and the entry's icon sitting on it.
 *
 * One family, one 20px box, one stroke, whatever the row is: the ring you left
 * from, the walk, the bike, the anchor, the pin you are going to. The rail is
 * drawn behind and the icon is painted on the panel colour, so the line joins
 * the marks rather than striking through them.
 *
 * The accent is on the anchor and nowhere else in this column. That is the one
 * thing on the trail this product exists to tell you about, and
 * docs/ui-guidelines.md reserves the accent for exactly this kind of use.
 */
function Rail({ entry, last }: { entry: Entry; last: boolean }) {
  const glyph = {
    start: <Origin />,
    walk: <Walk />,
    ride: <Bike />,
    anchor: <Anchor />,
    destination: <Destination />,
  }[entry.kind];

  const tint =
    entry.kind === "anchor"
      ? "text-brand"
      : entry.kind === "destination" || entry.kind === "start"
        ? "text-ink"
        : "text-muted";

  return (
    <div
      // `items-start` is load-bearing. Stretched, the icon's span would be as
      // tall as the row and its panel-coloured background would paint over the
      // whole rail rather than the 20px it occupies — a trail with no line.
      className="relative flex w-5 shrink-0 items-start justify-center"
      aria-hidden="true"
    >
      {/*
        Full height, and masked where the icon sits: the icon is at the top of
        the row and carries the panel colour, so the segment above it never
        shows and only the run down to the next row does. The last row draws no
        line at all, because there is nothing below the destination to join.
      */}
      {!last && <span className="absolute inset-y-0 w-[1.5px] bg-edge" />}
      <span className={`relative bg-panel ${tint}`}>{glyph}</span>
    </div>
  );
}

/**
 * One row: an icon, a name, a duration.
 *
 * The duration column is monospace and right-aligned, so the figures form a
 * column down the trail and can be compared without being read one by one.
 */
function EntryRow({
  entry,
  last,
  stationName,
  params,
  t,
}: {
  entry: Entry;
  last: boolean;
  stationName: (id: string) => string;
  params: PlanningParameters;
  t: Messages;
}) {
  /**
   * Where this row takes you, or null when the row below already says it.
   *
   * The last walk has no name. Its target is the destination, and the
   * destination is the very next row with the pin on it; writing it twice, two
   * lines apart, is the sort of repetition the density rule exists to stop. The
   * walk icon and the duration are the whole of what that row has to add.
   */
  const name = (() => {
    switch (entry.kind) {
      case "start":
        return t.trail.start;
      case "destination":
        return t.trail.destination;
      case "anchor":
        return stationName(entry.stationId);
      case "walk":
        return entry.step.toStationId === null
          ? null
          : stationName(entry.step.toStationId);
      case "ride":
        return stationName(entry.step.toStationId);
    }
  })();

  const duration = (() => {
    switch (entry.kind) {
      case "start":
      case "destination":
        return null;
      case "anchor":
        return approximateDuration(entry.cooldown, t);
      case "walk":
      case "ride":
        return approximateDuration(entry.step.duration, t);
    }
  })();

  const status = entry.kind === "walk" || entry.kind === "ride" ? entry.status : null;

  return (
    <li className="flex gap-2">
      <Rail entry={entry} last={last} />

      <div className="min-w-0 flex-1 pb-3">
        <div className="flex min-h-5 items-center gap-2">
          {name === null ? (
            <span className="flex-1" />
          ) : (
            <p
              className={[
                "min-w-0 flex-1 truncate text-sm",
                entry.kind === "start" ||
                entry.kind === "destination" ||
                entry.kind === "anchor"
                  ? "font-medium"
                  : "",
              ].join(" ")}
            >
              {name}
            </p>
          )}

          {/*
            A mark, not a word. It appears only on a leg whose path was not
            measured, so an untroubled trail carries nothing here at all; the
            word rides along for screen readers and is announced on every leg,
            traced ones included, because "this one was checked" is the half a
            rider most needs to hear.
          */}
          {status !== null && (
            <span className="shrink-0 text-muted">
              {status !== "traced" && <Dashed />}
              <span className="sr-only">{statusWord(status, t)}</span>
            </span>
          )}

          {duration !== null && (
            <p className="shrink-0 font-mono text-xs text-muted">{duration}</p>
          )}
        </div>

        {/* The only entry that carries a gauge, because riding is the only
            thing that spends the free window (FR-108, FR-114). */}
        {entry.kind === "ride" && (
          <RemainingGauge
            remaining={entry.step.remaining}
            status={entry.step.remainingStatus}
            fraction={gaugeFraction(entry.step.remaining, params)}
          />
        )}
      </div>
    </li>
  );
}

export default function ItineraryTrail({
  itinerary,
  geometry = null,
  corrections = 0,
  stations,
  params,
}: {
  itinerary: Itinerary;
  /**
   * Path status per step, index-aligned with `itinerary.steps`.
   *
   * Optional, defaulting to null, which reads as "no refinement has opened".
   * That is the honest default: every leg shows as still being traced rather
   * than as verified.
   */
  geometry?: StepGeometry[] | null;
  /** Correction rounds behind this itinerary. Above zero, the rider is told why. */
  corrections?: number;
  stations: Station[];
  /** For the gauge's denominator only. No figure is recomputed here. */
  params: PlanningParameters;
}) {
  const t = useStrings();
  const say = useResolve();
  const names = new Map(stations.map((s) => [s.id, s.name]));
  const stationName = (id: string): string =>
    names.get(id) ?? say(t.trail.unknownStation, { id });

  const entries = toEntries(itinerary.steps, geometry);

  return (
    <>
      {corrections > 0 && (
        /*
          The plan changed under the reader, so it says so and why (FR-316).
          `role="status"` rather than `alert`: this is worth announcing, but it
          is not an emergency and it must not interrupt what a screen reader is
          already reading.
        */
        <p role="status" className="mb-3 text-xs font-medium">
          {t.trail.corrected}
        </p>
      )}

      <ol aria-label={t.trail.label}>
        {entries.map((entry, index) => (
          <EntryRow
            key={index}
            entry={entry}
            last={index === entries.length - 1}
            stationName={stationName}
            params={params}
            t={t}
          />
        ))}
      </ol>
    </>
  );
}
