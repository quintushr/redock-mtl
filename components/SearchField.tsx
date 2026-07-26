"use client";

import { useEffect, useRef, useState } from "react";
import {
  GEOCODER_DEBOUNCE_MS,
  GEOCODER_MIN_QUERY_LENGTH,
  GEOCODER_RESULT_LIMIT,
  GEOCODER_URL,
} from "@/lib/endpoints";
import type { LatLon } from "@/lib/types";

/**
 * Address and place search.
 *
 * Optional by construction (constitution principle II). The endpoint is a free
 * public instance whose operator states plainly that availability is not
 * guaranteed and that extensive use will be throttled, so when it fails the
 * user simply falls back to clicking the map or entering coordinates, both of
 * which always work.
 *
 * Debouncing and cancelling superseded requests are courtesy obligations under
 * principle V, not merely a nicety. One request per keystroke against a
 * courtesy endpoint is how such endpoints get closed.
 */

interface Suggestion {
  label: string;
  position: LatLon;
}

function toSuggestions(payload: unknown): Suggestion[] {
  if (typeof payload !== "object" || payload === null) return [];
  const features = (payload as { features?: unknown }).features;
  if (!Array.isArray(features)) return [];

  const out: Suggestion[] = [];
  for (const feature of features) {
    if (typeof feature !== "object" || feature === null) continue;
    const { geometry, properties } = feature as {
      geometry?: unknown;
      properties?: unknown;
    };
    const coordinates = (geometry as { coordinates?: unknown } | null)
      ?.coordinates;
    if (!Array.isArray(coordinates) || coordinates.length < 2) continue;
    const [lon, lat] = coordinates;
    if (typeof lon !== "number" || typeof lat !== "number") continue;

    const props = (properties ?? {}) as Record<string, unknown>;
    const parts = [props.name, props.street, props.city].filter(
      (part): part is string => typeof part === "string" && part !== "",
    );
    if (parts.length === 0) continue;

    out.push({ label: parts.join(", "), position: { lat, lon } });
  }
  return out;
}

export default function SearchField({
  label,
  placeholder,
  bias,
  onPick,
}: {
  label: string;
  placeholder: string;
  bias: LatLon;
  onPick: (position: LatLon, label: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [failed, setFailed] = useState(false);
  const controller = useRef<AbortController | null>(null);

  const trimmed = query.trim();
  const longEnough = trimmed.length >= GEOCODER_MIN_QUERY_LENGTH;

  // Derived rather than stored. Clearing state from inside the effect would
  // cascade an extra render for every keystroke below the threshold.
  const visible = longEnough ? suggestions : [];
  const showFailure = longEnough && failed;

  useEffect(() => {
    if (!longEnough) return;

    const timer = setTimeout(() => {
      // Cancel whatever is still in flight: only the latest query matters.
      controller.current?.abort();
      const abort = new AbortController();
      controller.current = abort;

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
          setSuggestions(toSuggestions(payload));
          setFailed(false);
        })
        .catch((error: unknown) => {
          if (error instanceof DOMException && error.name === "AbortError") return;
          setSuggestions([]);
          setFailed(true);
        });
    }, GEOCODER_DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [trimmed, longEnough, bias.lat, bias.lon]);

  return (
    <div>
      <label className="block text-sm font-medium">
        {label}
        <input
          type="search"
          className="mt-1 w-full rounded border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          placeholder={placeholder}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </label>

      {showFailure && (
        <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">
          Address search is unavailable right now. Click the map instead.
        </p>
      )}

      {visible.length > 0 && (
        <ul className="mt-1 divide-y divide-zinc-200 rounded border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
          {visible.map((suggestion, index) => (
            <li key={index}>
              <button
                type="button"
                className="w-full px-2 py-1.5 text-left text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800"
                onClick={() => {
                  onPick(suggestion.position, suggestion.label);
                  setQuery(suggestion.label);
                  setSuggestions([]);
                }}
              >
                {suggestion.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
