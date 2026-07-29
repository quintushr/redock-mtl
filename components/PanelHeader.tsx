"use client";

import LanguageToggle from "@/components/LanguageToggle";
import { useStrings } from "@/components/LocaleProvider";

/**
 * The panel's header: the product's name, its city, and the language.
 *
 * docs/ui-guidelines.md forbids a navigation bar on the planner and puts these
 * entries in the panel header instead, for a stated reason: a permanent bar
 * would cost 56px of map height on a phone for no gain. Inside the panel it
 * costs panel height, which is the surface that is already there.
 *
 * On the red. That document reserves the accent to three uses and this is a
 * fourth, so it is a deliberate departure, recorded here and worth recording
 * there too. It is also split in two, because one red cannot do both jobs:
 *
 *   --brand      #E0402B  the mark, a non-text element, 4,25:1, owes 3:1
 *   --brand-deep #8F2517  the wordmark, text at 14px, 8,59:1, owes 4,5:1
 *
 * #E0402B as 14px text is 4,25:1 and fails AA, which is why the vivid red is
 * on the square and the darker one on the letters. Neither is sampled from the
 * operator's own brand: this is not their product, and the about page says so.
 *
 * The document also lists "À propos" and "Suggérer une idée" here. Neither page
 * exists yet, and a menu entry pointing nowhere is worse than no menu.
 *
 * On the second line. It states what the product does and why stopping saves
 * money, and it never leaves — before any endpoint is entered, and still there
 * once a plan is on screen (FR-414). That permanence is what removed the need
 * for a control to recall the explanation: a sentence always in view cannot
 * need bringing back, and an overlay opened to deliver one sentence is a
 * mechanism heavier than the thing it serves (FR-417).
 *
 * It costs panel height on every screen, permanently, including the collapsed
 * rest position where the summary has just claimed more room. That trade is
 * accepted once and only once: this is one line of content and nothing else may
 * join it. It wraps rather than truncating, because a subtitle ending in an
 * ellipsis states nothing (FR-419a).
 */
export default function PanelHeader() {
  const t = useStrings();

  return (
    <div className="shrink-0 border-b border-edge px-4 pt-2 pb-2.5">
      <div className="flex items-center justify-between gap-3">
        {/*
          The wordmark at 16px rather than 14px. It is the one thing in the
          panel that names the product, and it was set at body size next to a
          44px control that outweighed it — so the eye landed on "FR / EN"
          first. Sixteen is the "titres de section" step of the type scale, not
          a new size.

          The city drops to 12px muted in the same move. It was the same size
          and weight as the product's name, which made two words of equal
          loudness where one is a name and the other is a qualifier.
        */}
        <p className="flex min-w-0 items-baseline gap-1.5">
          <span
            aria-hidden="true"
            className="h-[9px] w-[9px] shrink-0 translate-y-[-1px] rounded-[3px] bg-brand"
          />
          <span className="truncate text-base leading-none font-medium text-brand-deep">
            {t.app.name}
          </span>
          <span className="truncate text-xs leading-none text-muted">
            {t.app.city}
          </span>
        </p>

        <LanguageToggle />
      </div>

      {/*
        Full width, under both the wordmark and the toggle, so it has the whole
        panel to wrap into and competes with nothing for horizontal room.
        `text-balance` keeps a two-line wrap from leaving one orphan word.

        `leading-snug` rather than the default: at 12px over two lines the
        default leading opened a gap wide enough to read as a paragraph break
        inside a single sentence.
      */}
      <p className="mt-1.5 text-xs leading-snug text-balance text-muted">
        {t.app.tagline}
      </p>
    </div>
  );
}
