"use client";

import { useId, useState } from "react";
import { approximateDuration } from "@/lib/format";
import { DEFAULT_PARAMETERS } from "@/lib/params";
import type { PlanningParameters } from "@/lib/types";

/**
 * The planning assumptions, at rest one line (FR-103).
 *
 * This sits after the itinerary and never before it. Parameters are an input
 * changed once a year; the itinerary is the output read every time, and putting
 * the input first charged a scroll on every consultation to serve a setting
 * nobody touches. docs/ui-guidelines.md lists a setting above the result among
 * its outright prohibitions.
 *
 * Opened, one control is offered: the safety margin (FR-120). It is the only
 * one a rider has a legitimate reason to adjust regularly, because it is the
 * dial between fewer stops and more slack. Everything else lives one level
 * deeper behind a disclosure that is closed by default (FR-121).
 *
 * That is grouping, not hiding. Constitution principle IV requires every
 * parameter that influences a result to stay visible and adjustable, and every
 * one of them is, two clicks away, with a single action to put them all back
 * (FR-127).
 */

const MS_TO_KMH = 3600 / 1000;

interface Control {
  key: keyof PlanningParameters;
  label: string;
  hint: string;
  min: number;
  max: number;
  step: number;
  /** Parameters are stored in SI; these convert for display. */
  toDisplay: (value: number) => number;
  fromDisplay: (value: number) => number;
  unit: string;
  /**
   * True for the one control offered at the first level. Exactly one control
   * carries this, and the rest are driven from the same list, so a parameter
   * added later appears in the nested group without editing this component.
   */
  primary?: true;
}

const CONTROLS: Control[] = [
  {
    key: "safetyMargin",
    label: "Safety margin",
    hint: "Held back from the free window. Lower it for fewer stops and tighter segments.",
    min: 0,
    max: 20,
    step: 1,
    toDisplay: (v) => v / 60,
    fromDisplay: (v) => v * 60,
    unit: "min",
    primary: true,
  },
  {
    key: "freeWindow",
    label: "Free window",
    hint: "The free duration your subscription includes per ride.",
    min: 10,
    max: 90,
    step: 5,
    toDisplay: (v) => v / 60,
    fromDisplay: (v) => v * 60,
    unit: "min",
  },
  {
    key: "cyclingSpeed",
    label: "Cycling speed",
    hint: "Your pace on a share bike.",
    min: 8,
    max: 28,
    step: 1,
    toDisplay: (v) => v * MS_TO_KMH,
    fromDisplay: (v) => v / MS_TO_KMH,
    unit: "km/h",
  },
  {
    key: "maxWalkDistance",
    label: "Maximum walk",
    hint: "How far you will walk to or from a station.",
    min: 100,
    max: 2500,
    step: 100,
    toDisplay: (v) => v,
    fromDisplay: (v) => v,
    unit: "m",
  },
  {
    key: "walkingSpeed",
    label: "Walking speed",
    hint: "Used for the walk at each end, which never uses the free window.",
    min: 2,
    max: 7,
    step: 0.5,
    toDisplay: (v) => v * MS_TO_KMH,
    fromDisplay: (v) => v / MS_TO_KMH,
    unit: "km/h",
  },
  {
    key: "dockCooldown",
    label: "Docking cooldown",
    hint: "The operator's wait before you can take the same bike again.",
    min: 0,
    max: 300,
    step: 15,
    toDisplay: (v) => v,
    fromDisplay: (v) => v,
    unit: "s",
  },
  {
    key: "segmentOverhead",
    label: "Unlock and dock time",
    hint: "Charged once per ride, and it does use the free window.",
    min: 0,
    max: 300,
    step: 15,
    toDisplay: (v) => v,
    fromDisplay: (v) => v,
    unit: "s",
  },
  {
    key: "bikeReserve",
    label: "Bikes held in reserve",
    hint: "Never plan on the last bikes; someone may take them first.",
    min: 0,
    max: 5,
    step: 1,
    toDisplay: (v) => v,
    fromDisplay: (v) => v,
    unit: "",
  },
  {
    key: "dockReserve",
    label: "Docks held in reserve",
    hint: "Never plan on the last free docks.",
    min: 0,
    max: 5,
    step: 1,
    toDisplay: (v) => v,
    fromDisplay: (v) => v,
    unit: "",
  },
  {
    key: "detourFactor",
    label: "Detour factor",
    hint: "How much longer streets are than a straight line.",
    min: 1,
    max: 2,
    step: 0.05,
    toDisplay: (v) => v,
    fromDisplay: (v) => v,
    unit: "×",
  },
  {
    key: "overageRate",
    label: "Overage rate",
    hint: "What a minute past the free window costs, before taxes. Only used to price a ride without stops.",
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
  const shown = control.toDisplay(value);

  return (
    <div className="py-2">
      <label htmlFor={id} className="flex items-baseline justify-between">
        <span className="text-sm font-medium">{control.label}</span>
        <span className="font-mono text-sm text-muted tabular-nums">
          {Number.isInteger(shown) ? shown : shown.toFixed(2)} {control.unit}
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
        {control.hint}
      </p>
    </div>
  );
}

/** How many parameters differ from their default. Drives the summary line. */
function changedCount(parameters: PlanningParameters): number {
  return (Object.keys(DEFAULT_PARAMETERS) as (keyof PlanningParameters)[])
    .filter((key) => parameters[key] !== DEFAULT_PARAMETERS[key])
    .length;
}

export default function AssumptionsLine({
  parameters,
  onChange,
  correction,
}: {
  parameters: PlanningParameters;
  onChange: (next: PlanningParameters) => void;
  correction: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [showRest, setShowRest] = useState(false);

  const set = (key: keyof PlanningParameters, value: number): void =>
    onChange({ ...parameters, [key]: value });

  const primary = CONTROLS.filter((c) => c.primary === true);
  const rest = CONTROLS.filter((c) => c.primary !== true);
  const changed = changedCount(parameters);

  return (
    <section aria-label="Planning assumptions">
      {/*
        At rest this is the whole component: one line, and enough of it to know
        whether the plan above rests on the defaults or on something the reader
        changed (FR-125).
      */}
      <button
        type="button"
        className="flex w-full items-baseline justify-between gap-3 text-left"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <span className="text-sm font-medium">Assumptions</span>
        <span className="truncate text-xs text-muted">
          {approximateDuration(parameters.safetyMargin)} of margin
          {changed === 0
            ? ", all defaults"
            : `, ${changed} changed from ${changed === 1 ? "its default" : "their defaults"}`}
        </span>
      </button>

      {open && (
        <div className="mt-2">
          {correction !== null && (
            // FR-126: explain and correct rather than failing silently.
            <p
              role="alert"
              className="mb-2 rounded-control border border-warn/40 bg-brand-soft p-2 text-xs text-brand-deep"
            >
              {correction}
            </p>
          )}

          {primary.map((control) => (
            <Slider
              key={control.key}
              control={control}
              value={parameters[control.key]}
              onChange={(next) => set(control.key, next)}
            />
          ))}

          <div className="mt-1 flex items-center justify-between">
            <button
              type="button"
              className="text-xs underline"
              aria-expanded={showRest}
              onClick={() => setShowRest((current) => !current)}
            >
              {showRest ? "Hide" : "Show"} the other assumptions
            </button>
            <button
              type="button"
              className="text-xs underline disabled:opacity-40"
              disabled={changed === 0}
              onClick={() => onChange(DEFAULT_PARAMETERS)}
            >
              Reset all
            </button>
          </div>

          {showRest && (
            <div className="mt-1 border-t border-line pt-1">
              {rest.map((control) => (
                <Slider
                  key={control.key}
                  control={control}
                  value={parameters[control.key]}
                  onChange={(next) => set(control.key, next)}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
