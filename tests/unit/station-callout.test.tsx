import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import StationCallout from "@/components/StationCallout";
import { messages as fr } from "@/lib/i18n/messages/fr";
import type { Station } from "@/lib/types";

/**
 * What a tap on a station marker gets you.
 *
 * This is the answer to the quality floor's rule that nothing may exist at hover
 * only. The markers carry availability as the length of a ring and no more, which
 * is right for several hundred points and useless to a reader who has picked one
 * and wants to know whether walking there is worth it. On a touch screen there is
 * no hover to reveal it, so it has to be reachable by tap, and this is the thing
 * a tap reaches.
 */

afterEach(cleanup);

const station: Station = {
  id: "b",
  name: "Métro Champ-de-Mars (Viger / Sanguinet)",
  position: { lat: 45.51, lon: -73.556 },
  capacity: 31,
  mechanicalBikesAvailable: 3,
  ebikesAvailable: 4,
  docksAvailable: 0,
  isInstalled: true,
  isRenting: true,
  isReturning: true,
};

const empty: Station = {
  ...station,
  id: "c",
  name: "Station Vide",
  mechanicalBikesAvailable: 0,
  docksAvailable: 1,
};

describe("the callout answers both halves of the question", () => {
  it("states the mechanical bikes and the free docks", () => {
    render(
      <StationCallout station={station} onUse={() => {}} onClose={() => {}} />,
    );
    // They answer different questions: bikes decide whether a ride can start
    // here, docks decide whether one can end here. This station has three bikes
    // and no free dock, which is a station you leave from and cannot arrive at.
    expect(screen.getByText("3 vélos mécaniques")).toBeTruthy();
    expect(screen.getByText("0 ancrage libre")).toBeTruthy();
  });

  it("counts mechanical bikes only, never the e-bikes beside them", () => {
    // The free window does not apply to an e-bike, which is why the markers
    // ignore them too. This station holds four; naming them here would offer a
    // rider seven bikes for a plan that can use three.
    const { container } = render(
      <StationCallout station={station} onUse={() => {}} onClose={() => {}} />,
    );
    expect(container.textContent).not.toContain("7");
    expect(container.textContent).not.toContain("4 ");
  });

  it("puts zero in the singular in French, which is where French puts it", () => {
    render(<StationCallout station={empty} onUse={() => {}} onClose={() => {}} />);
    expect(screen.getByText("0 vélo mécanique")).toBeTruthy();
    expect(screen.getByText("1 ancrage libre")).toBeTruthy();
  });

  it("names the station in full, however long the name is", () => {
    // The name that broke the itinerary rows. Nothing here truncates it either.
    render(
      <StationCallout station={station} onUse={() => {}} onClose={() => {}} />,
    );
    expect(screen.getByText(station.name)).toBeTruthy();
  });
});

describe("the callout is where a point gets placed", () => {
  it("offers both ends of the trip", () => {
    render(
      <StationCallout station={station} onUse={() => {}} onClose={() => {}} />,
    );
    expect(screen.getByRole("button", { name: fr.station.useAsOrigin })).toBeTruthy();
    expect(
      screen.getByRole("button", { name: fr.station.useAsDestination }),
    ).toBeTruthy();
  });

  it("hands the whole station back, not merely a point", () => {
    // The caller needs the name as well as the position: a field filled from a
    // station should say which station, not a pair of coordinates.
    const onUse = vi.fn();
    render(
      <StationCallout station={station} onUse={onUse} onClose={() => {}} />,
    );
    fireEvent.click(screen.getByRole("button", { name: fr.station.useAsOrigin }));
    expect(onUse).toHaveBeenCalledWith("origin", station);

    fireEvent.click(
      screen.getByRole("button", { name: fr.station.useAsDestination }),
    );
    expect(onUse).toHaveBeenCalledWith("destination", station);
  });

  it("keeps both actions at a finger's size", () => {
    render(
      <StationCallout station={station} onUse={() => {}} onClose={() => {}} />,
    );
    for (const label of [fr.station.useAsOrigin, fr.station.useAsDestination]) {
      // jsdom cannot measure, so the class carrying the floor is what is checked.
      // 44px is the quality floor's minimum and these are the two controls on
      // this surface a rider actually presses.
      expect(
        screen.getByRole("button", { name: label }).className,
      ).toContain("min-h-11");
    }
  });
});

describe("the callout can always be got rid of", () => {
  it("closes on its own control", () => {
    const onClose = vi.fn();
    render(
      <StationCallout station={station} onUse={() => {}} onClose={onClose} />,
    );
    fireEvent.click(screen.getByRole("button", { name: fr.station.close }));
    expect(onClose).toHaveBeenCalled();
  });

  it("closes on Escape, because its buttons are in the tab order", () => {
    // A keyboard reader can land inside this. Without Escape their only way out
    // would be tabbing past the end of it, which is not a way out.
    const onClose = vi.fn();
    render(
      <StationCallout station={station} onUse={() => {}} onClose={onClose} />,
    );
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });

  it("does not claim to be modal", () => {
    // The map and the panel behind it stay usable, so `dialog` would be a lie
    // and a focus trap would be worse than the problem.
    render(
      <StationCallout station={station} onUse={() => {}} onClose={() => {}} />,
    );
    expect(screen.queryByRole("dialog")).toBeNull();
    const group = screen.getByRole("group");
    expect(group.getAttribute("aria-label")).toContain(station.name);
  });
});

describe("the callout carries no forbidden treatment", () => {
  it("has no shadow and no gradient", () => {
    // docs/ui-guidelines.md forbids both outright, and a popup is exactly where
    // a shadow gets added without anyone deciding to.
    const { container } = render(
      <StationCallout station={station} onUse={() => {}} onClose={() => {}} />,
    );
    const markup = container.innerHTML;
    expect(markup).not.toMatch(/shadow-/);
    expect(markup).not.toMatch(/gradient/);
  });

  it("spends the accent on nothing but the destination mark", () => {
    const { container } = render(
      <StationCallout station={station} onUse={() => {}} onClose={() => {}} />,
    );
    // One occurrence: the pin on "Aller ici", which is the same grammar the
    // entry block and the trail use for a destination.
    expect(container.innerHTML.match(/text-brand/g)).toHaveLength(1);
  });
});
