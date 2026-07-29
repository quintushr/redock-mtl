"use client";

import { Moon, Sun } from "@/components/icons";
import { useStrings } from "@/components/LocaleProvider";
import { useTheme } from "@/components/ThemeProvider";

/**
 * Light or dark, in one button.
 *
 * A button and not a two-segment control like the language: there are two
 * states here as well, but unlike FR/EN one of them is always the one you are
 * already in, and a segmented control would spend the width of two targets
 * saying so. The icon shows what pressing it produces.
 *
 * Icon-only, so the accessible name carries the whole meaning — and it names
 * the *action*, not the state: "Passer au thème sombre" tells a screen-reader
 * user what will happen, where "Thème sombre" would leave them guessing whether
 * it is a label or a switch.
 *
 * `aria-pressed` is deliberately absent. This is not a toggle button holding a
 * state, it is a button whose label changes; announcing both the changed name
 * and a pressed state makes screen readers say the theme twice.
 */
export default function ThemeToggle() {
  const t = useStrings();
  const { theme, toggle } = useTheme();
  const dark = theme === "dark";
  const label = dark ? t.theme.toLight : t.theme.toDark;

  return (
    <button
      type="button"
      // Identical to the refresh beside it, down to the class list. They are
      // the same kind of thing in the same row, and the two used to differ:
      // this one dimmed its icon and lit it on hover, that one did not, which
      // read as one button being disabled next to one that was not.
      //
      // 44px of target inside a 40px row; the negative margin lets the hit area
      // outgrow the row without changing the row's height.
      className="state-layer -my-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-control text-muted enabled:hover:text-ink"
      aria-label={label}
      title={label}
      onClick={toggle}
    >
      {dark ? <Sun /> : <Moon />}
    </button>
  );
}
