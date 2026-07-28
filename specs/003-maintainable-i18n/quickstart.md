# Quickstart: Working with the Translation System

**Feature**: `003-maintainable-i18n` | **Date**: 2026-07-27

Everything here is what the system looks like **after** this feature lands. It is
written for the person doing the smallest possible job, first.

---

## Correct a sentence

1. Open `lib/i18n/messages/fr.ts` for French, or `en.ts` for English.
2. Find the entry by the part of the interface it belongs to. The groups are named
   after what a rider sees: `fields`, `summary`, `trail`, `settings`, `feed`.
3. Change the text. Leave the key alone.
4. `npm test`.

You do not touch the other language, any component, or any test. That is the whole of
SC-002.

**If you changed a French sentence and not its English counterpart**, nothing fails —
the two are independent sentences. If you changed it because it was *wrong*, the English
one is probably wrong the same way.

---

## Add a new piece of wording

1. Add the entry to `lib/i18n/messages/fr.ts`, in the group it belongs to. Write a
   `//` comment above it saying what it is for and what any `{placeholder}` stands for.
2. Add it to every other language file. TypeScript will tell you that you have to; it
   will not compile until you do.
3. Use it from a component through `useStrings()`.
4. `npm test`.

**Placeholders**: write `{place}`, not string concatenation. Every language must use the
same set of names for the same entry, and the checks compare them.

**Counts**: write a plural map, never a comparison.

```ts
stops: {
  one:   "1 arrêt pour rester dans la fenêtre gratuite.",
  other: "{count} arrêts pour rester dans la fenêtre gratuite.",
},
```

`Intl.PluralRules` picks the category for the active language. Note that French puts
zero in `one` and English puts it in `other` — which is exactly why this is not a
comparison you write yourself.

---

## Add a language

1. Copy `lib/i18n/messages/fr.ts` to `lib/i18n/messages/<id>.ts` and translate it.
   Keep every key; change only the text.
2. Add a descriptor to `LANGUAGES` in `lib/i18n/languages.ts`:

   ```ts
   { id: "es", name: "Español", code: "ES", formatting: "es-CA" }
   ```

3. `npm test`.

That is the entire procedure (FR-218, SC-004). The toggle picks the language up from
the registry; nothing else has a list to update.

**What the checks will tell you**:

- Entries you have not translated yet → the run fails, naming each one.
- Entries you left identical to the French on purpose (a product name, a code) → the run
  fails until you list them in `intentionallyIdentical`. That is the declaration, not an
  obstacle.
- Placeholders you dropped or invented → the run fails, naming the entry and both sets.

**If your language has more than two plural forms**, write them:

```ts
stops: { one: "…", few: "…", many: "…", other: "…" },
```

`other` is always required. The rest are whatever your language actually uses.

---

## See where every language stands

```sh
npm run i18n:report
```

Prints, per language: how many entries are translated, what is missing, and what no
part of the interface appears to read.

The unreferenced list is **advice, not a verdict**. Seven groups are reached by a key
computed at runtime — failure reasons, suggestions, planning parameters, place kinds,
feed failure kinds, gauge states, parameter corrections — and no scan can tell those
from dead copy. Read the list, do not obey it.

---

## What you cannot do, by construction

**Read a fixed language.** There is no export that hands you French. `useStrings()`
gives you the active language and that is the only door. This is FR-202, and it is why
the map markers can no longer end up French for an English rider.

The single exception is `lib/i18n/static-metadata.ts`, which holds the page title and
description, in the default language, because a static export ships one document. ESLint
confines it to `app/layout.tsx`. If you find yourself wanting to import it elsewhere,
you want `useStrings()` instead.

**Write a sentence directly into a component.** Nothing stops you at the keyboard, but
`tests/unit/i18n-language-sweep.test.tsx` renders every screen in English and fails when
it finds French, naming where. That is the guard for the mistake no amount of API design
prevents.

**Put logic in the wording.** The `Messages` type admits strings and plural maps. If you
need to decide something, decide it in `lib/format.ts` and give each outcome its own
entry — which is what the three duration entries are:

```ts
units: {
  durationHours:        "{hours} heures",
  durationMinutes:      "{minutes} minutes",
  durationHoursMinutes: "{hours} h {minutes} min",
},
```

`approximateDuration` does the division and picks. No language repeats the arithmetic.

---

## Running the checks

| Command | What it covers |
|---|---|
| `npm test` | Everything blocking: completeness, placeholders, undeclared duplicates, the English sweep, the resolver |
| `npm run lint` | The import restrictions, including the static-metadata confinement |
| `npm run build` | Type errors, which is where a missing key surfaces first |
| `npm run i18n:report` | Coverage and the advisory unreferenced list |

---

## Conventions worth keeping

- **Group by what a rider sees**, not by which component reads it. Two components
  showing the same label share the entry.
- **Name the entry for its meaning**, not its appearance. `swapUnavailable`, not
  `greyButtonLabel`.
- **Write the note before the entry**, not after. It is for whoever translates next,
  who has no screen in front of them.
- **Accessible names are wording too.** They live in the same tree, are covered by the
  same checks, and are the easiest thing here to forget — forgetting them is the defect
  this whole feature started from.
