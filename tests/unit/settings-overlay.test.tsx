import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import AssumptionsLine from "@/components/AssumptionsLine";
import { DEFAULT_PARAMETERS } from "@/lib/params";
import type { PlanningParameters } from "@/lib/types";

/**
 * The assumptions: one line at rest, one control when opened.
 *
 * What is NOT covered here, because jsdom has no layout: that opening this
 * leaves the reading position and the map camera untouched (FR-122, FR-123,
 * FR-124). Those are verified by hand against quickstart.md section 3.
 */

afterEach(cleanup);

const withParams = (patch: Partial<PlanningParameters>): PlanningParameters => ({
  ...DEFAULT_PARAMETERS,
  ...patch,
});

const renderLine = (
  parameters: PlanningParameters = DEFAULT_PARAMETERS,
  correction: string | null = null,
) => {
  const onChange = vi.fn();
  render(
    <AssumptionsLine
      parameters={parameters}
      onChange={onChange}
      correction={correction}
    />,
  );
  return { onChange };
};

const open = (): void => {
  fireEvent.click(screen.getByRole("button", { name: /réglages/i }));
};

const showRest = (): void => {
  fireEvent.click(
    screen.getByRole("button", { name: /afficher les autres réglages/i }),
  );
};

describe("at rest it is one line (FR-103, FR-125)", () => {
  it("offers a single control and no slider until opened", () => {
    renderLine();
    expect(screen.getAllByRole("button")).toHaveLength(1);
    expect(screen.queryAllByRole("slider")).toHaveLength(0);
  });

  it("says the assumptions are the defaults when they are", () => {
    renderLine();
    expect(screen.getByText(/valeurs par défaut/i)).toBeTruthy();
  });

  it("says how many were changed when some were", () => {
    renderLine(withParams({ safetyMargin: 600, cyclingSpeed: 5 }));
    expect(screen.getByText(/2 valeurs modifiées/i)).toBeTruthy();
    expect(screen.queryByText(/valeurs par défaut/i)).toBeNull();
  });

  it("uses the singular for a single change", () => {
    renderLine(withParams({ safetyMargin: 600 }));
    expect(screen.getByText(/1 valeur modifiée/i)).toBeTruthy();
  });
});

describe("opened, the safety margin is the only first-level control (FR-120, FR-121)", () => {
  it("shows exactly one slider, and it is the safety margin", () => {
    renderLine();
    open();

    const sliders = screen.getAllByRole("slider");
    expect(sliders).toHaveLength(1);
    expect(screen.getByLabelText(/marge de sécurité/i)).toBe(sliders[0]);
  });

  it("keeps the other assumptions in a group that starts closed", () => {
    renderLine();
    open();

    const disclosure = screen.getByRole("button", {
      name: /afficher les autres réglages/i,
    });
    expect(disclosure.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByLabelText(/vitesse à vélo/i)).toBeNull();
  });

  it("exposes every remaining parameter once that group is opened", () => {
    renderLine();
    open();
    showRest();

    // One slider per planning parameter, the safety margin included. Nothing
    // that influences the result may be unreachable (principle IV). This count
    // is derived from DEFAULT_PARAMETERS, so a parameter added later fails this
    // test until it is given a control.
    expect(screen.getAllByRole("slider")).toHaveLength(
      Object.keys(DEFAULT_PARAMETERS).length,
    );
    expect(screen.getByLabelText(/vitesse à vélo/i)).toBeTruthy();
    expect(screen.getByLabelText(/facteur de détour/i)).toBeTruthy();
  });
});

describe("reset (FR-127)", () => {
  it("restores every default in one action", () => {
    const { onChange } = renderLine(
      withParams({ safetyMargin: 900, maxWalkDistance: 1500 }),
    );

    open();
    fireEvent.click(screen.getByRole("button", { name: /tout réinitialiser/i }));

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(DEFAULT_PARAMETERS);
  });

  it("is offered but inert when nothing has been changed", () => {
    renderLine();
    open();
    const reset = screen.getByRole("button", {
      name: /tout réinitialiser/i,
    }) as HTMLButtonElement;
    expect(reset.disabled).toBe(true);
  });
});

describe("changing the safety margin (FR-120)", () => {
  it("reports the new value without touching any other assumption", () => {
    const { onChange } = renderLine();
    open();

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
    renderLine(
      withParams({ safetyMargin: 4000 }),
      "La marge de sécurité doit être plus courte que la fenêtre gratuite.",
    );
    open();
    expect(screen.getByRole("alert").textContent).toMatch(
      /plus courte que la fenêtre gratuite/i,
    );
  });
});
