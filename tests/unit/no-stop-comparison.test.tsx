import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import NoStopComparison from "@/components/NoStopComparison";
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
  fireEvent.click(screen.getByRole("button", { name: /without stopping/i }));
};

describe("reachable in one action (FR-128, SC-007)", () => {
  it("offers a single control, and one click reveals the answer", () => {
    render(
      <NoStopComparison noStop={billed} overageRate={rate} stopCount={2} />,
    );
    const trigger = screen.getByRole("button", { name: /without stopping/i });
    expect(trigger.getAttribute("aria-expanded")).toBe("false");

    fireEvent.click(trigger);
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByText(/in one go/i)).toBeTruthy();
  });

  it("returns to the trail when dismissed, revealing nothing", () => {
    render(
      <NoStopComparison noStop={billed} overageRate={rate} stopCount={2} />,
    );
    reveal();
    fireEvent.click(screen.getByRole("button", { name: /hide/i }));
    expect(screen.queryByText(/in one go/i)).toBeNull();
  });
});

describe("what it reports (FR-129, FR-129a, FR-130)", () => {
  it("gives a duration, an amount, and the time it buys", () => {
    render(
      <NoStopComparison noStop={billed} overageRate={rate} stopCount={2} />,
    );
    reveal();

    expect(screen.getByText(/about 65 min/i)).toBeTruthy();
    expect(screen.getByText(`$${(20 * rate).toFixed(2)}`)).toBeTruthy();
    expect(screen.getByText(/faster/i)).toBeTruthy();
  });

  it("states that the amount is an estimate, pre-tax, and at what rate", () => {
    render(
      <NoStopComparison noStop={billed} overageRate={rate} stopCount={2} />,
    );
    reveal();

    const note = screen.getByText(/estimated, before taxes/i);
    expect(note.textContent).toMatch(/\$0\.19 per minute/);
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
    expect(screen.getByText("$10.00")).toBeTruthy();
    expect(screen.getByText(/\$0\.50 per minute/)).toBeTruthy();
  });

  it("says so plainly when the direct ride would still be free", () => {
    render(<NoStopComparison noStop={free} overageRate={rate} stopCount={1} />);
    reveal();
    expect(screen.getByText(/still free/i)).toBeTruthy();
    expect(screen.queryByText(/you would pay/i)).toBeNull();
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
    expect(screen.getByText(/no ride to compare/i)).toBeTruthy();
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
