"use client";

import { useEffect, useState } from "react";
import { useLanguage, useResolve, useStrings } from "@/components/LocaleProvider";
import { ChevronDown, Refresh, Sliders } from "@/components/icons";
import ThemeToggle from "@/components/ThemeToggle";
import { PROJECT_LINKS } from "@/lib/endpoints";
import { approximateDuration, relativeAge } from "@/lib/format";
import { changedCount } from "@/lib/params";
import type { FeedStatus, PlanningParameters } from "@/lib/types";

/**
 * The panel's sticky footer: exactly three rows, and nothing else may join them.
 *
 * docs/ui-guidelines.md, "Pied de panneau", is unusually prescriptive here, and
 * for a reason worth restating: on a long itinerary the settings and the refresh
 * are the two things a reader needs without scrolling, and everything that ever
 * gets added to a footer pushes them out of reach one line at a time.
 *
 * Row 1, 46px: settings. A button, never a disclosure list, and the whole row is
 * the hit area rather than the label alone.
 * Row 2, 40px: how old the figures are, and the control that renews them.
 * Row 3, 32px: the credits. Added 2026-08-03.
 *
 * Row 3 is last and is the shortest of the three on purpose. It is read once, if
 * ever, where the two above it are used on every trip, so it takes the position
 * and the height that cost them the least — and the rule the original two rows
 * were given, that settings and refresh stay reachable without scrolling, holds
 * exactly as before.
 *
 * The map attribution is still deliberately not here. It sits on the map, where
 * the tile licences require it, and where it does not compete with these rows for
 * the one part of the panel that never scrolls.
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
      className="state-layer flex min-h-[46px] w-full items-center gap-2 px-4 text-left"
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

      {/*
        The theme, at the very bottom of the panel.

        docs/ui-guidelines.md closes this footer to two rows and says nothing
        else may be added, so this joins row 2 rather than becoming a row 3 —
        which is also the only reading of "at the very bottom" that survives
        that rule. It sits before the refresh because the refresh belongs to
        this row's own subject and should stay the last thing on it.

        The two are 44px targets side by side with no gap between their boxes;
        they are distinguishable by icon and by name, and the row has no third
        control to crowd them.
      */}
      <ThemeToggle />

      <button
        type="button"
        // 44px of target inside a 40px row, and -my-0.5 keeps the row's height.
        // Same class list as the theme control beside it, deliberately.
        //
        // Disabled is opacity rather than a colour: the icon is already --muted
        // at rest, so dimming it *to* muted was a no-op and a load in flight
        // looked exactly like one that was not.
        className="state-layer -my-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-control text-muted enabled:hover:text-ink disabled:opacity-40"
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

/**
 * Row 3. Who wrote this, and where the source is.
 *
 * Two links, and the row is closed at two: a credit line is exactly the kind of
 * thing that grows an item at a time until it is a site footer, which is the
 * failure mode the two rows above were written to avoid.
 *
 * Plain text links rather than a logo. The icon set is one stroke width in a
 * 20x20 box and the GitHub mark is a filled glyph, so an icon here would either
 * break that rule or be a worse GitHub mark than no mark at all; "Code sur
 * GitHub" also says where the link leads, which a bare logo does not.
 *
 * The links fill the row's height, so the target is the whole 32px rather than
 * the cap height of 12px text.
 */
function CreditsRow() {
  const t = useStrings();

  return (
    <div className="flex min-h-8 items-center justify-between gap-3 px-4 text-xs text-muted">
      <a
        className="state-layer -mx-1 flex min-h-8 min-w-0 items-center truncate rounded-control px-1 underline underline-offset-2 hover:text-ink"
        href={PROJECT_LINKS.author}
        target="_blank"
        rel="noopener noreferrer"
      >
        {t.credits.author}
      </a>
      <a
        className="state-layer -mx-1 flex min-h-8 shrink-0 items-center rounded-control px-1 underline underline-offset-2 hover:text-ink"
        href={PROJECT_LINKS.repository}
        target="_blank"
        rel="noopener noreferrer"
      >
        {t.credits.source}
      </a>
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
      <div className="border-t border-edge">
        <CreditsRow />
      </div>
    </div>
  );
}
