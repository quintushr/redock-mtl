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
 */
export default function PanelHeader() {
  const t = useStrings();

  return (
    <div className="flex shrink-0 items-center justify-between gap-2 border-b border-edge px-4 py-1">
      <p className="flex items-baseline gap-1.5 text-sm">
        <span
          aria-hidden="true"
          className="h-[9px] w-[9px] shrink-0 translate-y-[1px] rounded-[3px] bg-brand"
        />
        <span className="font-medium text-brand-deep">{t.app.name}</span>
        <span className="text-muted">{t.app.city}</span>
      </p>
      <LanguageToggle />
    </div>
  );
}
