"use client";

import { useLocale, useResolve } from "@/components/LocaleProvider";
import { LANGUAGES } from "@/lib/i18n/languages";

/**
 * FR / EN.
 *
 * Two segments rather than a dropdown: there are two languages, and a menu that
 * hides one of two choices behind a click is a menu that exists for nothing.
 *
 * No flags. A flag is a country, not a language, and here the question has no
 * neutral answer: French in Montreal is not the French flag, and English is
 * neither British nor American. docs/ui-guidelines.md names this entry "FR /
 * EN", which is also what every reader of either language recognises without
 * being taught.
 *
 * The active segment carries the accent, which is the third and last use that
 * document allows it. It is also marked with `aria-current`, so the state does
 * not rest on colour alone.
 *
 * On the size. This was two separate 44×44 bordered buttons, which made it the
 * tallest thing in the header by a wide margin: the wordmark line was 44px tall
 * to accommodate a control nobody presses twice in a session, and the sentence
 * that says what the product does was crushed underneath it. It is one 30px
 * segmented control now — a single bordered container with two segments, which
 * also reads as *one* choice rather than two buttons that happen to be adjacent.
 *
 * The touch target did not shrink with it. Each segment carries an `::after`
 * that extends its hit area vertically past the visual bounds to 44px, which is
 * the technique for exactly this case: a control that should look small and
 * still be pressable on a phone. The visual box is 24px, the target is 44px,
 * and nothing in the layout moves to pay for it.
 */
export default function LanguageToggle() {
  const { locale, strings, setLocale } = useLocale();
  const say = useResolve();

  return (
    <div
      className="flex shrink-0 items-center gap-0.5 rounded-control border border-edge p-0.5"
      role="group"
      aria-label={strings.language.label}
    >
      {LANGUAGES.map(({ id, name, code }) => {
        const active = id === locale;
        return (
          <button
            key={id}
            type="button"
            lang={id}
            aria-current={active ? "true" : undefined}
            // The name says what the control does, not merely what it is
            // labelled: "EN" alone tells a screen-reader user nothing.
            aria-label={say(strings.language.switchTo, { name })}
            className={[
              "relative flex h-6 items-center rounded-[5px] px-2 text-xs",
              // The hit area, 44px tall, reaching past the 24px box on both
              // sides. `content-['']` is what makes the pseudo-element exist at
              // all; without it the rest of these do nothing.
              "after:absolute after:inset-x-0 after:-inset-y-2.5 after:content-['']",
              active
                ? "bg-brand-soft font-medium text-brand-deep"
                : "text-muted hover:text-ink",
            ].join(" ")}
            onClick={() => setLocale(id)}
          >
            {code}
          </button>
        );
      })}
    </div>
  );
}
