import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import NoStopComparison from "@/components/NoStopComparison";
import { formatMoney } from "@/lib/format";
import { STRINGS } from "@/lib/strings";
import { DEFAULT_PARAMETERS } from "@/lib/params";
import type { NoStopRide } from "@/lib/types";

/**
 * The comparison that lets a rider judge whether the stops are worth it.
 *
 * Not covered here, because jsdom has no layout and no map: that dismissing it
 * leaves the camera untouched (FR-134). That is verified by hand against
 * quickstart.md section 3.
 */

afterEach(cleanup);

const rate = DEFAULT_PARAMETERS.overageRate;

/**
 * The rendered amount as the DOM reports it.
 *
 * Intl separates the figure from the sign with a non-breaking space, and
 * Testing Library's default normaliser collapses it to a plain one. Comparing
 * against the raw output would fail on that invisible difference alone.
 */
const money = (amount: number): string =>
  formatMoney(amount, STRINGS.fr).replace(/\s/g, " ");

const billed: NoStopRide = {
  fromStationId: "a",
  toStationId: "c",
  duration: 65 * 60,
  distance: 9000,
  overage: 20 * 60,
  cost: 20 * rate,
  deltaAgainstPlan: -12 * 60,
};

const free: NoStopRide = {
  fromStationId: "a",
  toStationId: "b",
  duration: 30 * 60,
  distance: 5000,
  overage: 0,
  cost: 0,
  deltaAgainstPlan: -4 * 60,
};

const reveal = (): void => {
  fireEvent.click(screen.getByRole("button", { name: /sans aucun arrêt/i }));
};

describe("reachable in one action (FR-128, SC-007)", () => {
  it("offers a single control, and one click reveals the answer", () => {
    render(
      <NoStopComparison noStop={billed} overageRate={rate} stopCount={2} />,
    );
    const trigger = screen.getByRole("button", { name: /sans aucun arrêt/i });
    expect(trigger.getAttribute("aria-expanded")).toBe("false");

    fireEvent.click(trigger);
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByText(/d'une traite/i)).toBeTruthy();
  });

  it("returns to the trail when dismissed, revealing nothing", () => {
    render(
      <NoStopComparison noStop={billed} overageRate={rate} stopCount={2} />,
    );
    reveal();
    fireEvent.click(screen.getByRole("button", { name: /masquer/i }));
    expect(screen.queryByText(/d'une traite/i)).toBeNull();
  });
});

describe("what it reports (FR-129, FR-129a, FR-130)", () => {
  it("gives a duration, an amount, and the time it buys", () => {
    render(
      <NoStopComparison noStop={billed} overageRate={rate} stopCount={2} />,
    );
    reveal();

    expect(screen.getByText(/environ 65 min/i)).toBeTruthy();
    expect(screen.getByText(money(20 * rate))).toBeTruthy();
    expect(screen.getByText(/de moins/i)).toBeTruthy();
  });

  it("states that the amount is an estimate, pre-tax, and at what rate", () => {
    render(
      <NoStopComparison noStop={billed} overageRate={rate} stopCount={2} />,
    );
    reveal();

    const note = screen.getByText(/estimation avant taxes/i);
    expect(note.textContent).toMatch(/0,19\s?\$ la minute/);
  });

  it("follows the rate it is given rather than a constant", () => {
    render(
      <NoStopComparison
        noStop={{ ...billed, cost: 20 * 0.5 }}
        overageRate={0.5}
        stopCount={2}
      />,
    );
    reveal();
    expect(screen.getByText(money(10))).toBeTruthy();
    expect(screen.getByText(/0,50\s?\$ la minute/)).toBeTruthy();
  });

  it("says so plainly when the direct ride would still be free", () => {
    render(<NoStopComparison noStop={free} overageRate={rate} stopCount={1} />);
    reveal();
    expect(screen.getByText(/toujours gratuit/i)).toBeTruthy();
    expect(screen.queryByText(/tu paierais/i)).toBeNull();
  });

  it("never renders a clock time", () => {
    const { container } = render(
      <NoStopComparison noStop={billed} overageRate={rate} stopCount={2} />,
    );
    reveal();
    expect(container.textContent).not.toMatch(/\b\d{1,2}:\d{2}\b/);
  });
});

describe("when there is nothing to compare (FR-132)", () => {
  it("says there is no ride rather than showing an amount", () => {
    render(<NoStopComparison noStop={null} overageRate={rate} stopCount={1} />);
    reveal();
    expect(screen.getByText(/rien à comparer/i)).toBeTruthy();
    expect(screen.queryByText(/\$/)).toBeNull();
  });

  it("offers nothing at all when the trip already needs no stop", () => {
    const { container } = render(
      <NoStopComparison noStop={free} overageRate={rate} stopCount={0} />,
    );
    // The summary has already said the trip is free. There is no second trip.
    expect(container.textContent).toBe("");
  });
});
