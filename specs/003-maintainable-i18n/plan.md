# Implementation Plan: Maintainable Translation System

**Branch**: `003-maintainable-i18n` | **Date**: 2026-07-27 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/003-maintainable-i18n/spec.md`

## Summary

Replace the single 672-line `lib/strings.ts`, which holds both languages, their type
declarations, their casts and hand-written plural arithmetic, with a `lib/i18n/`
module: one data-only wording file per language, a registry that makes adding a third
language a translation exercise, and a small pure resolver over `Intl.PluralRules`.

No runtime dependency is added. The formats, the checks and the plural handling all
come from the platform or from about a hundred lines of pure code, which is what the
constitution's dependency rule asks for and what the product's actual needs justify.

Two rider-visible defects are corrected on the way, both consequences of the escape
hatch this work removes: `components/MapView.tsx:66-67` labels map markers from the
always-French bundle, so an English rider's screen reader announces "Départ, fais
glisser pour déplacer"; and the hand-written `count === 1` comparison is already wrong
for French, where CLDR puts zero in the `one` category. Nothing else a rider reads
changes, and a character-exact capture of all ~200 entries taken before the move proves
it.

## Technical Context

**Language/Version**: TypeScript 5, React 19.2.4, Next.js 16.2.12 (App Router). Versions
authoritative in `package.json`. This feature touches one Next.js API — the `metadata`
export in `app/layout.tsx` — and only changes which module its two strings come from.

**Primary Dependencies**: next, react, react-dom, tailwindcss. **None added.**
`Intl.PluralRules` and `Intl.NumberFormat` are platform APIs. Verified on the Node build
the tests run under (v24.18.0): `Intl.PluralRules('pl')` resolves to
`['one','few','many','other']`.

**Storage**: Browser-local only. One existing `localStorage` key, `redock.locale`,
unchanged. Every language's wording ships in the first load (FR-225); nothing is fetched.

**Testing**: Vitest 4.1.10 with jsdom and Testing Library, per `vitest.config.mts`. The
resolver and coverage modules are pure and unit-tested. The English sweep renders real
screens. No network in any test.

**Target Platform**: Modern browsers. `next.config.ts` sets `output: "export"`; the build
is a directory of static files. Unchanged by this feature.

**Project Type**: Client-side web application (static export).

**Performance Goals**: Language switching stays instant and makes no request (SC-007,
FR-225). Both languages total ~11.5 KB of text today; a third adds ~6 KB to the initial
payload, which is the tradeoff the payload clarification accepted, with a stated
revisit point past about five languages.

**Constraints**: Zero operating cost, zero API keys, computation in-browser. Feature
specific: `lib/` may not import React, `react-dom`, `maplibre-gl`, or anything from
`components/` or `app/` — already enforced by `eslint.config.mjs` and relied on here to
keep `lib/i18n/` pure.

**Scale/Scope**: ~200 wording entries, 92 distinct dotted access paths across 14
components plus `lib/format.ts` and `app/layout.tsx`. Two languages shipping, an
arbitrary number supported.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Gate | Principle | Pass? | Notes |
|------|-----------|-------|-------|
| No backend, database, serverless function, or paid/metered service is introduced | I. Zero Operating Cost | [x] | Nothing added. Wording is compiled into the bundle |
| All computation runs in the browser; build still produces a static export | I. Zero Operating Cost | [x] | `output: "export"` untouched. The clarified scope explicitly rejected per-language routing, which is what would have pressured this |
| Feature works with zero API keys and zero accounts; any keyed integration is optional and degrades cleanly | II. No Mandatory API Keys | [x] | No translation service, no key, no environment variable. Every language is in the repository |
| Calculation logic lands in pure modules (no network, no DOM, no global state) with unit tests over frozen fixtures | III. Pure, Tested Domain Core | [x] | `lib/i18n/resolve.ts` and `lib/i18n/coverage.ts` are pure and DOM-free. Fixtures are the committed wording files plus small test-local trees. `lib/format.ts` stays pure and gains the duration split that two language bundles duplicate today |
| Durations shown as estimates, never to-the-minute arrivals; influencing parameters user-visible and adjustable with conservative defaults | IV. Honest Estimates | [x] | FR-223. The rounding in `approximateDuration` is untouched; only where the hours/minutes wording lives changes. No language can express a clock time, since no entry accepts one. No planning parameter changes |
| GBFS `ttl` honored, responses cached client-side, attribution and license displayed, only public documented endpoints called, feed failure degrades cleanly | V. Respect for Data Sources | [x] | No feed is called. Attribution and the four feed-failure notices stay in the translated set (FR-224), and the English sweep now covers them, which it never was before |
| New runtime dependencies are justified, or none were added | Technology Constraints | [x] | None added. `intl-messageformat`, `next-intl` and `react-i18next` were each considered and rejected in [research.md](./research.md) R3 |

*Re-check status after Phase 1 design:* **passed**. The design added no module that
takes a dependency, performs I/O, or requires a server. The one new ESLint rule tightens
an existing boundary rather than introducing a concept.

## Project Structure

### Documentation (this feature)

```text
specs/003-maintainable-i18n/
├── plan.md              # This file
├── research.md          # Phase 0: 11 decisions, the deferred dependency question resolved
├── data-model.md        # Phase 1: shapes and the rules each must satisfy
├── quickstart.md        # Phase 1: how to correct a word, add one, add a language
├── contracts/
│   └── i18n-contracts.md  # Phase 1: pure modules, React binding, translator contract, tests
├── checklists/
│   └── requirements.md  # Spec quality, with the clarification record
└── tasks.md             # Phase 2 output (/speckit-tasks - NOT created here)
```

### Source Code (repository root)

The repository's `lib/` is flat rather than split into `core/`, `gbfs/` and `ui/` as the
template's default layout suggests. This feature does not restructure it; it adds one
directory.

```text
app/
└── layout.tsx           # CHANGED: metadata reads lib/i18n/static-metadata

components/
├── LocaleProvider.tsx   # CHANGED: hooks resolve against the registry; store unchanged
├── LanguageToggle.tsx   # CHANGED: derives its options from LANGUAGES (FR-221)
├── MapView.tsx          # CHANGED: marker labels follow the active language (FR-201)
└── …11 others           # CHANGED: call sites follow renamed duration and plural entries

lib/
├── i18n/                # NEW. Pure. No React (eslint-enforced, principle III)
│   ├── messages/fr.ts   #   Reference wording. Defines the shape
│   ├── messages/en.ts   #   Typed against it
│   ├── languages.ts     #   Descriptors + registry (FR-218, FR-220, FR-221)
│   ├── resolve.ts       #   Substitution, plural selection, leaf paths, placeholders
│   ├── coverage.ts      #   One implementation behind both the gate and the report
│   ├── types.ts         #   Message shape
│   └── static-metadata.ts  # The FR-202a exception. Import-confined to app/layout.tsx
├── strings.ts           # DELETED at the end of the migration
└── format.ts            # CHANGED: owns the hours/minutes split (FR-207a); reads the
                         #   Intl tag from the descriptor, not from the wording (FR-220)

tests/unit/
├── i18n-resolve.test.ts          # NEW: substitution, plural, >2 categories
├── i18n-coverage.test.ts         # NEW: the four blocking checks
├── i18n-language-sweep.test.tsx  # NEW: every screen in English, no French (FR-202b)
└── i18n-parity.test.ts           # NEW, then DELETED: byte-exact capture (FR-222a/b)

scripts/
├── i18n-capture.mjs     # NEW, then DELETED: writes the pre-migration capture
└── i18n-report.mjs      # NEW: coverage + advisory unreferenced list (FR-216, SC-005)

eslint.config.mjs        # CHANGED: confines static-metadata to app/layout.tsx
package.json             # CHANGED: adds the i18n:report script
```

**Structure Decision**: `lib/i18n/` is the new home; `lib/strings.ts` is deleted, not
adapted. The pure calculation this feature introduces — placeholder substitution, plural
category selection, and the coverage diff — lives in `lib/i18n/resolve.ts` and
`lib/i18n/coverage.ts`, both unit-tested without a DOM. The "frozen fixtures" principle
III asks for are the committed wording files themselves, plus small hand-written trees
in the tests for the cases the real files cannot exercise, such as a language with four
plural categories.

## Sequencing constraint

One ordering in this feature cannot be recovered from. The character-exact capture
required by FR-222a must be generated and committed **before** `lib/strings.ts` is
modified. Once that file is edited the capture is no longer evidence of anything, and
FR-222 becomes an assertion rather than a demonstration.

`/speckit-tasks` must place the capture task first, before any task that writes to
`lib/strings.ts`, `lib/format.ts`, or any component.

The removal tasks — the capture, its test, and the capture script — come last, after the
parity test has passed at least once (FR-222b).

## Complexity Tracking

> No Constitution Check gate failed. No entries.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| *(none)* | | |
