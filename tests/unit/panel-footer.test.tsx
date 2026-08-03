import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import PanelFooter from "@/components/PanelFooter";
import { snapshot } from "./fixture";
import { PROJECT_LINKS } from "@/lib/endpoints";
import { DEFAULT_PARAMETERS } from "@/lib/params";
import type { FeedStatus, PlanningParameters } from "@/lib/types";

/**
 * The three rows docs/ui-guidelines.md fixes, and the rules that make them worth
 * pinning: settings and refresh reachable without scrolling a long itinerary.
 *
 * What is NOT covered here, because jsdom has no layout: the 46px, 40px and 32px
 * row heights, the 44px touch targets, the safe-area padding, and that the footer
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
  const view = render(
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
  return { onToggleSettings, onRefresh, view };
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
    // One live region, because the refusal replaces the age rather than
    // joining it. Counting buttons no longer proves the row count: row 2 now
    // carries the theme control beside the refresh. The structural assertion
    // is in the describe below.
    expect(screen.getAllByRole("status")).toHaveLength(1);
  });

  it("goes back to reporting the age once a refresh is permitted", () => {
    renderFooter(at(7), DEFAULT_PARAMETERS, false, null);
    expect(screen.getByRole("status").textContent).not.toMatch(/à jour/i);
  });
});

describe("row 3 credits the author and points at the source", () => {
  /*
   * Asserted against PROJECT_LINKS rather than against a literal: lib/endpoints
   * is the one file allowed to write an external URL down, and a test that
   * repeated one here would be a second place to change when a link moves — and
   * would break the rule that no test file carries a real host.
   */
  it("links the author's name to their site", () => {
    renderFooter();
    const author = screen.getByRole("link", { name: /quentin harnay/i });
    expect(author.getAttribute("href")).toBe(PROJECT_LINKS.author);
  });

  it("links to the repository, saying where the link leads", () => {
    renderFooter();
    const source = screen.getByRole("link", { name: /github/i });
    expect(source.getAttribute("href")).toBe(PROJECT_LINKS.repository);
  });

  it("opens both away from the planner, without handing it the opener", () => {
    // A trip in progress is not something to navigate away from, and a new tab
    // that keeps a handle on this one is a hole rel="noopener" closes.
    renderFooter();
    for (const name of [/quentin harnay/i, /github/i]) {
      const link = screen.getByRole("link", { name });
      expect(link.getAttribute("target")).toBe("_blank");
      expect(link.getAttribute("rel")).toMatch(/noopener/);
    }
  });

  it("is closed at two links, which is what keeps it one row", () => {
    const { view } = renderFooter();
    const rowThree = view.container.firstElementChild?.children[2] as HTMLElement;
    expect(rowThree.querySelectorAll("a")).toHaveLength(2);
  });
});

describe("nothing else may join the three rows", () => {
  it("carries no attribution: that is the map's, by licence", () => {
    renderFooter();
    // The credits moved back onto the map. A footer that grows a third line
    // pushes these two out of reach on the itineraries that need them most.
    expect(screen.queryByText(/openstreetmap/i)).toBeNull();
  });

  /**
   * The rule docs/ui-guidelines.md actually states is about *rows*, not about
   * controls: "Exactement trois rangées, dans cet ordre, et rien d'autre ne peut
   * s'y ajouter."
   *
   * This used to be checked by counting buttons, which held only for as long as
   * each row had exactly one. The theme control joined row 2 rather than
   * becoming a row of its own — which is the only placement that satisfies both
   * this rule and a request to put it at the very bottom. Assert the structure
   * instead.
   */
  it("is three rows, whatever the controls on them", () => {
    const { view } = renderFooter();
    const footer = view.container.firstElementChild;
    expect(footer?.children).toHaveLength(3);
  });

  it("keeps the settings and the refresh above the credits", () => {
    // The order is the whole reason a third row was tolerable: the two rows a
    // rider actually uses stay where they were, at the top of the footer.
    const { view } = renderFooter();
    const [rowOne, rowTwo, rowThree] = [
      ...(view.container.firstElementChild?.children ?? []),
    ] as HTMLElement[];

    expect(rowOne.contains(screen.getByRole("button", { name: /réglages/i }))).toBe(true);
    expect(
      rowTwo.contains(
        screen.getByRole("button", { name: /actualiser les stations/i }),
      ),
    ).toBe(true);
    expect(rowThree.contains(screen.getByRole("link", { name: /github/i }))).toBe(
      true,
    );
  });

  it("keeps the theme control on row 2, beside the refresh", () => {
    const { view } = renderFooter();
    const rowTwo = view.container.firstElementChild?.children[1] as HTMLElement;

    const theme = screen.getByRole("button", { name: /thème/i });
    const refresh = screen.getByRole("button", {
      name: /actualiser les stations/i,
    });

    expect(rowTwo.contains(theme)).toBe(true);
    expect(rowTwo.contains(refresh)).toBe(true);
    // The refresh belongs to this row's own subject, so it stays last on it.
    expect(
      theme.compareDocumentPosition(refresh) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("names the theme control by the action it performs", () => {
    // Icon-only, so the accessible name is the whole of what a screen reader
    // gets. It must say what pressing does, not what the theme currently is.
    renderFooter();
    expect(
      screen.getByRole("button", { name: /passer au thème sombre/i }),
    ).toBeTruthy();
  });
});
