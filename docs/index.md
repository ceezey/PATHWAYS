# Documentation Index: PATHWAYS

**Project slug:** `pathways`  
**Maintained by:** PATHWAYS capstone team  
**Workflow adoption:** 2026-09-26  
**Workflow basis:** Curated from the supplied ArkiLaunch repository documentation/agent system

> **Manifest / control panel.** This file is the documentation entry point, registry, traceability map, Change Log, and Health Check. Update it in the same change whenever registered documents/statuses materially change.

## 0. Status Semantics

- **Locked:** implementation authority unless superseded by a newer explicit developer decision.
- **Working:** usable, but repository reconciliation is still required.
- **Draft:** planning/reference only.
- **Deferred:** preserved for future work but not an active implementation target.
- **Control:** persistent execution/governance document.

## 1. Root Files

| Document | File | Status | Role |
|---|---|---|---|
| Engineering idea/source-of-record | `../IDEA.md` | Control | project identity/scope distillation |
| README | `../README.md` | Control | repository entry point |
| Agent build instructions | `../AGENTS.md` | Control | materialized from BUILD |
| Brand reference | `../BRAND.md` | Working | materialized from canonical DSD |
| Design reference | `../DESIGN.md` | Working | materialized from canonical DSD |

## 2. Documentation Suite

| Type | File | Status |
|---|---|---|
| IDEA | `idea-pathways.md` | Draft |
| VALIDATION | `val-pathways.md` | Draft |
| SCRUTINY | `scrutiny-pathways.md` | Working |
| VOICE | `voice-pathways.md` | Working |
| PITCH | `pitch-pathways.md` | Draft |
| WRAP | `wrap-pathways.md` | Draft |
| BRD | `brd-pathways.md` | Working |
| UES | `ues-pathways.md` | Deferred |
| PRD | `prd-pathways.md` | Working |
| DSD | `dsd-pathways.md` | Working — frontend source reconciled |
| SDD | `sdd-pathways.md` | Working |
| QAD | `qad-pathways.md` | Working |
| SAD | `sad-pathways.md` | Draft |
| BUILD | `build-pathways.md` | Working |
| CLR | `clr-pathways.md` | Working |
| AIA | `aia-pathways.md` | Working / not triggered |
| GTM | `gtm-pathways.md` | Deferred |
| OPS | `ops-pathways.md` | Working |
| LOG | `log-pathways.md` | Control / append-only |

## 3. RFCs

| RFC | File | Scope | Status |
|---|---|---|---|
| Auth/RBAC/isolation | `rfc-pathways-auth-rbac-isolation.md` | PRD-F1 + all protected paths | Working |
| Metadata/ingestion | `rfc-pathways-metadata-ingestion.md` | PRD-F5/F6 | Working |
| SADDD/privacy | `rfc-pathways-saddd-privacy.md` | PRD-F8 | Locked |
| Rules/decision support | `rfc-pathways-rule-alerts-decision-support.md` | PRD-F10/F11 | Working |

## 4. Runbooks

| Runbook | File | Status |
|---|---|---|
| Local development | `runbook-local-dev.md` | Draft pending repo command reconciliation |
| Backup/restore | `runbook-backup-restore.md` | Working |
| Documentation reconciliation | `runbook-doc-reconciliation.md` | Working |

## 5. Governance Templates

| Template | File |
|---|---|
| Change Record | `change-record-template.md` |
| Audit | `audit-template.md` |
| Postmortem | `postmortem-template.md` |

### Workflow rule

- Audit = finding/evidence.
- Change Record = decision/approved contract change.
- Postmortem = incident learning/action.

Do not build directly against an audit finding until the appropriate contract/CR is approved.

## 6. Traceability Matrix

| PRD ID | Feature | Priority | SDD | QAD | RFC |
|---|---|---|---|---|---|
| PRD-F1 | RBAC / Workspace | Must | yes | yes | auth RFC |
| PRD-F2 | Project / Activity | Must | yes | yes | - |
| PRD-F3 | Beneficiary Profile | Must | yes | yes | - |
| PRD-F4 | Beneficiary Journey | Must | yes | yes | - |
| PRD-F5 | Digital Collection | Must | yes | yes | metadata RFC |
| PRD-F6 | Metadata Integration | Must | yes | yes | metadata RFC |
| PRD-F7 | Indicators / Monitoring | Must | yes | yes | - |
| PRD-F8 | Dashboard / SADDD | Must | yes | yes | SADDD RFC |
| PRD-F9 | Descriptive Analytics | Supporting | yes | yes | - |
| PRD-F10 | Rule Alerts | Supporting | yes | yes | rules RFC |
| PRD-F11 | Decision Support | Supporting | yes | yes | rules RFC |
| PRD-F12 | Reporting / Visualization | Supporting | yes | yes | - |
| PRD-F13 | Public Tracker | Supporting | yes | yes | - |

## 7. Change Log

Newest first.

| CR ID | Date | Summary | Status |
|---|---|---|---|
| workflow-adoption-2026-09-26 | 2026-09-26 | Curated ArkiLaunch-style documentation/AI workflow for PATHWAYS; added manifest, suite, build/AGENTS materialization, RFC/runbook/templates while preserving PATHWAYS execution controls | Applied as documentation package |

Future material changes to Locked docs should use `cr-pathways-<slug>.md`.

## 8. Incident Log

| PM ID | Incident date | Severity | Summary | Status |
|---|---|---|---|---|
| none | - | - | - | - |

## 9. Health Check

- [x] Root entry files exist in this generated package.
- [x] PRD stable feature IDs defined.
- [x] SDD/QAD/RFC traceability registered.
- [x] SADDD policy captured as Locked RFC.
- [x] Build guide -> AGENTS materialization exists.
- [x] Audit / Change Record / postmortem distinctions documented.
- [x] Deployment/SSO/AWS deferral carried forward.
- [x] six-role model carried forward.
- [x] rule-based/no-autonomous-AI boundary carried forward.
- [~] Current repository has **not** been reconciled against all generated Working docs in this package.
- [x] DSD/BRAND/DESIGN are grounded in the supplied current frontend source snapshot.
- [x] Redundant root `AGENT.md` and root `index.md` are intentionally omitted.
- [~] The referenced `/brand/pathways-mark.png` binary was not present in the uploaded source snapshot; verify it in the authoritative repo.
- [~] SDD exact model/API names require current backend/Prisma inspection.
- [~] QAD exact executable commands require repository test-tool inspection.
- [~] No automated documentation drift checker is claimed.

## 10. Maintenance Rules

1. The current repository wins over stale docs.
2. Disposable task TODOs, temporary source-of-truth notes, phase prompts, and report templates stay outside the repository.
3. Locked-doc material changes require Change Records.
4. Audits do not rewrite contracts.
5. `log-pathways.md` is append-only.
6. Do not claim generated docs are Locked before repository reconciliation.
7. Update this index whenever a registered doc/status/CR/audit/runbook changes.
8. Keep document count secondary to correctness; do not create docs without a real governance/use case.

## 11. Current Next Step

Continue backend/API/Prisma/QAD reconciliation. The DSD/BRAND/DESIGN are now source-grounded for the supplied frontend snapshot but remain Working until accepted against the authoritative branch.
