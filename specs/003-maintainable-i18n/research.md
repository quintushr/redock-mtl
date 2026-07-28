# Phase 0 Research: Maintainable Translation System

**Feature**: `003-maintainable-i18n` | **Date**: 2026-07-27

The spec left one item explicitly deferred to planning: whether a runtime dependency
is warranted for plural categories and message formatting, and what shape the wording
files take. Everything below resolves that, plus the design questions the five
clarifications implied but did not answer.

---

## R1. Wording file format

**Decision**: TypeScript object literals holding nothing but data, one file per
language, under `lib/i18n/messages/`. Nested by area of the interface, mirroring the
grouping that exists today.

**Rationale**:

- FR-209 requires each entry to be able to carry a note for translators. JSON has no
  comments. This single requirement eliminates plain JSON, which was otherwise the
  obvious choice.
- A TypeScript literal is `key: "value",` with `//` notes above it. That is within
  reach of a contributor who does not program, which is what FR-210 asks for, and it
  is what the current file already does well.
- Typing each non-reference language against the reference shape makes a missing or
  misspelled key a compile error. FR-211 and FR-212 then hold before any test runs.
- FR-225 requires every language in the first load. A static import gives that with no
  bundler configuration.

**Alternatives considered**:

| Option | Rejected because |
|---|---|
| Plain JSON | No comments, so FR-209 is unsatisfiable without a parallel notes structure that would drift from the entries it annotates |
| JSON5 / YAML / TOML | Solves comments, costs a runtime or build dependency and a bundler rule, for a format no better than a TS literal |
| Keep typed functions (status quo shape) | A function is code. FR-207 forbids it, FR-214 cannot inspect placeholders inside an arbitrary function body, and FR-219 cannot express plural categories through a hand-written comparison |
| Flat dotted keys (`"fields.origin"`) | Loses the grouping FR-208 wants and would rewrite all 92 call sites for no gain |

---

## R2. Plural categories

**Decision**: `Intl.PluralRules`, from the platform. No dependency.

**Rationale**: It is exactly the requirement of FR-219, it is baseline-available in
every browser this project targets, and it is present in the Node build the tests run
under. Verified locally on Node v24.18.0:

```
new Intl.PluralRules('pl').resolvedOptions().pluralCategories
  -> [ 'one', 'few', 'many', 'other' ]
```

**Finding worth recording**: the current hand-written `count === 1` comparison is
already wrong for French, not merely for hypothetical future languages. CLDR maps zero
to the `one` category in French and to `other` in English:

```
new Intl.PluralRules('fr-CA').select(0)  -> 'one'
new Intl.PluralRules('en-CA').select(0)  -> 'other'
```

So French wants "0 arrêt" and English wants "0 stops". The current code produces the
plural form in both. It is not reachable today, because `summary.noStops` is a separate
entry that handles zero, but it is the exact class of error FR-219 exists to remove,
and it is a concrete argument against carrying the comparison forward.

---

## R3. Message formatting and interpolation

**Decision**: No formatting library. Placeholders are written `{name}` and resolved by
a small pure function in `lib/i18n/`.

**Rationale**:

- The constitution's technology rule is "prefer no dependency, then a small one". The
  substitution this product needs is a single pass over a string.
- The product uses none of what a full ICU implementation provides beyond simple
  arguments and one level of plural: no ordinals, no nested plurals, no date skeletons,
  no gender selection.
- Adding a parser to interpret a syntax we would only ever use the simplest tenth of is
  the definition of an unjustified dependency.

**Deliberate compatibility choice**: `{name}` is ICU's own simple-argument syntax, and
the plural entry shape below uses CLDR's category names. If this product ever outgrows
the small resolver, adopting a real ICU implementation is a superset move over the
existing files rather than a rewrite of them.

**Alternatives considered**:

| Option | Size | Rejected because |
|---|---|---|
| `intl-messageformat` | ~10 KB min+gz plus a parser | Buys ICU features this product does not use; fails the dependency-justification gate |
| `next-intl` / `react-i18next` | Larger, opinionated | Both assume routing and server negotiation, which the clarified scope explicitly excludes. Neither's central feature applies |
| Tagged template literals | none | Cannot be inspected statically for FR-214, and puts code back in the wording |

---

## R4. How the blocking checks are implemented

**Decision**: Two layers, deliberately overlapping.

1. **The type system.** Each non-reference language is declared against the shape
   derived from the reference. A missing key, an extra key, or a misspelled one is a
   compile error naming the entry and the file.
2. **Unit tests** in `tests/unit/`, run by `npm test`, which walk both trees at runtime
   and report every problem at once.

**Rationale**: The type system fails at the first error and stops. A translator
completing a new language wants the whole list, not the first line of it. FR-211
requires the check to name the entry and the language, and FR-216 requires a count per
language; a runtime walk produces both. The type system is what makes the failure
impossible to merge past, and it costs nothing to keep both.

**Severity mapping**, from the clarified FR-217a:

| Check | Requirement | Severity |
|---|---|---|
| Entry missing from a language | FR-211 | Fails |
| Entry present but absent from the reference | FR-212 | Fails |
| Placeholder omitted or invented | FR-214 | Fails |
| Identical to reference, undeclared | FR-215 | Fails |
| Entry referenced nowhere | FR-213 | Reports, never fails |

---

## R5. Making a fixed language structurally unreachable (FR-202)

**Decision**: Nothing exports a language-specific bundle. The registry is internal to
`lib/i18n/`; the only way out is the React binding, which resolves against the active
language. The one exception, `lib/i18n/static-metadata.ts`, exports the page title and
description alone and is confined to `app/layout.tsx` by an ESLint rule.

**Rationale**: The project already enforces an architectural boundary this exact way.
`eslint.config.mjs` uses a file-scoped `no-restricted-imports` block to keep React,
`react-dom`, `maplibre-gl`, and the UI layer out of `lib/`. Confining the metadata
exception is the same mechanism applied to one more module, so it introduces no new
concept a contributor has to learn.

**What this replaces**: `export const t: Strings = fr` in `lib/strings.ts:654`. Two
modules import it today. `app/layout.tsx:4` uses it legitimately, for static metadata.
`components/MapView.tsx:26` uses it for map marker labels, which is the defect FR-201
exists to fix.

---

## R6. The non-reference-language sweep (FR-202b)

**Decision**: A test renders every screen and state with the language set to English
and fails if any French wording appears in rendered text or in an accessible name. The
French string set is derived from the reference file at test time, never hand-listed.

**Rationale**: A hand-maintained list of forbidden strings is a list that goes stale on
the first copy change. Deriving it means the sweep automatically covers every entry
that exists, including ones added after the sweep was written, which is what makes
SC-001 a standing guarantee rather than a one-time audit.

**Exclusions, and why each is safe**:

- Entries declared intentionally identical (R7 below). By definition they are expected
  in both languages.
- Any French string that is also an English string for a different entry. Rare, but
  "Destination" is exactly this, and flagging it would be a false failure.
- Proper nouns already covered by the intentional-identical declaration.

**Coverage**: the states named in the spec's Independent Test for User Story 1 — empty,
planning, result, no-stop comparison, settings expanded and collapsed, and each of the
three feed failure kinds. Accessible names matter as much as visible text here; the
defect that motivated this feature is invisible on screen.

---

## R7. Declaring an intentionally identical translation (FR-215)

**Decision**: Each non-reference language module exports, alongside its messages, the
list of entry paths it deliberately keeps identical to the reference.

**Rationale**: The choice belongs to the language that made it. "Redock" is the same in
English because it is a product name; a future language using a different script might
transliterate it. Holding the list centrally would make one file the place every
language argues in.

Known members for English today: the product name, the city name, `attribution.stations`
("Stations"), `trail.destination` and `fields.destination` ("Destination"), and the
locale codes.

---

## R8. Proving nothing changed (FR-222a, FR-222b)

**Decision**: A script renders every entry, in every language, with fixed sample
arguments, against the current `lib/strings.ts`, and writes the result to a committed
JSON file. A temporary test asserts the new system reproduces it character for
character. Both the capture and the test are deleted in the final task.

**Hard sequencing constraint for `/speckit-tasks`**: the capture must be generated and
committed **before** `lib/strings.ts` is modified. Once it is edited, the capture is no
longer evidence of anything. This is the one ordering in this feature that cannot be
recovered from if it is done out of sequence.

**Sample arguments**: fixed and committed with the script, so the capture is
reproducible. Every parameterised entry gets values chosen to exercise the shape it
varies over — a count of 0, 1 and 2 for plural entries, and durations of 45 minutes,
2 hours exactly, and 2 hours 30 minutes for the duration entries covered by R9.

**Why it is removed afterwards**: FR-222b. Keeping it would make every later copy
correction a two-file edit, which is precisely the friction SC-002 measures.

---

## R9. Where the duration arithmetic goes (FR-207a)

**Decision**: `lib/format.ts` performs the hours/minutes split and selects among three
entries per language: hours alone, minutes alone, hours with minutes.

**Rationale**: Which parts are non-zero is arithmetic, not language. The current code
answers it twice, once per language, with identical arithmetic
(`lib/strings.ts:64-77` and `lib/strings.ts:382-395`). Moving it leaves each language
free to word each shape however it likes, including different separators and word
order, while nobody repeats the division.

The rounding in `approximateDuration` — to the minute below ten, to five minutes above
— stays in `lib/format.ts` untouched. It is what keeps a duration from reading as a
measurement, and principle IV depends on it.

---

## R10. Module layout

**Decision**:

```text
lib/i18n/
├── messages/fr.ts        Reference wording. Defines the shape.
├── messages/en.ts        Typed against it.
├── languages.ts          Descriptors and the registry (FR-220, FR-221).
├── resolve.ts            Pure: placeholder substitution, plural selection.
├── types.ts              Message shape, placeholder and plural types.
└── static-metadata.ts    The FR-202a exception. Import-restricted.
```

`lib/` may not import React — `eslint.config.mjs` enforces it and principle III
requires it. So `resolve.ts` is pure and testable without a DOM, and the React binding
stays in `components/LocaleProvider.tsx`, exactly the split that exists today.

---

## R11. Fixing the map marker defect (FR-201)

**Decision**: `MapView` reads wording through the active language like every other
component, and the effect that creates and updates markers re-applies the accessible
names when the language changes.

**Constraint discovered while reading the code**: `components/MapView.tsx` builds
markers imperatively, outside React's render, and its own documentation
(`MapView.tsx:35-40`) warns that driving the camera from React state is the bug it
guards against. Marker labels are not the camera, so re-applying them on a language
change is safe, but the fix has to update existing markers rather than rebuild them —
rebuilding would move the map.

`ENDPOINT_LABEL` at `MapView.tsx:66-67` is a module-level constant today, which is why
it cannot follow the language. It becomes a value computed inside the component.

---

## Resolved

No `NEEDS CLARIFICATION` items remain. No runtime dependency is added, so the
Technology Constraints gate passes without an entry in Complexity Tracking.
