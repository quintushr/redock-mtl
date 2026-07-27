"use client";

import LanguageToggle from "@/components/LanguageToggle";
import { useStrings } from "@/components/LocaleProvider";

/**
 * The panel's header: the product's name, and the language.
 *
 * docs/ui-guidelines.md forbids a navigation bar on the planner and puts these
 * entries in the panel header instead, for a stated reason: a permanent bar
 * would cost 56px of map height on a phone for no gain. Inside the panel it
 * costs panel height, which is the surface that is already there.
 *
 * The document also lists "À propos" and "Suggérer une idée" here. Neither page
 * exists yet, and a menu entry pointing nowhere is worse than no menu, so this
 * header carries the two entries that have somewhere to go.
 */
export default function PanelHeader() {
  const t = useStrings();

  return (
    <div className="flex shrink-0 items-center justify-between gap-2 border-b border-line px-4 py-1">
      <span className="text-sm font-medium">{t.app.name}</span>
      <LanguageToggle />
    </div>
  );
}
