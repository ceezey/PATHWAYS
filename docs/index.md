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
- **Historical:** retained record; not implementation authority.

## 1. Root Files

| Document | File | Status | Role |
|---|---|---|---|
| Engineering idea/source-of-record | ../IDEA.md | Control | project identity/scope distillation |
| README | ../README.md | Control | repository entry point |
| Agent build instructions | ../AGENTS.md | Control | materialized from BUILD |
| Brand reference | ../BRAND.md | Working | materialized from canonical DSD |
| Design reference | ../DESIGN.md | Working | materialized from canonical DSD |
| Setup guide | ../README-setup.md | Working | local environment setup |
| Design QA record | ../design-qa.md | Historical | 2026-09-08 staff-shell QA; describes a since-removed prototype mode |

## 2. Documentation Suite

| Type | File | Status |
|---|---|---|
| IDEA | idea-pathways.md | Draft |
| VALIDATION | val-pathways.md | Draft |
| SCRUTINY | scrutiny-pathways.md | Working |
| VOICE | voice-pathways.md | Working |
| PITCH | pitch-pathways.md | Draft |
| WRAP | wrap-pathways.md | Draft |
| BRD | brd-pathways.md | Working |
| UES | ues-pathways.md | Deferred |
| PRD | prd-pathways.md | Working |
| DSD | dsd-pathways.md | Working; frontend source reconciled |
| SDD | sdd-pathways.md | Working |
| QAD | qad-pathways.md | Working |
| SAD | sad-pathways.md | Draft |
| BUILD | build-pathways.md | Working |
| CLR | clr-pathways.md | Working |
| AIA | aia-pathways.md | Working; not triggered |
| GTM | gtm-pathways.md | Deferred |
| OPS | ops-pathways.md | Working |
| LOG | log-pathways.md | Control; append-only |
| STATE | state.md | Control; operating position |

## 3. RFCs

| RFC | File | Scope | Status |
|---|---|---|---|
| Auth/RBAC/isolation | rfc-pathways-auth-rbac-isolation.md | PRD-F1 + all protected paths | Working |
| Metadata/ingestion | rfc-pathways-metadata-ingestion.md | PRD-F5/F6 | Working |
| SADDD/privacy | rfc-pathways-saddd-privacy.md | PRD-F8 | Locked |
| Rules/decision support | rfc-pathways-rule-alerts-decision-support.md | PRD-F10/F11 | Working |

## 4. Runbooks

| Runbook | File | Status |
|---|---|---|
| Local development | runbook-local-dev.md | Draft; pending repo command reconciliation |
| Backup/restore | runbook-backup-restore.md | Working |
| Documentation reconciliation | runbook-doc-reconciliation.md | Working |

## 5. Governance Templates

| Template | File |
|---|---|
| Change Record | change-record-template.md |
| Audit | audit-template.md |
| Postmortem | postmortem-template.md |

### Workflow rule

- Audit = finding/evidence.
- Change Record = decision/approved contract change.
- Postmortem = incident learning/action.

Do not build directly against an audit finding until the appropriate contract/CR is approved.

## 6. Traceability Matrix

| PRD ID | Feature | Priority | SDD | QAD | RFC | Backend status |
|---|---|---|---|---|---|---|
| PRD-F1 | RBAC / Workspace | Must-Have | yes | yes | auth RFC | implemented |
| PRD-F2 | Project / Activity | Must-Have | yes | yes | - | implemented |
| PRD-F3 | Beneficiary Profile | Must-Have | yes | yes | - | implemented |
| PRD-F4 | Beneficiary Journey | Must-Have | yes | yes | - | implemented |
| PRD-F5 | Digital Collection | Must-Have | yes | yes | metadata RFC | implemented |
| PRD-F6 | Metadata Integration | Must-Have | yes | yes | metadata RFC | implemented |
| PRD-F7 | Indicators / Monitoring | Must-Have | yes | yes | - | implemented |
| PRD-F8 | Dashboard / SADDD | Must-Have | yes | yes | SADDD RFC | implemented |
| PRD-F9 | Descriptive Analytics | Supporting | yes | yes | - | partial (dashboard endpoints) |
| PRD-F10 | Rule Alerts | Supporting | yes | yes | rules RFC | schema only; no API |
| PRD-F11 | Decision Support | Supporting | yes | yes | rules RFC | schema only; no API |
| PRD-F12 | Reporting / Visualization | Supporting | yes | yes | - | schema only; reports module empty |
| PRD-F13 | Public Tracker | Supporting | yes | yes | - | no API |

Backend status verified 2026-09-26 against `apps/api/src/modules/*` controllers and `apps/web/src/lib/services/pathways-client.ts` (`backendNotConfigured` surfaces).

## 7. Change Log

Newest first.

| CR ID | Date | Summary | Status |
|---|---|---|---|
| development-branch-dev-2026-09-26 | 2026-09-26 | Developer replaced `Backend-DB` with `dev` for development; retained `origin/master` for deployment and aligned development preview configuration | Applied |
| deployment-branch-policy-2026-09-26 | 2026-09-26 | Developer designated `origin/master` for deployment and initially `Backend-DB` for development; authorized connected Vercel API/web projects and explicit remote API/web-origin configuration | Applied; development branch superseded by `dev` |
| workflow-adoption-2026-09-26 | 2026-09-26 | Curated ArkiLaunch-style documentation/AI workflow for PATHWAYS; added manifest, suite, build/AGENTS materialization, RFC/runbook/templates while preserving PATHWAYS execution controls | Applied as documentation package |

Future material changes to Locked docs should use `cr-pathways-<slug>.md`.

## 8. Incident Log

| PM ID | Incident date | Severity | Summary | Status |
|---|---|---|---|---|
| none | - | - | - | - |

## 9. Health Check

Last run: 2026-09-26 (`pnpm docs:check`).

- [x] Root entry files exist.
- [x] PRD stable feature IDs defined and cited by SDD/QAD.
- [x] SADDD policy captured as Locked RFC.
- [x] Build guide -> AGENTS and DSD -> BRAND/DESIGN materialization via `pnpm docs:materialize`.
- [x] Documentation checker: `pnpm docs:check`.
- [x] Audit / Change Record / postmortem distinctions documented.
- [x] Vercel API/web release separately authorized; SSO/AWS remain deferred.
- [x] six-role model carried forward.
- [x] rule-based/no-autonomous-AI boundary carried forward.
- [x] Root `AGENT.md` and root `index.md` intentionally omitted.
- [x] Brand mark verified at `apps/web/public/brand/pathways-mark.png`.
- [x] SDD table list reconciled with `apps/api/prisma/schema.prisma` (99 mapped models/enums, migrations 0001-0025).
- [~] Vercel API runtime not verified: the API currently binds IPv4 loopback only (see OPS open items).
- [~] PRD-F10 to PRD-F13 have no backend API yet.
- [~] Rules RFC items beyond the current Prisma enums remain proposals.
- [~] QAD exact executable commands require repository test-tool inspection.

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

Resolve the OPS open items (API listener policy, env schema, CI trigger), then continue PRD-F10 to PRD-F13 backend work. See `state.md`.
