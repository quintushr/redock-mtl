"use client";

import { useEffect, useId, useRef, useState } from "react";
import {
  GEOCODER_DEBOUNCE_MS,
  GEOCODER_MIN_QUERY_LENGTH,
  GEOCODER_RESULT_LIMIT,
} from "@/lib/endpoints";
import { configReady } from "@/lib/runtime-config";
import {
  formatCoordinates,
  parseCoordinates,
  parseGeocoderResults,
  type GeocodeSuggestion,
} from "@/lib/geocode";
import { Crosshair, Cross } from "@/components/icons";
import { useStrings } from "@/components/LocaleProvider";
import type { Messages } from "@/components/LocaleProvider";
import type { LatLon } from "@/lib/types";

/**
 * Address and place search for one end of the trip: one 38px row, no more.
 *
 * The row has no visible label. docs/ui-guidelines.md, "Saisie du départ et de
 * la destination", gives that job to the rail and the pin drawn beside it in
 * the parent: a hollow ring for the start, a pin for the destination, the same
 * two marks the itinerary trail uses. Two headings reading "Départ" and
 * "Destination" above two identical boxes cost 180px of panel to repeat what
 * the marks already say. The names survive as the inputs' accessible names,
 * which is where a screen reader looks for them anyway.
 *
 * The clear control is a cross inside the row, shown only when there is
 * something to clear, and never a text button.
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
  t: Messages,
): Row[] {
  const rows: Row[] = suggestions.map((suggestion) => ({
    kind: "place",
    primary: suggestion.primary,
    secondary: suggestion.secondary,
    badge: t.placeKinds[suggestion.kind],
    position: suggestion.position,
  }));

  if (typed === null) return rows;
  return [
    {
      kind: "coordinates",
      primary: formatCoordinates(typed),
      secondary: t.fields.useThisPoint,
      badge: t.fields.coordinates,
      position: typed,
    },
    ...rows,
  ];
}

export default function SearchField({
  label,
  clearLabel,
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
  /** The accessible name of the input. Not drawn: the rail says which end. */
  label: string;
  /** The accessible name of the cross. Names the end, so two rows differ. */
  clearLabel: string;
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
  const t = useStrings();
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

  const rows = typing ? toRows(suggestions, coordinates, t) : [];
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

      // The geocoder a deployment configured, which on the public one is the
      // compiled-in default. Chained rather than awaited in an effect body: the
      // configuration is in flight from the document's head, so this is a
      // resolved promise in every realistic case and the debounce above is what
      // actually paces the request.
      configReady()
        .then(({ geocoderUrl }) => {
          const url = new URL(geocoderUrl);
          url.searchParams.set("q", trimmed);
          url.searchParams.set("limit", String(GEOCODER_RESULT_LIMIT));
          // Bias to the network's area so a short query is useful locally rather
          // than returning the same street name from another continent.
          url.searchParams.set("lat", String(bias.lat));
          url.searchParams.set("lon", String(bias.lon));
          return fetch(url, { signal: abort.signal });
        })
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
    <div className="relative flex h-[38px] items-center">
      {/*
        The address, the cross that clears it, and the way to place the point
        on the map instead. Nothing else fits in 38px and nothing else needs to:
        which end this is has already been said by the rail beside it.

        Truncated by ellipsis and never wrapped — an input cannot wrap anyway,
        and `truncate` is what puts the ellipsis on the overflow rather than
        cutting a street name mid-word.
      */}
      <input
        id={id}
        type="text"
        role="combobox"
        autoComplete="off"
        aria-label={label}
        aria-expanded={rows.length > 0}
        aria-controls={`${id}-list`}
        aria-activedescendant={active >= 0 ? `${id}-row-${active}` : undefined}
        className={[
          "h-full min-w-0 flex-1 truncate bg-transparent pl-2 text-sm",
          // The ring is drawn inside the row: the entry block is 78px with two
          // rows against its own border, and an outward offset would be clipped
          // by the container it sits in.
          "outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand",
        ].join(" ")}
        placeholder={placeholder}
        value={value}
        onChange={(event) => {
          const next = event.target.value;
          onValueChange(next);
          setDraft(next);
          setActive(-1);
          // Emptying the text clears the point too. Without this the pin would
          // stay on the map and the plan would stay computed under a field
          // that reads as empty.
          if (next.trim() === "" && point !== null) onClear();
        }}
        onKeyDown={onKeyDown}
        onBlur={() => {
          // Let a click on a row land before the list disappears.
          setTimeout(dismiss, 150);
        }}
      />

      {/*
        Only when the row holds something. A cross on an empty field is a
        control that does nothing, drawn next to a control that does.
      */}
      {value !== "" && (
        <button
          type="button"
          aria-label={clearLabel}
          className="flex h-[38px] w-7 shrink-0 items-center justify-center text-muted hover:text-ink"
          onClick={onClear}
        >
          <Cross />
        </button>
      )}

      <button
        type="button"
        aria-pressed={armed}
        // Icon only, so the name carries the whole meaning. This is the
        // guaranteed input path when the geocoder is down, which its
        // operator does not promise it will not be, so it stays reachable.
        aria-label={armed ? t.fields.picking : t.fields.pickOnMap}
        className={[
          "flex h-[38px] w-8 shrink-0 items-center justify-center",
          // The third and last use docs/ui-guidelines.md allows the accent:
          // the active state of a control.
          armed ? "text-brand" : "text-muted hover:text-ink",
        ].join(" ")}
        onClick={onArm}
      >
        <Crosshair />
      </button>

      {rows.length > 0 && (
        <ul
          id={`${id}-list`}
          role="listbox"
          className="absolute top-full right-0 left-0 z-20 mt-1 overflow-hidden rounded-control border border-edge bg-panel"
        >
          {rows.map((row, index) => (
            <li key={`${row.kind}-${index}`} role="presentation">
              <button
                id={`${id}-row-${index}`}
                type="button"
                role="option"
                aria-selected={index === active}
                className={`flex min-h-11 w-full items-center gap-2 border-b border-line px-3 py-2 text-left last:border-b-0 ${
                  index === active ? "bg-state-hover" : "state-layer"
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
                    <span className="block truncate text-xs text-muted">
                      {row.secondary}
                    </span>
                  )}
                </span>
                {/* Sentence case at the type scale's floor. Ten pixels in
                    decorative capitals was two rules broken at once. */}
                <span className="shrink-0 rounded-control bg-paper px-1.5 py-0.5 text-xs text-muted">
                  {row.badge}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {/*
        Under the row rather than in it, on the same footing as the suggestion
        list and for the same reason: the entry block is a fixed 78px, and a
        line of status text inside it would either burst that or shrink the
        field it is reporting on. Not a hover affordance — it answers the
        reader's own typing, and it stays until the typing changes.
      */}
      {(searching || showFailure) && rows.length === 0 && (
        <p
          role="status"
          className="absolute top-full right-0 left-0 z-20 mt-1 rounded-control border border-edge bg-panel px-3 py-2 text-xs text-muted"
        >
          {searching ? t.fields.searching : t.fields.searchUnavailable}
        </p>
      )}
    </div>
  );
}
