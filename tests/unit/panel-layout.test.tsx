import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import PlannerPanel from "@/components/PlannerPanel";

/**
 * Where things sit in the panel, which is what "sticky footer, only the trail
 * scrolls" actually means once it is code.
 *
 * jsdom has no layout, so none of this measures a pixel. What it does check is
 * the structure the pixels follow from, and that structure is the part that
 * rots: a footer moved one level in becomes a footer that scrolls away, and
 * nothing in a screenshot taken the same day would show it.
 *
 * The measurements themselves — 46px, 40px, the 44px targets, the safe area,
 * and the three widths — are recorded in docs/ui-guidelines.md and checked by
 * hand.
 */

afterEach(cleanup);

const renderPanel = () =>
  render(
    <PlannerPanel
      footer={<div data-testid="footer">footer</div>}
      overlay={<div data-testid="overlay">overlay</div>}
    >
      <div data-testid="trail">trail</div>
    </PlannerPanel>,
  );

/** The one element allowed to scroll. */
function scrollContainer(): HTMLElement {
  const found = document
    .querySelector("section")
    ?.querySelectorAll(".overflow-y-auto");
  expect(found?.length).toBe(1);
  return found?.[0] as HTMLElement;
}

describe("only the itinerary scrolls", () => {
  it("has exactly one scroll container, and the trail is in it", () => {
    renderPanel();
    expect(scrollContainer().contains(screen.getByTestId("trail"))).toBe(true);
  });

  it("keeps the footer out of it, which is what pins it", () => {
    renderPanel();
    // The whole point. A footer inside the scroll is a footer that leaves the
    // screen exactly on the long itineraries where its two rows matter most.
    expect(scrollContainer().contains(screen.getByTestId("footer"))).toBe(false);
  });

  it("puts the footer after the scroll area, so it sits at the bottom", () => {
    renderPanel();
    const footer = screen.getByTestId("footer");
    const position = scrollContainer().compareDocumentPosition(footer);
    expect(position & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

describe("the settings cover the panel rather than push it", () => {
  it("puts the overlay outside the scroll area, not in its flow", () => {
    renderPanel();
    // Inside the flow it would displace the trail and drop the reader
    // somewhere they never chose when it closed (FR-122).
    expect(scrollContainer().contains(screen.getByTestId("overlay"))).toBe(
      false,
    );
  });

  it("leaves the itinerary mounted underneath", () => {
    renderPanel();
    // Not "erases the displayed itinerary": it is still in the document, still
    // holding its own scroll offset, and comes back untouched.
    expect(screen.getByTestId("trail")).toBeTruthy();
    expect(screen.getByTestId("overlay")).toBeTruthy();
  });

  it("shares a positioned parent with the scroll area it covers", () => {
    renderPanel();
    const parent = screen.getByTestId("overlay").parentElement;
    expect(parent?.className).toMatch(/\brelative\b/);
    expect(parent?.contains(scrollContainer())).toBe(true);
  });
});
