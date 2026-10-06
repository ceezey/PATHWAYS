# Documentation Index: PATHWAYS

**Project slug:** `pathways`
**Maintained by:** PATHWAYS capstone team
**Workflow adoption:** 2026-09-26
**Workflow basis:** Curated PATHWAYS documentation and agent workflow
**Last reconciled:** 2026-10-01

> **Manifest / control panel.** This file is the documentation entry point, registry, traceability map, Change Log and Health Check. Update it in the same change whenever registered documents or statuses materially change.

## 1. Document Suite

### 1.1 Root Files

| Document | File | Status | Role |
|---|---|---|---|
| Idea baseline | [IDEA.md](../IDEA.md) | Locked | Self-contained idea baseline distilled from the rev-2026 manuscript |
| README | [README.md](../README.md) | Control | Repository entry point |
| Agent build instructions | [AGENTS.md](../AGENTS.md) | Control | Materialized from the BUILD guide |
| Brand reference | [BRAND.md](../BRAND.md) | Working | Materialized from the DSD |
| Design reference | [DESIGN.md](../DESIGN.md) | Working | Materialized from the DSD |
| Setup guide | [README-setup.md](../README-setup.md) | Working | Local environment setup |
| Design QA record | [design-qa.md](../design-qa.md) | Historical | 2026-09-08 staff-shell QA; describes a since-removed prototype mode |
| Project instructions | [CLAUDE.md](../CLAUDE.md) | Control | Repository guidance for the AI assistant |

### 1.2 Suite

| Type | File | Version | Status |
|---|---|---|---|
| IDEA | [idea-pathways.md](idea-pathways.md) | 2.0 | Locked |
| VALIDATION | [val-pathways.md](val-pathways.md) | 2.0 | Working |
| SCRUTINY | [scrutiny-pathways.md](scrutiny-pathways.md) | 2.0 | Working |
| VOICE | [voice-pathways.md](voice-pathways.md) | 2.0 | Locked |
| BRD | [brd-pathways.md](brd-pathways.md) | 2.0 | Working |
| UES | [ues-pathways.md](ues-pathways.md) | 2.0 | Draft |
| PRD | [prd-pathways.md](prd-pathways.md) | 2.0 | Locked |
| DSD | [dsd-pathways.md](dsd-pathways.md) | 2.0 | Locked |
| SDD | [sdd-pathways.md](sdd-pathways.md) | 2.0 | Locked |
| QAD | [qad-pathways.md](qad-pathways.md) | 2.0 | Locked |
| SAD | [sad-pathways.md](sad-pathways.md) | 2.0 | Control |
| BUILD | [build-pathways.md](build-pathways.md) | 2.0 | Control |
| CLR | [clr-pathways.md](clr-pathways.md) | 2.0 | Working |
| AIA | [aia-pathways.md](aia-pathways.md) | 2.0 | Working; not triggered |
| GTM | [gtm-pathways.md](gtm-pathways.md) | 2.0 | Draft |
| PITCH | [pitch-pathways.md](pitch-pathways.md) | 2.0 | Working |
| WRAP | [wrap-pathways.md](wrap-pathways.md) | 2.0 | Draft |
| OPS | [ops-pathways.md](ops-pathways.md) | 2.0 | Working |
| LOG | [log-pathways.md](log-pathways.md) | - | Control; append-only |
| STATE | [state.md](state.md) | - | Control; operating position |
| Deferred features register | [deferred-features.md](deferred-features.md) | - | Control; updated alongside each hide/defer decision |
| Activity log | [activity-log.md](activity-log.md) | - | Working; dated session activity notes |

### 1.3 RFCs

| RFC | File | Scope | Status |
|---|---|---|---|
| Auth/RBAC/isolation | [rfc-pathways-auth-rbac-isolation.md](rfc-pathways-auth-rbac-isolation.md) | PRD-F1 and all protected paths | Locked |
| Metadata/ingestion | [rfc-pathways-metadata-ingestion.md](rfc-pathways-metadata-ingestion.md) | PRD-F5, PRD-F6 | Working |
| SADDD/privacy | [rfc-pathways-saddd-privacy.md](rfc-pathways-saddd-privacy.md) | PRD-F8 | Locked |
| Rules/decision support | [rfc-pathways-rule-alerts-decision-support.md](rfc-pathways-rule-alerts-decision-support.md) | PRD-F10, PRD-F11 | Working |
| AWS hosting migration | [rfc-pathways-aws-hosting-migration.md](rfc-pathways-aws-hosting-migration.md) | Hosting, auth, storage, database portability; strategy only, no implementation authorized | Draft |

### 1.4 Runbooks

| Runbook | File | Status |
|---|---|---|
| Local development | [runbook-local-dev.md](runbook-local-dev.md) | Working |
| Backup/restore | [runbook-backup-restore.md](runbook-backup-restore.md) | Working |
| Migration baseline | [runbook-migration-baseline.md](runbook-migration-baseline.md) | Working |
| Role-staging build | [runbook-role-staging-build.md](runbook-role-staging-build.md) | Working |
| Defense demo reseed | [runbook-defense-demo.md](runbook-defense-demo.md) | Working |
| Documentation reconciliation | [runbook-doc-reconciliation.md](runbook-doc-reconciliation.md) | Working |

### 1.5 Governance Templates and Audits

| Template | File |
|---|---|
| Change Record | [change-record-template.md](change-record-template.md) |
| Audit | [audit-template.md](audit-template.md) |
| Postmortem | [postmortem-template.md](postmortem-template.md) |

| Audit | Date | Scope | Status |
|---|---|---|---|
| [audit-pathways-rbac-csv-20260928](audit-pathways-rbac-csv-20260928.md) | 2026-09-28 | Revised RBAC CSV against contract, API, SQL and web enforcement | Dispositioned by [RBAC audit closure](cr-pathways-rbac-audit-closure.md); implementation applied locally |
| [audit-pathways-frontend-controls-20260929](audit-pathways-frontend-controls-20260929.md) | 2026-09-29 | Web controls, client methods, UiActions and routes against current API/RBAC enforcement | Dispositioned by [frontend usability Change Record](cr-pathways-frontend-usability.md); implementation pending |
| [audit-pathways-manuscript-alignment-20261001](audit-pathways-manuscript-alignment-20261001.md) | 2026-10-01 | Manuscript purpose, objectives, requirements and scope against the running system | Open; gates production release |
| [audit-pathways-core-features-qa-20261001](audit-pathways-core-features-qa-20261001.md) | 2026-10-01 | Core features F1 to F8 against PRD gates, QAD rows, deferred register and UI foundations | Open; findings feed the manuscript alignment decisions |
| [audit-pathways-defense-readiness-20261005](audit-pathways-defense-readiness-20261005.md) | 2026-10-05 | Defense-readiness task sheet (Sheet3) and pitch against code and PRD gates | Open; **priority** task list for the 2026-10-06 defense |

Workflow rule: an audit is finding and evidence, a Change Record is the approved decision, and a postmortem is incident learning. Do not build directly against an audit finding until the appropriate contract or Change Record is approved.

### 1.6 Design Specs and Plans

| Spec | File | Date | Scope | Status |
|---|---|---|---|---|
| [Docs canonical reconciliation](superpowers/specs/2026-10-01-docs-canonical-reconciliation-design.md) | 2026-10-01-docs-canonical-reconciliation-design.md | 2026-10-01 | Rebuild and reconcile the documentation suite into a canonical baseline | Draft; developer review pending |
| [Docs canonical reconciliation plan](superpowers/plans/2026-10-01-docs-canonical-reconciliation.md) | 2026-10-01-docs-canonical-reconciliation.md | 2026-10-01 | Task-by-task implementation plan for the reconciliation spec | Approved; in progress |
| [Core gap closure plan](superpowers/plans/2026-10-01-core-gap-closure.md) | 2026-10-01-core-gap-closure.md | 2026-10-01 | Close the six gaps left after the core-feature integration | Executed; integrated into dev |
| [Replay harness modernization plan](superpowers/plans/2026-10-01-replay-harness-modernization.md) | 2026-10-01-replay-harness-modernization.md | 2026-10-01 | Parallel-safe, faster local migration replays with drift detection | Written; not started |
| [RBAC v4 and Figma reference reconciliation](superpowers/specs/2026-10-01-rbac-v4-figma-reconciliation-design.md) | 2026-10-01-rbac-v4-figma-reconciliation-design.md | 2026-10-01 | Adopt manuscript RBAC v4 in docs; add a non-authoritative Figma reference section to DSD | Approved |
| [RBAC v4 and Figma reference reconciliation plan](superpowers/plans/2026-10-01-rbac-v4-figma-reconciliation.md) | 2026-10-01-rbac-v4-figma-reconciliation.md | 2026-10-01 | Task-by-task plan for the RBAC v4 and Figma reference spec | Executed; merged into dev |
| [Role dashboards plan](superpowers/plans/2026-10-04-role-dashboards.md) | 2026-10-04-role-dashboards.md | 2026-10-04 | Role-specific dashboards from one read-only overview endpoint | Executed; integrated into dev pending |
| [Extension requests and escalated alerts plan](superpowers/plans/2026-10-04-extensions-and-escalations.md) | 2026-10-04-extensions-and-escalations.md | 2026-10-04 | Activity extension requests (0061) and the read-only escalated-alerts queue (0062) on the role dashboards | Executed; on dev and applied to devV2 |
| [Designed PDF reports design](superpowers/specs/2026-10-05-f12-puppeteer-pdf-design.md) | 2026-10-05-f12-puppeteer-pdf-design.md | 2026-10-05 | Puppeteer-rendered designed PDF reports from a print route with the pdfkit fallback | Executed on feature branch; hosted verification pending |
| [Designed PDF reports plan](superpowers/plans/2026-10-05-f12-puppeteer-pdf.md) | 2026-10-05-f12-puppeteer-pdf.md | 2026-10-05 | Renderer module, generate wiring, print route, docs and local check | Executed on feature branch; hosted verification pending |
| [Plan 2 cloud handoff](handoff-extensions-and-escalations.md) | handoff-extensions-and-escalations.md | 2026-10-04 | Paused state of Plan 2 Task 1 handed to the cloud session, with the SDD ledger rulings | Closed; resumed and completed |
| [Defense seed snapshot design](superpowers/specs/2026-10-06-defense-seed-snapshot-design.md) | 2026-10-06-defense-seed-snapshot-design.md | 2026-10-06 | Local service seed with mirrored devV2 identities, restored onto devV2 in one transaction with triggers skipped and dates shifted | Approved |
| [Defense seed snapshot plan](superpowers/plans/2026-10-06-defense-seed-snapshot.md) | 2026-10-06-defense-seed-snapshot.md | 2026-10-06 | Parsers, SQL builders, storage copy, CLI, local rehearsal and docs for the snapshot restore | Executed on feature branch; hosted restore pending |

### 1.7 Traceability Matrix

Gates are the `G-F<n>-<m>` rows in the PRD. SDD and QAD cite every feature by its PRD ID.

| PRD ID | Feature | Priority | Gates | SDD | QAD | RFC | Status |
|---|---|---|---|---|---|---|---|
| PRD-F1 | RBAC and Workspace Management | Must-Have | 10 | yes | yes | auth RFC | Implemented |
| PRD-F2 | Project Profile and Activity Tracking | Must-Have | 19 | yes | yes | - | Implemented |
| PRD-F3 | Centralized Beneficiary Profile | Must-Have | 6 | yes | yes | - | Implemented |
| PRD-F4 | Beneficiary Journey Tracking | Must-Have | 6 | yes | yes | - | Implemented |
| PRD-F5 | Digital Data Collection and Preparation | Must-Have | 5 | yes | yes | metadata RFC | Implemented |
| PRD-F6 | Metadata-Driven Data Integration | Must-Have | 7 | yes | yes | metadata RFC | Implemented |
| PRD-F7 | Project Indicator and Monitoring | Must-Have | 5 | yes | yes | - | Implemented |
| PRD-F8 | Aggregated Monitoring Dashboard with SADDD Analysis | Must-Have | 7 | yes | yes | SADDD RFC | Implemented |
| PRD-F9 | Descriptive Analytics and Project Performance Summaries | Supporting | 10 | yes | yes | - | Implemented for KPI, participation, survey and timeline views; on-hold items in the [deferred register](deferred-features.md) |
| PRD-F10 | Rule-Based Alerts | Supporting | 7 | yes | yes | rules RFC | Runtime verified on local PostgreSQL (0058-0060 on dev, not applied to hosted); hosted scheduler activation pending |
| PRD-F11 | Rule-Based Decision Support and Recommendations | Supporting | 5 | yes | yes | rules RFC | Human review and auto-resolve verified on local PostgreSQL (0058-0059 on dev, not applied to hosted) |
| PRD-F12 | Reporting and Data Visualization | Supporting | 5 | yes | yes | rollout CR | Local preview and artifact APIs; final verification pending; hosted application deferred |
| PRD-F13 | Public Project Tracker | Supporting | 5 | yes | yes | rollout CR | Local publication and approved-public APIs; final verification pending; hosted application deferred |

Statuses mirror the PRD summary. The [approved rollout Change Record](cr-pathways-self-managed-rollout-scenarios.md) limits the current phase to Core and Alerts source verification and dev release; hosted schema application, account provisioning and master release remain deferred.

### 1.8 UI/UX Foundations Reference

| Reference | File | Role |
|---|---|---|
| [Brand foundations](ui-ux-pathways-reference/pathways-brand-foundations.md) | pathways-brand-foundations.md | Source the DSD transcribes; `docs/dsd-pathways.md` remains the design authority (the DSD wins where they differ) |
| [Color foundations](ui-ux-pathways-reference/pathways-color-foundations.md) | pathways-color-foundations.md | Source the DSD transcribes; `docs/dsd-pathways.md` remains the design authority (the DSD wins where they differ) |
| [UI foundations](ui-ux-pathways-reference/pathways-ui-foundations.md) | pathways-ui-foundations.md | Source the DSD transcribes; `docs/dsd-pathways.md` remains the design authority (the DSD wins where they differ) |
| [Design system note](ui-ux-pathways-reference/pathways-design-system-note.md) | pathways-design-system-note.md | Source the DSD transcribes; `docs/dsd-pathways.md` remains the design authority (the DSD wins where they differ) |
| [UI foundations image](ui-ux-pathways-reference/Pathways%20UI%20foundations.png) | Pathways UI foundations.png | Source the DSD transcribes; `docs/dsd-pathways.md` remains the design authority (the DSD wins where they differ) |
| [Color palette image](ui-ux-pathways-reference/Pathways%20color%20palette.png) | Pathways color palette.png | Source the DSD transcribes; `docs/dsd-pathways.md` remains the design authority (the DSD wins where they differ) |
| Figma component board | file `fQee5ydlhJPLFhj8yUx8pA`, canvas `1344:2` | Sample UI only; DSD section 4 "Figma reference specimens" maps it; the DSD wins everywhere |

## 2. Change Log

Newest first. Core P1 supporting contract reconciliation is approved for local implementation after coordinator and independent reviews; no installed endpoint or complete migration acceptance is claimed.

| CR ID | Date | Summary | Status |
|---|---|---|---|
| [cr-pathways-defense-seed-snapshot](cr-pathways-defense-seed-snapshot.md) | 2026-10-06 | Defense demo snapshot restore: local service seed with mirrored devV2 identities, data-only dump of the wipe tables, one-transaction restore on devV2 with triggers skipped (replica role), staged day shift and storage upsert; no migration | Approved; local rehearsal passed, hosted restore pending |
| [cr-pathways-report-pdf-renderer](cr-pathways-report-pdf-renderer.md) | 2026-10-05 | PRD-F12 UC-F12-1: PDF reports rendered by headless Chromium from `/print/reports/[id]` with an injected snapshot, pdfkit fallback, env keys `WEB_PROTECTION_BYPASS` and `PDF_CHROME_PATH`, no migration | Applied locally; hosted verification pending |
| [cr-pathways-f8-f9-f12-gate-closure](cr-pathways-f8-f9-f12-gate-closure.md) | 2026-10-04 | Closes G-F9-9, G-F9-10 and G-F12-4: analytics insights API (participation, indicator trends, approved-only budget), closed-period survey release for aggregate-only roles (migration 0057), monitoring and evaluation report kinds with bare `text/csv`, export button, Participation option and browser-stored Add to Dashboard pins | Applied; 0057 applied on PATHWAYS-devV2 |
| [cr-pathways-rbac-v4-grant-migration](cr-pathways-rbac-v4-grant-migration.md) | 2026-10-02 | Migration 0055 applies RBAC v4 cells V4-C01, C02, C06, C07, C09, C10 (312 role grants); Project Officer keeps `beneficiaries.aggregates.read` re-sourced to v4 rows 112-117; Encode Project Data retired with `submissions.write` kept for four survey and monitoring form types | Applied; role-staging verified 2026-10-02 |
| [cr-pathways-figma-reference-integration](cr-pathways-figma-reference-integration.md) | 2026-10-01 | DSD gains a non-authoritative Figma reference section (five specimen families mapped to existing components, a not-adopted list) and a Figma rank in the authority order; local module guidance folded into DSD; notification inbox deferred | Applied |
| [cr-pathways-rbac-v4-adoption](cr-pathways-rbac-v4-adoption.md) | 2026-10-01 | Manuscript access matrix v4 becomes the documented source of record: 11 cell decisions (adopt, kept deviation, already satisfied), six interpretation rules, Encode Project Data retired; code follows in the RBAC v4 grant migration | Approved; docs propagated; code applied by 0055 on role-staging (see [cr-pathways-rbac-v4-grant-migration](cr-pathways-rbac-v4-grant-migration.md)) |
| [cr-pathways-doc-reconciliation-2026-10-01](cr-pathways-doc-reconciliation-2026-10-01.md) | 2026-10-01 | Rebuilt the documentation suite into one canonical baseline: repository first, then the rev-2026 manuscript, then the new brand, color and UI foundations as design target only; stable IDs preserved; contradicted records superseded; no code or migration change | Applied |
| [cr-pathways-indicator-library](cr-pathways-indicator-library.md) | 2026-10-01 | Organization indicator library of definition templates (create, list, archive under `indicators.library.*`) and create-project-indicator-from-entry by copy with no live link; closes G-F7-5 and the indicator part of MA-01 (migration 0051, not applied) | Applied 2026-10-02 (0051, 0054 on role-staging) |
| [cr-pathways-activity-extension-request](cr-pathways-activity-extension-request.md) | 2026-10-04 | Activity extension requests: Project Officer requests, M&E Officer verifies or returns, Project Manager approves (moving the planned end date through ACTIVITY_UPDATE) or declines (migration 0061) | Applied 2026-10-04 (0061 on devV2) |
| [cr-pathways-escalated-alerts](cr-pathways-escalated-alerts.md) | 2026-10-04 | Read-only escalated-alerts list for Program and Grant Manager portfolios; ESCALATE still leaves the lifecycle unchanged (migration 0062) | Applied 2026-10-04 (0062 on devV2) |
| [cr-pathways-indicator-form-and-type](cr-pathways-indicator-form-and-type.md) | 2026-10-04 | Guided Add project indicator form (generated code, Activity completion % recipe, baseline 0, project period) and indicator type classification (migration 0056) | Applied 2026-10-04 (0056 on devV2) |
| [cr-pathways-activity-overdue-explanation](cr-pathways-activity-overdue-explanation.md) | 2026-09-29 | M&E (or a role holding `monitoring.review`) records a reason category (`WEATHER`/`SECURITY`/`FUNDING`/`COMMUNITY`/`LOGISTICS`/`OTHER`) plus a 10-2000 character written explanation once an activity is overdue; append-only, prompt not a block (migration 0043) | Approved; backend implemented on feature branch, web phase deferred |
| [cr-pathways-proof-session-beneficiary-count](cr-pathways-proof-session-beneficiary-count.md) | 2026-09-29 | Optional whole-number "Beneficiaries reached this session" recorded on the proof submission only (migration 0042); never changes the activity's computed `beneficiariesReached` and never feeds SADDD | Approved; implemented on feature branch |
| [cr-pathways-f9-trusted-aggregates](cr-pathways-f9-trusted-aggregates.md) | 2026-09-29 | Program Manager and Grant Manager receive real F9 survey improvement and timeline adherence aggregates through two trusted SQL functions, `p10_f9_survey_aggregate` and `p10_f9_timeline_aggregate` (migration 0045); suppression stays in the API calculators; no detail permission is granted | Approved (implementation pending); amended 2026-10-04 with the closed-period release freeze |
| [cr-pathways-frontend-usability](cr-pathways-frontend-usability.md) | 2026-09-29 | Wires four stubbed web controls (expenses, evidence preview, create user, journey transition/correction) to existing endpoints; removes "Edit Labels" and disables the page-heading pencil and all other confirmed no-backend controls with "Not available yet" (organization display labels deferred, `settings.labels.manage` stays reserved); removes Objectives from the UI only; fixes the post-create unauthorized redirect and team-edit silent-failure bugs; frontend only, no migration | Approved; implementation pending |
| [cr-pathways-import-throughput-and-pdf](cr-pathways-import-throughput-and-pdf.md) | 2026-09-28 | Chunked import promotion, automatic continuation, parse-once, text-layer PDF import via `unpdf` (migration 0036) and server form-definition export in CSV/XLSX/XLS/PDF under `forms.export` | Approved; implemented on Wave A integration; hosted application pending |
| [cr-pathways-smart-import-mapping](cr-pathways-smart-import-mapping.md) | 2026-09-28 | Deterministic `AUTO_SMART_V2` mapping with integer scores, versioned synonyms and value-type checks; high-confidence auto-map, reviewer-confirmed suggestions, no AI (migration 0038); V1 kept as rollback | Approved; implementation pending |
| [cr-pathways-import-value-map](cr-pathways-import-value-map.md) | 2026-10-01 | Per-column data type choice and value translation at mapping time (G-F6-7, MA-07); migration 0050 | Implemented; 0050 applied on role-staging; G-F6-7 Met (2026-10-03) |
| [cr-pathways-project-rbac-ui-and-partners](cr-pathways-project-rbac-ui-and-partners.md) | 2026-09-28 | Split activity create/update UI checks, server capability flags, scoped assignable Project Officer read, `LockedField` pattern and structured-partner backfill (migration 0039); permission matrix unchanged | Implemented on feature branch; hosted pending |
| [cr-pathways-activity-progress-media](cr-pathways-activity-progress-media.md) | 2026-09-28 | Direct signed evidence upload with server size, type and digest verification; up to 10 files including MP4/MOV/WebM; `EVIDENCE_MAX_FILE_BYTES` default 50 MiB; amended inspection and 0031 finalize bounds (migration 0041); developer-reduced scope covers Submit proof only, section 9 | Approved; implemented on feature branch; hosted pending |
| [cr-pathways-beneficiary-step-up-pin](cr-pathways-beneficiary-step-up-pin.md) | 2026-09-28 | TOTP step-up stays primary; adds a user-set, session-bound PIN fallback with lockout and TOTP unlock (migration 0037); weaker-factor trade-off stated | Approved; implemented on Wave A integration; hosted preprovision and application pending |
| [cr-pathways-default-registration-form](cr-pathways-default-registration-form.md) | 2026-09-28 | System default registration form per project with a narrow DB-enforced maker-checker exemption (migration 0040); minimum Beneficiary age 5 and no future birth date | Approved; implemented locally, SAD review pending |
| [cr-pathways-rbac-audit-closure](cr-pathways-rbac-audit-closure.md) | 2026-09-28 | Closes RBAC CSV audit findings A-01 to A-06: scoped evidence list, five action implementations, four deferrals, UI hiding, reserved permissions and confirmed user hierarchy | Applied locally; hosted release pending |
| [cr-pathways-program-manager-project-assignment](cr-pathways-program-manager-project-assignment.md) | 2026-10-04 | System Administrator assigns Program Managers to projects in User Management; zero assignments allowed; no migration | Developer approved; implemented locally |
| [cr-pathways-performance-scaling](cr-pathways-performance-scaling.md) | 2026-09-28 | Measured performance path: short scoped client cache, server prefetch, targeted backend cache; same-origin proxy deferred; one-day CORS preflight cache shipped | Approved; preflight cache and step 2 client cache implemented; preview and staging re-measure pending |
| [cr-pathways-admin-read-access](cr-pathways-admin-read-access.md) | 2026-09-28 | System Administrator read-only `activities.read` and `budgets.read` (migration 0035); web reads gated on the permission each call needs | Approved; local implementation verified; hosted application and release pending |
| [cr-pathways-beneficiary-step-up](cr-pathways-beneficiary-step-up.md) | 2026-09-28 | Replace client-only hardcoded Beneficiary PIN gate with server-enforced fresh-MFA step-up (manuscript Objective 2.2); alternatives: server-hashed PIN or documented removal | Approved (Option A, 15 min); implemented locally; SAD sign-off and hosted MFA refresh verification pending |
| [cr-pathways-sad-orchestration](cr-pathways-sad-orchestration.md) | 2026-09-28 | Staged SAD review pipeline with typed handoff packets, `.claude/agents` coordinator and specialist definitions, multi-branch release sequence with gated autonomous master push and roster drift check | Applied |
| [cr-pathways-self-managed-rollout-scenarios](cr-pathways-self-managed-rollout-scenarios.md) | 2026-09-27 | Trusted hosted creator-admin exception, Singapore staging, approved feature completion and verified synthetic record replacement with protected history | Approved; implementation and staging/live verification pending |
| [cr-pathways-core-p1-supporting-operations](cr-pathways-core-p1-supporting-operations.md) | 2026-09-27 | Scoped registration context and revision-bound server-derived mapping; human review/normalization authority preserved | Approved for local P1 implementation; installation/runtime acceptance pending |
| [cr-pathways-signin-lockout](cr-pathways-signin-lockout.md) | 2026-10-01 | API-side sign-in failure counter: 5 failures in 15 minutes lock the identifier for 15 minutes with a uniform response, reset on success and a lockout audit event (migration 0046, G-F1-10) | Applied 2026-10-02 (0046, 0052 on role-staging; hosted hook not enabled on Free plan) |
| [cr-pathways-journey-note](cr-pathways-journey-note.md) | 2026-10-01 | Optional trimmed free-text note on journey events and corrections, audited without the note body (migration 0049, G-F4-6) | Applied 2026-10-02 (0049 on role-staging) |
| [cr-pathways-retire-project-target-goal](cr-pathways-retire-project-target-goal.md) | 2026-09-26 | Retire live project benchmark inputs, outputs and comparisons; preserve database history, target beneficiaries and independent indicator targets | Approved; local implementation verified; coordinated previews pending; no hosted migration or completed release |
| [cr-pathways-private-activity-proof-inspection](cr-pathways-private-activity-proof-inspection.md) | 2026-09-27 | Assigned distinct M&E pending private-proof inspection, bounded verified transfer and final authorization/audit; withdraw generic old downloads | Approved; local implementation/verification pending; hosted application and release excluded; section 6 in-modal preview amendment approved 2026-10-06 |
| conservative-mapping-v1-2026-09-27 | 2026-09-27 | Register stable source keys, conservative NFKC/ASCII code-label matching and unresolved candidate collisions for PRD-F6 preview suggestions | Contract clarification; preview implementation pending; no server authority or SQL installed |
| [cr-pathways-f10-f11-runtime-authority](cr-pathways-f10-f11-runtime-authority.md) | 2026-09-26 | Local least-privilege worker/sweeper boundary, SYSTEM attribution, calendar equality, conservative exposure and legacy preservation; human matrix unchanged | Approved; implementation/verification pending; hosted application, scheduler and release excluded |
| [cr-pathways-rules-metric-catalog-and-auto-resolve](cr-pathways-rules-metric-catalog-and-auto-resolve.md) | 2026-10-04 | Budget, Beneficiary and survey rule metrics on `f10.v1` with suppression and source-read audience restriction, plus recommendation Auto-resolved when the linked alert clears; closes G-F10-6 and G-F11-5 | Approved; implemented and verified locally (0058-0060 on dev); hosted apply pending |
| [cr-pathways-rules-hosted-scheduler](cr-pathways-rules-hosted-scheduler.md) | 2026-10-04 | GitHub Actions drain/sweep schedule against the hosted API, pooler usernames and a prompt-only machine login script; G-F10-7 | Approved; code complete; hosted activation pending human credentials |
| [cr-pathways-rules-board-ui](cr-pathways-rules-board-ui.md) | 2026-10-04 | Two-card rule board with drawer builder on `/alerts/repository`, sidebar entry removed, Figma review cards on `/alerts` | Approved; implemented on dev |
| sad-review-adoption-2026-09-26 | 2026-09-26 | Developer-approved seven-role SAD, digest-bound external sign-off, automated CI diagnostics, and disposable PostgreSQL 18 archive/baseline replay | Applied; local checker and replay verified; hosted application excluded |
| [cr-pathways-revised-rbac-baseline](cr-pathways-revised-rbac-baseline.md) | 2026-09-26 | Revised grants and archived baseline consolidation | Applied |
| [cr-pathways-core-rbac-identity-review](cr-pathways-core-rbac-identity-review.md) | 2026-10-01 | System Administrator loses `journeys.read` (0047), M&E Officer gains `beneficiaries.identities.review` with audited duplicate review routes and UI (0048), forms publish roles documented | Applied 2026-10-02 (0047, 0048, 0051, 0054 on role-staging) |
| [cr-pathways-csv-rbac-realignment](cr-pathways-csv-rbac-realignment.md) | 2026-09-26 | CSV action matrix, authorization realignment, preserved migration history and development-only correction | Applied; PATHWAYS-dev 0026 verified, approved 0020 checksum exception retained |
| [cr-pathways-replay-harness-modernization](cr-pathways-replay-harness-modernization.md) | 2026-10-01 | Retire the pre-baseline replay switches; baseline replay unchanged | Approved |
| [cr-pathways-evaluation-write-path](cr-pathways-evaluation-write-path.md) | 2026-10-06 | Opens the evaluation write path (DR-08): M&E creates, edits, publishes criteria and scores/submits; Project Manager reviews and signs off together or returns for correction; four criterion types compute from project data, Other is always manual with a required note (migration 0063) | Proposed; code and tests complete on `feat/evaluation-write-path`, migration not yet run against any database |
| [cr-pathways-zone-check-memo](cr-pathways-zone-check-memo.md) | 2026-10-06 | Remembers a validated timezone per transaction so the analytics reads stop re-reading pg_timezone_names (migration 0065) | Approved; applied to devV2 with 0064 |
| [cr-pathways-beneficiary-reach-kpi-values](cr-pathways-beneficiary-reach-kpi-values.md) | 2026-10-06 | Releases beneficiary reach with small-cell suppression, KPI values only and SADDD for ongoing projects (migration 0066, applied on devV2). |
| development-branch-dev-2026-09-26 | 2026-09-26 | Developer replaced `Backend-DB` with `dev` for development; retained `origin/master` for deployment and aligned development preview configuration | Applied |
| deployment-branch-policy-2026-09-26 | 2026-09-26 | Developer designated `origin/master` for deployment and initially `Backend-DB` for development; authorized connected Vercel API/web projects and explicit remote API/web-origin configuration | Applied; development branch superseded by `dev` |
| workflow-adoption-2026-09-26 | 2026-09-26 | Adopted the PATHWAYS documentation and agent workflow: added manifest, suite, build/AGENTS materialization, RFC/runbook/templates while preserving PATHWAYS execution controls | Applied as documentation package |

Future material changes to Locked docs use `cr-pathways-<slug>.md`.

## 3. Incident Log (Postmortems)

| PM ID | Incident date | Severity | Summary | Status |
|---|---|---|---|---|
| none | - | - | - | - |

## 4. Health Check

Last run: 2026-10-01.

- [x] `pnpm docs:materialize`: `AGENTS.md`, `BRAND.md` and `DESIGN.md` regenerated and current.
- [x] `verify_suite.py all`: PASS for scrub, anchors, ids, charters, usecases, reqs, qad, schema, stack, links, audit, tracked, mermaid, leak, tokens and rfc.
- [x] Clean check of the tracked tree: `pnpm docs:check` reports 0 failures and 0 warnings; materialized output is current.
- [x] `pnpm sad:test`: 45 of 45 tests pass.
- [x] `pnpm sad:typecheck`: passes.
- [x] Every suite doc header Status and Version match the Suite table in section 1.2.
- [x] The index registers every file under `docs/` except Change Records.
- [x] The AWS hosting migration RFC is Draft; no implementation is authorized.
- [~] The manuscript alignment audit is open and gates production release.
- [~] PRD-F10 to PRD-F13 integration verification and hosted application remain pending.


## 5. Notes

**Status semantics**

- **Locked:** implementation authority unless superseded by a newer explicit developer decision.
- **Working:** usable, but repository reconciliation is still required.
- **Draft:** planning or reference only.
- **Deferred:** preserved for future work but not an active implementation target.
- **Control:** persistent execution or governance document.
- **Historical:** retained record; not implementation authority.

**Maintenance rules**

1. The current repository wins over stale docs.
2. Disposable task TODOs, temporary source-of-truth notes, phase prompts and report templates stay outside the repository.
3. Locked-doc material changes require Change Records.
4. Audits do not rewrite contracts.
5. `log-pathways.md` is append-only.
6. Do not claim generated docs are Locked before repository reconciliation.
7. Update this index whenever a registered doc, status, CR, audit or runbook changes.
8. Keep document count secondary to correctness; do not create docs without a real governance use case.

**Current next step**

The suite is reconciled to one canonical baseline under [the reconciliation Change Record](cr-pathways-doc-reconciliation-2026-10-01.md). The [manuscript alignment audit](audit-pathways-manuscript-alignment-20261001.md) is open and gates production release. Production release and core-feature repairs keep their separate authorization boundaries; remaining gaps are recorded in `state.md` and the relevant contracts.
