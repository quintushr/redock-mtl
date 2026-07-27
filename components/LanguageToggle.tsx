"use client";

import { useLocale } from "@/components/LocaleProvider";
import { LOCALES, LOCALE_CODES, LOCALE_NAMES } from "@/lib/strings";

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

  return (
    <div
      className="flex items-center gap-1"
      role="group"
      aria-label={strings.language.label}
    >
      {LOCALES.map((code) => {
        const active = code === locale;
        return (
          <button
            key={code}
            type="button"
            lang={code}
            aria-current={active ? "true" : undefined}
            // The name says what the control does, not merely what it is
            // labelled: "EN" alone tells a screen-reader user nothing.
            aria-label={strings.language.switchTo(LOCALE_NAMES[code])}
            className={[
              "min-h-11 min-w-11 rounded-control border px-2 text-xs",
              active
                ? "border-brand bg-brand-soft font-medium text-brand-deep"
                : "border-transparent text-muted hover:bg-paper",
            ].join(" ")}
            onClick={() => setLocale(code)}
          >
            {LOCALE_CODES[code]}
          </button>
        );
      })}
    </div>
  );
}
