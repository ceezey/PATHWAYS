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
| SAD | sad-pathways.md | Control |
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
| Auth/RBAC/isolation | rfc-pathways-auth-rbac-isolation.md | PRD-F1 + all protected paths | Locked |
| Metadata/ingestion | rfc-pathways-metadata-ingestion.md | PRD-F5/F6 | Working |
| SADDD/privacy | rfc-pathways-saddd-privacy.md | PRD-F8 | Locked |
| Rules/decision support | rfc-pathways-rule-alerts-decision-support.md | PRD-F10/F11 | Working |

## 4. Runbooks

| Runbook | File | Status |
|---|---|---|
| Local development | runbook-local-dev.md | Draft; pending repo command reconciliation |
| Backup/restore | runbook-backup-restore.md | Working |
| Migration baseline | runbook-migration-baseline.md | Working |
| Role-staging build | runbook-role-staging-build.md | Working |
| Documentation reconciliation | runbook-doc-reconciliation.md | Working |

## 5. Governance Templates

| Template | File |
|---|---|
| Change Record | change-record-template.md |
| Audit | audit-template.md |
| Postmortem | postmortem-template.md |

### Audits

| Audit | Date | Scope | Status |
|---|---|---|---|
| [audit-pathways-rbac-csv-20260928](audit-pathways-rbac-csv-20260928.md) | 2026-09-28 | Revised RBAC CSV against contract, API, SQL and web enforcement | Dispositioned by [RBAC audit closure](cr-pathways-rbac-audit-closure.md); implementation applied locally |

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
| PRD-F10 | Rule Alerts | Supporting | yes | yes | rules RFC | local API and initial runtime slice; integration verification pending |
| PRD-F11 | Decision Support | Supporting | yes | yes | rules RFC | local human review API; integration verification pending |
| PRD-F12 | Reporting / Visualization | Supporting | yes | yes | rollout CR | local preview/artifact APIs; final verification pending; hosted application deferred |
| PRD-F13 | Public Tracker | Supporting | yes | yes | rollout CR | local publication/approved-public APIs; final verification pending; hosted application deferred |

Backend status reconciled 2026-09-27 for local source against `apps/api/src/modules/*` controllers and the canonical web service clients. The [approved rollout Change Record](cr-pathways-self-managed-rollout-scenarios.md) limits the current phase to Core and Alerts source verification and dev release. The team will populate the system and perform manual acceptance testing; hosted schema application, account provisioning and master release remain deferred.

## 7. Change Log

Newest first.

Core P1 supporting contract reconciliation is approved for local implementation after coordinator and independent reviews; no installed endpoint or complete migration acceptance is claimed.

| CR ID | Date | Summary | Status |
|---|---|---|---|
| [cr-pathways-import-throughput-and-pdf](cr-pathways-import-throughput-and-pdf.md) | 2026-09-28 | Chunked import promotion, automatic continuation, parse-once, text-layer PDF import via `unpdf` (migration 0036) and server form-definition export in CSV/XLSX/XLS/PDF under `forms.export` | Approved; implemented on Wave A integration; hosted application pending |
| [cr-pathways-smart-import-mapping](cr-pathways-smart-import-mapping.md) | 2026-09-28 | Deterministic `AUTO_SMART_V2` mapping with integer scores, versioned synonyms and value-type checks; high-confidence auto-map, reviewer-confirmed suggestions, no AI (migration 0038); V1 kept as rollback | Approved; implementation pending |
| [cr-pathways-project-rbac-ui-and-partners](cr-pathways-project-rbac-ui-and-partners.md) | 2026-09-28 | Split activity create/update UI checks, server capability flags, scoped assignable Project Officer read, `LockedField` pattern and structured-partner backfill (migration 0039); permission matrix unchanged | Implemented on feature branch; hosted pending |
| [cr-pathways-activity-progress-media](cr-pathways-activity-progress-media.md) | 2026-09-28 | Direct signed evidence upload with server size, type and digest verification; up to 10 files including MP4/MOV/WebM; `EVIDENCE_MAX_FILE_BYTES` default 50 MiB; amended inspection and 0031 finalize bounds (migration 0041); developer-reduced scope covers Submit proof only, section 9 | Approved; implemented on feature branch; hosted pending |
| [cr-pathways-beneficiary-step-up-pin](cr-pathways-beneficiary-step-up-pin.md) | 2026-09-28 | TOTP step-up stays primary; adds a user-set, session-bound PIN fallback with lockout and TOTP unlock (migration 0037); weaker-factor trade-off stated | Approved; implemented on Wave A integration; hosted preprovision and application pending |
| [cr-pathways-default-registration-form](cr-pathways-default-registration-form.md) | 2026-09-28 | System default registration form per project with a narrow DB-enforced maker-checker exemption (migration 0040); minimum Beneficiary age 5 and no future birth date | Approved; implemented locally, SAD review pending |
| [cr-pathways-rbac-audit-closure](cr-pathways-rbac-audit-closure.md) | 2026-09-28 | Closes RBAC CSV audit findings A-01 to A-06: scoped evidence list, five action implementations, four deferrals, UI hiding, reserved permissions and confirmed user hierarchy | Applied locally; hosted release pending |
| [cr-pathways-performance-scaling](cr-pathways-performance-scaling.md) | 2026-09-28 | Measured performance path: short scoped client cache, server prefetch, targeted backend cache; same-origin proxy deferred; one-day CORS preflight cache shipped | Approved; preflight cache and step 2 client cache implemented; preview measurement pending |
| [cr-pathways-admin-read-access](cr-pathways-admin-read-access.md) | 2026-09-28 | System Administrator read-only `activities.read` and `budgets.read` (migration 0035); web reads gated on the permission each call needs | Approved; local implementation verified; hosted application and release pending |
| [cr-pathways-beneficiary-step-up](cr-pathways-beneficiary-step-up.md) | 2026-09-28 | Replace client-only hardcoded Beneficiary PIN gate with server-enforced fresh-MFA step-up (manuscript Objective 2.2); alternatives: server-hashed PIN or documented removal | Approved (Option A, 15 min); implemented locally; SAD sign-off and hosted MFA refresh verification pending |
| [cr-pathways-sad-orchestration](cr-pathways-sad-orchestration.md) | 2026-09-28 | Staged SAD review pipeline with typed handoff packets, `.claude/agents` coordinator and specialist definitions, multi-branch release sequence with gated autonomous master push and roster drift check | Applied |
| [cr-pathways-self-managed-rollout-scenarios](cr-pathways-self-managed-rollout-scenarios.md) | 2026-09-27 | Trusted hosted creator-admin exception, Singapore staging, approved feature completion and verified synthetic record replacement with protected history | Approved; implementation and staging/live verification pending |
| [cr-pathways-core-p1-supporting-operations](cr-pathways-core-p1-supporting-operations.md) | 2026-09-27 | Scoped registration context and revision-bound server-derived mapping; human review/normalization authority preserved | Approved for local P1 implementation; installation/runtime acceptance pending |
| [cr-pathways-retire-project-target-goal](cr-pathways-retire-project-target-goal.md) | 2026-09-26 | Retire live project benchmark inputs, outputs and comparisons; preserve database history, target beneficiaries and independent indicator targets | Approved; local implementation verified; coordinated previews pending; no hosted migration or completed release |
| [cr-pathways-private-activity-proof-inspection](cr-pathways-private-activity-proof-inspection.md) | 2026-09-27 | Assigned distinct M&E pending private-proof inspection, bounded verified transfer and final authorization/audit; withdraw generic old downloads | Approved; local implementation/verification pending; hosted application and release excluded |
| conservative-mapping-v1-2026-09-27 | 2026-09-27 | Register stable source keys, conservative NFKC/ASCII code-label matching and unresolved candidate collisions for PRD-F6 preview suggestions | Contract clarification; preview implementation pending; no server authority or SQL installed |
| [cr-pathways-f10-f11-runtime-authority](cr-pathways-f10-f11-runtime-authority.md) | 2026-09-26 | Local least-privilege worker/sweeper boundary, SYSTEM attribution, calendar equality, conservative exposure and legacy preservation; human matrix unchanged | Approved; implementation/verification pending; hosted application, scheduler and release excluded |
| sad-review-adoption-2026-09-26 | 2026-09-26 | Developer-approved seven-role SAD, digest-bound external sign-off, automated CI diagnostics, and disposable PostgreSQL 18 archive/baseline replay | Applied; local checker and replay verified; hosted application excluded |
| [cr-pathways-revised-rbac-baseline](cr-pathways-revised-rbac-baseline.md) | 2026-09-26 | Revised grants and archived baseline consolidation | Applied |
| [cr-pathways-csv-rbac-realignment](cr-pathways-csv-rbac-realignment.md) | 2026-09-26 | CSV action matrix, authorization realignment, preserved migration history and development-only correction | Applied; PATHWAYS-dev 0026 verified, approved 0020 checksum exception retained |
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
- [x] Seven-role SAD registered as Control; checker regressions/type interfaces and disposable historical/baseline/forward replay verified locally. CI execution remains separately observed.
- [x] Audit / Change Record / postmortem distinctions documented.
- [x] Vercel API/web release separately authorized; SSO/AWS remain deferred.
- [x] six-role model carried forward.
- [x] rule-based/no-autonomous-AI boundary carried forward.
- [x] Root `AGENT.md` and root `index.md` intentionally omitted.
- [x] Brand mark verified at `apps/web/public/brand/pathways-mark.png`.
- [x] SDD table list reconciled with `apps/api/prisma/schema.prisma` (99 mapped models/enums; verified 0001-0026 archived, active baseline plus 0027/0028; PATHWAYS-dev transition verified).
- [x] Vercel development API/web previews verified against PATHWAYS-dev; production verification remains separate (see OPS).
- [~] PRD-F10/F11 local rule configuration, machine drain, alert/recommendation review and outcome recording are verified on a synthetic local replay at 0034; hosted installation is pending. PRD-F12 reporting and PRD-F13 publication APIs exist from migration 0034 and are verified locally; hosted installation is pending.
- [~] The approved F10/F11 runtime CR governs the initial local implementation. Unapproved rules RFC extensions remain proposals.
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

The revised RBAC and baseline Change Record is Applied; the auth RFC is Locked following PATHWAYS-dev and development-preview verification. The F10/F11 local runtime authority Change Record is Approved with implementation and verification pending; it does not establish feature availability or authorize hosted provisioning, scheduler application or production release. Production release and subsequent core-feature repairs retain their separate authorization boundaries. Remaining OPS and PRD-F10 to PRD-F13 gaps are recorded in `state.md` and the relevant contracts.
