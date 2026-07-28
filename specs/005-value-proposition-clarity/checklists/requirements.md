# Specification Quality Checklist: Value Proposition Clarity and Data Control

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-07-28
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

### Clarification session, 2026-07-28

Five questions were asked and answered interactively after the spec was drafted. Their answers are
recorded under "Clarifications / Session 2026-07-28" alongside the two resolved at drafting time.
Three of the five changed the shape of the feature rather than merely sharpening it:

- **Amounts are deferred until the itinerary settles** (FR-408a to FR-408c). Chosen over live
  updating. Adds a second display state to the summary and a dependency on feature 004's settling
  signal, and makes "no plan withholds its amounts forever" a testable obligation (SC-009).
- **Planning parameters persist browser-locally** (FR-413a to FR-413c, FR-412a). This widens the
  feature past the original brief and is flagged as such in the spec's "Scope widened during
  clarification" note. Verified before asking: only language and route geometry persist today;
  `PlannerShell` restarts from `DEFAULT_PARAMETERS` on every load.
- **The one-sentence explanation becomes a permanent header subtitle** (FR-414, FR-417, FR-419a),
  which removed the need for any recall control. FR-417 consequently inverted from an obligation to
  a prohibition.

The other two settled the zero-stop case (FR-406a) and the collapsed-panel height budget (FR-402a).

### Earlier clarifications, resolved at drafting time

1. **Tariff modelling scope.** Resolved *against* adding tariff profiles. The planner only builds
   plans on mechanical bikes, so an electric-bike tariff can never apply to a plan this application
   produces. The existing adjustable free window and per-minute rate are the whole model; what the
   feature adds is disclosure of the assumptions, not tariff structure (FR-411, FR-412).

2. **On-demand refresh against the self-imposed polling floor.** Resolved in favour of honouring the
   request up to the floor and refusing it visibly beyond it (FR-420, FR-421). Constitution
   principle V is preserved: the floor stays, and no request is sent inside it.

### Carried into planning

**`docs/ui-guidelines.md` must be amended in the same change, on three points now, not one:**

1. "États de l'écran" says the empty panel holds "deux champs de saisie, rien d'autre" — superseded
   for the result region by FR-415.
2. "Un trajet à deux arrêts est intégralement lisible sans défilement sur un écran de 700px" — now
   scoped to the expanded panel by FR-402a.
3. The panel header is described as carrying the name, the city and the language; FR-414 adds a
   permanent subtitle line.

Its "Résumé : durée totale, nombre d'arrêts, coût" already anticipates FR-402, so the summary change
moves toward the guidelines rather than away. Nothing is added to the footer, which that document
closes to a third row.

**Four references to existing behaviour are load-bearing** and were verified against the code while
writing: the exhausted-correction path that can leave a plan over budget (FR-404), the
mechanical-only pickup rule (FR-411), the refresh floor and the unused `force` option (FR-420,
FR-421), and the absence of parameter persistence (FR-413a). Planning should re-verify these rather
than trust these notes.

**Feature 004 coupling.** FR-408a and FR-408b depend on the itinerary's settling signal, including
its behaviour when every path request fails and when correction gives up. That contract must be
confirmed at plan time; if settling is not reachable on every failure path, FR-408b does not hold
and the deferral decision must be revisited.

Reviewed against the checklist on 2026-07-28 at drafting and again after the clarification session;
all items pass.
