<!-- MATERIALIZED from docs/build-pathways.md by scripts/docs/materialize.py. Do not hand-edit; edit the canonical doc and re-run. -->

# PATHWAYS Build Guide

**Status:** Control
**Version:** 2.0
**Last reconciled:** 2026-10-01
**Owner:** PATHWAYS capstone team

**Canonical:** `docs/build-pathways.md`

Root `AGENTS.md` is a materialized copy. Edit this guide first, then run `pnpm docs:materialize` and `pnpm docs:check`.

## 1. How to Build From These Docs

### 1.1 Read Order

Before substantial implementation:

1. `docs/index.md`
2. `docs/scrutiny-pathways.md`
3. `docs/brd-pathways.md`
4. `docs/prd-pathways.md`
5. `docs/sdd-pathways.md`
6. relevant RFC(s)
7. `docs/dsd-pathways.md`
8. `docs/qad-pathways.md`
9. `docs/clr-pathways.md`
10. `docs/aia-pathways.md`
11. `docs/ops-pathways.md`
12. this build guide

Read `docs/sad-pathways.md` before proposing or implementing changed code; its specialist triggers and evidence gate apply alongside the relevant contracts.

Read the manuscript/Master Context Pack when academic/domain context is needed.

### Status Semantics

- **Locked:** implementation authority unless superseded by newer explicit developer decision.
- **Working:** usable, but must be reconciled with repository behavior.
- **Draft:** planning/reference only.
- **Deferred:** not an active implementation target.

### Re-ground Triggers

Reload `docs/index.md`, `AGENTS.md`, and the relevant registered docs:

- at a new agent/Codex session;
- after an approved Change Record;
- before schema/auth/security changes;
- before destructive DB changes;
- after long research/tool detours;
- when code contradicts docs.

### 1.2 Source Authority

1. Latest explicit developer decision
2. Verified current repository behavior
3. Locked docs in `docs/index.md`
4. Master Context Pack
5. manuscript/revision matrix
6. older notes

Never silently resolve material contradictions.

### Frontend / visual work

For frontend tasks, read the canonical `docs/dsd-pathways.md` and use root `BRAND.md` / `DESIGN.md` as materialized references generated from it. If they conflict with newer verified code, reconcile the canonical DSD first rather than silently choosing whichever file is convenient.

### 1.3 Traceability

Every requirement follows the chain `P<n>/R<n> -> PRD-F<n> -> G-F<n>-<m> -> UC-F<n>-<m> -> QAD-* -> ISO/IEC 25010`, with `FR-<n>` and `NFR-<n>` attached to the PRD features they serve. Use the table to choose what to read and verify.

| Work | Read | Verify |
|---|---|---|
| Core feature | PRD -> SDD -> applicable RFC | QAD rows |
| Auth/RBAC | SDD Security -> auth RFC | abuse/isolation tests |
| Metadata/import | PRD F5/F6 -> SDD -> ingestion RFC | staging/validation/idempotency tests |
| Beneficiary | PRD F3/F4 -> SDD -> CLR | privacy/project-scope tests |
| Indicators/dashboard | PRD F7/F8 -> SDD | metric/privacy tests |
| SADDD | PRD F8 -> SADDD RFC | age/suppression tests |
| Rules/recommendations | PRD F10/F11 -> rules RFC | deterministic lifecycle/isolation tests |
| UI | DSD + PRD | accessibility + backend-authority tests |
| Migration/schema | SDD + RFC | replay/diff/integrity/recovery |

## 2. Subagents

### 2.1 SAD Review and Sign-off

Use the seven-role SAD (`docs/sad-pathways.md`) for changed-path matching and engineering rules. Review proposed changes with matching specialists and design QA concurrently in bounded batches before implementation; stop dependent work on a violation. After implementation, run `pnpm sad:check`, relevant tests, and renewed specialist reviews against the final change digest. Run `pnpm sad:signoff -- --reviews <external-json-path>` before engineering sign-off. Missing, stale, malformed, or BLOCKED evidence withholds sign-off; changed content invalidates previous evidence. Automated diagnostics do not certify semantic safety. Keep review reports outside tracked files, and omit unmatched roles rather than claiming PASS.

Run reviews through `sad-orchestrator` as the main-thread agent (`claude --agent sad-orchestrator`), following the SAD section 4.1 stage order and section 4.2 handoff packet. Definitions live in `.claude/agents/` and defer to the SAD.

### 2.2 Release Sequence

**Branch and release workflow**

- `origin/master` is the deployment branch.
- `dev` is the development branch.
- Prepare and verify changes on `dev`, then bring the approved release into `master` and push normally.
- The Vercel `pathways-api` and `pathways-web` projects use `master` for production and `dev` for development previews.
- Verify both development previews when shared web route policy affects API imports. If Vercel skips the API build, redeploy the reviewed development source explicitly and confirm both previews before database application.
- Preserve branch history. Do not force-push a deployment branch or run database migrations as a deployment shortcut.

Use `release-integrator` as the main-thread agent (`claude --agent release-integrator`) when integrating one or more feature branches for deployment. Stages run in order; any failure stops later stages and produces a report.

1. **R1 Feature review:** each feature branch passes the SAD pipeline independently against `dev`.
2. **R2 Integrate:** create `integration/<slug>` from current `dev` and merge each feature branch with `--no-ff`. Any conflict halts the run with a Human Intervention block; conflicts are never auto-resolved.
3. **R3 Merged review:** run the SAD pipeline on the merged digest. Passing branches can still conflict semantically.
4. **R4 Requirements QA:** `requirements-qa-gate` verifies each feature against its PRD gate criteria (`G-F<n>-<m>`) and QAD happy/sad/abuse rows. Every feature needs PASS.
5. **R5 Development release:** merge into `dev`, push, and verify that both Vercel development previews build and respond.
6. **R6 Deployment:** merge `dev` into `master` and push normally.

The developer authorized R6 without per-release approval on 2026-09-28, only when all of these pass on the exact commit pushed: `pnpm -r typecheck`, test and build scripts, `pnpm docs:check`, `pnpm sad:signoff` with valid PASS evidence, R4 PASS for every feature, and healthy development previews. A release containing schema or migration changes stops before R6 for human authorization. Run logs and evidence go to `.tmp/release/<run>/`.

## 3. Stack Currency & Deprecations

Stack, hosting and deprecation decisions are in SDD section 2.4 (`docs/sdd-pathways.md`). Versions come from the dependency files (`package.json`, `pnpm-lock.yaml`), verified 2026-10-01; never copy a version from prose.

## 4. Golden-Path Patterns

### Protected request

```text
verified Supabase identity
→ linked system user
→ account-state check
→ organization
→ role
→ permissions
→ project assignment if required
→ scoped DB query
```

Never retrieve broad sensitive data then filter in memory.

### Metadata ingestion

```text
private upload / direct entry
→ batch/submission
→ source discovery
→ explicit mapping
→ validation
→ raw staging
→ authorized normalization
→ domain records
→ audit
```

### Beneficiary privacy

- Beneficiary records are not public users.
- Program Manager/Grant Manager get aggregate-only Beneficiary information.
- Project roles get detail only within permitted assignments.
- private media is not public without separate approval/provenance.

### Rules

```text
trusted metric provider
→ typed metric catalog
→ structured condition(s)
→ deterministic evaluation snapshot
→ alert
→ predefined recommendation
→ human outcome
→ audit history
```

No arbitrary SQL/code in user-created rules.

### SADDD

Use the Locked SADDD RFC. Suppression is part of correctness.

## 5. Conventions & Guardrails

### Always

- validate external input;
- derive identity/scope server-side;
- scope sensitive queries before retrieval;
- use migrations for schema changes;
- preserve exact migration history and ledger checksums; approved consolidation archives original bytes and registers a verified baseline without executing it on populated databases;
- separately authorize destructive work;
- keep secrets out of code/docs/logs;
- test happy/sad/abuse paths;
- use synthetic/anonymized data;
- preserve approved UI/UX unless redesign is authorized;
- keep phase/task tracking in external disposable context;
- update registered durable docs only when an approved contract or verified repository fact changes;
- keep disposable task/checklist/report context outside the repository;
- report phase results in chat only.

### Never

- trust client role/org/permission/assignment;
- expose Beneficiary detail to aggregate-only roles;
- use direct browser Data API for core domain access;
- weaken security to pass tests;
- rewrite applied migrations silently;
- create a second Prisma migration ledger;
- use production/confidential data for demos/tests;
- commit disposable phase prompts, task TODOs, temporary source-of-truth notes, or phase-report files;
- claim deployment/SSO/AWS completion without verified evidence;
- display user-facing prototype/mock/demo/presentation-only product status.

### 5.1 Brownfield Change Workflow

Material change to a Locked contract:

```text
explore
→ propose `docs/cr-pathways-<slug>.md`
→ verify against repo + dependent docs
→ obtain developer approval where material
→ apply
→ run QAD/security tests
→ verify behavior
→ update Locked docs/index
→ mark CR Applied/Deferred/Rejected
```

Audits record findings. Change Records record decisions.

### 5.2 Public Surface & Crawler Policy

Not established: the public tracker surface (PRD-F13) has no crawler or indexing policy in the F13 charter or repository. Until one is approved, treat public pages as unindexed-by-default and expose only fields the F13 charter allows.

### 5.3 Restraint Ladder

Before adding complexity:

1. Does this need to exist?
2. Does the repo already have a pattern?
3. Can a native capability solve it?
4. Can an installed dependency solve it?
5. Can a small explicit implementation solve it?
6. Only then add an abstraction/dependency.

Never cut security, privacy, validation, auditability, recovery, tests, or accessibility for simplicity.

### 5.4 Human Intervention Contract

```text
HUMAN INTERVENTION REQUIRED: <title>

Why:
<verified reason>

Developer steps:
1. <exact action>
2. <exact action>

Expected result:
<what should be observed>

Reply with:
<exact response needed>

Blocked:
<scope>

Can continue:
<safe scope, if any>
```

Do not bury a human gate inside a long phase report.

### 5.5 Definition of Done and Release Criteria

- [ ] authorized phase scope implemented
- [ ] relevant PRD gate criteria (`G-F<n>-<m>`) satisfied
- [ ] security/privacy invariants preserved
- [ ] schema/API matches current SDD/RFC or approved CR
- [ ] relevant QAD happy/sad/abuse tests pass
- [ ] required SAD specialist/design reviews pass against final content and external evidence validates
- [ ] no secrets committed
- [ ] no unauthorized cross-org/project access
- [ ] no user-facing prototype/mock/presentation-only labels introduced
- [ ] any approved durable documentation change is reflected in the registered docs/index
- [ ] disposable task state remains outside the repository
- [ ] final report delivered in chat
- [ ] next phase not started without explicit authorization
- [ ] Manuscript Alignment gate satisfied (QAD section 6.1, `docs/qad-pathways.md`; audit in `docs/audit-pathways-manuscript-alignment-20261001.md`)

## 6. Materialization

| Target | File | Rule |
|---|---|---|
| Canonical build guide | `docs/build-pathways.md` | edit first |
| All agents | `AGENTS.md` | materialized copy |
| Brand reference | `BRAND.md` | materialized from DSD sections 0, 0.5, 1, 2, 8, 9 |
| Design reference | `DESIGN.md` | materialized from DSD sections 2-8 |
| Phase/task workflow | external/disposable prompt context | never committed as repository authority |

Regenerate materialized files with `pnpm docs:materialize` (`scripts/docs/materialize.py`). Validate the suite with `pnpm docs:check` (`scripts/docs/check.py`): em-dash/voice rules, index manifest coverage, PRD-F# traceability, and Locked-doc reconciliation dates. Never hand-edit materialized files.

## Self-Check

- [x] read order and source hierarchy
- [x] traceability chain
- [x] SAD review and release sequence
- [x] golden paths and guardrails
- [x] Change Record flow
- [x] human intervention contract
- [x] definition of done and alignment gate
