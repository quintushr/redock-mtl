import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import TripSummary from "@/components/TripSummary";
import { planTrip } from "@/lib/planner";
import { noStopRide } from "@/lib/pricing";
import { formatMoney } from "@/lib/format";
import { describe as descriptorFor } from "@/lib/i18n/languages";
import { messages as fr } from "@/lib/i18n/messages/fr";
import { DEFAULT_PARAMETERS } from "@/lib/params";
import type { Itinerary, NoStopRide } from "@/lib/types";
import { corridor, eastEnd, near, snapshot, westEnd } from "./fixture";

/**
 * The summary, which is now where the product makes its argument.
 *
 * The figures used to live behind a fold below the itinerary trail, which meant
 * the case for the product was made only to a reader who had already scrolled
 * past the answer and then chosen to open a disclosure. They are here now, and
 * the tests that matter most are the ones asserting they are *not* behind
 * anything.
 *
 * NOT covered here, because jsdom has no layout: that the reserved space for the
 * deferred amounts is the same height as the resolved block, that the whole
 * summary fits the collapsed rest position on a 700px screen, and that nothing
 * shifts when the amounts arrive. Those are measured by hand against
 * quickstart.md.
 */

afterEach(cleanup);

const params = DEFAULT_PARAMETERS;
const lang = descriptorFor("fr");

/** Intl separates the figure from the sign with a non-breaking space. */
const money = (amount: number): string =>
  formatMoney(amount, lang).replace(/\s/g, " ");

const planBetween = (from: typeof westEnd, to: typeof westEnd): Itinerary => {
  const result = planTrip(near(from), near(to), snapshot, params);
  if (!result.ok) throw new Error("fixture must plan");
  return result.itinerary;
};

/** One stop, and riding straight through would be billed. */
const withSaving = planBetween(westEnd, eastEnd);
/** One stop, but the direct ride still fits the free window. */
const withoutSaving = planBetween(corridor[0].position, corridor[9].position);
/** Short enough that the planner returns no stop. */
const noStopNeeded = planBetween(corridor[0].position, corridor[3].position);

const rideFor = (itinerary: Itinerary): NoStopRide | null =>
  noStopRide(itinerary, snapshot.stations, params);

const renderSummary = (itinerary: Itinerary, settled: boolean) =>
  render(
    <TripSummary
      itinerary={itinerary}
      noStop={rideFor(itinerary)}
      settled={settled}
      params={params}
    />,
  );

/** Any amount at all, in the locale's own currency shape. */
const anyMoney = /\d[\d\s ]*[,.]\d\d\s*\$/;

describe("while the itinerary is still being revised", () => {
  it("answers the duration and the stop count immediately", () => {
    const { container } = renderSummary(withSaving, false);

    // The plan is readable before any tracing completes, which feature 004
    // requires and this deferral must not undo.
    expect(container.textContent).toMatch(/\d/);
    expect(screen.getByText(fr.summary.pricingPending)).toBeTruthy();
  });

  it("shows no amount at all", () => {
    // The whole point. A price that corrects itself while being read is worse
    // than a price that arrives a moment late (FR-408a).
    const { container } = renderSummary(withSaving, false);
    expect(container.textContent).not.toMatch(anyMoney);
  });

  it("shows no amount even for a trip that would save nothing", () => {
    const { container } = renderSummary(withoutSaving, false);
    expect(container.textContent).not.toMatch(anyMoney);
  });
});

describe("once the itinerary has settled", () => {
  describe("and the stops save real money", () => {
    it("shows all three figures", () => {
      const ride = rideFor(withSaving);
      if (ride === null) throw new Error("fixture must compare");
      renderSummary(withSaving, true);

      // The planned cost, which for a plan the planner built is zero.
      expect(screen.getByText(money(0))).toBeTruthy();

      // The direct cost and the saving, which are the same figure whenever the
      // plan itself is free — the ordinary case, and worth pinning: it is what
      // makes "you save $3.46" mean "the stops cost you nothing".
      expect(screen.getAllByText(money(ride.cost))).toHaveLength(2);
    });

    it("labels which amount is which", () => {
      renderSummary(withSaving, true);

      expect(screen.getByText(fr.summary.withStops)).toBeTruthy();
      expect(screen.getByText(fr.summary.withoutStops)).toBeTruthy();
      expect(screen.getByText(fr.summary.saved)).toBeTruthy();
    });

    it("states the assumptions the amounts rest on", () => {
      // FR-407: free window, rate, mechanical bike, taxes excluded. An amount
      // a reader cannot reconcile against the operator's published price reads
      // as an error.
      const { container } = renderSummary(withSaving, true);
      const text = container.textContent ?? "";

      expect(text).toMatch(/45 min/);
      expect(text).toMatch(/mécanique/i);
      expect(text).toMatch(/taxes/i);
    });

    it("keeps the time comparison beside the money", () => {
      // FR-410. The stops cost time and save money; a reader deciding between
      // them needs both halves of that trade.
      const { container } = renderSummary(withSaving, true);
      expect(container.textContent).toMatch(/d'une traite/i);
    });

    it("puts nothing behind a disclosure", () => {
      // FR-403. There is no fold, so there is no control that opens one.
      renderSummary(withSaving, true);
      expect(screen.queryAllByRole("button")).toHaveLength(0);
    });
  });

  describe("and the stops save nothing", () => {
    it("says so in words rather than showing a zero", () => {
      renderSummary(withoutSaving, true);
      expect(screen.getByText(fr.summary.savesNothing)).toBeTruthy();
    });

    it("shows no pair of amounts to interpret", () => {
      const { container } = renderSummary(withoutSaving, true);
      expect(container.textContent).not.toMatch(anyMoney);
      expect(screen.queryByText(fr.summary.saved)).toBeNull();
    });
  });

  describe("and the plan has no stop at all", () => {
    it("says no stop is needed", () => {
      renderSummary(noStopNeeded, true);
      expect(screen.getByText(fr.summary.noStopNeeded)).toBeTruthy();
    });

    it("shows neither two identical amounts nor a zero difference", () => {
      // FR-406a. Two identical figures beside a zero invite the reader to hunt
      // for the mistake, and answer a question nobody asked.
      const { container } = renderSummary(noStopNeeded, true);
      expect(container.textContent).not.toMatch(anyMoney);
      expect(screen.queryByText(fr.summary.saved)).toBeNull();
    });
  });

  describe("and there is nothing to compare", () => {
    it("says what it can rather than inventing a figure", () => {
      // The anchor stations left the snapshot between planning and rendering.
      render(
        <TripSummary
          itinerary={withSaving}
          noStop={null}
          settled
          params={params}
        />,
      );

      const { container } = render(<div />);
      void container;
      expect(screen.getByText(fr.summary.noStopNeeded)).toBeTruthy();
    });
  });
});

describe("across the whole surface", () => {
  it("never renders a broken value in any state", () => {
    for (const itinerary of [withSaving, withoutSaving, noStopNeeded]) {
      for (const settled of [true, false]) {
        const { container, unmount } = renderSummary(itinerary, settled);
        expect(container.textContent).not.toMatch(/NaN|undefined|\[object/);
        unmount();
      }
    }
  });

  it("still says the durations are estimates", () => {
    // Principle IV. Adding amounts must not crowd out the hedge on the times.
    renderSummary(withSaving, true);
    expect(screen.getByText(fr.summary.estimate)).toBeTruthy();
  });
});
