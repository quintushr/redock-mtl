"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useLanguage, useResolve, useStrings } from "@/components/LocaleProvider";
import { Cross } from "@/components/icons";
import { formatDecimal } from "@/lib/format";
import { DEFAULT_PARAMETERS, changedCount } from "@/lib/params";
import { cachedPathCount, purgeCachedPaths } from "@/components/useTracedItinerary";
import type { PlanningParameters } from "@/lib/types";

/**
 * The planning assumptions, as an overlay on the panel.
 *
 * docs/ui-guidelines.md states the screen has three states and that the settings
 * one puts "les contrôles en surcouche du panneau". An overlay rather than an
 * expanding region for a reason that only shows up on a long itinerary: a region
 * that grows in the scroll flow pushes the trail down under the reader's finger,
 * and closing it drops them somewhere they never chose to be. This covers the
 * trail instead. The trail stays mounted, keeps its scroll offset, and is exactly
 * where it was when the overlay closes (FR-122).
 *
 * It covers the scroll area and stops short of the footer, so the row that
 * opened it is still visible and is the way back out.
 *
 * Every parameter is on screen at once, with no nested disclosure. This is a
 * deliberate departure from FR-121 and from the "zone repliée, fermée par
 * défaut" of docs/ui-guidelines.md, and the reason it is defensible now is that
 * the containing surface changed: those said "one summary line after the trail",
 * where eleven sliders would have buried the itinerary, and nesting was what
 * kept the line a line. In a full-height overlay with its own scroll there is no
 * itinerary to bury, and the disclosure only added a click between a rider and
 * the value they came for. Principle IV wants every influencing parameter
 * visible and adjustable; this is the most literal reading of it.
 *
 * The safety margin stays first, being the one adjusted regularly, and one
 * action still puts every default back (FR-127).
 */

const MS_TO_KMH = 3600 / 1000;

/**
 * A control's range and unit. Its label and its hint come from the message
 * registry, keyed by the parameter name, so wording and arithmetic are not
 * maintained in the same place.
 *
 * The order of the list is the order on screen, and it is not alphabetical: the
 * safety margin leads because it is the one a rider adjusts regularly, being
 * the dial between fewer stops and more slack. A parameter added to this list
 * gets a control with no further edit to this component.
 */
interface Control {
  key: keyof PlanningParameters;
  min: number;
  max: number;
  step: number;
  /** Parameters are stored in SI; these convert for display. */
  toDisplay: (value: number) => number;
  fromDisplay: (value: number) => number;
  unit: string;
}

const CONTROLS: Control[] = [
  {
    key: "safetyMargin",
    min: 0,
    max: 20,
    step: 1,
    toDisplay: (v) => v / 60,
    fromDisplay: (v) => v * 60,
    unit: "min",
  },
  {
    key: "freeWindow",
    min: 10,
    max: 90,
    step: 5,
    toDisplay: (v) => v / 60,
    fromDisplay: (v) => v * 60,
    unit: "min",
  },
  {
    key: "cyclingSpeed",
    min: 8,
    max: 28,
    step: 1,
    toDisplay: (v) => v * MS_TO_KMH,
    fromDisplay: (v) => v / MS_TO_KMH,
    unit: "km/h",
  },
  {
    key: "maxWalkDistance",
    min: 100,
    max: 2500,
    step: 100,
    toDisplay: (v) => v,
    fromDisplay: (v) => v,
    unit: "m",
  },
  {
    key: "walkingSpeed",
    min: 2,
    max: 7,
    step: 0.5,
    toDisplay: (v) => v * MS_TO_KMH,
    fromDisplay: (v) => v / MS_TO_KMH,
    unit: "km/h",
  },
  {
    key: "dockCooldown",
    min: 0,
    max: 300,
    step: 15,
    toDisplay: (v) => v,
    fromDisplay: (v) => v,
    unit: "s",
  },
  {
    key: "segmentOverhead",
    min: 0,
    max: 300,
    step: 15,
    toDisplay: (v) => v,
    fromDisplay: (v) => v,
    unit: "s",
  },
  {
    key: "detourFactor",
    min: 1,
    max: 2,
    step: 0.05,
    toDisplay: (v) => v,
    fromDisplay: (v) => v,
    unit: "×",
  },
  {
    key: "overageRate",
    min: 0,
    max: 1,
    step: 0.01,
    toDisplay: (v) => v,
    fromDisplay: (v) => v,
    unit: "$/min",
  },
];

function Slider({
  control,
  value,
  onChange,
}: {
  control: Control;
  value: number;
  onChange: (next: number) => void;
}) {
  const id = useId();
  const t = useStrings();
  const lang = useLanguage();
  const shown = control.toDisplay(value);
  const { label, hint } = t.settings.controls[control.key];

  return (
    <div className="py-2">
      <label htmlFor={id} className="flex items-baseline justify-between">
        <span className="text-sm font-medium">{label}</span>
        <span className="font-mono text-sm text-muted tabular-nums">
          {Number.isInteger(shown) ? shown : formatDecimal(shown, 2, lang)}{" "}
          {control.unit}
        </span>
      </label>
      <input
        id={id}
        type="range"
        className="mt-1 w-full accent-brand"
        min={control.min}
        max={control.max}
        step={control.step}
        value={shown}
        aria-describedby={`${id}-hint`}
        onChange={(event) =>
          onChange(control.fromDisplay(Number(event.target.value)))
        }
      />
      <p id={`${id}-hint`} className="text-xs text-muted">
        {hint}
      </p>
    </div>
  );
}

/**
 * The control that empties the stored routes (FR-329a).
 *
 * The count is read on mount and after a purge rather than on every render:
 * localStorage is synchronous, and counting it during a render that a slider
 * drag triggers sixty times a second is a way to make a smooth control stutter.
 *
 * Not a planning parameter, so it influences no figure the rider reads and does
 * not belong among the sliders. It sits with them because this is where a person
 * goes looking for the knobs.
 */
function PurgePaths() {
  const t = useStrings();
  const say = useResolve();
  /*
   * Read once, when this mounts, and again after a purge.
   *
   * A lazy initializer rather than an effect, and it is safe here specifically
   * because this component only ever mounts after the rider has opened both
   * disclosures. Static export prerenders the panel closed, so this never runs
   * during a server render and there is no hydration mismatch to worry about.
   */
  const [count, setCount] = useState<number>(() => cachedPathCount());

  const purge = (): void => {
    purgeCachedPaths();
    setCount(cachedPathCount());
  };

  return (
    <div className="mt-2 flex items-center justify-between gap-3 border-t border-edge pt-2">
      <span className="text-xs text-muted">
        {say(t.settings.purgePathsCount, { count })}
      </span>
      <button
        type="button"
        className="state-layer -mx-2 min-h-11 rounded-control px-2 text-xs underline disabled:text-muted disabled:no-underline"
        disabled={count === 0}
        onClick={purge}
      >
        {t.settings.purgePaths}
      </button>
    </div>
  );
}

export default function SettingsOverlay({
  id,
  open,
  onClose,
  parameters,
  onChange,
  correction,
}: {
  /** What the footer's settings row points `aria-controls` at. */
  id: string;
  open: boolean;
  onClose: () => void;
  parameters: PlanningParameters;
  onChange: (next: PlanningParameters) => void;
  correction: string | null;
}) {
  const t = useStrings();
  const surface = useRef<HTMLDivElement | null>(null);

  /*
   * Escape closes.
   *
   * Not a focus trap: the footer underneath stays reachable on purpose, because
   * the row that opened this is the way back out and trapping focus away from it
   * would make the obvious gesture the impossible one.
   */
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Focus moves in when it opens, so a keyboard reader is where the controls
  // are rather than back at the top of the itinerary they cannot see.
  useEffect(() => {
    if (open) surface.current?.focus();
  }, [open]);

  if (!open) return null;

  const set = (key: keyof PlanningParameters, value: number): void =>
    onChange({ ...parameters, [key]: value });

  const changed = changedCount(parameters);

  return (
    <div
      id={id}
      ref={surface}
      tabIndex={-1}
      role="group"
      aria-label={t.settings.label}
      /*
        Opaque, and absolutely placed over the scroll area only. The itinerary
        is underneath, still mounted and still scrolled where it was: this
        covers the answer, it does not discard it.
      */
      /*
        Same drawn scrollbar as the trail underneath. Every parameter is
        visible by mandate and none is behind a fold, which means this list is
        always taller than the panel — so it is the one surface that must never
        look like it ends where the panel does.
      */
      className="panel-scroll absolute inset-0 z-10 overflow-y-auto overscroll-contain bg-panel px-4 pt-2 pb-4"
    >
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-base font-medium">{t.settings.label}</h2>
        <button
          type="button"
          className="state-layer -mr-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-control text-muted enabled:hover:text-ink"
          aria-label={t.settings.close}
          title={t.settings.close}
          onClick={onClose}
        >
          <Cross />
        </button>
      </div>

      {correction !== null && (
        // FR-126: explain and correct rather than failing silently.
        <p
          role="alert"
          className="mt-2 rounded-control border border-edge p-2 text-xs"
        >
          {correction}
        </p>
      )}

      {CONTROLS.map((control) => (
        <Slider
          key={control.key}
          control={control}
          value={parameters[control.key]}
          onChange={(next) => set(control.key, next)}
        />
      ))}

      <div className="mt-1 flex items-center justify-end border-t border-edge pt-2">
        <button
          type="button"
          className="state-layer -mx-2 min-h-11 rounded-control px-2 text-xs underline disabled:text-muted disabled:no-underline"
          disabled={changed === 0}
          onClick={() => onChange(DEFAULT_PARAMETERS)}
        >
          {t.settings.reset}
        </button>
      </div>

      {/*
        Emptying the stored routes (FR-329a).

        Geometry between two stations does not change, so it is kept across
        visits rather than re-requested from a service that gives it away for
        free. Anything kept without expiring should be erasable by the person
        whose browser is keeping it.
      */}
      <PurgePaths />
    </div>
  );
}
