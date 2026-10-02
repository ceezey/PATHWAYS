# Docs Canonical Reconciliation: Design

**Date:** 2026-10-01
**Branch:** `docs/canonical-reconcile` (cut from `origin/dev` at `a732016`)
**Path:** Architectural (brainstorming; spec, then plan)
**Status:** Draft for developer review

## 1. Intent

Before feature development resumes, rebuild the PATHWAYS documentation suite into one reconciled, canonical baseline and integrate it into `origin/dev`.

Success means:

- every registered doc describes the running system, the 2026 manuscript intent and the new design foundations without contradiction;
- no tracked file names or credits another repository; the suite reads as PATHWAYS' own;
- the docs are self-contained, so `docs/reference/` can be deleted afterward without losing information;
- `pnpm docs:check` passes and `origin/dev` holds the result.

## 2. Inputs

| Input | Location | Use |
|---|---|---|
| Capstone manuscript rev 2026 (271 pp.) | `docs/reference/NEW [Group 14] Capstone Manuscript rev 2026.pdf` | context, problem, objectives, scope, users, methodology, quality and evaluation plans |
| Brand foundations | `docs/reference/pahways-brand-foundations.md` | product character, UX principles, language |
| Color foundations and palette image | `docs/reference/pathways-color-foundations.md`, `Pathways color palette.png` | color authority |
| UI foundations and image | `docs/reference/pathways-ui-foundations.md`, `Pathways UI foundations.png` | spacing, radius, targets, surfaces, layout authority |
| Design system note | `docs/reference/pathways-design-system-note.md` | authority order and conflict rules for the three foundations |
| Architecture diagram | `docs/reference/pathways-architecture.md` | component map for SDD and README |
| Suite template | `docs/document suite reference ONLY from another repo/` | section headings and document order only |
| Repository | `apps/`, `supabase/`, `packages/`, `.claude/agents/`, `scripts/` | what exists now |

Known outdated manuscript content: use case diagrams and reports, activity diagrams and ERD / data dictionary. These are reconciled against the repository before any of their content is used.

## 3. Decisions (developer-approved 2026-10-01)

| # | Decision |
|---|---|
| D1 | New brand/color/UI foundations are the canonical design target. DSD carries a "current vs target" gap table; the UI migration is registered in `deferred-features.md`. |
| D2 | The other-repository name is removed everywhere tracked, including the append-only `log-pathways.md`; the one-time exception is recorded in the reconciliation CR. |
| D3 | Root `IDEA.md` becomes a self-contained distillation (about 400-700 lines) of the rev-2026 manuscript, reconciled to the system; no transcript. |
| D4 | Suite topics without source material are not invented. The developer answers a questionnaire before UES, GTM, PITCH, WRAP and the OPS SLO section are written. |
| D5 | Integration: work on `docs/canonical-reconcile`, merge into `dev` locally, push `origin/dev` as `ceezey`; no PR. |
| D6 | Approach B: suite docs are rebuilt from the template skeleton and repopulated under the source precedence in section 4. |
| D7 | SAD and BUILD may take the template section numbering; section references in `.claude/agents/` and live docs are realigned to the new numbers in the same wave. |
| D8 | The PRD carries a Requirements-Features Matrix and a Locked charter per feature (purpose, why it helps, gate criteria, bounds), replacing the Acceptance Summary (section 5.5). |
| D9 | Each feature carries reconciled use cases and workflows, drawn as Mermaid UML diagrams (section 5.6). |
| D10 | The PRD carries explicit Functional (`FR-<n>`) and Non-Functional (`NFR-<n>`) Requirements; every NFR is tagged with one ISO/IEC 25010 characteristic (section 5.7). |
| D11 | Testing and evaluation are organized by the eight ISO/IEC 25010 product quality characteristics (section 5.8). |
| D12 | SDD carries "Database Architecture: Repository Baseline and Production Requirements": a module-level table (Database Module, Tables, Purpose) reconciled to `schema.prisma`, plus production database requirements (section 5.9). |
| D13 | SDD carries the current tech stack (frontend, backend, database, tools) with versions from the project dependency files (section 5.10). |
| D14 | SDD section 2 carries an explicit High-Level Architecture: component, deployment and request/trust-boundary views (section 5.11). |
| D15 | A Draft `rfc-pathways-aws-hosting-migration.md` records a phased migration strategy to the client AWS stack; it authorizes no implementation (section 5.12). |
| D16 | A manuscript alignment audit traces the Purpose and Description, specific objectives, Problem-Requirements Matrix and Scope and Limitations to the running system; production deployment is gated on it (section 5.13). |

## 4. Source Precedence

1. **Repository** decides what exists now: code, migrations, RBAC seed, Prisma schema, Applied CRs.
2. **Rev-2026 manuscript** decides purpose, context, problem, objectives, scope and limits, users, methodology, quality and evaluation plans.
3. **New foundations** decide brand, color and UI (D1). Within them, the design system note's conflict rules apply.
4. **Template** supplies headings and document order only. No template wording is carried over and the other repository is never named or credited.

When sources conflict on current behavior, the repository wins and the manuscript content is recorded as superseded in the reconciliation CR.

## 5. Scope

### 5.1 Rebuilt from the template skeleton

Suite docs: `idea`, `val`, `scrutiny`, `voice`, `pitch`, `wrap`, `brd`, `ues`, `prd`, `dsd`, `sdd`, `qad`, `sad`, `build`, `clr`, `aia`, `gtm`, `ops`, `log` (all `*-pathways.md`) and `docs/index.md`.

Root: `IDEA.md` (D3) and `README.md` rewritten; `AGENTS.md`, `BRAND.md`, `DESIGN.md` regenerated by `pnpm docs:materialize` from BUILD and DSD.

### 5.2 Kept as records, lightly edited

CRs (20), RFCs (4), audits (2), runbooks (5), governance templates (3). Content stays; edits are limited to removing the other-repository name and adding a "Superseded by" note where the rebuilt PRD or SDD now contradicts them.

### 5.3 PATHWAYS-specific, kept and updated

`state.md`; `deferred-features.md` (gains the UI migration item from D1).

### 5.4 New

`docs/cr-pathways-doc-reconciliation-2026-10-01.md`: source precedence, the append-only exception (D2), the design-authority change (D1), and superseded manuscript items.

`docs/rfc-pathways-aws-hosting-migration.md` (Draft; D15).

`docs/audit-pathways-manuscript-alignment-20261001.md` (D16).

### 5.5 Requirements-Features Matrix and feature charters (D8)

`prd-pathways.md` is the single authority; `IDEA.md` shows a summary and links to it.

**ID mapping.** The manuscript matrix uses F1-F12 with F12 as the Public Project Tracker. PRD IDs stay (invariant 1): manuscript F1-F11 map to PRD-F1 to PRD-F11, manuscript F12 maps to PRD-F13, and PRD-F12 Reporting / Visualization is kept. The PRD states this mapping once.

**Matrix.** One row per functional and non-functional requirement from manuscript Table 5, reconciled to the system. Columns: requirement, PRD feature ID(s), priority, problem addressed (Problem-Requirements Matrix row), current status from the repository.

**Charter per feature (PRD-F1 to PRD-F13):**

| Field | Content |
|---|---|
| Purpose | What the feature is for, one or two sentences, sourced from the Problem-Requirements Matrix requirement (`R1`-`R8`) and the specific objective (1.1-1.8, 2.1-2.4) it fulfils |
| Why it helps | The problem it removes (`P1`-`P8` from the Problem-Requirements Matrix, manuscript Table 4) and the affected role |
| Gate criteria | Numbered, testable, behavior-level conditions `G-F<n>-<m>`, each linked to QAD row(s); the feature is complete only when every gate passes; gates the current code does not meet are marked Not met and linked to `deferred-features.md` |
| Bounds (in) | The capabilities the feature covers, and nothing beyond them |
| Bounds (out) | Adjacent capabilities explicitly excluded, each with a reason |
| Lock | Locked; adding a gate or widening a bound requires an approved `cr-pathways-*`; anything outside the bounds is out of scope by default |

Purpose source: manuscript Table 4 Problem-Requirements Matrix (problems `P1`-`P8`, requirements `R1`-`R8`) with the specific objectives in Purpose and Description. Every feature cites at least one `R<n>`; every `R<n>` is covered by at least one feature or shown as a gap. The matrix (5.5) and IDEA.md use the same `P<n>`/`R<n>` labels.

Bounds source: manuscript Chapter 1 Scope and Limitations (manuscript pp. 26-28) is the primary source for Bounds (in) and Bounds (out), reconciled to the repository. Its system-wide limitations (not a full project management, ERP or replacement platform; no guaranteed real-time sync or API integration with KOBO, YES!ME or PMERL; no individual beneficiary evaluation; predefined rules only, no AI, predictive ML or autonomous decisions; beneficiaries are data subjects, never system actors; public tracker limited to approved, non-sensitive, high-level information; capstone time and resource limits) appear once as System-wide Bounds in PRD section 6 (Out of Scope) and are cited, not repeated, by each charter.

Gate sources, in order: current PRD acceptance text, QAD rows and Applied CRs; then manuscript objectives and use case intent restated against actual behavior. A gate without a source is omitted and noted in the reconciliation CR. QAD rows cite their gate IDs. No new checker is added for gate IDs.

### 5.6 Use cases and workflows (D9)

Sources: manuscript use case reports (Tables 6-31) and activity diagrams (Figures 15-24), reconciled to web routes, API endpoints, the permission matrix and state machines in the repository.

**Use cases** (PRD section 4, grouped under each feature charter). Each has a stable ID `UC-F<n>-<m>`, actor role(s) and required permission, trigger and preconditions, main flow, alternate and exception flows (permission denied, validation failure, step-up required, maker-checker rejection), postconditions and audit effects, and the gate IDs it satisfies.

**Workflows and screens** (PRD section 5). Screen Inventory (5.1): every screen with route, reachable roles and feature. App Flow (5.3): one diagram per end-to-end workflow, with role swimlanes and named routes.

**Manuscript use case disposition** (recorded in the reconciliation CR):

| Manuscript use case | Treatment |
|---|---|
| Supported | Restated to match actual behavior |
| Partly supported | Written as implemented; missing parts marked Not met and linked to `deferred-features.md` |
| Not supported (deferred or retired) | Listed in "Manuscript use cases not carried forward" with the reason; not in the PRD |

**Diagrams as code: Mermaid only** (renders on GitHub; fenced blocks are exempt from the `docs:check` dash rules).

| UML diagram | Mermaid form | Location |
|---|---|---|
| Use case | `flowchart LR`: actor nodes, stadium-shaped use cases, system boundary subgraph; one per feature group | PRD section 4 |
| Activity | `flowchart TD` with one subgraph per role as swimlanes; replaces manuscript Figures 15-24 | PRD section 5.3 |
| State machine | `stateDiagram-v2` for lifecycles: alert, journey, proof inspection, import batch, expense approval | PRD charter of the owning feature |
| Sequence | `sequenceDiagram`, only for flows with non-obvious backend steps: import promotion, evidence upload and finalize, rule evaluation and sweep, step-up | SDD section 4.1 |
| ER | `erDiagram` per domain, reconciled to `schema.prisma`; replaces manuscript Figures 25-33 | SDD section 3 |
| Component | `flowchart` from `docs/reference/pathways-architecture.md` | SDD section 2, README |

Diagram labels use role and screen names, never personal data.

### 5.7 Functional and Non-Functional Requirements (D10)

PRD section 3 lists Functional Requirements `FR-<n>` (from the functional rows of manuscript Table 5, reconciled), each mapped to its PRD feature(s), use cases and gates. PRD section 5.7 lists Non-Functional Requirements `NFR-<n>`, each tagged with exactly one ISO/IEC 25010 characteristic, stated measurably where a source value exists and otherwise as a qualitative target marked "threshold not established" (numeric targets come from the D4 questionnaire). The Requirements-Features Matrix (5.5) rows use these IDs. `FR`/`NFR` IDs are stable once assigned.

### 5.8 ISO/IEC 25010 testing and evaluation (D11)

The quality model is ISO/IEC 25010 with its eight product quality characteristics: Functional Suitability, Performance Efficiency, Compatibility, Usability, Reliability, Security, Maintainability, Portability. The manuscript passage using 2023 edition names ("interaction capability", "flexibility") is normalized to these eight and noted in the reconciliation CR.

QAD is organized so that:

- every QAD test row carries one ISO/IEC 25010 characteristic plus its PRD, gate and use case IDs, and keeps the happy / sad / abuse path classification;
- each characteristic has a coverage section naming the automated tests (from the repository test suites), manual checks and NFRs it verifies; a characteristic without coverage is shown as a gap, not hidden;
- User Acceptance Testing uses the manuscript instrument: 5-point Likert questionnaire items grouped by the eight characteristics, respondent groups, and the statistical treatment (weighted mean and verbal interpretation) from the manuscript;
- SAD reviewer pillars and QAD characteristics use the same eight names.

### 5.9 Database Architecture: Repository Baseline and Production Requirements (D12)

Location: SDD section 3, after the domain ER diagrams. Purpose: a scoped, module-level view that future contributors and AI workflows can load quickly; `schema.prisma` stays the column-level authority, so no per-column dictionary is kept in docs.

**Repository Baseline** table:

| Database Module | Tables | Purpose |
|---|---|---|
| one row per module | the Prisma models (and mapped table names) in the module | what the module supports, its owning PRD feature(s), and what is not implemented |

Modules follow the PRD feature groups: access and organization; programs, projects, activities and milestones; indicators and monitoring; forms, imports and metadata mapping; beneficiaries, enrollments, participation and journeys; finance (budgets, expenses, receipts); assessments, rules, alerts and recommendations; proof and evidence; reporting and public tracker; runtime and support (audit, step-up, jobs, idempotency, staging). Every listed table exists in `schema.prisma`; every mapped model belongs to exactly one module; the "not implemented" notes come from comparing the manuscript data dictionary (Tables 32-61) and PRD bounds with the schema. Enums are named per module; values are not listed.

**Production Requirements** (host-independent): PostgreSQL 17; required roles (`pathways_runtime`, `prisma`, rules worker and sweeper roles) and least-privilege checks; `pgcrypto`; RLS and organization scoping (transaction-local organization context); SSL for remote connections; migration-chain replay from baseline; backup and restore (from `runbook-backup-restore.md`); and the provider prerequisites the migrations currently assume, with a pointer to the D15 RFC.

The manuscript-to-current table mapping lives in the reconciliation CR. The section describes schema only, never record contents.

### 5.10 Tech stack (D13)

Location: SDD section 2 (authoritative), with a short summary in `README.md` and `IDEA.md`. Versions come from `package.json` files, `.nvmrc`, `pnpm-lock.yaml`, `supabase/config.toml` and `.github/workflows/ci.yml`, never from memory.

| Layer | Content |
|---|---|
| Frontend | Next.js, React, TypeScript, Tailwind CSS, Radix UI primitives, TanStack Query and Table, React Hook Form with Zod, ECharts, MapLibre, shared `@pathways/ui` |
| Backend | NestJS, Prisma, Zod and class-validator, Pino logging, Helmet, Swagger, PDFKit, shared `@pathways/imports` (PapaParse, SheetJS, unpdf) |
| Database and platform | Supabase: PostgreSQL 17, Auth with MFA, Storage; Vercel hosting for API and web |
| Tools | pnpm workspaces, Node version from `.nvmrc`, Biome, Vitest, Playwright, Husky and lint-staged, Supabase CLI, tsx, GitHub Actions CI, Sentry, `docs:check` / `sad:check` scripts, Claude Code agents |

Each row lists the package and its pinned or ranged version and one-line role. The manuscript Development Tools, Hardware and Software Requirements tables (Tables 62-64) are reconciled against this list in the reconciliation CR.

### 5.11 High-Level Architecture (D14)

SDD section 2, each view as a Mermaid diagram with a short narrative:

1. **Component view:** from `docs/reference/pathways-architecture.md`, reconciled to current modules and routes.
2. **Deployment view (current):** browser; Next.js web on Vercel; NestJS API on Vercel; Supabase PostgreSQL 17 reached through Prisma as `pathways_runtime`; Supabase Auth; Supabase Storage reached only through the API; Sentry; the rules dispatcher (standalone, not yet scheduled).
3. **Request and trust boundaries:** bearer token, auth guard, workspace resolution, transaction-local organization context, RLS; signed upload and digest-verified finalize; public tracker read path.

The tech stack (D13) sits beside these views. README carries the component view only.

### 5.12 AWS hosting migration strategy (D15)

New `docs/rfc-pathways-aws-hosting-migration.md`, status Draft, registered in `index.md`. It is a strategy, not an approval: Supabase and Vercel stay canonical until a CR approves each phase.

Content:

- **Target mapping** (client direction): web on AWS Amplify Hosting or ECS/Fargate; API on ECS Fargate (Docker); RDS PostgreSQL; S3 for file storage; Cognito or the organization-approved identity provider; CloudWatch; Secrets Manager.
- **Isolation requirement:** multi-organization isolation is preserved and the domain model does not hard-code Plan International Pilipinas. Current evidence: organization context and RLS on every request; "Plan International" appears only in seed and bootstrap scripts. Known v1 constraint: one organization per login.
- **Coupling inventory:** hard couplings (auth token claims and session liveness, `auth.*` schema references, migrations needing `supabase_admin` or a true superuser, Supabase role names in revoke lists, `extensions`-schema pgcrypto, web auth flows, admin-API provisioning, storage API calls, loopback-only listeners, hardcoded bucket name) and soft couplings (environment names, scheduler, dashboard settings, Prisma binary target), each with file references.
- **Phases,** each needing its own CR, SAD review, isolation tests and staging rehearsal: P0 portability preparation on current hosting (configurable listener and fixed Dockerfiles, storage and auth adapters, app-owned session liveness, RDS-compatible migrations, neutral environment names); P1 database to RDS PostgreSQL 17; P2 storage to S3 with preserved key layout and digest re-verification; P3 authentication to Cognito or the organization identity provider (MFA re-enrollment, step-up freshness claim to be confirmed by a spike, recovery email); P4 compute and operations (Amplify or ECS web, ECS Fargate API behind a load balancer, scheduled rules dispatcher task, Secrets Manager, CloudWatch logs and alarms); P5 cutover and rollback.
- **Open client decisions:** Cognito or existing identity provider, AWS region and data residency, operating responsibility.

OPS and SDD link to the RFC; neither claims AWS readiness.

### 5.13 Manuscript alignment audit and production gate (D16)

New `docs/audit-pathways-manuscript-alignment-20261001.md`, following `audit-template.md` and the existing audit workflow (audit records findings; CRs decide).

Trace table, one row per manuscript commitment:

| Source | Items |
|---|---|
| Purpose and Description | each distinct capability claim (for example centralized project and beneficiary information, interoperable information layer, descriptive analytics with KPI and segment insights, prescriptive course-of-action proposals, rule-based underperformance alerts, public tracker) |
| Specific objectives | 1.1-1.8, 2.1-2.4, 3.1-3.8 |
| Problem-Requirements Matrix | R1-R8 |
| Scope and Limitations | each coverage area and each limitation |

Columns: item, PRD feature(s) and gate(s), status (`Met`, `Partly met`, `Not met`, `Deferred`, `Not applicable to code` for evaluation-only items such as UAT), evidence (file and route references, or QAD rows), and finding ID for every status other than `Met`.

Known items to examine closely: R4 reusable project structures for recurring project types; "prescriptive analytics" against the rules-only bound; "beneficiary outcome assessment" against the no-individual-evaluation limitation; the forty-hour preparation claim (evaluation evidence, not code); objective numbering changes that affect older CRs citing manuscript objectives (for example the step-up CR citing Objective 2.2).

**Production gate.** BUILD release criteria and QAD Definition of Done add a Manuscript Alignment gate: production deployment (master release or any AWS cutover) is blocked while any Must-Have item is `Not met` or `Partly met` without an approved CR that either schedules the work or formally descopes it with the manuscript impact stated. The audit is re-run before each production release; the `release-integrator` path reads the gate from BUILD.

This documentation task produces the audit and the gate. Closing gaps in code is separate feature work, each through its own CR.

### 5.14 Out of scope

Product code, migrations, and agent behavior (models, tools, prompts beyond section references). Exceptions:

- `.claude/agents/*.md`: section-number references only (D7), for example "SAD section 3.1" and "build guide section 8".
- `.claude/agents/requirements-qa-gate.md`: "PRD acceptance criteria" becomes "PRD gate criteria (`G-F<n>-<m>`)" (D8).
- `scripts/docs/check.py`: a minimal change only if a rebuilt heading legitimately breaks a rule; named in the reconciliation CR.

Historical CRs that cite old section numbers (for example `cr-pathways-sad-orchestration.md`) keep their text; the reconciliation CR carries an old-to-new section map.

Not committed: the template folder, `docs/reference/`, `docs/activity-log.md`. Root `CLAUDE.md` is tracked (developer-approved).

## 6. Invariants

1. Stable IDs are preserved exactly: `PRD-F1` to `PRD-F13`, QAD row IDs, RFC and CR filenames, migration numbers. Gate, use case, FR and NFR IDs are stable once assigned.
2. Every SAD and BUILD concept that agents or checkers depend on survives the rebuild under some section: roster and trigger paths, per-role engineering rules (one subsection per role, named exactly as the agent), sequenced pipeline, handoff packet, output schema; BUILD release sequence, traceability grounding, Human Intervention block. After renumbering (D7), every `SAD section N` and `build guide section N` reference in `.claude/agents/`, `build-pathways.md` and `sad-pathways.md` points to the section holding that concept.
3. SAD keeps a roster table with `Specialist` and `Model` columns matching `.claude/agents/` (parsed by `check_agents` in `scripts/docs/check.py`), and its trigger paths stay identical to the globs in `scripts/sad/check.ts`.
4. `pnpm docs:check` passes (baseline on `origin/dev`: 0 failures, 0 warnings).
5. No invented facts: missing source material is either asked for (D4) or stated as "not established" with the reason.

## 7. Process

| Wave | Content | Depends on |
|---|---|---|
| 0 | Branch; extract manuscript text; build a scratchpad fact sheet from the repo (roles, permission matrix, API modules and routes, Prisma models, migrations 0000-0045, web routes, current design tokens) | - |
| 1 | `IDEA.md`, BRD, PRD (matrix, charters, FR/NFR, use cases, workflows and diagrams; D8-D10), one drafter per feature group | 0 |
| 2 | DSD (with gap table), SDD (architecture D14, tech stack D13, ER diagrams and database architecture D12, checked against Prisma), QAD (ISO/IEC 25010 structure, rows cite gate and use case IDs; D11), SDD sequence and ER diagrams (D9), SAD, BUILD; realign section references in `.claude/agents/` (D7, D8) | 1 |
| 3 | VAL, SCRUTINY, VOICE, CLR, AIA, OPS (without SLOs); AWS migration RFC (D15); manuscript alignment audit (D16); record edits; `state.md`, `deferred-features.md`, reconciliation CR | 2 |
| 4 | UES, GTM, PITCH, WRAP, OPS SLOs, after the developer questionnaire | 3 and answers |
| 5 | `index.md`, `log-pathways.md`, `README.md`; `pnpm docs:materialize`; `pnpm docs:check` | 4 |

Drafting is done by Sonnet subagents (one per doc or small group, parallel within a wave), each given the fact sheet, the relevant manuscript extract and the template headings. The coordinator reviews each draft against the fact sheet and manuscript before accepting it. One focused commit per task, grouped by wave.

## 8. Verification

Run against a clean copy of the tracked tree (`git archive HEAD`), because `docs:check` scans every `.md` under `docs/` recursively and would otherwise include the untracked reference folders.

- A case-insensitive search for the other repository's name over tracked files returns nothing (the search term lives only in the scratchpad harness, never in a tracked file).
- `pnpm docs:check` passes; `pnpm docs:materialize` produces no diff.
- Every `SAD section N` and `build guide section N` reference in `.claude/agents/`, `sad-pathways.md` and `build-pathways.md` resolves to the heading holding that concept (invariant 2); `pnpm sad:test` passes.
- Every use case cites a real route or endpoint and permission from the fact sheet; every gate is linked to at least one use case; every manuscript use case report is either in the PRD or in the not-carried-forward table.
- Every FR maps to a feature; every NFR has exactly one of the eight characteristics; each characteristic has a QAD coverage section.
- Every table named in the Database Architecture exists in `schema.prisma` and every mapped model appears in exactly one module; every manuscript dictionary table has a reconciliation row.
- Every file reference in the AWS migration RFC exists; the RFC and OPS make no AWS readiness claim.
- Every charter's bounds trace to Scope and Limitations or to an Applied CR.
- Every feature cites an `R<n>` and objective; every `R1`-`R8` and every specific objective has a row in the alignment audit with status and evidence; the Manuscript Alignment gate appears in BUILD release criteria and QAD Definition of Done.
- Every tech stack version matches the dependency files.
- Every Mermaid block renders (checked with the Mermaid CLI in the scratchpad, not added as a project dependency).
- Every gate `G-F<n>-<m>` links at least one QAD row and every QAD row citing a gate resolves; every feature has all six charter fields.
- Every cited PRD, QAD and CR ID resolves; no broken relative links inside `docs/`.
- Spot checks: roles and permissions against the RBAC seed and migrations; SDD tables against `schema.prisma`; DSD "current" column against `apps/web/src/app/globals.css`.
- `git status` shows no staged file from the untracked folders.

## 9. Integration

1. `git fetch origin`; fast-forward local `dev` to `origin/dev`.
2. `git merge --no-ff docs/canonical-reconcile` into `dev`.
3. Conflicts: in docs, the rebuilt version wins, with any content added upstream since the branch point (for example new `deferred-features.md` rows) carried into it. Any code or migration conflict stops the merge for a developer decision.
4. Re-run section 8 on the merge result, then push `origin/dev` as `ceezey`.
5. Report the merge commit and each conflict with its resolution.

Any failing check is fixed on the branch and the sequence repeats; nothing reaches `origin/dev` in a failing state.

## 10. Risks

| Risk | Mitigation |
|---|---|
| Template-first rebuild drops verified contract detail | Invariants 1-3; per-doc review against the fact sheet; records kept intact (5.2) |
| Template wording or identity leaks in | Precedence rule 4; grep gate; coordinator review |
| Outdated manuscript use cases / ERD re-enter as current | Repository wins; superseded items listed in the CR |
| System ships to production without meeting manuscript commitments | D16 alignment audit and production gate; gaps resolved or formally descoped by CR |
| Design docs claim the new UI is shipped | D1 gap table separates current from target |
| PRD grows too large to review | One drafter per feature group; diagrams only where section 5.6 lists them; sequence diagrams limited to the named backend flows |
| Parallel drafters contradict each other | Single fact sheet; wave ordering; coordinator review |
| Renumbered SAD/BUILD silently breaks agents | D7 realignment in the same wave; reference-resolution gate in section 8 |
