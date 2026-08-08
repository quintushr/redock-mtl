import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import SettingsOverlay from "@/components/SettingsOverlay";
import { DEFAULT_PARAMETERS } from "@/lib/params";
import type { PlanningParameters } from "@/lib/types";

/**
 * The assumptions, as the overlay docs/ui-guidelines.md asks for.
 *
 * What is NOT covered here, because jsdom has no layout: that opening this
 * leaves the reading position and the map camera untouched (FR-122, FR-123,
 * FR-124), and that it covers the trail rather than displacing it. Those are
 * verified by hand against quickstart.md.
 */

afterEach(cleanup);

const withParams = (patch: Partial<PlanningParameters>): PlanningParameters => ({
  ...DEFAULT_PARAMETERS,
  ...patch,
});

const renderOverlay = (
  parameters: PlanningParameters = DEFAULT_PARAMETERS,
  correction: string | null = null,
  open = true,
) => {
  const onChange = vi.fn();
  const onClose = vi.fn();
  render(
    <SettingsOverlay
      id="settings"
      open={open}
      onClose={onClose}
      parameters={parameters}
      onChange={onChange}
      correction={correction}
    />,
  );
  return { onChange, onClose };
};

describe("closed, it is not in the document at all", () => {
  it("renders nothing, so the trail underneath keeps every pixel", () => {
    renderOverlay(DEFAULT_PARAMETERS, null, false);
    expect(screen.queryAllByRole("slider")).toHaveLength(0);
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });
});

describe("opened, every parameter is on screen at once (FR-120, principle IV)", () => {
  it("shows one slider per planning parameter, with nothing nested", () => {
    renderOverlay();

    // Derived from DEFAULT_PARAMETERS, so a parameter added later fails this
    // test until it is given a control. Nothing that influences the result may
    // be unreachable, and here nothing is even one click away.
    expect(screen.getAllByRole("slider")).toHaveLength(
      Object.keys(DEFAULT_PARAMETERS).length,
    );
    expect(screen.getByLabelText(/vitesse à vélo/i)).toBeTruthy();
    expect(screen.getByLabelText(/facteur de détour/i)).toBeTruthy();
  });

  it("leads with the safety margin, the one adjusted regularly", () => {
    renderOverlay();
    expect(screen.getAllByRole("slider")[0]).toBe(
      screen.getByLabelText(/marge de sécurité/i),
    );
  });

  it("offers no disclosure to open, because there is nothing left behind one", () => {
    renderOverlay();
    expect(
      screen.queryByRole("button", { name: /autres réglages/i }),
    ).toBeNull();

    /*
     * A disclosure is a control that says it reveals something, and that is
     * what `aria-expanded` is. Asserting on that rather than on a head count of
     * the buttons, which is what this used to do: the count broke the day a
     * fourth control that reveals nothing was added beside the other three, and
     * a test that fails for the thing it is not about is a test that gets
     * edited rather than read.
     */
    for (const button of screen.getAllByRole("button")) {
      expect(button.getAttribute("aria-expanded")).toBeNull();
    }
  });
});

describe("closing it", () => {
  it("offers a control that says what it does", () => {
    const { onClose } = renderOverlay();
    fireEvent.click(
      screen.getByRole("button", { name: /fermer les réglages/i }),
    );
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes on Escape, because a cover over the answer must be dismissible", () => {
    const { onClose } = renderOverlay();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe("reset (FR-127)", () => {
  it("restores every default in one action", () => {
    const { onChange } = renderOverlay(
      withParams({ safetyMargin: 900, maxWalkDistance: 1500 }),
    );

    fireEvent.click(screen.getByRole("button", { name: /tout réinitialiser/i }));

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(DEFAULT_PARAMETERS);
  });

  it("is offered but inert when nothing has been changed", () => {
    renderOverlay();
    const reset = screen.getByRole("button", {
      name: /tout réinitialiser/i,
    }) as HTMLButtonElement;
    expect(reset.disabled).toBe(true);
  });
});

describe("changing the safety margin (FR-120)", () => {
  it("reports the new value without touching any other assumption", () => {
    const { onChange } = renderOverlay();

    fireEvent.change(screen.getByLabelText(/marge de sécurité/i), {
      target: { value: "8" },
    });

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith({
      ...DEFAULT_PARAMETERS,
      safetyMargin: 8 * 60,
    });
  });
});

describe("an unusable value is explained, not swallowed (FR-126)", () => {
  it("surfaces the correction as an alert", () => {
    renderOverlay(
      withParams({ safetyMargin: 4000 }),
      "La marge de sécurité doit être plus courte que la fenêtre gratuite.",
    );
    expect(screen.getByRole("alert").textContent).toMatch(
      /plus courte que la fenêtre gratuite/i,
    );
  });
});
