<!-- MATERIALIZED from docs/build-pathways.md by scripts/docs/materialize.py. Do not hand-edit; edit the canonical doc and re-run. -->

# PATHWAYS Build Guide

**Canonical:** `docs/build-pathways.md`

Root `AGENTS.md` is a materialized copy. Edit this guide first, then run `pnpm docs:materialize` and `pnpm docs:check`.

## 1. Read Order

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

## 2. Source Authority

1. Latest explicit developer decision
2. Verified current repository behavior
3. Locked docs in `docs/index.md`
4. Master Context Pack
5. manuscript/revision matrix
6. older notes

Never silently resolve material contradictions.

### Frontend / visual work

For frontend tasks, read the canonical `docs/dsd-pathways.md` and use root `BRAND.md` / `DESIGN.md` as materialized references generated from it. If they conflict with newer verified code, reconcile the canonical DSD first rather than silently choosing whichever file is convenient.

### Branch and release workflow

- `origin/master` is the deployment branch.
- `dev` is the development branch.
- Prepare and verify changes on `dev`, then bring the approved release into `master` and push normally.
- The Vercel `pathways-api` and `pathways-web` projects use `master` for production and `dev` for development previews.
- Preserve branch history. Do not force-push a deployment branch or run database migrations as a deployment shortcut.

## 3. Traceability

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

## 4. Golden Paths

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

## 5. Guardrails

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

## 6. Restraint Ladder

Before adding complexity:

1. Does this need to exist?
2. Does the repo already have a pattern?
3. Can a native capability solve it?
4. Can an installed dependency solve it?
5. Can a small explicit implementation solve it?
6. Only then add an abstraction/dependency.

Never cut security, privacy, validation, auditability, recovery, tests, or accessibility for simplicity.

## 7. Brownfield Change Workflow

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

## 8. Human Intervention Contract

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

## 9. Definition of Done

- [ ] authorized phase scope implemented
- [ ] relevant PRD acceptance criteria satisfied
- [ ] security/privacy invariants preserved
- [ ] schema/API matches current SDD/RFC or approved CR
- [ ] relevant QAD happy/sad/abuse tests pass
- [ ] no secrets committed
- [ ] no unauthorized cross-org/project access
- [ ] no user-facing prototype/mock/presentation-only labels introduced
- [ ] any approved durable documentation change is reflected in the registered docs/index
- [ ] disposable task state remains outside the repository
- [ ] final report delivered in chat
- [ ] next phase not started without explicit authorization

## 10. Materialization

| Target | File | Rule |
|---|---|---|
| Canonical build guide | `docs/build-pathways.md` | edit first |
| All agents | `AGENTS.md` | materialized copy |
| Brand reference | `BRAND.md` | materialized from DSD sections 0, 0.5, 1, 2, 8, 9 |
| Design reference | `DESIGN.md` | materialized from DSD sections 2-8 |
| Phase/task workflow | external/disposable prompt context | never committed as repository authority |

Regenerate materialized files with `pnpm docs:materialize` (`scripts/docs/materialize.py`). Validate the suite with `pnpm docs:check` (`scripts/docs/check.py`): em-dash/voice rules, index manifest coverage, PRD-F# traceability, and Locked-doc reconciliation dates. Never hand-edit materialized files.

## Self-Check

- [x] read order
- [x] source hierarchy
- [x] status semantics
- [x] authz golden path
- [x] import golden path
- [x] Beneficiary privacy
- [x] rule determinism
- [x] SADDD privacy
- [x] Change Record flow
- [x] human intervention
- [x] phase hard-stop workflow
