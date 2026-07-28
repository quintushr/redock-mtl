# Phase 1 Data Model: Maintainable Translation System

**Feature**: `003-maintainable-i18n` | **Date**: 2026-07-27

Nothing here is persisted beyond the one existing `localStorage` key. These are the
shapes the wording system is built from, and the rules each must satisfy.

---

## LanguageDescriptor

Everything the system needs to know about a language other than its wording. This is
what FR-220 means by "declares its regional formatting conventions in one place", and
registering one is what FR-218 means by "registration".

| Field | Type | Rule |
|---|---|---|
| `id` | `"fr" \| "en" \| …` | Unique. The value persisted in storage and written to the document's `lang` attribute. Must be a valid BCP 47 language subtag |
| `name` | `string` | How the language names itself, never how another names it. "Français", not "French" |
| `code` | `string` | The short form shown in the toggle. "FR", "EN" |
| `formatting` | `string` | The BCP 47 tag driving `Intl` for numbers, currency and decimals. `fr-CA`, `en-CA`. Distinct from `id`: the language is `fr`, the conventions are Quebec's |

**Derived, never declared separately**: the list of available languages, the name map,
and the code map. FR-221 requires the toggle to have no second list to keep in step,
so `LOCALES`, `LOCALE_NAMES` and `LOCALE_CODES` — three parallel exports in
`lib/strings.ts:23-40` today — all become projections of the registry.

**Plural categories are not a field.** They come from `Intl.PluralRules(formatting)`,
which is the platform's answer and cannot drift from the language it describes.

---

## MessageTree

The wording for one language: a tree of groups, mirroring the areas of the interface,
whose leaves are messages. The reference language's tree defines the shape; every other
tree is declared against it.

```text
MessageTree   := { [group: string]: MessageTree | Message }
Message       := SimpleMessage | PluralMessage
SimpleMessage := string
PluralMessage := { [category in PluralCategory]?: string }  // `other` required
```

**Rules**:

| Rule | Source |
|---|---|
| Every language's tree has exactly the reference's set of leaf paths | FR-211, FR-212 |
| A leaf is a string or a plural map. Never a function, never arithmetic | FR-207 |
| Grouping follows the area of the interface, not the module that reads it | FR-208 |
| A leaf may carry a note for translators, written as a comment above it | FR-209 |
| `other` is present in every plural map; the remaining categories are whatever the language uses | FR-219 |

**Groups**, carried over from the current file so that call sites and FR-222 are
undisturbed: `language`, `app`, `units`, `fields`, `placeKinds`, `map`, `panel`,
`summary`, `trail`, `gauge`, `noStop`, `settings`, `feed`, `empty`, `plan`,
`attribution`, `corrections`.

**Removed from the tree**: `units.locale`, which is a formatting convention and moves
to `LanguageDescriptor.formatting`, and `feed.retryable`, which is a policy about which
failures offer a retry and is not wording at all.

---

## Placeholder

A named slot inside a message, written `{name}`.

| Rule | Source |
|---|---|
| Every language's version of a message uses the same set of names | FR-214 |
| A name appearing in one language and not another fails the checks | FR-214 |
| Repetition within one message is allowed; the set is compared, not the count | FR-214 |
| Substitution is textual. A placeholder cannot introduce markup or another message | FR-207 |

**Values that are already formatted before they arrive**: durations, distances,
amounts and decimals reach a message as strings, formatted by `lib/format.ts` against
the active language's `formatting` tag. A message never receives a raw number it is
expected to format, because formatting is not wording.

Counts are the exception. A plural message receives the number itself, because
selecting the category requires it.

---

## LanguageModule

What one language's file exports. This is the unit a translator delivers, and the whole
of what FR-218 calls "a new wording file".

| Export | Type | Purpose |
|---|---|---|
| `messages` | `MessageTree` | The wording |
| `intentionallyIdentical` | `readonly string[]` | Leaf paths this language deliberately keeps identical to the reference (FR-215, R7) |

The reference language exports `messages` only; identity with itself is not a concept.

---

## Registry

The single place a language becomes available.

| Rule | Source |
|---|---|
| Maps each `LanguageDescriptor` to its `LanguageModule` | FR-218 |
| Adding an entry is the whole of "registering a language" | FR-218, SC-004 |
| The default and reference language is `fr` and is marked as such | Spec assumptions |
| Not exported outside `lib/i18n/`; nothing can reach a fixed language through it | FR-202 |

---

## CoverageReport

Produced on demand (FR-216, SC-005) and by the test run (FR-213).

| Field | Meaning | Severity |
|---|---|---|
| `missing` | Leaf paths the reference has and this language does not | Fails |
| `orphaned` | Leaf paths this language has and the reference does not | Fails |
| `placeholderMismatch` | Leaves whose placeholder set differs from the reference's | Fails |
| `suspectedUntranslated` | Leaves identical to the reference and not declared | Fails |
| `unreferenced` | Leaf paths no source file appears to read | Reports only |
| `total`, `translated` | Counts, per language | Reports only |

**Where each is computed.** Everything except `unreferenced` is a diff between two
trees and lives in the pure `lib/i18n/coverage.ts`, which takes the trees as arguments
and touches nothing else. `unreferenced` requires scanning source files, which is
filesystem I/O and forbidden to a domain module by principle III, so it lives in
`scripts/i18n-report.mjs`. The split is not cosmetic: it is why the blocking checks can
be unit-tested in isolation and why the advisory one cannot gate a test run.

`unreferenced` is advisory because seven groups are reached by a key computed at
runtime and cannot be distinguished from dead copy by inspection. Those roots are
declared to the scan so it does not report all of them every time:

| Group | Key computed from |
|---|---|
| `placeKinds` | What the geocoder says a place is |
| `feed.unavailable` | The kind of feed failure |
| `plan.failures` | Why planning failed |
| `plan.suggestions` | What the planner suggests changing |
| `settings.controls` | The planning parameter being rendered |
| `gauge.states` | The remaining-window status |
| `corrections.byKey` | The parameter the domain had to correct |

---

## LocalePreference

Unchanged from today, and listed so the plan is explicit that it is not being
redesigned.

| Property | Value |
|---|---|
| Store | `localStorage`, key `redock.locale` |
| Read through | `useSyncExternalStore`, so two tabs stay in step and prerender has a defined snapshot |
| Server snapshot | The default language |
| Invalid or unknown value | Ignored; the default language is used (FR-205) |
| Storage denied | Default language, switch still works for the session (FR-205) |

---

## State transitions

One, and it already exists:

```text
       setLocale(next)                    storage event / same-tab event
active ───────────────► stored ──────────────────────────────────────► every
language                                                                reader
                                                                        re-renders
```

No loading state and no failure state exist on this transition, because FR-225 puts
every language in the first load and switching therefore makes no request.
