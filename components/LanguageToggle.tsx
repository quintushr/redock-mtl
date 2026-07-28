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
 */
export default function LanguageToggle() {
  const { locale, strings, setLocale } = useLocale();
  const say = useResolve();

  return (
    <div
      className="flex items-center gap-1"
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
              "min-h-11 min-w-11 rounded-control border px-2 text-xs",
              active
                ? "border-brand bg-brand-soft font-medium text-brand-deep"
                : "border-transparent text-muted hover:bg-paper",
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
