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
 * The station a row is about, or null when the row is not about one.
 *
 * The start and the destination are places the reader named, not stations, and
 * the last walk's target is the destination. Everything else lands on a station
 * that exists on the map, and those are the rows that become reachable.
 */
function entryStationId(entry: Entry): string | null {
  switch (entry.kind) {
    case "start":
    case "destination":
      return null;
    case "anchor":
      return entry.stationId;
    case "walk":
      return entry.step.toStationId;
    case "ride":
      return entry.step.toStationId;
  }
}

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
  say,
  highlighted,
  onHighlight,
  onSelect,
}: {
  entry: Entry;
  last: boolean;
  stationName: (id: string) => string;
  params: PlanningParameters;
  t: Messages;
  say: ReturnType<typeof useResolve>;
  highlighted: string | null;
  onHighlight: (stationId: string | null) => void;
  onSelect: (stationId: string) => void;
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

  const stationId = entryStationId(entry);

  /**
   * How a name is set, in one place, so the paragraph and the button cannot
   * drift apart.
   *
   * `line-clamp-2` and not `truncate`, which is the change this row exists for.
   * A single truncated line turned "Métro Champ-de-Mars (Viger / Sanguinet)"
   * into "Métro Champ-de-Ma…", which is not a station a rider can find, and the
   * panel is 380px wide on desktop and 360px at its narrowest — a width that
   * ellipsis was never going to survive. Two lines fit every name in the
   * network; the clamp is what stops a pathological one pushing the gauge down
   * the panel, and `title` below is the residue for that case.
   *
   * `[overflow-wrap:anywhere]` rather than plain wrapping: several Montreal
   * stations are one unbroken hyphenated token longer than the column, and a
   * word that cannot break does not wrap, it overflows.
   *
   * `leading-5` on both this and the duration is what keeps the duration where
   * it was. The row is aligned to the top now, so a name on two lines grows
   * downward; giving the 12px duration the same 20px line box as the 14px name
   * makes their first lines share a centre, so the figure does not creep upward
   * by 2px on the rows that wrap.
   */
  const nameClass = [
    "min-w-0 flex-1 text-sm leading-5 line-clamp-2 [overflow-wrap:anywhere]",
    entry.kind === "start" ||
    entry.kind === "destination" ||
    entry.kind === "anchor"
      ? "font-medium"
      : "",
  ].join(" ");

  return (
    <li className="flex gap-2">
      <Rail entry={entry} last={last} />

      <div className="min-w-0 flex-1 pb-3">
        {/*
          `items-start` and no longer `items-center`: centring a two-line name
          against a one-line duration is what would move the duration.
        */}
        <div className="flex min-h-5 items-start gap-2">
          {name === null ? (
            <span className="flex-1" />
          ) : stationId === null ? (
            <p className={nameClass} title={name}>
              {name}
            </p>
          ) : (
            /*
              A station on the itinerary, and therefore something the reader can
              reach. Hovering or focusing it rings the same station on the map;
              activating it recentres the map there, which is the only way to ask
              that question on a screen with no pointer.

              A button, not a div with a click handler, because the quality floor
              requires the whole interface to be navigable by keyboard and this
              is the one path to the map's stations that a keyboard has. It looks
              exactly like the paragraph above it: no border, no chrome, and the
              one focus ring the stylesheet declares for everything.

              The accessible name says what activating it does and contains the
              visible name, so a reader who says "Station Bravo" to a voice
              control still hits it.
            */
            <button
              type="button"
              /*
                Highlighted by a lay of the foreground colour, the same one every
                other control in this interface uses to acknowledge a pointer. Not
                the accent: docs/ui-guidelines.md reserves it for three things and
                "the step you are pointing at" is not one of them, and a red
                station name beside a red anchor icon would read as a state the
                trip is in rather than as a pointer following the reader.

                The negative margin is so the tint has room to breathe without
                the text moving by 4px when it appears.
              */
              className={[
                nameClass,
                "state-layer -mx-1 rounded-control px-1 text-left",
                highlighted === stationId ? "bg-state-hover" : "",
              ].join(" ")}
              title={name}
              aria-label={say(t.trail.centreOnMap, { name })}
              onMouseEnter={() => onHighlight(stationId)}
              onMouseLeave={() => onHighlight(null)}
              onFocus={() => onHighlight(stationId)}
              onBlur={() => onHighlight(null)}
              onClick={() => onSelect(stationId)}
            >
              {name}
            </button>
          )}

          {/*
            A mark, not a word. It appears only on a leg whose path was not
            measured, so an untroubled trail carries nothing here at all; the
            word rides along for screen readers and is announced on every leg,
            traced ones included, because "this one was checked" is the half a
            rider most needs to hear.
          */}
          {status !== null && (
            <span className="flex h-5 shrink-0 items-center text-muted">
              {status !== "traced" && <Dashed />}
              <span className="sr-only">{statusWord(status, t)}</span>
            </span>
          )}

          {duration !== null && (
            <p className="shrink-0 font-mono text-xs leading-5 text-muted">
              {duration}
            </p>
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
  highlighted = null,
  onHighlight,
  onSelect,
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
  /**
   * The station being pointed at, wherever the pointing happened.
   *
   * Optional and null by default, so a caller that has no map — every test in
   * this repository, and any future surface that shows a trail on its own — gets
   * a trail with the interaction inert rather than one that throws.
   */
  highlighted?: string | null;
  onHighlight?: (stationId: string | null) => void;
  /** Asked to show this station. The shell decides what showing means. */
  onSelect?: (stationId: string) => void;
}) {
  const t = useStrings();
  const say = useResolve();
  const names = new Map(stations.map((s) => [s.id, s.name]));
  const stationName = (id: string): string =>
    names.get(id) ?? say(t.trail.unknownStation, { id });

  const entries = toEntries(itinerary.steps, geometry);

  // Absent handlers become no-ops rather than making the rows conditionally
  // interactive: a row that is a button on one surface and a paragraph on
  // another is two markups to keep accessible instead of one.
  const highlight = onHighlight ?? (() => {});
  const select = onSelect ?? (() => {});

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
            say={say}
            highlighted={highlighted}
            onHighlight={highlight}
            onSelect={select}
          />
        ))}
      </ol>
    </>
  );
}
