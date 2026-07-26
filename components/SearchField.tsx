"use client";

import { useEffect, useId, useRef, useState } from "react";
import {
  GEOCODER_DEBOUNCE_MS,
  GEOCODER_MIN_QUERY_LENGTH,
  GEOCODER_RESULT_LIMIT,
  GEOCODER_URL,
} from "@/lib/endpoints";
import {
  KIND_LABELS,
  formatCoordinates,
  parseCoordinates,
  parseGeocoderResults,
  type GeocodeSuggestion,
} from "@/lib/geocode";
import type { LatLon } from "@/lib/types";

/**
 * Address and place search for one end of the trip.
 *
 * Optional by construction (constitution principle II). The endpoint is a free
 * public instance whose operator states plainly that availability is not
 * guaranteed and that extensive use will be throttled, so when it fails the
 * user falls back to clicking the map or typing a coordinate pair, both of
 * which always work and are offered here rather than buried in a message.
 *
 * Debouncing, cancelling superseded requests, and never querying at all for an
 * input we can resolve ourselves are courtesy obligations under principle V,
 * not niceties. One request per keystroke against a courtesy endpoint is how
 * such endpoints get closed.
 *
 * The text is owned by the parent, because a point can also arrive from a map
 * click or a marker drag, and the field must then show what was picked. Typing
 * is what reopens the list: a value that arrived from outside must not trigger
 * a query, or every drag of a marker would hit the geocoder.
 */

interface Row {
  /** A typed coordinate pair, resolvable without asking anyone. */
  kind: "coordinates" | "place";
  primary: string;
  secondary: string;
  badge: string;
  position: LatLon;
}

function toRows(
  suggestions: GeocodeSuggestion[],
  typed: LatLon | null,
): Row[] {
  const rows: Row[] = suggestions.map((suggestion) => ({
    kind: "place",
    primary: suggestion.primary,
    secondary: suggestion.secondary,
    badge: KIND_LABELS[suggestion.kind],
    position: suggestion.position,
  }));

  if (typed === null) return rows;
  return [
    {
      kind: "coordinates",
      primary: formatCoordinates(typed),
      secondary: "Use this exact point",
      badge: "Coordinates",
      position: typed,
    },
    ...rows,
  ];
}

export default function SearchField({
  label,
  placeholder,
  value,
  point,
  bias,
  armed,
  onValueChange,
  onPick,
  onClear,
  onArm,
}: {
  label: string;
  placeholder: string;
  /** The text shown in the input. Owned by the parent (see the note above). */
  value: string;
  /** The point this field currently resolves to, if any. */
  point: LatLon | null;
  bias: LatLon;
  /** True when the next map click will set this end of the trip. */
  armed: boolean;
  onValueChange: (next: string) => void;
  onPick: (position: LatLon, label: string) => void;
  onClear: () => void;
  onArm: () => void;
}) {
  const id = useId();
  const [suggestions, setSuggestions] = useState<GeocodeSuggestion[]>([]);
  const [searching, setSearching] = useState(false);
  const [failed, setFailed] = useState(false);
  const [active, setActive] = useState(-1);
  const controller = useRef<AbortController | null>(null);

  /**
   * What the user has typed and not yet resolved, or null when the field holds
   * a settled value. Text arriving from the parent, a map click for instance,
   * leaves this null, so it opens no list and sends no request.
   */
  const [draft, setDraft] = useState<string | null>(null);
  const typing = draft !== null && draft === value;

  const trimmed = typing ? draft.trim() : "";
  const coordinates = parseCoordinates(trimmed);
  const searchable =
    typing && coordinates === null && trimmed.length >= GEOCODER_MIN_QUERY_LENGTH;

  const rows = typing ? toRows(suggestions, coordinates) : [];
  const showFailure = searchable && failed && !searching;

  useEffect(() => {
    if (!searchable) {
      controller.current?.abort();
      return;
    }

    const timer = setTimeout(() => {
      // Cancel whatever is still in flight: only the latest query matters.
      controller.current?.abort();
      const abort = new AbortController();
      controller.current = abort;
      setSearching(true);

      const url = new URL(GEOCODER_URL);
      url.searchParams.set("q", trimmed);
      url.searchParams.set("limit", String(GEOCODER_RESULT_LIMIT));
      // Bias to the network's area so a short query is useful locally rather
      // than returning the same street name from another continent.
      url.searchParams.set("lat", String(bias.lat));
      url.searchParams.set("lon", String(bias.lon));

      fetch(url, { signal: abort.signal })
        .then((response) => {
          if (!response.ok) throw new Error(String(response.status));
          return response.json();
        })
        .then((payload) => {
          setSuggestions(parseGeocoderResults(payload));
          setFailed(false);
          setSearching(false);
          setActive(-1);
        })
        .catch((error: unknown) => {
          if (error instanceof DOMException && error.name === "AbortError") return;
          setSuggestions([]);
          setFailed(true);
          setSearching(false);
        });
    }, GEOCODER_DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [trimmed, searchable, bias.lat, bias.lon]);

  const commit = (row: Row): void => {
    const text =
      row.kind === "coordinates"
        ? formatCoordinates(row.position)
        : [row.primary, row.secondary].filter((part) => part !== "").join(", ");
    onPick(row.position, text);
    setDraft(null);
    setSuggestions([]);
    setActive(-1);
  };

  const dismiss = (): void => {
    setDraft(null);
    setSuggestions([]);
    setActive(-1);
  };

  // Arrow keys and Enter, so the list is usable without a pointer. A suggestion
  // list that only responds to a mouse is unreachable on a phone keyboard and
  // to anyone navigating by keyboard.
  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === "Escape") {
      dismiss();
      return;
    }
    if (rows.length === 0) return;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((index) => (index + 1) % rows.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((index) => (index <= 0 ? rows.length - 1 : index - 1));
    } else if (event.key === "Enter") {
      event.preventDefault();
      commit(rows[active >= 0 ? active : 0]);
    }
  };

  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor={id} className="text-sm font-medium">
          {label}
        </label>
        <div className="flex items-center gap-2">
          {point !== null && (
            <button
              type="button"
              className="text-xs text-zinc-500 underline hover:text-zinc-800 dark:hover:text-zinc-200"
              onClick={() => {
                dismiss();
                onClear();
              }}
            >
              Clear
            </button>
          )}
          <button
            type="button"
            aria-pressed={armed}
            className={
              armed
                ? "rounded border border-blue-600 bg-blue-600 px-2 py-0.5 text-xs font-medium text-white"
                : "rounded border border-zinc-300 px-2 py-0.5 text-xs hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
            }
            onClick={onArm}
          >
            {armed ? "Click the map…" : "Pick on map"}
          </button>
        </div>
      </div>

      <div className="relative mt-1">
        <input
          id={id}
          type="search"
          role="combobox"
          autoComplete="off"
          aria-expanded={rows.length > 0}
          aria-controls={`${id}-list`}
          aria-activedescendant={active >= 0 ? `${id}-row-${active}` : undefined}
          className={`w-full rounded border px-2 py-1.5 text-sm dark:bg-zinc-900 ${
            armed
              ? "border-blue-500 ring-1 ring-blue-500"
              : "border-zinc-300 dark:border-zinc-700"
          }`}
          placeholder={placeholder}
          value={value}
          onChange={(event) => {
            onValueChange(event.target.value);
            setDraft(event.target.value);
            setActive(-1);
          }}
          onKeyDown={onKeyDown}
          onBlur={() => {
            // Let a click on a row land before the list disappears.
            setTimeout(dismiss, 150);
          }}
        />

        {rows.length > 0 && (
          <ul
            id={`${id}-list`}
            role="listbox"
            className="absolute z-10 mt-1 w-full overflow-hidden rounded border border-zinc-200 bg-white shadow-lg dark:border-zinc-700 dark:bg-zinc-900"
          >
            {rows.map((row, index) => (
              <li key={`${row.kind}-${index}`} role="presentation">
                <button
                  id={`${id}-row-${index}`}
                  type="button"
                  role="option"
                  aria-selected={index === active}
                  className={`flex w-full items-baseline gap-2 border-b border-zinc-100 px-2 py-2 text-left last:border-b-0 dark:border-zinc-800 ${
                    index === active
                      ? "bg-zinc-100 dark:bg-zinc-800"
                      : "hover:bg-zinc-50 dark:hover:bg-zinc-800/60"
                  }`}
                  // Keep the focus in the input so the field does not blur the
                  // list away between pressing and releasing the pointer.
                  onMouseDown={(event) => event.preventDefault()}
                  onMouseEnter={() => setActive(index)}
                  onClick={() => commit(row)}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm">{row.primary}</span>
                    {row.secondary !== "" && (
                      <span className="block truncate text-xs text-zinc-500">
                        {row.secondary}
                      </span>
                    )}
                  </span>
                  <span className="shrink-0 rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-zinc-500 dark:bg-zinc-800">
                    {row.badge}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {searching && rows.length === 0 && (
        <p className="mt-1 text-xs text-zinc-500">Searching…</p>
      )}

      {showFailure && (
        <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">
          Address search is unavailable right now. Pick the point on the map, or
          type coordinates as “45.5088, -73.5878”.
        </p>
      )}
    </div>
  );
}
