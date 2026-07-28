"use client";

import { useLanguage, useResolve, useStrings } from "@/components/LocaleProvider";
import RemainingGauge from "@/components/RemainingGauge";
import { approximateDuration, formatDistance } from "@/lib/format";
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
 * Rendered as text rather than as a colour or an icon, and placed in the flow
 * rather than in a title attribute, so a screen reader announces it with the
 * leg it belongs to. A rider who cannot see the dash pattern on the map has no
 * other way to know whether this part of their journey was checked.
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
  t: Messages;
}) {
  // Read here rather than threaded down as props: the store is the browser, not
  // a React tree, so a hook reads the same value at any depth.
  const say = useResolve();
  const lang = useLanguage();

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
              {say(t.trail.anchor, {
                wait: approximateDuration(entry.cooldown, t),
              })}
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
                ? say(t.trail.walkTo, {
                    place: stationName(entry.step.toStationId),
                  })
                : t.trail.walkToDestination}
            </p>
            <p className="text-xs text-muted">
              {approximateDuration(entry.step.duration, t)} ·{" "}
              {formatDistance(entry.step.distance, t, lang)}
              <span className="ml-1">{t.trail.walkFree}</span>
              {" · "}
              <span>{statusWord(entry.status, t)}</span>
            </p>
          </>
        );

      case "ride":
        // The only entry that carries a gauge, because riding is the only thing
        // that spends the free window (FR-108, FR-114).
        return (
          <>
            <p className="text-sm">
              {say(t.trail.rideTo, {
                place: stationName(entry.step.toStationId),
              })}
            </p>
            <p className="text-xs text-muted">
              {approximateDuration(entry.step.duration, t)} ·{" "}
              {formatDistance(entry.step.distance, t, lang)}
              {" · "}
              <span>{statusWord(entry.status, t)}</span>
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

/**
 * The note under the list, chosen by what is actually traced (FR-311).
 *
 * One sentence for the whole itinerary would be false the moment one leg
 * differs from the rest, which is exactly the claim FR-311 forbids. So: every
 * leg traced gets the confident sentence, none traced keeps the old
 * straight-line caveat, and anything in between says that *some* parts are
 * approximate without pretending to say which. Which ones is on each leg.
 */
function traceNote(geometry: StepGeometry[] | null, t: Messages): string {
  if (geometry === null || geometry.length === 0) return t.trail.traceIsIndicative;

  const traced = geometry.filter((g) => g.status === "traced").length;
  if (traced === 0) return t.trail.traceIsIndicative;
  if (traced === geometry.length) return t.trail.traceAllReal;
  return t.trail.traceMixed;
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
      <p className="text-xs text-muted">{traceNote(geometry, t)}</p>
    </>
  );
}
