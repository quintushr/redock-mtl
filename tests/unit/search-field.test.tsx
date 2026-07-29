import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import SearchField from "@/components/SearchField";
import type { LatLon } from "@/lib/types";

/**
 * The two guaranteed input paths of FR-002, the ones that must work with the
 * geocoder unreachable: a coordinate pair typed by hand, and arming the map.
 *
 * No test here touches the network. The one assertion about fetch is that it is
 * *not* called: querying a courtesy endpoint for input we can resolve ourselves
 * is exactly the behaviour principle V rules out.
 */

afterEach(cleanup);

const MONTREAL: LatLon = { lat: 45.5088, lon: -73.5878 };

function setup(overrides: Partial<Parameters<typeof SearchField>[0]> = {}) {
  const onPick = vi.fn();
  const onValueChange = vi.fn();
  const onArm = vi.fn();
  const onClear = vi.fn();
  const fetchSpy = vi.fn();
  vi.stubGlobal("fetch", fetchSpy);

  const props = {
    label: "Départ",
    clearLabel: "Effacer le départ",
    placeholder: "Adresse",
    value: "",
    point: null,
    bias: MONTREAL,
    armed: false,
    onValueChange,
    onPick,
    onClear,
    onArm,
    ...overrides,
  };

  const view = render(<SearchField {...props} />);
  const rerender = (next: Partial<typeof props>) =>
    view.rerender(<SearchField {...props} {...next} />);

  return { onPick, onValueChange, onArm, onClear, fetchSpy, rerender };
}

describe("typing a coordinate pair", () => {
  it("offers the point directly and never asks the geocoder", () => {
    const { onPick, fetchSpy, rerender } = setup();

    const input = screen.getByRole("combobox");
    fireEvent.change(input, { target: { value: "45.5088, -73.5878" } });
    rerender({ value: "45.5088, -73.5878" });

    const option = screen.getByRole("option", { name: /45\.5088, -73\.5878/ });
    fireEvent.click(option);

    expect(onPick).toHaveBeenCalledWith(
      { lat: 45.5088, lon: -73.5878 },
      "45.5088, -73.5878",
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("text that did not come from the keyboard", () => {
  it("opens no list and sends no request when a map click fills the field", () => {
    const { fetchSpy, rerender } = setup();

    // What a map click does: the parent sets the text, nobody typed anything.
    rerender({ value: "45.51234, -73.55678", point: { lat: 45.51234, lon: -73.55678 } });

    expect(screen.queryAllByRole("option")).toHaveLength(0);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("arming the map", () => {
  it("says which end it is arming and reports the toggle", () => {
    const { onArm } = setup();
    const button = screen.getByRole("button", { name: /choisir sur la carte/i });
    expect(button.getAttribute("aria-pressed")).toBe("false");

    fireEvent.click(button);
    expect(onArm).toHaveBeenCalled();
  });

  it("shows the armed state rather than leaving the user guessing", () => {
    setup({ armed: true });
    const button = screen.getByRole("button", { name: /touche la carte/i });
    expect(button.getAttribute("aria-pressed")).toBe("true");
  });

  /**
   * Typing the field empty has to clear the point too, or the pin stays on the
   * map and the plan stays computed under a field that reads as empty.
   */
  it("clears the point when the field is emptied, not just the text", () => {
    const { rerender, onClear } = setup();
    rerender({ point: MONTREAL, value: "45.5088, -73.5878" });

    fireEvent.change(screen.getByRole("combobox"), { target: { value: "" } });
    expect(onClear).toHaveBeenCalled();
  });

  it("does not clear a point that was never set", () => {
    const { onClear } = setup();
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "" } });
    expect(onClear).not.toHaveBeenCalled();
  });
});

/**
 * The cross inside the row, which replaced a full-width "Effacer" button.
 *
 * docs/ui-guidelines.md, "Saisie du départ et de la destination": clearing is a
 * discreet cross in the row, shown only when the row holds something, and never
 * a text button. The name says which end it clears, because two identical
 * crosses sit 38px apart.
 */
describe("clearing the row", () => {
  it("shows no cross while the row is empty", () => {
    setup();
    expect(screen.queryByRole("button", { name: /effacer/i })).toBeNull();
  });

  it("shows a cross once the row holds something, and clears on press", () => {
    const { onClear } = setup({ value: "45.5088, -73.5878", point: MONTREAL });

    const cross = screen.getByRole("button", { name: /effacer le départ/i });
    fireEvent.click(cross);
    expect(onClear).toHaveBeenCalled();
  });

  it("offers no text button to clear with", () => {
    setup({ value: "45.5088, -73.5878", point: MONTREAL });
    for (const button of screen.getAllByRole("button")) {
      expect(button.textContent).toBe("");
    }
  });
});

/**
 * No visible label. The rail and the pin beside the rows carry that, which is
 * what gets the block from about 180px to 78px; the name survives where a
 * screen reader looks for it.
 */
describe("the row's naming", () => {
  it("names the input without drawing a heading above it", () => {
    setup();
    expect(screen.getByRole("combobox", { name: "Départ" })).toBeTruthy();
    expect(document.querySelector("label")).toBeNull();
  });
});
