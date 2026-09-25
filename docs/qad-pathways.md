# QA & Test Plan (QAD)

**Status:** Working.

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
| QAD-T01 | F1 | active user resolves trusted org/role/permission/project scope |
| QAD-T02 | F2 | authorized project/activity workflow persists |
| QAD-T03 | F3 | authorized Beneficiary create/search in scope |
| QAD-T04 | F4 | journey/participation history persists chronologically |
| QAD-T05 | F5 | valid form/direct entry persists validated data |
| QAD-T06 | F6 | mapped import validates and normalizes |
| QAD-T07 | F7 | indicator shows correct trusted metric/target/source |
| QAD-T08 | F8 | dashboard/SADDD uses trusted data and suppression |
| QAD-T09 | F10 | rule triggers once with versioned evidence |
| QAD-T10 | F11 | authorized human reviews predefined recommendation |
| QAD-T11 | F13 | public surface exposes only approved data/media |

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

Test:

- `< <= = != >= >`;
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
