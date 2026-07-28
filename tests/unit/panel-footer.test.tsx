import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import PanelFooter from "@/components/PanelFooter";
import { snapshot } from "./fixture";
import { DEFAULT_PARAMETERS } from "@/lib/params";
import type { FeedStatus, PlanningParameters } from "@/lib/types";

/**
 * The two rows docs/ui-guidelines.md fixes, and the rules that make them worth
 * pinning: settings and refresh reachable without scrolling a long itinerary.
 *
 * What is NOT covered here, because jsdom has no layout: the 46px and 40px row
 * heights, the 44px touch targets, the safe-area padding, and that the footer
 * stays visible at both of the sheet's rest positions. Those are measured by
 * hand at 360px, 768px and 1440px.
 */

afterEach(cleanup);

const at = (minutesAgo: number): FeedStatus => ({
  state: "ready",
  snapshot: {
    ...snapshot,
    observedAt: new Date(Date.now() - minutesAgo * 60_000),
  },
});

const renderFooter = (
  status: FeedStatus = at(0),
  parameters: PlanningParameters = DEFAULT_PARAMETERS,
  settingsOpen = false,
  refreshWait: number | null = null,
) => {
  const onToggleSettings = vi.fn();
  const onRefresh = vi.fn();
  render(
    <PanelFooter
      parameters={parameters}
      settingsOpen={settingsOpen}
      onToggleSettings={onToggleSettings}
      settingsPanelId="settings"
      status={status}
      onRefresh={onRefresh}
      refreshWait={refreshWait}
    />,
  );
  return { onToggleSettings, onRefresh };
};

describe("row 1 is a button, never a disclosure list", () => {
  it("puts the label, the summary and the state on one control", () => {
    renderFooter();
    const row = screen.getByRole("button", { name: /réglages/i });
    // The whole row, not the label alone: the summary text is inside the same
    // control, which is what makes the hit area the width of the panel.
    expect(row.textContent).toMatch(/valeurs par défaut/i);
    expect(row.getAttribute("aria-expanded")).toBe("false");
    expect(row.getAttribute("aria-controls")).toBe("settings");
  });

  it("reports the overlay as open when it is", () => {
    renderFooter(at(0), DEFAULT_PARAMETERS, true);
    expect(
      screen.getByRole("button", { name: /réglages/i }).getAttribute("aria-expanded"),
    ).toBe("true");
  });

  it("opens the settings rather than changing a parameter itself", () => {
    const { onToggleSettings } = renderFooter();
    fireEvent.click(screen.getByRole("button", { name: /réglages/i }));
    expect(onToggleSettings).toHaveBeenCalledTimes(1);
    // No slider in the footer. The controls are the overlay's business.
    expect(screen.queryAllByRole("slider")).toHaveLength(0);
  });

  it("says how many assumptions were changed, so the row alone answers it", () => {
    renderFooter(at(0), { ...DEFAULT_PARAMETERS, cyclingSpeed: 5 });
    expect(
      screen.getByRole("button", { name: /réglages/i }).textContent,
    ).toMatch(/1 valeur modifiée/i);
  });
});

describe("row 2 states an age, not a clock time", () => {
  /*
   * The age arrives one tick after the render.
   *
   * `Date.now()` is read in an effect rather than during render, because the
   * render must stay pure and a static export has no "now" to bake in. So these
   * wait for it rather than asserting on the first paint.
   */
  it("says the snapshot is fresh when it just arrived", async () => {
    renderFooter(at(0));
    expect(await screen.findByText(/à l'instant/i)).toBeTruthy();
  });

  it("words the age in relative terms as it grows", async () => {
    renderFooter(at(7));
    expect(await screen.findByText(/il y a 7 min/i)).toBeTruthy();
  });

  it("keeps the exact moment available, which FR-014 requires", () => {
    const status = at(7);
    renderFooter(status);
    const observed = status.state === "ready" ? status.snapshot.observedAt : null;
    const time = screen.getByText(/relevé à/i);
    expect(time.getAttribute("datetime")).toBe(observed?.toISOString());
  });

  it("says the feed is loading rather than showing a stale age", () => {
    renderFooter({ state: "loading" });
    expect(screen.getByRole("status").textContent).toMatch(/chargement/i);
  });
});

describe("row 2 carries the refresh", () => {
  it("asks the feed again, named in words", () => {
    const { onRefresh } = renderFooter();
    fireEvent.click(
      screen.getByRole("button", { name: /actualiser les stations/i }),
    );
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it("is inert while a load is already in flight", () => {
    renderFooter({ state: "loading" });
    const refresh = screen.getByRole("button", {
      name: /actualiser les stations/i,
    }) as HTMLButtonElement;
    expect(refresh.disabled).toBe(true);
  });

  it("says how long remains when the ask was too soon", () => {
    // The floor is ours, not the operator's, so the rider has done nothing
    // wrong and the row does not tell them off. It says the data is as new as
    // it is allowed to be, and when they may look again (FR-421).
    renderFooter(at(0), DEFAULT_PARAMETERS, false, 42);
    expect(screen.getByRole("status").textContent).toMatch(/42/);
    expect(screen.getByRole("status").textContent).toMatch(/à jour/i);
  });

  it("puts the refusal in row 2 rather than growing a third", () => {
    renderFooter(at(0), DEFAULT_PARAMETERS, false, 42);
    expect(screen.getAllByRole("button")).toHaveLength(2);
    expect(screen.getAllByRole("status")).toHaveLength(1);
  });

  it("goes back to reporting the age once a refresh is permitted", () => {
    renderFooter(at(7), DEFAULT_PARAMETERS, false, null);
    expect(screen.getByRole("status").textContent).not.toMatch(/à jour/i);
  });
});

describe("nothing else may join the two rows", () => {
  it("carries no attribution: that is the map's, by licence", () => {
    renderFooter();
    // The credits moved back onto the map. A footer that grows a third line
    // pushes these two out of reach on the itineraries that need them most.
    expect(screen.queryByText(/openstreetmap/i)).toBeNull();
    expect(screen.getAllByRole("button")).toHaveLength(2);
  });
});
