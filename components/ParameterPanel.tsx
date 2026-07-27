"use client";

import { useId, useState } from "react";
import { DEFAULT_PARAMETERS } from "@/lib/params";
import type { PlanningParameters } from "@/lib/types";

/**
 * Every parameter that influences the result, visible and adjustable (FR-021).
 *
 * Constitution principle IV names speeds, transfer penalties and availability
 * buffers explicitly, so none of them may be a hidden constant. The less
 * commonly changed ones live behind a disclosure (FR-021a), which is grouping,
 * not hiding: nothing here is unreachable.
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
  advanced: boolean;
}

const CONTROLS: Control[] = [
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
    advanced: false,
  },
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
    advanced: false,
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
    advanced: false,
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
    advanced: false,
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
    advanced: true,
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
    advanced: true,
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
    advanced: true,
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
    advanced: true,
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
    advanced: true,
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
    advanced: true,
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
        <span className="text-sm tabular-nums text-zinc-600 dark:text-zinc-400">
          {Number.isInteger(shown) ? shown : shown.toFixed(2)} {control.unit}
        </span>
      </label>
      <input
        id={id}
        type="range"
        className="mt-1 w-full accent-zinc-700 dark:accent-zinc-300"
        min={control.min}
        max={control.max}
        step={control.step}
        value={shown}
        aria-describedby={`${id}-hint`}
        onChange={(event) =>
          onChange(control.fromDisplay(Number(event.target.value)))
        }
      />
      <p id={`${id}-hint`} className="text-xs text-zinc-500">
        {control.hint}
      </p>
    </div>
  );
}

export default function ParameterPanel({
  parameters,
  onChange,
  correction,
}: {
  parameters: PlanningParameters;
  onChange: (next: PlanningParameters) => void;
  correction: string | null;
}) {
  const [showAdvanced, setShowAdvanced] = useState(false);

  const set = (key: keyof PlanningParameters, value: number): void =>
    onChange({ ...parameters, [key]: value });

  const basic = CONTROLS.filter((c) => !c.advanced);
  const advanced = CONTROLS.filter((c) => c.advanced);

  return (
    <section aria-label="Planning assumptions">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-semibold">Your assumptions</h2>
        <button
          type="button"
          className="text-xs underline"
          onClick={() => onChange(DEFAULT_PARAMETERS)}
        >
          Reset
        </button>
      </div>

      {correction !== null && (
        // FR-024: explain and correct rather than failing silently.
        <p
          role="alert"
          className="mt-2 rounded border border-amber-300 bg-amber-50 p-2 text-xs dark:border-amber-800 dark:bg-amber-950"
        >
          {correction}
        </p>
      )}

      {basic.map((control) => (
        <Slider
          key={control.key}
          control={control}
          value={parameters[control.key]}
          onChange={(next) => set(control.key, next)}
        />
      ))}

      <button
        type="button"
        className="mt-2 text-xs underline"
        aria-expanded={showAdvanced}
        onClick={() => setShowAdvanced((open) => !open)}
      >
        {showAdvanced ? "Hide" : "Show"} the remaining assumptions
      </button>

      {showAdvanced && (
        <div className="mt-1 border-t border-zinc-200 pt-1 dark:border-zinc-800">
          {advanced.map((control) => (
            <Slider
              key={control.key}
              control={control}
              value={parameters[control.key]}
              onChange={(next) => set(control.key, next)}
            />
          ))}
        </div>
      )}
    </section>
  );
}
