<!--
SYNC IMPACT REPORT
==================
Version change: (template, unversioned) -> 1.0.0
Rationale: Initial ratification. All template placeholders replaced with concrete
governance for redock-mtl. MAJOR bump from unversioned template to first adopted
constitution.

Principles defined (all new):
  - I. Zero Operating Cost (NON-NEGOTIABLE)
  - II. No Mandatory API Keys (NON-NEGOTIABLE)
  - III. Pure, Tested Domain Core
  - IV. Honest Estimates
  - V. Respect for Data Sources

Sections added:
  - Core Principles
  - Technology & Deployment Constraints (was [SECTION_2_NAME])
  - Development Workflow (was [SECTION_3_NAME])
  - Governance

Sections removed: none

Templates requiring updates:
  - .specify/templates/plan-template.md            ✅ updated (Constitution Check gate table,
                                                     Technical Context defaults, project structure)
  - .specify/templates/spec-template.md            ✅ updated (added Constitution Alignment section)
  - .specify/templates/tasks-template.md           ✅ updated (path conventions, required domain-core
                                                     tests, forbidden foundational tasks, TS paths)
  - .specify/templates/checklist-template.md       ✅ reviewed, generic, no change required
  - .claude/skills/speckit-*/SKILL.md              ✅ reviewed; the CLAUDE.md reference in
                                                     speckit-plan/SKILL.md is correct for this
                                                     Claude-scoped skill directory, left as is
  - README.md                                      ✅ rewritten 2026-07-26 (task T067): states the
                                                     zero-cost, no-key setup, the static hosting
                                                     target, and the review consequences of each
                                                     principle. No follow-up items remain.

Deferred TODOs: none
-->

# redock-mtl Constitution

redock-mtl is a trip planner for GBFS bike-share networks, first target Montreal.
It is open source and built by volunteers. These principles bind every feature,
every dependency choice, and every pull request.

## Core Principles

### I. Zero Operating Cost (NON-NEGOTIABLE)

The project MUST cost the maintainer nothing to run, forever.

- No backend server, no database, no serverless function, no message queue.
- No paid service, and no free tier whose overage exposes the maintainer to a bill.
- No metered quota on any runtime dependency of the shipped application.
- All computation (geometry, graph building, route planning) MUST run in the
  user's browser.
- Deployment MUST target static hosting only: the build output is a directory of
  static files served without server-side execution.

Rationale: A volunteer project dies the day someone receives an invoice, or the day
the one person holding the credit card walks away. Zero cost is what makes the
project outlive its maintainers.

### II. No Mandatory API Keys (NON-NEGOTIABLE)

The application MUST be fully functional after `git clone`, install, and dev,
with no account created anywhere.

- No environment variable MAY be required for the application to build, start, or
  deliver its core trip-planning function.
- Any integration that needs a key MUST be optional. When the key is absent the
  feature MUST degrade cleanly: the application still works, the affected feature
  is either hidden or replaced by a keyless fallback, and no error is shown to the
  end user for a key they were never asked to provide.
- Onboarding a new contributor MUST NOT require a signup step.

Rationale: A required key is a barrier to contribution and a single point of failure
owned by one person. Keyless-by-default keeps the project forkable.

### III. Pure, Tested Domain Core

All calculation logic MUST live in pure modules.

- Domain modules MUST NOT perform network I/O, touch the DOM, or read or write
  global mutable state. Data enters as arguments and leaves as return values.
- Domain modules MUST be unit tested against frozen JSON fixtures committed to the
  repository. Tests MUST NOT hit the network.
- The UI is a thin layer over the core. Logic that could be expressed as a pure
  function MUST NOT be written inside a component.
- Fetching, caching, and rendering are separate layers from calculation, and their
  concerns MUST NOT leak into domain modules.

Rationale: Routing logic is the part of this project that is hard to get right and
easy to break. Purity makes it testable without a browser, a server, or a live feed.

### IV. Honest Estimates

Durations are estimates and MUST be presented as estimates.

- The UI MUST NOT display a to-the-minute arrival time. Ranges, approximations, and
  explicit uncertainty are required instead.
- Every parameter that influences a computed result (speeds, transfer penalties,
  walking tolerance, availability buffers) MUST be visible to the user and MUST be
  adjustable.
- Default parameter values MUST be conservative rather than optimistic. Where a
  choice exists between a flattering estimate and a cautious one, choose cautious.
- Station availability is a snapshot, not a guarantee, and MUST be communicated as
  such wherever a plan depends on it.

Rationale: A planner that overpromises sends a person to an empty dock in the rain.
Being trusted matters more than looking fast.

### V. Respect for Data Sources

GBFS feeds are provided as a courtesy by transit operators. Treat them accordingly.

- The `ttl` field of each GBFS feed MUST be honored. The application MUST NOT poll
  faster than the source permits.
- Feed responses MUST be cached client-side, and repeat views MUST be served from
  cache rather than refetched.
- Operator attribution and the feed license MUST be displayed in the interface.
- Only public, documented GBFS endpoints MAY be called. Scraping, and use of
  undocumented or internal operator APIs, is forbidden.
- Operator terms of use MUST be reviewed before a network is added, and MUST be
  complied with.
- An unavailable or malformed feed MUST degrade the application cleanly: the failure
  is surfaced to the user, and the rest of the application keeps working.

Rationale: These feeds are free because nobody abuses them. Aggressive polling and
unattributed reuse are how public feeds get shut off for everyone.

## Technology & Deployment Constraints

- Stack: Next.js (App Router), React, TypeScript, Tailwind CSS. Versions are pinned
  in `package.json` and are the single source of truth.
- Next.js APIs and conventions in this version differ from older releases. The
  relevant guide under `node_modules/next/dist/docs/` MUST be read before writing
  code against an unfamiliar API. Deprecation notices MUST be heeded.
- The build MUST produce a static export (see
  `node_modules/next/dist/docs/01-app/02-guides/static-exports.md`). Any Next.js
  feature requiring a server at runtime is out of bounds under Principle I.
- New runtime dependencies MUST be justified in the pull request that adds them.
  Prefer no dependency, then a small one, then a large one.
- Persistence, if any, is browser-local. No user data leaves the browser.

## Development Workflow

- Work flows through Spec Kit: `/speckit.specify` -> `/speckit.plan` ->
  `/speckit.tasks` -> `/speckit.implement`. Feature work lives on a feature branch.
- The Constitution Check gate in `plan-template.md` MUST pass before Phase 0
  research and MUST be re-checked after Phase 1 design.
- Every pull request MUST state which principles it touches and how it complies.
- Domain-core changes MUST ship with unit tests in the same pull request.
- A violation MUST NOT be merged silently. Either the design changes, or the
  violation is recorded in the plan's Complexity Tracking table with a rejected
  simpler alternative, or the constitution is amended first.

## Governance

This constitution supersedes all other practices, conventions, and preferences in
this repository. Where a style guide, a template, or an agent instruction conflicts
with it, this document wins.

**Amendment procedure**: Amendments are proposed as a pull request modifying this
file. The pull request MUST state the version bump and its rationale, and MUST
update every dependent artifact listed in the Sync Impact Report in the same change.
A maintainer approval is required to merge.

**Versioning policy**: Semantic versioning.

- MAJOR: a principle is removed, or redefined in a backward-incompatible way.
- MINOR: a principle or section is added, or existing guidance is materially expanded.
- PATCH: clarification, wording, or typo fixes that do not change obligations.

**Compliance review**: Constitution compliance is checked at plan time (the
Constitution Check gate) and at review time (pull request review). Any complexity
that a principle would forbid MUST be justified in writing or removed.

**Version**: 1.0.0 | **Ratified**: 2026-07-25 | **Last Amended**: 2026-07-25
