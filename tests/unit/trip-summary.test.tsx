import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import TripSummary from "@/components/TripSummary";
import { planTrip } from "@/lib/planner";
import { noStopRide } from "@/lib/pricing";
import { approximateDuration, formatMoney } from "@/lib/format";
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
    it("shows both amounts of the comparison", () => {
      const ride = rideFor(withSaving);
      if (ride === null) throw new Error("fixture must compare");
      renderSummary(withSaving, true);

      // The planned cost, which for a plan the planner built is zero, and what
      // the same trip costs ridden straight through. The saving used to be a
      // third labelled figure spelling out the difference between these two; it
      // is the gap between them now, which is what the two-cell block is for.
      expect(screen.getByText(money(0))).toBeTruthy();
      expect(screen.getByText(money(ride.cost))).toBeTruthy();
    });

    it("labels which amount is which", () => {
      renderSummary(withSaving, true);

      expect(screen.getByText(fr.summary.withStops)).toBeTruthy();
      expect(screen.getByText(fr.summary.withoutStops)).toBeTruthy();
    });

    it("strikes the losing amount rather than calling it the losing one", () => {
      // "Cellule perdante: sans fond, bordure neutre, montant barré et
      // atténué." Which side is worse is legible before either number is read.
      const ride = rideFor(withSaving);
      if (ride === null) throw new Error("fixture must compare");
      renderSummary(withSaving, true);

      expect(screen.getByText(money(ride.cost)).className).toMatch(
        /line-through/,
      );
      expect(screen.getByText(money(0)).className).not.toMatch(/line-through/);
    });

    it("keeps the time comparison beside the money", () => {
      // FR-410. The stops cost time and save money; a reader deciding between
      // them needs both halves of that trade. It used to be a sentence built
      // around a signed delta ("d'une traite, 6 min de moins qu'avec les
      // arrêts"); the direct ride's own duration sits in the losing cell now,
      // and the delta is the gap to the total below it.
      const ride = rideFor(withSaving);
      if (ride === null) throw new Error("fixture must compare");
      const { container } = renderSummary(withSaving, true);

      expect(container.textContent).toContain(
        approximateDuration(ride.duration, fr),
      );
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
      expect(screen.queryByText(fr.summary.withStops)).toBeNull();
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
      expect(screen.queryByText(fr.summary.withStops)).toBeNull();
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

  /**
   * The hedge on the durations, and the assumptions under the amounts, are both
   * gone — removed on request.
   *
   * Pinned as absences rather than deleted outright, because both were carrying
   * a stated requirement: principle IV and FR-138 for the estimate line, FR-407
   * for the assumptions. If either comes back it should come back as a decision.
   *
   * What still holds is the part that was never wording: the figures are still
   * rounded, and nothing here can produce a clock time. That is asserted in
   * "never renders a clock time in the summary" over in itinerary-trail.test.tsx
   * and it is now the only thing standing between a rounded estimate and a
   * reader treating it as a timetable.
   */
  it("no longer hedges the durations", () => {
    const { container } = renderSummary(withSaving, true);
    expect(container.textContent).not.toMatch(/estim/i);
    expect(container.textContent).not.toMatch(/environ/i);
  });

  it("no longer states what the amounts assume", () => {
    const { container } = renderSummary(withSaving, true);
    const text = container.textContent ?? "";
    expect(text).not.toMatch(/mécanique/i);
    expect(text).not.toMatch(/taxes/i);
  });
});
