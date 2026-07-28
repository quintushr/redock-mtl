# Phase 1 Contracts: Maintainable Translation System

**Feature**: `003-maintainable-i18n` | **Date**: 2026-07-27

Three contracts: the pure resolution modules, the React binding components consume, and
the file a translator delivers. Wording itself is governed by `docs/ui-guidelines.md`
and is not specified here.

---

## Part 1: Pure domain modules

`lib/` may not import React, `react-dom`, `maplibre-gl`, or anything from `components/`
or `app/`. `eslint.config.mjs` enforces it; principle III requires it. Everything below
is testable without a DOM.

### `lib/i18n/types.ts`

```ts
/** A language the interface can speak. */
export type LanguageId = "fr" | "en";

/** CLDR plural categories. `other` is the only one every language has. */
export type PluralCategory = "zero" | "one" | "two" | "few" | "many" | "other";

/** A message that varies by count. `other` is required. */
export type PluralMessage = Partial<Record<PluralCategory, string>> & {
  other: string;
};

export type Message = string | PluralMessage;

/** Values substituted into a message. Counts arrive as numbers; everything
 *  else arrives already formatted for the active language. */
export type MessageValues = Record<string, string | number>;
```

### `lib/i18n/languages.ts`

```ts
export interface LanguageDescriptor {
  readonly id: LanguageId;
  /** How the language names itself. Never how another language names it. */
  readonly name: string;
  /** The short form the toggle shows. */
  readonly code: string;
  /** BCP 47 tag driving Intl. Distinct from `id`: the language is `fr`,
   *  the conventions are Quebec's. */
  readonly formatting: string;
}

/** The reference language. Its wording defines the shape every other must hold,
 *  and it is what an untranslated entry falls back to (FR-203). */
export const REFERENCE: LanguageId;

/** Registering a language here is the whole of making it available (FR-218).
 *  Everything the toggle needs is derived from this, so no second list can
 *  drift out of step (FR-221). */
export const LANGUAGES: readonly LanguageDescriptor[];

export function describe(id: LanguageId): LanguageDescriptor;
export function isLanguageId(value: unknown): value is LanguageId;
```

**Invariant**: no export of this module, or of any module under `lib/i18n/`, yields the
wording of a named language. That is what makes FR-202 structural rather than a
convention someone has to remember.

### `lib/i18n/resolve.ts`

Pure. No state, no storage, no DOM. This is the whole of what FR-207 permits a message
to do.

```ts
/**
 * Substitutes `{name}` placeholders. Textual and single-pass: a substituted
 * value is never rescanned, so a place name containing braces cannot inject a
 * placeholder.
 *
 * An unknown placeholder is left as written rather than replaced with a blank,
 * so the mistake is visible instead of silently swallowed.
 */
export function fill(template: string, values?: MessageValues): string;

/**
 * Selects the plural category for `count` in `language`, through
 * Intl.PluralRules, and fills it. Falls back to `other` when the language's
 * category is absent, which the checks would already have failed on.
 *
 * The count is available to the message as {count} without being passed twice.
 */
export function plural(
  message: PluralMessage,
  count: number,
  formatting: string,
  values?: MessageValues,
): string;

/** Every leaf path in a tree, dotted, sorted. The basis of every check. */
export function leafPaths(tree: unknown): readonly string[];

/** The placeholder names a message uses, deduplicated. Across every category
 *  of a plural message, since a language may use a placeholder in one form and
 *  not another. */
export function placeholders(message: Message): ReadonlySet<string>;
```

### `lib/i18n/coverage.ts`

Pure, and the single implementation behind both the blocking tests (FR-211, FR-212,
FR-214, FR-215) and the on-demand report (FR-216). One implementation so the report and
the gate cannot disagree.

**Trees enter as arguments.** This module does not read the registry, does not know
which languages exist, and does not touch the filesystem. That is what lets its tests
run in Phase 2, before any wording has been ported, over small hand-written trees.

```ts
export interface Coverage {
  readonly total: number;
  readonly translated: number;
  /** All blocking (FR-211, FR-212, FR-214, FR-215). */
  readonly missing: readonly string[];
  readonly orphaned: readonly string[];
  readonly placeholderMismatch: readonly PlaceholderMismatch[];
  readonly suspectedUntranslated: readonly string[];
}

export interface PlaceholderMismatch {
  readonly path: string;
  readonly expected: readonly string[];
  readonly actual: readonly string[];
}

export function coverageOf(
  reference: Messages,
  candidate: Messages,
  intentionallyIdentical: readonly string[],
): Coverage;

/** True when nothing blocking was found. */
export function passes(coverage: Coverage): boolean;
```

**`unreferenced` is deliberately absent from this module.** Deciding whether an entry is
read anywhere requires scanning source files, which is filesystem I/O, and principle III
forbids a domain module from doing anything but taking arguments and returning values.
It lives in `scripts/i18n-report.mjs` instead, which is a build-time script and free to
read the tree. FR-213 is satisfied there, and its advisory-only severity follows
naturally from living outside the code that gates the test run.

### `lib/format.ts` (changed)

Behaviour is preserved exactly. **Signatures change**, and they have to: these functions
read the Intl tag from `t.units.locale` today, and FR-220 moves that tag onto the
descriptor. A message tree can no longer yield it, so the descriptor must be passed.

```ts
/** Behaviour unchanged. Rounds to the minute below ten and to five minutes
 *  above, so a figure cannot be read as a measurement (principle IV).
 *
 * Changed inside: performs the hours/minutes split itself and selects among
 * `units.durationHours`, `units.durationMinutes` and
 * `units.durationHoursMinutes`. The arithmetic duplicated in both language
 * bundles today is gone from the wording (FR-207a). Takes no descriptor: the
 * three entries use invariable unit symbols, so none varies by plural
 * category. If that ever changes, this gains one.
 */
export function approximateDuration(seconds: Seconds, t: Messages): string;

/** Unchanged, including its signature. Language-free: a number is a number. */
export function roundedMinutes(seconds: Seconds): number;

/** Behaviour unchanged. Words the unit from `t`, formats the figure against
 *  `lang.formatting` (FR-220). */
export function formatDistance(
  metres: Metres,
  t: Messages,
  lang: LanguageDescriptor,
): string;

/** Behaviour unchanged. Needs no wording, only conventions. */
export function formatDecimal(
  value: number,
  digits: number,
  lang: LanguageDescriptor,
): string;
export function formatMoney(amount: number, lang: LanguageDescriptor): string;
```

**Consequence for the migration**: 20 call sites across five components pass an extra
argument. `components/RemainingGauge.tsx` is untouched, because `roundedMinutes` is the
one language-free function here. The affected components are `EmptyState`,
`ItineraryTrail`, `NoStopComparison`, `AssumptionsLine` and `TripSummary`.

The React binding gains one hook to supply it:

```ts
/** The active language's descriptor. Separate from useStrings() so that the
 *  92 wording call sites keep reading `t.group.entry` unchanged. */
export function useLanguage(): LanguageDescriptor;
```

**Invariant preserved**: nothing in this module can produce a clock time or an arrival
time, in any language (FR-223, principle IV, FR-113).

---

## Part 2: The React binding

### `components/LocaleProvider.tsx` (changed)

The store, the persistence and the `useSyncExternalStore` reading are unchanged. What
changes is what the hooks hand back and what no longer exists.

```ts
/** Unchanged: the store is the browser, not a React tree, so a component
 *  rendered alone in a test reads what the application reads. */
export function useLocale(): {
  locale: LanguageId;
  strings: Strings;
  setLocale: (next: LanguageId) => void;
};

/** The common case. Unchanged. */
export function useStrings(): Messages;

/**
 * Turns a message into a sentence: substitutes values, and selects the plural
 * category when the message varies by count. One hook for both kinds, so a call
 * site need not know which it holds — and so that turning a plain entry into a
 * plural one later is a change to the wording file alone.
 */
export function useResolve(): (message: Message, values?: MessageValues) => string;

/** Unchanged: a screen reader picks its voice from the document's lang. */
export function DocumentLanguage(props: { children: React.ReactNode }): JSX.Element;
```

**Removed**: `export const t: Strings = fr` from `lib/strings.ts:654`, and the `STRINGS`
record it indexed. After this change no module outside `lib/i18n/` can name a language
and receive its wording.

### `lib/i18n/static-metadata.ts` — the one exception (FR-202a)

```ts
/**
 * The page title and description, in the default language.
 *
 * A static export ships one document, so its metadata has one language. This
 * is the only fixed-language wording that exists, and ESLint confines this
 * module to app/layout.tsx: nothing a rider interacts with can reach it.
 */
export const STATIC_METADATA: { readonly title: string; readonly description: string };
```

Enforced by a file-scoped `no-restricted-imports` entry in `eslint.config.mjs`, the same
mechanism already keeping React out of `lib/`.

---

## Part 3: The translator's contract

What one language file must contain. This is the unit FR-218 calls "a new wording file",
and the whole of what someone adding a language delivers.

```ts
// lib/i18n/messages/en.ts

import type { Messages } from "../types";

/** Typed against the reference, so a missing or misspelled key is a compile
 *  error rather than a blank label a rider discovers. */
export const messages: Messages = {
  summary: {
    // Shown under the itinerary. {count} is the number of docking stops.
    stops: {
      one: "1 stop to stay inside the free window. This trip is free.",
      other: "{count} stops to stay inside the free window. This trip is free.",
    },
  },
  // …
};

/** Entries deliberately identical to the reference. Without this declaration
 *  they fail the checks as suspected-untranslated (FR-215). */
export const intentionallyIdentical = [
  "app.name",
  "app.city",
  "fields.destination",
  "trail.destination",
  "attribution.stations",
] as const;
```

**Rules a language file must satisfy**:

| Rule | Enforced by |
|---|---|
| Holds every leaf the reference holds, and no others | Compile error, and FR-211/FR-212 checks |
| Contains no logic, no arithmetic, no function bodies | The `Messages` type admits only strings and plural maps |
| Uses the same placeholder names as the reference, per message | FR-214 check |
| Provides `other` on every plural message, plus whatever categories the language uses | The `PluralMessage` type |
| Declares any entry it keeps identical to the reference | FR-215 check |
| Notes for translators are comments above the entry | Convention; FR-209 |

**What a translator never has to touch**: any component, any test, `lib/format.ts`, or
the registry beyond one line adding the descriptor.

---

## Part 4: Test contracts

The checks the spec requires, and where each lives so `npm test` runs all of them
(FR-217).

| Test | Requirement | Severity |
|---|---|---|
| `tests/unit/i18n-coverage.test.ts` | FR-211, FR-212, FR-214, FR-215 | Fails the run |
| `tests/unit/i18n-resolve.test.ts` | FR-207, FR-219: substitution and plural selection, including a language with more than two categories | Fails the run |
| `tests/unit/i18n-language-sweep.test.tsx` | FR-201, FR-202b, SC-001: every screen and state rendered in English, no French in text or accessible names | Fails the run |
| `tests/unit/i18n-parity.test.ts` | FR-222a: byte-exact reproduction of the pre-migration capture | Fails the run, then is **deleted** (FR-222b) |
| `scripts/i18n-report.mjs` | FR-213, FR-216, SC-005 | Reports; never fails |

The sweep derives the French string set from the reference file rather than listing it,
so it covers entries added after it was written.
