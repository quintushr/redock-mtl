# Specification Quality Checklist: Real Route Geometry

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-07-28
**Feature**: [spec.md](../spec.md)

## Content Quality

- [x] No implementation details (languages, frameworks, APIs)
- [x] Focused on user value and business needs
- [x] Written for non-technical stakeholders
- [x] All mandatory sections completed

## Requirement Completeness

- [ ] No [NEEDS CLARIFICATION] markers remain
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

- Iteration 1 (2026-07-28): three clarification markers raised. FR-316 and FR-329 were resolved
  the same day and are recorded in the spec's Clarifications section: the corrected itinerary is
  substituted automatically, and station-to-station geometry is persisted while walk legs are
  reused for the session only.
- Iteration 2 (2026-07-28, post-plan): **one marker remains, FR-335** — whether calibration moves
  the detour factor automatically or proposes the move. It belongs to US6, priority P3. Nothing in
  US1 through US5 depends on it, and `tasks.md` Phase 8 is marked BLOCKED on it, so it does not
  gate implementation. The recommendation is in `research.md` R11.
- The spec deliberately names no routing service, protocol, or geometry format. The choice of a
  credential-free, cost-free source that satisfies FR-330 through FR-332 was made in
  `/speckit-plan` and verified against the live endpoint; FR-331 is the constraint it satisfies.
- Every other item passes. This checklist no longer gates `/speckit-clarify` or `/speckit-plan`,
  both of which have run; resolve FR-335 before starting Phase 8.
