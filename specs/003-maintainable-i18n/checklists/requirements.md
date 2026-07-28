# Specification Quality Checklist: Maintainable Translation System

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-07-27
**Feature**: [spec.md](../spec.md)

## Content Quality

- [x] No implementation details (languages, frameworks, APIs)
- [x] Focused on user value and business needs
- [x] Written for non-technical stakeholders
- [x] All mandatory sections completed

## Requirement Completeness

- [x] No [NEEDS CLARIFICATION] markers remain
- [x] Requirements are testable and unambiguous
- [x] Success criteria are measurable
- [x] Success criteria are technology-agnostic (no implementation details)
- [x] All acceptance scenarios are defined
- [x] Edge cases are identified
- [x] Scope is clearly bounded
- [x] Dependencies and assumptions identified

## Feature Readiness

- [x] All functional requirements have clear acceptance criteria
- [x] User scenarios cover primary flows
- [x] Feature meets measurable outcomes defined in Success Criteria
- [x] No implementation details leak into specification

## Notes

- Items marked incomplete require spec updates before `/speckit-clarify` or `/speckit-plan`

### Validation record (2026-07-27)

- **Iteration 1**: One issue found and fixed. FR-202 originally described the defect in code terms ("bundle that components can import"). Reworded to "the always-default set of wording that parts of the interface reach for", which states the same testable condition without naming a code mechanism. All other items passed on first review.
- **Clarification budget**: One question was raised and answered before the spec was written (single URL versus one URL per language). It is recorded under Clarifications and its consequences are recorded under Out of Scope. Zero markers remain in the spec.
- **Deliberate borderline calls**:
  - "One file per language" (FR-206) reads as a storage decision but is the maintainability property the request is about, and it is directly testable. Which format that file takes is left to planning.
  - "Accessible names" and "assistive technology" are accessibility terms, not implementation terms, and are load-bearing: FR-201 and SC-001 would be trivially satisfiable without them, since the defect they guard against is invisible on screen.
  - The current-state observations in User Story 1 and 2 (an always-French label reaching English readers, both languages in one long file) describe what a rider and a contributor experience today. They justify the priorities and are not design instructions.
- **Deferred to planning**: whether a runtime dependency provides plural categories and message formatting, and what shape the wording files take. Both are recorded as assumptions in the spec rather than decided here.

### Clarification session (2026-07-27, `/speckit-clarify`)

Five questions asked and answered; spec re-validated after each. All sixteen items above still pass.

1. **Payload** — every language ships in the first load. FR-225 rewritten: no request on switch, therefore no loading state and no network-failure path.
2. **Enforcement** — two guards, not one. FR-202 rewritten as structural impossibility; FR-202a names the static-metadata exception; FR-202b adds the non-reference-language screen sweep that catches sentences typed into components.
3. **Regression net** — FR-222a requires a character-exact capture of all ~200 entries in both languages before the move; FR-222b requires its removal afterwards, so it cannot become the second file every later copy edit has to touch.
4. **Check severity** — FR-217a splits blocking from advisory. FR-215 promoted to blocking (the intentional-identical declaration is its way out); FR-213 fixed as advisory, because seven groups are reached by computed key and no unused-entry check can tell them from dead copy.
5. **Durations** — FR-207 tightened to forbid arithmetic outright; FR-207a moves the hours/minutes split out of the wording into three named entries per language.

Two contradictions in the original draft were found and closed by this session: FR-213 and FR-215 said "report" while FR-211/212/214 said "fail" with nothing distinguishing them, and FR-207 forbade logic in wording while the duration entries it governs contained duplicated arithmetic.
