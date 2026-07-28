# Feature Specification: Maintainable Translation System

**Feature Branch**: `003-maintainable-i18n`

**Created**: 2026-07-27

**Status**: Draft

**Input**: User description: "Fait un système de traduction plus facilement maintenanble avec les bonnes pratiques connue"

**Language note**: Written in English for consistency with `specs/001-free-window-trip-planner/spec.md` and `specs/002-refonte-affichage-resultat/spec.md`. The product's own copy stays French-first; that is the subject of this feature, not its medium.

**Requirement numbering**: Requirements are numbered from FR-201 so that code comments referencing FR-0xx (feature 001) and FR-1xx (feature 002) remain unambiguous.

**Authoritative wording direction**: `docs/ui-guidelines.md` governs how the product speaks in both languages. This feature moves and guards the wording; it does not rewrite it.

## Clarifications

### Session 2026-07-27

- Q: Does this refonte introduce one URL per language, or does language stay a browser-side choice on a single URL? → A: Browser-side only. One URL, immediate persisted switch, prerendered document and shared-link metadata stay in the default language. URL-based locale routing is out of scope.
- Q: Does every visitor receive all languages on first load, or only the one they are reading? → A: All of them. Every language's wording is in the first load. At roughly 6 KB of text per language, splitting it buys nothing and would cost the switch its instantness. The decision is worth revisiting past about five languages.
- Q: How is "no text escapes the active language" actually enforced? → A: Two guards, because they catch two different mistakes. Reading a fixed language is made structurally impossible for rendering code, and a test renders every screen in a non-reference language and fails on any reference-language text, which is the only thing that catches a sentence typed directly into a component. Static page metadata is the one named exception.
- Q: How is FR-222 (no wording changes meaning) proven, given roughly 200 entries move and existing tests assert on only a minority? → A: Capture every entry's exact rendered text in both languages before the move, require the new system to reproduce it byte for byte, and remove the capture once the migration lands. It exists to prove this one refactor; keeping it would make every later copy correction a two-file change and contradict SC-002.
- Q: Which automated checks block a merge, and which only report? → A: Missing, orphaned, mismatched-value and suspected-untranslated entries all fail, because each has a precise definition and a way out. Unused entries report only: seven groups of wording are reached by computed key, and no unused-entry check can tell those from dead copy without an exemption list that would have to be maintained forever.
- Q: Duration wording currently holds the hours/minutes arithmetic, copied identically into both languages, which FR-207 forbids. Where does it go? → A: Out of the wording entirely. Three named entries per language — hours alone, minutes alone, hours and minutes — and the formatting layer does the split and picks which one applies from the non-zero parts. Which parts exist is not a question about language, so it is decided once. The wording is left with nothing to decide.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - The interface speaks one language at a time (Priority: P1)

A rider switches the interface to English. Every word they can see, and every word their screen reader announces, is English. Nothing is left in French: not a map pin's label, not a hidden description, not a badge on a search suggestion.

Today this is not true. Some text is reached through the active language and some is reached through a default bundle that is always French, and nothing distinguishes the two at the point of use. An English-speaking rider is told "Départ, fais glisser pour déplacer" by their screen reader.

**Why this priority**: This is the only part of the feature a rider experiences directly. A translation system that lets the wrong language reach a user has failed at the one job it has, and every other improvement here is worth less if this one is not made impossible.

**Independent Test**: Switch the interface to English, walk every screen and every state (empty, planning, result, no-stop comparison, settings, each feed failure), and confirm no default-language text appears in visible copy, in accessible names, or in spoken descriptions. Delivers a genuinely bilingual product on its own, with or without the rest of this feature.

**Acceptance Scenarios**:

1. **Given** the interface is set to English, **When** the rider places a start and a destination on the map, **Then** the accessible name of every map marker is English.
2. **Given** the interface is set to English, **When** any screen is displayed in any state, **Then** no piece of text that reaches the rider or their assistive technology comes from the default language.
3. **Given** a developer writes a new component, **When** they look for a way to display text in a fixed language, **Then** none exists to be found.
4. **Given** a developer writes a sentence directly into a component instead of into the wording, **When** the automated checks run, **Then** the screen sweep in a non-reference language finds that sentence and fails, naming where it is.

---

### User Story 2 - Correcting a word is a one-file, one-line change (Priority: P1)

A contributor notices that a French error message is unclear. They open the French wording, find the entry by the part of the interface it belongs to, change it, and are done. They never read the English wording, never open a component, and never learn how the planner works.

Today both languages live in a single file of nearly seven hundred lines, interleaved with type declarations, casts, and hand-written branching logic. Changing one sentence means navigating code, and the two versions of a sentence sit three hundred lines apart.

**Why this priority**: This is the maintainability the feature exists for. Wording is the part of this product that changes most often and needs the least technical skill to change; it is currently the part that demands the most.

**Independent Test**: Ask someone who has never opened this repository to correct one French sentence and add its English counterpart. Measure how many files they open and whether they need to read any application code. Delivers value on its own even if no new language is ever added.

**Acceptance Scenarios**:

1. **Given** a contributor wants to change one sentence in one language, **When** they make that change, **Then** they edit exactly one file, and that file contains no application logic and no other language's wording.
2. **Given** a contributor adds a new entry to the reference language and forgets the other language, **When** the project's automated checks run, **Then** the checks fail and name the missing entry and the language missing it.
3. **Given** a contributor removes the last use of an entry from the interface, **When** the checks run, **Then** the now-unused entry is reported so it can be deleted rather than accumulate.

---

### User Story 3 - A third language is a translation, not a project (Priority: P2)

A volunteer wants the planner in Spanish. They are handed the list of every entry the product needs, with the reference wording and a note on what each variable value in a sentence stands for. They return a completed file. It is registered as an available language, and the toggle offers it. No component is touched.

**Why this priority**: The current system supports exactly two languages by construction: plural forms are written as a hand-written comparison against one, which is wrong for languages with more than two plural categories, and regional formatting conventions are buried inside the wording. Fixing that is what turns "two hardcoded languages" into "a translation system". It ranks below the first two stories because no third language is committed to today.

**Independent Test**: Add a placeholder third language with a partial translation and confirm the toggle offers it, the interface uses it, the coverage report states exactly what is missing, and the untranslated entries fall back to the reference language rather than showing blanks or raw identifiers. No third language ships to riders as part of this feature.

**Acceptance Scenarios**:

1. **Given** a completed set of wording for a new language, **When** it is registered, **Then** the language appears in the toggle and drives the whole interface with no change to any component.
2. **Given** a language whose grammar has more than two plural forms, **When** a count-dependent sentence is worded, **Then** every plural category that language actually uses can be expressed.
3. **Given** a partially translated language, **When** a rider selects it, **Then** untranslated entries are shown in the reference language, and the interface never displays a blank or an internal identifier.

---

### User Story 4 - Numbers, money and durations follow the language (Priority: P2)

A rider reading English sees `$1.20` and `1.5 km`; a rider reading French sees `1,20 $` and `1,5 km`. The regional conventions that produce those come from the language's own declaration, in one place, not from a convention embedded in a sentence somewhere.

**Why this priority**: Formatting conventions are already language-dependent here and already handled, but the declaration is mixed into the wording. Separating it is what keeps a new language from having to know where in the copy its number conventions were hidden. Lower priority than the above because nothing is currently broken for a rider.

**Independent Test**: Change one language's regional convention declaration and confirm every number, amount and decimal in the interface follows, with no other edit.

**Acceptance Scenarios**:

1. **Given** a language is selected, **When** any amount, distance, decimal or duration is shown, **Then** its formatting follows that language's declared regional conventions.
2. **Given** a duration is shown, **When** it is worded in any language, **Then** it remains an approximation and never reads as a clock time or an arrival time.

---

### Edge Cases

- **An entry is missing in a non-reference language.** The checks fail before merge. If one somehow reaches a running interface, the reference language's wording is shown; a blank, an internal identifier, or a crash is never acceptable.
- **A translation is deliberately identical to the reference.** Proper nouns ("Redock", "Montréal", "GBFS") and short codes are the same in both languages. These must be declarable as intentional, so that "identical to the reference" can otherwise be reported as a suspected untranslated leftover.
- **An entry exists in a translation but no longer in the reference language.** Reported as an orphan, so deleted copy does not leave residue behind in every other language.
- **A sentence carries a variable value** (a count, a duration, a place name, a rate). Every language's version of that sentence must use the same set of values. A version that drops one, or invents one, is a check failure, not a runtime surprise.
- **A sentence is split so a figure can be set in a different typeface.** The no-stop comparison already does this. The system must let a translator see and reorder the whole sentence, rather than forcing them to translate two halves that only make sense together.
- **A language has more than two plural forms**, or a distinct form for zero. The wording must be able to express what that language actually has.
- **A duration falls on a round hour, or under one.** Each shape is its own entry rather than a branch inside a sentence, so a language that phrases "2 h" differently from "2 h 30 min" says so in its own wording, and no language repeats the arithmetic.
- **The rider's browser denies storage.** The interface still works, in the default language, and the switch still works for the current session.
- **A stored language value is unknown** (an old code, a hand-edited value). It is ignored and the default language is used.
- **Text destined only for assistive technology** — accessible names, spoken gauge descriptions, group labels — is covered by exactly the same completeness checks as visible text, because it is exactly as translatable and considerably easier to forget.
- **A new component is added that displays text.** There must be no reachable way for it to render text outside the active language.

## Requirements *(mandatory)*

### Functional Requirements

#### Correctness for the rider

- **FR-201**: Every piece of text the interface presents — visible copy, accessible names, and descriptions read by assistive technology — MUST resolve through the language the rider has selected.
- **FR-202**: Reading a fixed language MUST be structurally impossible for anything that renders to a rider: no such access may exist to be reached for. The always-default set of wording that parts of the interface use today MUST be removed or made unreachable.
- **FR-202a**: Static page metadata is the one exception, and MUST be named as such. One document ships one title and one description, and the clarified scope keeps them in the default language. The exception MUST be confined to that metadata and MUST NOT be reachable from anything the rider interacts with.
- **FR-202b**: An automated test MUST render every screen and every state in a non-reference language and MUST fail if any reference-language wording appears. This is what catches a sentence written directly into a component, which no amount of care about access can prevent.
- **FR-203**: When an entry has no wording in the selected language, the interface MUST show the reference language's wording, and MUST NOT show a blank, an internal identifier, or an error.
- **FR-204**: Selecting a language MUST take effect immediately across the whole interface and MUST persist across sessions. The document's declared language MUST always match the language being displayed.
- **FR-205**: A rider whose browser denies persistent storage MUST still get a working interface in the default language, and a language switch that works for the current session.

#### Maintainability for the contributor

- **FR-206**: Each language's wording MUST live in its own file, editable without reading or editing any other language's wording.
- **FR-207**: A language's wording MUST contain no application logic and no arithmetic. Substituting a value and varying by plural category are the only things a wording file may do.
- **FR-207a**: Where a value must be decomposed before it can be worded, the decomposition MUST happen once, outside the wording, and each resulting shape MUST be a separate named entry. A duration therefore offers hours alone, minutes alone, and hours with minutes; the formatting layer splits the value and selects the entry from which parts are non-zero, a question no language answers differently. The hours-and-minutes arithmetic currently duplicated in both languages MUST be removed from the wording.
- **FR-208**: Entries MUST be grouped by the area of the interface they belong to, so a contributor can find the wording for what they are looking at without reading application code.
- **FR-209**: Each entry MUST be able to carry a note for translators explaining its context and what each variable value in it stands for.
- **FR-210**: A contributor MUST be able to correct one sentence in one language by editing one file, with no knowledge of the planner's logic.

#### Guarantees the project enforces

- **FR-211**: Automated checks MUST fail when a language lacks an entry that the reference language defines, and MUST name the entry and the language.
- **FR-212**: Automated checks MUST fail when a language defines an entry the reference language does not.
- **FR-213**: Automated checks MUST report entries that no part of the interface appears to use, and MUST NOT fail on them. Several groups of wording are reached by a key computed at runtime — the failure reasons, the suggestions, the planning parameters, the place kinds, the feed failure kinds, the gauge states, the parameter corrections — and no such check can tell those from dead copy. The report informs a human decision; it does not gate one.
- **FR-214**: Automated checks MUST fail when a language's version of a sentence omits a variable value the reference version carries, or introduces one it does not.
- **FR-215**: An entry whose wording is identical to the reference language's MUST fail the checks as suspected-untranslated, unless it is declared as intentionally identical. The declaration is the way out, which is what makes failing on this safe.
- **FR-216**: The project MUST be able to report, on demand, how many entries each language is missing.
- **FR-217**: These checks MUST run as part of the project's existing verification commands, requiring no separate tool a contributor has to know about.
- **FR-217a**: Of these checks, FR-211, FR-212, FR-214 and FR-215 MUST fail the run. FR-213 MUST report without failing it. Each failing check MUST name the entry, the language, and what to do about it.

#### Extensibility

- **FR-218**: Adding a language MUST require only a new wording file and its registration. No component, and no planning or formatting logic, may need to change.
- **FR-219**: Count-dependent wording MUST be expressible through the plural categories the target language actually has, rather than through a comparison written by hand once per language.
- **FR-220**: Each language MUST declare its regional formatting conventions in one place, and every number, amount, distance and decimal in the interface MUST follow the declaration of the selected language.
- **FR-221**: The set of available languages MUST be derived from what is registered, so that the language toggle needs no separate list to keep in step.

#### Preservation

- **FR-222**: No wording visible to a rider may change as a result of this work, in either language. Three exceptions, each recorded and each a defect rather than an improvement: text currently shown in the wrong language; a plural form chosen by a hand-written comparison where the language's own rule differs; and durations that lost their "environ"/"about" hedge, which principle IV requires and which the repository's own tests had been failing on.
- **FR-222a**: Compliance with FR-222 MUST be demonstrated, not asserted. Every entry's rendered text, in every language, MUST be captured before the move — with sample values for the sentences that carry them — and the new system MUST reproduce that capture character for character, including punctuation, quotation marks and non-breaking spaces.
- **FR-222b**: That capture MUST be removed once the migration lands. It proves this one change; keeping it would make every later copy correction a two-file edit and defeat FR-210.
- **FR-223**: Durations MUST remain approximations in every language and MUST NOT be worded as clock times or arrival times (principle IV, and FR-113). Rounding alone does not satisfy this: principle IV requires explicit uncertainty, so every duration MUST carry its hedge in words. The hours/minutes split is presentation and is preserved.
- **FR-224**: Operator attribution and feed-failure wording MUST remain part of the translated set, in every language (principle V).
- **FR-225**: The system MUST work with no server, no account, no key, and no network call of its own (principles I and II). Every language's wording MUST be present in the interface's first load; none may be fetched at runtime, and switching language MUST NOT require a request. Consequently no loading state and no network-failure path exists for a language switch.

### Key Entities

- **Language**: A language the interface can speak. Carries its identifier, the name it calls itself, the short code shown in the toggle, its regional formatting conventions, and its plural categories. Registering one makes it available everywhere.
- **Entry**: One piece of wording the interface needs, under a stable identifier, belonging to an area of the interface. May declare variable values it substitutes, plural categories it varies over, and a note for translators.
- **Wording set**: Every entry's text for one language. One per language, all sharing the reference language's set of identifiers.
- **Reference language**: The language whose wording set defines what every other set must contain. French, the product's default.
- **Coverage report**: For each language, what it is missing, what it holds that the reference does not, and what looks untranslated.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: With the interface set to English, zero pieces of default-language text reach the rider across every screen and every state, in visible copy and in what assistive technology announces. Verified by sweeping all states, including the map marker labels that are wrong today.
- **SC-002**: Correcting one sentence in one language requires opening exactly one file and reading zero lines of application code.
- **SC-003**: 100% of missing entries, orphaned entries, mismatched variable values, and undeclared identical translations are caught by automated checks before a change can be merged. None reaches a rider. Unused entries are reported at the same time, and merging is not blocked on them.
- **SC-004**: Adding a language requires zero edits outside its own wording file and one registration entry, and someone who has never opened this repository can complete the registration in under thirty minutes once the wording is supplied.
- **SC-005**: Anyone can obtain, in a single command, the number of entries each language is missing.
- **SC-006**: Every sentence a rider reads means the same thing before and after this work, in both languages, with the sole exception of text that was being shown in the wrong language.
- **SC-007**: Switching language remains instant and requires no page reload, and the choice survives closing and reopening the browser.
- **SC-008**: A count-dependent sentence can be worded for a language with three or more plural forms without changing anything outside that language's wording file.

## Constitution Alignment *(mandatory)*

- **Cost & keys**: No. Nothing here needs a server, a database, a paid service, or an account. Every language's wording ships inside the static build; nothing is fetched at runtime and no translation service is contacted. No environment variable is introduced. A contributor after `git clone` gets the full bilingual interface with no signup.
- **Estimate honesty**: This feature shows no new durations. It relocates the wording of the durations the planner already shows — approximate minutes, hours-and-minutes, "under a minute", the free window remaining on arrival — and FR-223 requires every language to keep wording them as approximations. No clock time and no arrival time may become expressible in any language. No planning parameter changes; what this feature touches is wording, not assumptions.
- **Data sources**: N/A for the feeds themselves; this feature makes no GBFS call. It does own the wording of operator attribution and of the stale, unreachable, malformed and out-of-season feed notices, and FR-224 requires all of it to stay translated in every language, so that a feed failure and its attribution remain legible to a rider in whichever language they chose.

## Out of Scope

- **One URL per language.** The application keeps a single URL. The prerendered document and the metadata a crawler or a share card reads stay in the default language, exactly as today. Locale routing, redirection, and per-language metadata are a separate decision.
- **Shipping a third language.** The system must make a third language a translation exercise; supplying one is not part of this feature.
- **Rewriting product copy.** Wording moves and is guarded; it is not improved here. Any wording change worth making is its own change, made easier by this one.
- **Automatic language detection** from the browser's preferences. The rider chooses; the default is French.
- **Translating anything outside the interface** — the README, the specs, the code comments, the guidelines.

## Assumptions

- Two languages ship today: French as the default and reference, English as the second. The design targets an arbitrary number; the count that ships is unchanged by this feature.
- French remains the reference language for completeness checks, because it is the product's default and the language its copy is written in first.
- There is no server and no build-time language negotiation, per principle I. Language stays a browser-side choice on a single statically exported document, as clarified above.
- No translation management platform, no hosted translation service, and no paid tooling. Contributors edit files in the repository, per principles I and II.
- Whether a runtime dependency is warranted to provide plural categories and message formatting is a planning question, not a scope question. The constitution's rule applies: prefer no dependency, then a small one, and justify whichever is chosen in the pull request that adds it.
- `docs/ui-guidelines.md` remains the authority on how the product speaks. This feature changes where wording lives, not what it says.
- The existing language toggle, its persistence, and the document-language behaviour are correct and are preserved rather than redesigned.
- The planner's domain modules stay pure and language-free, per principle III. Wording reaches them as arguments, as it does today, or not at all.
