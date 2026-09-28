# QA & Test Plan (QAD)

## 1. Strategy

Every implemented feature requires:

- happy path;
- sad/error path;
- abuse/hostile path;
- authorization/isolation;
- data-integrity checks;
- accessibility where applicable.

A successful build alone is not completion evidence.

Use the [SAD review gates](sad-pathways.md) alongside feature tests. Proposed changes require concurrent matching specialist/design reviews before implementation; final content requires renewed review and external evidence validation. Automated check success does not imply semantic approval.

## 2. Test Data

Use synthetic/anonymized:
- organizations;
- projects;
- Beneficiaries;
- Auth identities;
- uploads;
- evidence/media.

Do not use confidential live Beneficiary data.

## 3. Core Matrix

### Happy

| ID | Feature | Scenario |
|---|---|---|
| QAD-T01 | PRD-F1 | active user resolves trusted org/role/permission/project scope |
| QAD-T02 | PRD-F2 | authorized project/activity workflow persists |
| QAD-T03 | PRD-F3 | authorized Beneficiary create/search in scope |
| QAD-T04 | PRD-F4 | journey/participation history persists chronologically |
| QAD-T05 | PRD-F5 | valid form/direct entry persists validated data |
| QAD-T06 | PRD-F6 | mapped import validates and normalizes |
| QAD-T07 | PRD-F7 | indicator shows correct trusted metric/target/source |
| QAD-T08 | PRD-F8 | dashboard/SADDD uses trusted data and suppression |
| QAD-T12 | PRD-F9 | descriptive summary uses trusted persisted metrics; missing data shown as unavailable |
| QAD-T09 | PRD-F10 | rule triggers once with versioned evidence |
| QAD-T10 | PRD-F11 | authorized human reviews predefined recommendation |
| QAD-T13 | PRD-F12 | report/visualization output respects role scope and SADDD suppression |
| QAD-T11 | PRD-F13 | public surface exposes only approved data/media |

### Sad

| ID | Scenario |
|---|---|
| QAD-T20 | suspended/deactivated/archived account denied |
| QAD-T21 | invalid import remains staged/error |
| QAD-T22 | missing required mapping blocks normalization |
| QAD-T23 | invalid/missing metric denominator does not produce misleading percentage |
| QAD-T24 | unavailable rule metric -> explicit unavailable/not-evaluated |
| QAD-T25 | disallowed upload rejected |
| QAD-T26 | export/report failure leaves source data intact |

PRD-F6 mapping suggestions additionally cover stable source keys, ASCII whitespace/hyphen folding, fullwidth NFKC, preserved accented-case distinctions, non-ASCII whitespace, punctuation and blank names. Competing code/label candidates and an ambiguous source sharing another source's sole target must remain unresolved. Suggested mappings retain existing reviewer confirmation and server validation; no new authority is inferred.

### Abuse

| ID | Scenario |
|---|---|
| QAD-A01 | Org A guesses Org B project -> denied |
| QAD-A02 | unassigned project direct API -> denied |
| QAD-A03 | Program Manager requests Beneficiary detail -> denied |
| QAD-A04 | Grant Manager requests Beneficiary detail -> denied |
| QAD-A05 | forged org/role/actor fields -> ignored/rejected |
| QAD-A06 | role/assignment privilege escalation -> denied |
| QAD-A07 | spreadsheet formula/macro does not execute |
| QAD-A08 | rule attempts raw SQL/code -> rejected |
| QAD-A09 | public route requests private media -> denied |
| QAD-A10 | SADDD suppressed cells cannot be trivially reconstructed |
| QAD-A11 | Beneficiary detail request with stale, missing or future-dated TOTP `amr` and no live PIN grant for the same user, organization and verified session -> 403 `STEP_UP_REQUIRED`, handler not run, denial audited; a grant from another session, user or organization, an expired grant or an ended session is rejected |
| QAD-A12 | client-supplied step-up flag/header/storage, grant or session value, or a client-only MFA success does not open Beneficiary detail; the server status must report fresh |
| QAD-A13 | PIN brute force: 5 failures lock the PIN, parallel wrong attempts cannot exceed the bound, a locked PIN is not compared, only a TOTP newer than the lock unlocks it, and PIN requests are throttled |
| QAD-A14 | PIN setup without a fresh signed TOTP or when a PIN exists, and change without the current PIN or a fresh TOTP -> denied; the PIN never appears in URLs, logs, audit rows or error bodies |

## 4. Rule-Engine Matrix

PRD-F10/PRD-F11 have a local human rules API and a disabled-by-default machine drain/sweep runtime (migration 0031). Hosted installation remains pending. Indicator metrics additionally require a current non-sensitive eligibility approval, which has no administration path yet.

- `< <= = >= >` (Prisma `RuleOperator`: LT, LTE, EQ, GTE, GT);
- BETWEEN;
- ALL/ANY;
- equality boundaries;
- missing metrics;
- duplicate/idempotent evaluation;
- cooldown;
- re-trigger;
- auto-resolution;
- project isolation;
- rule-version snapshots;
- human outcome permission.

## 5. Automated vs Manual

PRD-F1/F2 private pending-proof inspection follows [its approved Change Record](cr-pathways-private-activity-proof-inspection.md): test all roles and individual grants, self/cross-scope/revoked access, pending states and revisions, mixed lineage/incomplete uploads, private bucket and redirect, counted size/digest/deadline/disconnect, revocation or review during storage, failing audit with zero body release, safe headers/no cache, old URL/HEAD/range denial and keyboard-accessible review controls. Synthetic identifying proofs with unchanged false-consent defaults are eligible only for this approved pending-verification purpose, never publication. These are required scenarios, not executed evidence.

Use current repo commands after reconciliation.

Automate:
- unit;
- integration/API;
- DB constraints/replay;
- frontend components;
- E2E critical workflows;
- type/lint/static checks.

Manual:
- UX clarity;
- accessibility;
- charts/reports;
- import error usability;
- public privacy review;
- defense/UAT flow.

## 6. Bug Priority

P0:
- data loss/corruption;
- cross-org leak;
- private Beneficiary/public exposure;
- auth bypass;
- destructive migration error.

P1:
- monitoring/SADDD incorrect;
- silent import corruption;
- rule mis-evaluation;
- privileged workflow error.

## 7. Definition of Done

- acceptance criteria implemented;
- relevant tests executed;
- no unresolved in-scope P0/P1;
- docs reflect durable behavior;
- any durable documentation changes are reconciled;
- phase report in chat;
- next phase explicitly authorized.

## 8. AI / OCR

No runtime AI/OCR test program is currently required unless a future approved feature introduces it.

## Self-Check

- [x] core features traced
- [x] abuse/isolation present
- [x] rule/import/SADDD privacy covered
- [x] no unverified performance numbers invented

## 8. CSV RBAC Realignment (PRD-F1)

The approved [auth contract](rfc-pathways-auth-rbac-isolation.md) supplies the matrix. Verify with `pnpm --filter @pathways/api exec vitest run`, the web regression suite, and `infra/supabase/phase6/Replay-Local.ps1 -MigrationBaseline` on disposable PostgreSQL.

| ID | Required check |
|---|---|
| QAD-R01 | Exact API/frontend/SQL grants and role ceilings across all six roles; detailed rows override overview conflicts |
| QAD-R02 | All roles scoped project detail; restricted tabs excluded; Admin beneficiary/assessment/enrollment denied; activity context excludes detail |
| QAD-R03 | Admin all six roles, Program PM/M&E, PM PO/M&E; only Admin assigns Grant; cross-scope targets denied |
| QAD-R04 | Managed-program and explicit-assignment scope; forged actor/organization/project denied |
| QAD-R05 | Revoked grants, inactive permission/role, suspended/deactivated account, and ended assignments deny the next operation/request |
| QAD-R06 | Program/Grant raw beneficiary and assessment denial with populated synthetic rows; SADDD protections unchanged |
| QAD-R07 | Archived replay, fresh baseline, preserved-ledger registration/0027/0028 upgrade, subsequent Prisma migration creation/application, datamodel/security/privilege parity; actual SADDD entrypoints for all six roles, PO monitoring denial and cross-organization aggregate denial |
| QAD-R08 | Native PM creation preserves target beneficiaries, automatic self-assignment and audit recording; approved target-goal retirement requires goal-free create/update, legacy input rejection, historical-value preservation, output/draft omission and independent indicator progress checks (implementation/verification pending) |
| QAD-R09 | Read-only remote ledger/checksum/security inspection and protected backup restore before application; stop unexpected drift |

Permission grants for missing handlers are contract checks, not feature acceptance. Synthetic behavior stays local. No destructive or live-data behavioral tests are part of this phase.

Additional PRD-F1 checks cover blank definitions versus responses, collected-data versus template imports, journey freeze/privacy, PO alert/SADDD versus monitoring denials, escalation boundaries, archive integrity, and Prisma 6.19.2 compatibility without resets.

## 9. SAD Tooling and Disposable CI Replay

Run `pnpm sad:test`, `pnpm sad:typecheck`, and `pnpm sad:check`; use `--base REV --head REV` for a committed range. Store `--output` manifests and review evidence outside tracked repository files. Final engineering sign-off requires `pnpm sad:signoff -- --reviews <external-json-path>` against the current digest, covering each required role/path pair and its ISO pillars.

| Required regression | Expected result |
|---|---|
| Trigger routing, renames, deletions, Windows paths | All applicable roles match either renamed path; deterministic normalized ordering |
| Executable code versus comments/strings | AST flags executable `eval`/dynamic `Function`; descriptive text alone is not a violation |
| Unsafe raw queries and destructive SQL | Review flags require semantic evidence, including parameterization/preservation where applicable |
| Dependency additions and preserved migration edits | Dependency warnings require justification; immutable-history changes block |
| Missing/stale/malformed/BLOCKED evidence | Final sign-off fails; complete digest-matching PASS evidence succeeds |
| Disposable PostgreSQL 18 replay | Archived history, fresh baseline provisioning, preserved-ledger registration/upgrade, and forward corrections preserve expected data/security/catalog behavior |

CI publishes automated diagnostics without claiming full SAD approval. The Linux replay uses verified archive extraction, existing SQL fixtures and catalog validators, and documented checksum exceptions. Local execution limitations must be reported; an unexecuted CI job is not verified evidence. Hosted databases and confidential data are excluded.

## Core P1 acceptance coverage

For [core P1 supporting operations](cr-pathways-core-p1-supporting-operations.md), verify all-role and individual-grant denial, cross-organization/project scope, revocation on retry, bounded latest published-definition reads, strict allowlists, empty-versus-failed context, sparse individual definitions, age-only error focus, minor/guardian consistency and custom required fields. Verify all candidate collisions, stable source keys, incomplete mappings, immutable revision/audit parity, changed/stale retries and unchanged reviewer/processor authority. Corrected supporting SQL also requires all submission kinds, raw-policy compatibility, definition/archive lock waits, concurrency, fresh/upgrade/recovery and preserved ledger/catalog checks. A mapping-only run or static/unit PASS does not establish complete migration or feature acceptance. Authenticated UI, physical cancellation and preview checks remain separate executable requirements.
