# Audit: Defense Readiness (Sheet3 vs Pitch vs Repository)

**Date:** 2026-10-05
**Priority:** Active, highest. Defense-day task list for 2026-10-06; supersedes ad hoc task picking until the defense.
**Scope:** "PATHWAYS - Sheet3" defense-readiness task sheet, [pitch-pathways](pitch-pathways.md), PRD gates, code under `apps/`, `packages/`, `apps/api/prisma/`
**Type:** Findings / evidence only

An audit records what was found. It does not become implementation authority by itself.

## 1. Baseline

- Branch `dev` at c6527110 (EHK demo cohort sized for SADDD). No git tags.
- Sheet3: 35 tasks (P0 QA/Security/Recovery 10, P0 Demo data 3, P1 Analytics 4, P1 Usability 5, P1 Defense docs 4, P2 6, P3 3) with Owner and Status columns blank.
- Pitch: [pitch-pathways](pitch-pathways.md) v2.0, last reconciled 2026-10-01.
- PRD gate tables (section 4), QAD, deferred register, demo runbook, seed (`apps/api/prisma/local-demo-*.ts`, `defense-demo-verify.ts`).
- Numbering: the sheet uses manuscript F1 to F12. Manuscript F1 to F11 equal PRD-F1 to F11; manuscript F12 (Public Tracker) is PRD-F13; PRD-F12 Reporting has no manuscript ID.

Status legend: **Done** artifact exists and is current; **Partial** code or tests exist but no executed, dated record; **Missing** nothing usable exists.

## 2. Feature Cross-Check (code, not docs)

| PRD | Manuscript | Feature | Code status | Evidence | Open gate |
|---|---|---|---|---|---|
| F1 | F1 | RBAC and Workspace | Implemented | `modules/auth`, `users`, `audit`; 0027, 0046; `rbac-contract.json` | G-F1-10 hosted IdP bypass (deferred) |
| F2 | F2 | Project Profile and Activity Tracking | Implemented | `activities.controller.ts`, `finance.controller.ts`; 0034, 0044, 0061 | None |
| F3 | F3 | Centralized Beneficiary Profile | Implemented | `beneficiaries/identity-review.controller.ts`; 0048 | None |
| F4 | F4 | Beneficiary Journey Tracking | Implemented | `participants.service.ts` (journey note); 0049 | None |
| F5 | F5 | Digital Data Collection | Implemented | `metadata.controller.ts`, `form-templates.ts` | None |
| F6 | F6 | Metadata-Driven Integration | Implemented | `imports.controller.ts`; 0038, 0050 | None |
| F7 | F7 | Indicators and Monitoring | Implemented | `indicators.controller.ts`, `indicator-library.controller.ts`; 0051, 0056 | None |
| F8 | F8 | Monitoring Dashboard with SADDD | Implemented | `dashboards.controller.ts` (`home`, `monitoring`, `saddd`) | G-F8-7 staging re-measure pending |
| F9 | F9 | Descriptive Analytics | Implemented | `analytics.controller.ts`, `analytics-insights.controller.ts`; 0045, 0057 | None |
| F10 | F10 | Rule-Based Alerts | Partial | `rules-human.controller.ts`, `rules-machine.controller.ts`; `.github/workflows/rules-dispatch.yml` inert until `RULES_DISPATCH_ENABLED=true` | G-F10-7 Partly met |
| F11 | F11 | Decision Support and Recommendations | Implemented (rule-based only) | `rules-human.controller.ts` recommendations; 0031, 0059 | None |
| F12 | None | Reporting and Visualization | Implemented, project scope only | `reports.service.ts`, `report-artifact.ts` (CSV hand-built, XLS/XLSX SheetJS, PDF pdfkit) | Hosted CSV may fail (runbook section 7) |
| F13 | F12 | Public Project Tracker | Implemented in code | `public.controller.ts`; `/transparency/[projectId]/preview` | G-F13-5 hosted verification Not met |

Specific claims verified:

- All nine pitch demo routes exist as real pages and all eight demo permissions are granted (0027) and enforced in the named controllers or services.
- Reports take no location and no period input (`reports.dto.ts`); the period comes from project dates.
- No prescriptive or predictive code exists; recommendations are authored rule content under staff review.
- No cross-project template copy exists; reuse is through form templates, the indicator library and rule templates.

## 3. Findings: Pitch Reconciliation

| ID | Severity | Finding | Evidence | Recommended disposition |
|---|---|---|---|---|
| DR-01 | High | Pitch "Not met" list says export to CSV, XLS, XLSX and PDF is Not met; PRD marks G-F12-4 Met and code exports all four | `report-artifact.ts`; PRD G-F12-4 | Update pitch: export Met locally, hosted CSV unverified |
| DR-02 | High | Pitch judging map lists G-F3-6, G-F4-6 and G-F9-9 as Not met; all three are Met in PRD and code | 0048, 0049, `analytics-insights.controller.ts` | Update pitch section 4 |
| DR-03 | High | Sheet names a "Futuremakers" demo project; the real seed has none (only unused mocks under `apps/web/src/mocks`) | `local-demo-data.ts` creates SSG, CRL, ALS, ECD, WSH, EHK | Team decision: rename a seeded project or relabel the sheet task |
| DR-04 | High | Pitch section 5 readiness checklist is unchecked; no hosted reseed or `--verify` result recorded, and c6527110 needs a reseed | runbook-defense-demo section 4 | Reseed devV2, record `--verify` output |
| DR-05 | Medium | Demo script has no expected on-screen output per step and no per-step fallback; omits extensions, escalations, alerts | pitch section 3 | Add expected outputs and fallback column |
| DR-06 | Medium | Rules scheduler is inert on hosted, so live alerts depend on a manual drain | `rules-dispatch.yml`; runbook section 5 | Enable once or state manual trigger in script |
| DR-07 | Low | Pitch "Last reconciled 2026-10-01" predates 10-03 to 10-05 gate closures | pitch header | Bump after DR-01, DR-02 |

## 4. Sheet3 Task Status

### P0: System correctness and readiness

| Task | Status | Evidence | Gap / next action |
|---|---|---|---|
| Freeze the testing version | Missing | none; no tag | Tag dev head after reseed; record commit, Vercel deployment, devV2 ledger (0062), freeze time |
| Requirements to implementation audit | Partial | Section 2 of this audit; PRD section 4 | Section 2 is the code map; humans confirm each row in the app |
| Test every F1 to F12 feature | Partial | QAD section 3 maps tests; suite counts only in activity-log | Run per-feature PASS/PARTIAL/FAIL/NOT IMPLEMENTED sheet |
| Execute complete E2E workflow | Partial | `apps/web/e2e/workflows.spec.ts`; only stored run is a stale failed 2026-08-26 | Manual run of pitch steps 1 to 9 on devV2, record result |
| Negative / error-path testing | Partial | QAD sad and abuse rows A01 to A44 | No dated pass/fail record; QAD-T76, T80, T81, T82 manual pending |
| Integration / data integrity | Missing | `imports.f6-gates.test.ts` only | Trace 3 records: import, profile, dashboard, report |
| Fix confirmed blockers | Ongoing | n/a | Only from findings above; one at a time |
| Role / access / security testing | Partial (strong) | `rbac-v4.spec.ts`, `rbac-v4-grants-runtime.sql` (312 rows PASS) | Per-role login run on devV2 including direct URLs |
| Public / private boundary | Partial | `public.service.test.ts`, allowlist, distinct approver | G-F13-5 hosted check; outsider exposure checklist |
| Backup + recovery drill | Partial | `runbook-backup-restore.md`, `Verify-W10BackupRestore.ps1` | No dated drill; QAD-T82 pending; SDD says restore not verified |

### P0: Demo data

| Task | Status | Evidence | Gap / next action |
|---|---|---|---|
| Populate Futuremakers demo project | Missing as named | see DR-03 | Decide name; seed otherwise covers activities, indicators, beneficiaries, budgets, rules, reports |
| Populate one completed historical project | Done (needs reseed) | EHK closed, evaluation signed off; 45-person cohort | Reseed local and devV2 |
| Validate demo data against expected outputs | Partial | `defense-demo-verify.ts` 23/23 local, presence and threshold checks | Add expected numbers for key dashboard, rule and report values |

### P1: Analytics and decision support

| Task | Status | Evidence | Gap / next action |
|---|---|---|---|
| Verify every computation | Partial | `overview-metrics.ts`, `metric-math.ts`, `rule-metrics.ts`; metric catalog CR | One table: metric, formula, inputs, missing data, code path |
| Verify rules and thresholds | Partial | `rule-engine.test.ts` boundaries; `demoRules` in seed | Rule reference with rationale; rules carry no rationale field |
| Test positive and negative conditions | Partial | seed has WSH, CRL underperforming | Paired on-track vs underperforming walkthrough |
| Beneficiary-progress defense note | Partial | audit MA-15, PD-9; pitch section 6 | One-page records vs interpretation note |

### P1: Usability, reports, performance

| Task | Status | Evidence | Gap / next action |
|---|---|---|---|
| Requirements-to-screen audit | Partial | PRD section 5.1 | Stale after 10-04 navigation changes (Overview tab removed) |
| Dashboard actionability audit | Missing | role-overview code only | Teammate read-back review |
| Report-generation validation | Missing | runtime test covers scope and suppression only | Reconcile one report per kind against source |
| Performance testing | Partial | QAD-T62/T87 local single user (about 500 ms) | Time key screens on devV2 |
| Golden demo path | Partial | pitch section 3, runbook | Expected outputs, fallbacks, two clean runs |

### P1: Defense and documentation outputs

| Task | Status | Evidence | Gap / next action |
|---|---|---|---|
| Objective / technology / computation cheat sheet | Missing | source: SDD section 2.4 | Draft from sections 2 and 4 of this audit |
| Activity diagram / system cheat sheet | Partial | PRD section 5.3, SDD sections 2.1, 4.1 | Condense to one page |
| Engineering / system documentation | Partial | SDD, ops, build, runbooks | Spread out; state.md dated 10-01 |
| Panel test script | Missing | none | Printable walkthrough from golden path |

### P2: Judgment-gated improvements

| Task | Status | Evidence | Gap / next action |
|---|---|---|---|
| Analyze client dummy dataset | Partial | demo-fixtures CSVs; activity-log notes (100 rows, 36 columns) | No field inventory or analysis doc |
| Dynamic project report template | Partial | 6 fixed report kinds, 4 formats | No section choice, period or location input |
| OECD mid-term evaluation workflow | Partial (label only) | user-defined weighted criteria in `evaluations.service.ts` | No DAC criteria mapping |
| Beneficiary last modified by/when | Partial | `updated_at` and audit events exist; no `updated_by`; not shown | Read latest `BENEFICIARY_PROFILE_UPDATED` audit row, or skip |
| Public Tracker publishing setup | Mostly implemented | submit, approve (distinct), publish, withdraw; frozen preview | Field selection is hard-coded |
| Incident response + continuity | Partial | ops section 4 first actions, backup runbook | No escalation path; RPO/RTO unmeasured |

### P3: Polish

| Task | Status | Evidence | Gap / next action |
|---|---|---|---|
| Landing page + copy | Implemented as public tracker home | `(public)/page.tsx`; no overclaim terms in `apps/web/src` | Overclaim risk is only manuscript `IDEA.md` (prescriptive), tracked MA-02 |
| Project microsite customization | Missing in use | `public-dashboard-config.ts` editor not rendered since 10c5c4c8 | Skip unless core is finished |
| Cosmetic improvements | Ongoing | 98a4c7ee, fd642eb9, 474c361b | Only confusing or unprofessional screens |

## 5. Priority Order for 2026-10-05

1. Reseed devV2 (c6527110 cohort), run `--verify`, record output (DR-04).
2. Freeze: tag the head, record deployment and DB version.
3. Resolve the Futuremakers naming question (DR-03).
4. Run pitch steps 1 to 9 on devV2 per role, recording PASS/FAIL with expected vs actual; this covers E2E, role testing and the golden path together.
5. Public boundary check as an outsider on the hosted tracker (closes G-F13-5 if clean).
6. Fix pitch DR-01, DR-02, DR-05, DR-07; decide DR-06.
7. Computation and rule reference tables, then the cheat sheet and panel script built from them.
8. P2 and P3 only after the above.

## 6. Non-Findings / Verified Controls

- Self-approval of a public revision is refused server side.
- Report CSV escapes spreadsheet formulas; PDF font hash is pinned.
- No overclaiming terms (prescriptive, predictive, AI, real-time) in the web app.
- RBAC v4 grant runtime suite passed with 312 grants on devV2.

## 7. Summary

- Features: 12 of 13 PRD features implemented in code; F10 Partial (hosted scheduler inert); F13 hosted verification Not met; F12 reports are project-scoped only.
- Sheet3 (35 tasks): 1 Done, 2 Implemented or mostly implemented, 2 Ongoing, 22 Partial, 8 Missing.
- Highest-risk open items: no frozen build, no executed E2E record, demo data not reseeded on devV2, Futuremakers mismatch, stale pitch Not-met list.
