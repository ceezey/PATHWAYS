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

## 4. Rule-Engine Matrix

Test once the rules API exists (PRD-F10/PRD-F11 are schema-only today):

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

The approved [auth contract](rfc-pathways-auth-rbac-isolation.md) supplies the matrix. Verify with `pnpm --filter @pathways/api exec vitest run`, the web regression suite, and `infra/supabase/phase6/Replay-Local.ps1 -CsvRbacRealignment` on disposable PostgreSQL.

| ID | Required check |
|---|---|
| QAD-R01 | Exact API/frontend/SQL grants and role ceilings across all six roles; detailed rows override overview conflicts |
| QAD-R02 | Admin/PO project context selection excludes detail; Admin beneficiary detail denied; opaque enrollment support succeeds |
| QAD-R03 | Admin all six roles, Program PM/M&E, PM PO/M&E; only Admin assigns Grant; cross-scope targets denied |
| QAD-R04 | Managed-program and explicit-assignment scope; forged actor/organization/project denied |
| QAD-R05 | Revoked grants, inactive permission/role, suspended/deactivated account, and ended assignments deny the next operation/request |
| QAD-R06 | Program/Grant raw beneficiary and assessment denial with populated synthetic rows; SADDD protections unchanged |
| QAD-R07 | Historical replay and forward upgrade; fresh provisioning; unchanged datamodel plus security-catalog parity |
| QAD-R08 | Native PM creation preserves target beneficiaries/goal, automatic self-assignment, and audit recording |
| QAD-R09 | Read-only remote ledger/checksum/security inspection and protected backup restore before application; stop unexpected drift |

Permission grants for missing handlers are contract checks, not feature acceptance. Synthetic behavior stays local. No destructive or live-data behavioral tests are part of this phase.
