"use client";

import { useEffect, useState } from "react";
import { useLanguage, useResolve, useStrings } from "@/components/LocaleProvider";
import { ChevronDown, Refresh, Sliders } from "@/components/icons";
import { approximateDuration, relativeAge } from "@/lib/format";
import { changedCount } from "@/lib/params";
import type { FeedStatus, PlanningParameters } from "@/lib/types";

/**
 * The panel's sticky footer: exactly two rows, and nothing else may join them.
 *
 * docs/ui-guidelines.md, "Pied de panneau", is unusually prescriptive here, and
 * for a reason worth restating: on a long itinerary the settings and the refresh
 * are the two things a reader needs without scrolling, and everything that ever
 * gets added to a footer pushes them out of reach one line at a time.
 *
 * Row 1, 46px: settings. A button, never a disclosure list, and the whole row is
 * the hit area rather than the label alone.
 * Row 2, 40px: how old the figures are, and the control that renews them.
 *
 * The map attribution is deliberately not here. It sits on the map, where the
 * tile licences require it, and where it no longer competes with these two rows
 * for the one part of the panel that never scrolls.
 */

/** How often the age re-words itself. */
const TICK_MS = 30_000;

/**
 * Row 1. The settings trigger.
 *
 * `aria-expanded` and `aria-controls` rather than a link, because the overlay it
 * opens is a sibling that stays in the same document and leaves the itinerary
 * mounted underneath.
 */
function SettingsRow({
  parameters,
  open,
  onToggle,
  controls,
}: {
  parameters: PlanningParameters;
  open: boolean;
  onToggle: () => void;
  controls: string;
}) {
  const t = useStrings();
  const say = useResolve();
  const changed = changedCount(parameters);

  return (
    <button
      type="button"
      className="flex min-h-[46px] w-full items-center gap-2 px-4 text-left hover:bg-paper"
      aria-expanded={open}
      aria-controls={controls}
      onClick={onToggle}
    >
      <Sliders className="shrink-0 text-muted" />
      <span className="shrink-0 text-sm font-medium">{t.settings.label}</span>
      {/*
        The active values, right-aligned and allowed to be the thing that gives
        way: it is a summary of a summary, and the label beside it is what the
        row is for.
      */}
      <span className="ml-auto min-w-0 truncate text-right text-xs text-muted">
        {changed === 0
          ? say(t.settings.summaryDefaults, {
              margin: approximateDuration(parameters.safetyMargin, t),
            })
          : say(t.settings.summaryChanged, {
              margin: approximateDuration(parameters.safetyMargin, t),
              count: changed,
            })}
      </span>
      <ChevronDown
        className={[
          "shrink-0 text-muted",
          open ? "rotate-180" : "",
          "motion-safe:transition-transform motion-safe:duration-150",
        ].join(" ")}
      />
    </button>
  );
}

/**
 * Row 2. How old the figures are, and the button that renews them.
 *
 * The row is 40px and the button is 44px, which is the guidelines' own
 * arrangement: the visual rhythm wants the shorter row, the finger wants the
 * larger target, and negative margin is what lets the second overflow the first
 * without the row growing.
 */
function FreshnessRow({
  status,
  onRefresh,
  refreshWait,
}: {
  status: FeedStatus;
  onRefresh: () => void;
  /** Seconds until another fetch is permitted, or null when nothing was refused. */
  refreshWait: number | null;
}) {
  const t = useStrings();
  const say = useResolve();
  const lang = useLanguage();

  /**
   * The current time, held as state and moved by a timer.
   *
   * The timer is what makes the age re-word itself: "3 min ago" that stays
   * "3 min ago" for a quarter of an hour is worse than the clock time it
   * replaced, because it is a clock time that lies. Thirty seconds is under the
   * one-minute granularity displayed, so the figure is never more than a tick
   * behind.
   *
   * State and not a `Date.now()` in the render body, which React's purity rule
   * rightly rejects. It also settles what a static export should paint: the
   * build has no "now", so the first paint has no age, and the age appears with
   * the snapshot it describes rather than being baked into the HTML.
   */
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    const update = (): void => setNow(Date.now());
    /*
     * Deferred rather than called in the effect body: a synchronous setState
     * there cascades an extra render, and React's lint rule rightly rejects it.
     * The same shape as the geolocation denial in PlannerShell, for the same
     * reason.
     *
     * Re-run on every `status`, not only on its state: a refresh that returns
     * the same state still returns a new snapshot, and the age has to restart
     * from that one rather than keep counting from the previous.
     */
    const first = setTimeout(update, 0);
    if (status.state === "loading" || status.state === "unavailable") {
      return () => clearTimeout(first);
    }
    const timer = setInterval(update, TICK_MS);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [status]);

  const loading = status.state === "loading";
  const observedAt =
    status.state === "ready" || status.state === "stale"
      ? status.snapshot.observedAt
      : null;

  /*
   * Measured against now, not the feed's own `age` field: that one was taken
   * when the snapshot arrived and does not grow while the tab stays open, which
   * is the whole thing this row exists to show.
   */
  const age =
    observedAt === null || now === null
      ? null
      : (now - observedAt.getTime()) / 1000;

  return (
    <div className="flex min-h-10 items-center gap-2 px-4">
      {/*
        The refusal replaces the age rather than joining it. The row is one line
        and docs/ui-guidelines.md closes this footer to a third, so a message
        that needed its own line would have nowhere to go — and the two never
        need saying at once: "already up to date" is a statement about the very
        age it stands in for.
      */}
      <p className="min-w-0 flex-1 truncate text-xs text-muted" role="status">
        {loading
          ? t.feed.loading
          : refreshWait !== null
            ? say(t.feed.refreshTooSoon, { seconds: refreshWait })
            : age === null
              ? ""
              : say(t.feed.freshness, { age: relativeAge(age, t) })}
      </p>

      {/*
        The exact moment, kept and not discarded. FR-014 requires availability to
        be stated as a snapshot at a moment; the relative form answers "is this
        stale" and this answers "which moment", for whoever needs it.
      */}
      {observedAt !== null && (
        <time className="sr-only" dateTime={observedAt.toISOString()}>
          {say(t.feed.observedAt, {
            time: observedAt.toLocaleTimeString(lang.formatting, {
              hour: "2-digit",
              minute: "2-digit",
            }),
          })}
        </time>
      )}

      <button
        type="button"
        // 44px of target inside a 40px row, and -my-0.5 keeps the row's height.
        className="-my-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-control hover:bg-paper disabled:text-muted"
        aria-label={t.feed.refresh}
        title={t.feed.refresh}
        disabled={loading}
        onClick={onRefresh}
      >
        <Refresh
          className={
            loading ? "motion-safe:animate-spin motion-safe:[animation-duration:1.4s]" : ""
          }
        />
      </button>
    </div>
  );
}

export default function PanelFooter({
  parameters,
  settingsOpen,
  onToggleSettings,
  settingsPanelId,
  status,
  onRefresh,
  refreshWait,
}: {
  parameters: PlanningParameters;
  settingsOpen: boolean;
  onToggleSettings: () => void;
  /** The overlay this footer's first row controls. */
  settingsPanelId: string;
  status: FeedStatus;
  onRefresh: () => void;
  /** Seconds until another fetch is permitted, or null. See FreshnessRow. */
  refreshWait?: number | null;
}) {
  return (
    <div
      className={[
        // Above the overlay, so the row that opened the settings is also the row
        // that closes them.
        "relative z-20 shrink-0 border-t border-edge bg-panel",
        // The sheet's bottom edge is the phone's bottom edge, and on a handset
        // with a home indicator that is not where a control may sit.
        "pb-[env(safe-area-inset-bottom)] md:pb-0",
      ].join(" ")}
    >
      <SettingsRow
        parameters={parameters}
        open={settingsOpen}
        onToggle={onToggleSettings}
        controls={settingsPanelId}
      />
      <div className="border-t border-edge">
        <FreshnessRow
          status={status}
          onRefresh={onRefresh}
          refreshWait={refreshWait ?? null}
        />
      </div>
    </div>
  );
}
