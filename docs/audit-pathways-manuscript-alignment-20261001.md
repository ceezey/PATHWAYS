# Audit: Manuscript alignment, purpose, objectives, requirements and scope

**Date:** 2026-10-01
**Scope:** Purpose and Description, Specific Objectives 1.1 to 3.8, Problem-Requirements Matrix R1 to R8, Scope and Limitations against the Locked PRD gates and the running system
**Type:** Findings / evidence only

An audit records what was found. It does not become implementation authority by itself. This audit gates production release: every non-Met row below must be closed by a Change Record, deferred with rationale, or shown false before release.

## 1. Baseline

- Manuscript extracts: Purpose and Objectives, Problem-Requirements Matrix, Scope and Limitations (rev-2026).
- [prd-pathways](prd-pathways.md) charters, gate statuses and section 3.1; [qad-pathways](qad-pathways.md) sections 7 and 8; [deferred-features](deferred-features.md).
- Code spot checks: `apps/api/src/modules/indicators`, `apps/api/src/modules/metadata/form-templates.ts`, `apps/api/src/modules/dashboards`, `apps/api/src/modules/rules`.
- Gate statuses are taken from the reviewed PRD and cited, not re-derived. Code was checked only where a manuscript commitment has no gate: R4 templates, prescriptive analytics, beneficiary outcome assessment, the forty-hour claim and objective numbering.

## 2. Findings

| ID | Severity | Finding | Evidence | Contract affected | Recommended disposition |
|---|---|---|---|---|---|
| MA-01 | High | R4 reusable project structures and cross-project indicator reuse are absent | G-F7-5; no template module in `apps/api/src/modules/indicators`; PRD section 6 | R4, Objective 1.5 | CR to implement a Project Template Library and Indicator Library, or CR to descope R4 with manuscript impact |
| MA-02 | Medium | Manuscript claims prescriptive analytics; the system offers predefined rule-based recommendations only | G-F11-4; PRD-F9 out-of-scope note | Purpose and Description, R7 | CR to descope: reword to rule-based decision support, with manuscript impact |
| MA-03 | Medium | The forty-hour preparation claim has no measurement | `val-pathways.md` P2; `idea-pathways.md` open question | Purpose and Description | Gather timing evidence in the evaluation, or present it as an estimate in the manuscript |
| MA-04 | Medium | No in-app sign-in lockout | G-F1-10 | Objective 1.8 | CR to implement lockout, or CR to descope |
| MA-05 | Low | Project archive has no route though `projects.archive` is granted | G-F2-4 | Objective 1.2 | CR to implement archive, or remove the permission |
| MA-06 | Low | No free-text journey note | G-F4-6 | R6, Objective 1.3 | CR to implement or descope |
| MA-07 | Medium | Import data type choice and value translation on hold | G-F6-7; deferred-features | R2, Objectives 1.4, 2.1 | Resume the held work by CR, or descope |
| MA-08 | Medium | Dashboard scale unverified; participation breakdowns, indicator trends, server budget aggregate and manager survey totals not delivered | G-F8-7, G-F9-9, G-F9-10 | R3, Objectives 1.6, 2.2 | Complete the performance scaling CR steps and the deferred F9 views |
| MA-09 | High | Budget, Beneficiary and survey rule metrics are unavailable, so the manuscript alert conditions are only partly evaluable | G-F10-6 | R7, Objectives 1.7, 2.4 | CR to admit the metrics (runtime authority CR) |
| MA-10 | Medium | No hosted scheduled evaluation and no hosted public tracker verification | G-F10-7, G-F13-5 | R7, R8, Objective 1.8 | CR to implement the hosted scheduler and hosted verification in the authorized hosting release, or CR to descope with manuscript impact |
| MA-11 | Medium | Integration verification pending for alerts, recommendations and report scope | G-F10-1, G-F10-5, G-F11-1, G-F12-1 | R7, Objective 1.7 | Complete PostgreSQL verification and mark Met |
| MA-12 | Low | Recommendation has no Auto-resolved state | G-F11-5 | Objective 1.7 | CR to add the state, or descope |
| MA-13 | Medium | CSV export gap for report types | G-F12-4 | Objective 1.6 | CR to implement all formats |
| MA-14 | Low | Duplicate-identity review unreachable by default roles; no merge | G-F3-6 | Objective 1.3 | CR to grant the step or descope |
| MA-15 | Low | Purpose claims beneficiary outcome assessment while the limitations forbid individual evaluation; the system supports project-level pre-test and post-test summaries only | G-F9-2; Scope and Limitations | Purpose and Description | Reword the manuscript to project-level outcome monitoring |
| MA-16 | Low | Older CRs cite Specific Objective 2.2 for step-up; in rev-2026 2.2 is descriptive analytics and step-up is inferred under 1.8 (role-based access control) | `cr-pathways-beneficiary-step-up.md`, `cr-pathways-beneficiary-step-up-pin.md` | Objective 1.8 | Add a renumbering note to the two CRs |
| MA-17 | Low | UAT under ISO/IEC 25010 has not been run, so Objectives 3.1 to 3.8 have no results | QAD section 8.2 | Objective 3 | Run the UAT and record results in QAD |

## 3. Non-Findings / Verified Controls

- Organization isolation, project scope, escalation denial and revocation (G-F1-1 to G-F1-6) are Met with QAD evidence.
- Beneficiary detail step-up is server enforced (G-F3-4) and aggregate-only roles are denied raw records (G-F3-5, G-F8-5).
- SADDD suppression and age bands (G-F8-3, G-F8-4) are Met, so Objective 2.3 is Met.
- Alert rules reject raw SQL and recommendations are never generated at runtime (G-F10-3, G-F11-4), so the no-AI limitation holds.
- The public surface exposes approved data only (G-F13-1, G-F13-2).

## 4. Required Closure Path

Each finding must be closed through an approved Change Record, explicitly deferred with rationale in [deferred-features](deferred-features.md), or shown false through evidence. MA-01 and MA-09 are the highest risk.

## 5. Summary

Findings: 2 High, 8 Medium, 7 Low. Highest risk: MA-01 (R4 templates) and MA-09 (rule metrics).

### Trace table

| Item | Source | Commitment | PRD / Gate | Status | Evidence | Finding |
|---|---|---|---|---|---|---|
| R1 | Problem-Requirements Matrix | Structured environment; project, activity and beneficiary records accessed directly by intended users | PRD-F1, F2, F3; G-F1-1, G-F2-2, G-F3-1 | Met | Role dashboards and scoped screens; QAD-T01, QAD-R02, QAD-T03 | - |
| R2 | Problem-Requirements Matrix | Organized preparation and integration of field data with less repeated handling | PRD-F5, F6; G-F6-1 to G-F6-6 | Partly met | Mapped import pipeline in apps/api/src/modules/imports; G-F6-7 (data type and value mapping) on hold | MA-07 |
| R3 | Problem-Requirements Matrix | Dashboards, summaries and reports with less manual configuration | PRD-F7, F8, F9, F12; G-F8-7, G-F9-9 | Partly met | Dashboards Met (QAD-T08); production-scale responsiveness unverified, three F9 views deferred | MA-08 |
| R4 | Problem-Requirements Matrix | Reusable project structures, activity arrangements, indicator definitions and monitoring configurations for recurring project types | PRD-F7 (R4); G-F7-5 | Not met | No project template or cross-project indicator reuse in apps/api/src/modules/indicators; prd-pathways.md section 6 lists a Project Template Library and Indicator Library as out of scope; only form templates exist (apps/api/src/modules/metadata/form-templates.ts) | MA-01 |
| R5 | Problem-Requirements Matrix | Centralized project and beneficiary records | PRD-F2, F3; G-F2-1, G-F3-1 | Met | Single organization-scoped database; QAD-R08, QAD-T03 | - |
| R6 | Problem-Requirements Matrix | Clear tracking of beneficiary participation and progression across activities | PRD-F4; G-F4-1 to G-F4-5 | Partly met | Event history with corrections (QAD-T04); free-text journey note absent (G-F4-6) | MA-06 |
| R7 | Problem-Requirements Matrix | Timely summaries, rule-based flags and action guidance | PRD-F9, F10, F11; G-F10-1, G-F10-6, G-F10-7 | Partly met | Rule engine and predefined recommendations exist; Budget, Beneficiary and survey metrics unavailable; no hosted schedule; verification pending | MA-09, MA-10, MA-11 |
| R8 | Problem-Requirements Matrix | Controlled external visibility of approved project information | PRD-F13; G-F13-1 to G-F13-4 | Partly met | Approved-public APIs and pages locally verified (QAD-T11, QAD-A09); hosted verification G-F13-5 Not met | MA-10 |
| 1.1 | Purpose and Objectives | Web-based metadata-driven system centralizing project, activity, beneficiary and progress data | PRD-F1 to PRD-F6 | Met | Architecture-level claim; PRD section 3.1 status Implemented for PRD-F1 to PRD-F6; apps/web and apps/api | - |
| 1.2 | Purpose and Objectives | Project profile, activity tracking and budget evidence | PRD-F2; G-F2-1 to G-F2-19 | Partly met | Activities, milestones, budget and expense sign-off Met; project archive has no route (G-F2-4) | MA-05 |
| 1.3 | Purpose and Objectives | Beneficiary profile and journey tracking module | PRD-F3, F4; G-F3-6, G-F4-6 | Partly met | Profile, step-up and journey events Met; duplicate-identity review unreachable, no journey note | MA-14, MA-06 |
| 1.4 | Purpose and Objectives | Configurable forms, field datasets, source-field mapping, validation and processing | PRD-F5, F6; G-F6-7 | Partly met | Forms and imports Met (QAD-T05, QAD-T06); data type choice and value translation on hold | MA-07 |
| 1.5 | Purpose and Objectives | Project monitoring structure: configured activities, indicators and targets | PRD-F2, F7; G-F7-1 to G-F7-5 | Partly met | Indicator CRUD and measurements Met; cross-project reuse Not met | MA-01 |
| 1.6 | Purpose and Objectives | Dashboards, descriptive analytics, SADDD, beneficiary progress summaries and visualization | PRD-F8, F9, F12; G-F8-7, G-F9-9, G-F9-10, G-F12-4 | Partly met | Dashboard, SADDD and survey views Met; scale verification, three views and CSV export gaps | MA-08, MA-13 |
| 1.7 | Purpose and Objectives | Rule-based alerts and decision-support recommendations | PRD-F10, F11; G-F10-1, G-F10-6, G-F11-5 | Partly met | Alert lifecycle and human review exist; metric catalog incomplete, Auto-resolved absent, verification pending | MA-09, MA-11, MA-12 |
| 1.8 | Purpose and Objectives | Secure role-based access control and a public project tracker | PRD-F1, F13; G-F1-10, G-F13-5 | Partly met | Access control Met (QAD-A01 to A06); no sign-in lockout; tracker not hosted. Step-up PIN (renumbered from old Objective 2.2) is covered by G-F3-4 | MA-04, MA-10, MA-16 |
| 2.1 | Purpose and Objectives | Metadata-driven data preparation | PRD-F5, F6 | Partly met | Forms, mappings and validation in apps/api/src/modules/metadata and imports; data type mapping on hold | MA-07 |
| 2.2 | Purpose and Objectives | Descriptive analytics and dashboard visualization | PRD-F8, F9 | Partly met | apps/api/src/modules/dashboards; participation, trend and budget views hidden or browser-computed (G-F9-9) | MA-08 |
| 2.3 | Purpose and Objectives | SADDD analysis | PRD-F8; G-F8-3, G-F8-4 | Met | Suppression and age bands verified (QAD-A10) | - |
| 2.4 | Purpose and Objectives | Rule-based alerts and decision-support logic with predefined conditions | PRD-F10, F11; G-F10-2 to G-F10-4, G-F10-6 | Partly met | Deterministic rules, raw SQL rejected (QAD-A08); Budget, Beneficiary and survey metrics absent | MA-09 |
| 3.1 | Purpose and Objectives | Functional suitability evaluated by role-based UAT | QAD section 8 | Not applicable to code | UAT evaluation item; instrument defined in QAD section 8.1, status UAT has not been run | MA-17 |
| 3.2 | Purpose and Objectives | Performance efficiency evaluated by role-based UAT | QAD section 8 | Not applicable to code | UAT evaluation item; instrument defined in QAD section 8.1, status UAT has not been run | MA-17 |
| 3.3 | Purpose and Objectives | Compatibility evaluated by role-based UAT | QAD section 8 | Not applicable to code | UAT evaluation item; instrument defined in QAD section 8.1, status UAT has not been run | MA-17 |
| 3.4 | Purpose and Objectives | Usability evaluated by role-based UAT | QAD section 8 | Not applicable to code | UAT evaluation item; instrument defined in QAD section 8.1, status UAT has not been run | MA-17 |
| 3.5 | Purpose and Objectives | Reliability evaluated by role-based UAT | QAD section 8 | Not applicable to code | UAT evaluation item; instrument defined in QAD section 8.1, status UAT has not been run | MA-17 |
| 3.6 | Purpose and Objectives | Security evaluated by role-based UAT | QAD section 8 | Not applicable to code | UAT evaluation item; instrument defined in QAD section 8.1, status UAT has not been run | MA-17 |
| 3.7 | Purpose and Objectives | Maintainability evaluated by role-based UAT | QAD section 8 | Not applicable to code | UAT evaluation item; instrument defined in QAD section 8.1, status UAT has not been run | MA-17 |
| 3.8 | Purpose and Objectives | Portability evaluated by role-based UAT | QAD section 8 | Not applicable to code | UAT evaluation item; instrument defined in QAD section 8.1, status UAT has not been run | MA-17 |
| PD-1 | Purpose and Description | Metadata-driven project information management system | PRD-F1 to F13 | Met | Architecture-level claim; PRD section 3.1; apps/api/src/modules | - |
| PD-2 | Purpose and Description | Interoperable layer compatible with existing platforms | PRD-F6; G-F6-1 | Met | File-based CSV and spreadsheet import with source-field mapping; no API integration by design (SL-17) | - |
| PD-3 | Purpose and Description | Centralized beneficiary profiles and journey tracking | PRD-F3, F4 | Partly met | G-F3-6 and G-F4-6 not met | MA-14, MA-06 |
| PD-4 | Purpose and Description | Aggregated dashboards and KPI visualizations with beneficiary segment insights | PRD-F8, F9 | Partly met | G-F8-7, G-F9-9 | MA-08 |
| PD-5 | Purpose and Description | Prescriptive analytics proposing courses of action toward goals | PRD-F9, F11 | Not met | Decision support is rule-based predefined recommendations only (G-F11-4); prd-pathways.md does not carry the phrase forward | MA-02 |
| PD-6 | Purpose and Description | Rule-based alerts for underperformance | PRD-F10 | Partly met | G-F10-1, G-F10-6, G-F10-7 | MA-09, MA-10 |
| PD-7 | Purpose and Description | Public Project Tracker for stakeholder transparency | PRD-F13 | Partly met | G-F13-1 to G-F13-4 Met; G-F13-5 Not met | MA-10 |
| PD-8 | Purpose and Description | About forty cumulative working hours of manual preparation removed | val-pathways.md P2 | Deferred | Estimate not yet measured: to be measured in UAT (QAD section 8); MA-03 will be registered in deferred-features.md by Task 18; no timing instrument exists in the repository | MA-03 |
| PD-9 | Purpose and Description | Improves beneficiary outcome assessment | PRD-F9; G-F9-2 | Partly met | Project-level pre-test and post-test pairing only (QAD-T14); conflicts with the individual-evaluation limitation (SL-18) | MA-15 |
| SL-1 | Scope and Limitations | Authentication and Profile Management | PRD-F1; G-F1-8, G-F1-9, G-F1-10 | Partly met | No in-app sign-in lockout | MA-04 |
| SL-2 | Scope and Limitations | User and Access Management | PRD-F1; G-F1-5, G-F1-6 | Met | QAD-A06, QAD-R05 | - |
| SL-3 | Scope and Limitations | Project Information Management | PRD-F2; G-F2-4 | Partly met | No archive route | MA-05 |
| SL-4 | Scope and Limitations | Data Collection and Integration | PRD-F5, F6; G-F6-7 | Partly met | Data type and value mapping on hold | MA-07 |
| SL-5 | Scope and Limitations | Beneficiary Management | PRD-F3; G-F3-6 | Partly met | Identity review step unreachable, no merge | MA-14 |
| SL-6 | Scope and Limitations | Beneficiary Journey Tracking | PRD-F4; G-F4-6 | Partly met | No journey note | MA-06 |
| SL-7 | Scope and Limitations | Beneficiary-Related Monitoring Records | PRD-F9; G-F9-2 | Met | Pre-test and post-test pairing (QAD-T14); feedback via the form templates in apps/api/src/modules/metadata/form-templates.ts and follow-up records as FOLLOW_UP journey events (apps/api/src/modules/participants/participants.dto.ts) | - |
| SL-8 | Scope and Limitations | Monitoring, Analytics and Evaluation | PRD-F7, F8, F9 | Partly met | G-F7-5, G-F8-7, G-F9-9, G-F9-10 | MA-08, MA-01 |
| SL-9 | Scope and Limitations | Budget Expense Entries | PRD-F2; G-F2-14 to G-F2-18 | Met | Budget, receipt, verification and sign-off flows | - |
| SL-10 | Scope and Limitations | Reporting and Outputs | PRD-F12; G-F12-1, G-F12-4 | Partly met | CSV generation gap, verification pending | MA-13, MA-11 |
| SL-11 | Scope and Limitations | Rule-Based Alerts | PRD-F10 | Partly met | G-F10-1, G-F10-5, G-F10-6, G-F10-7 | MA-09, MA-10, MA-11 |
| SL-12 | Scope and Limitations | Decision-Support Recommendations | PRD-F11 | Partly met | G-F11-1, G-F11-5 | MA-11, MA-12 |
| SL-13 | Scope and Limitations | System Administration | PRD-F1; G-F1-7 | Met | Audit listing and role grants | - |
| SL-14 | Scope and Limitations | Public Project Visibility | PRD-F13 | Partly met | G-F13-5 hosted verification | MA-10 |
| SL-15 | Scope and Limitations | Internal user roles named in scope | PRD section 2; rbac-contract.json | Met | Roles defined in the RBAC contract | - |
| SL-16 | Scope and Limitations | Not a full project management platform or ERP | PRD section 6.1 | Met | Bounds stated in PRD section 6.1 | - |
| SL-17 | Scope and Limitations | No guaranteed real-time sync or API integration with KOBO, YES!ME or PMERL | PRD-F6 | Met | File import only | - |
| SL-18 | Scope and Limitations | No evaluation of beneficiaries as individuals | PRD-F9; G-F9-7, G-F9-8 | Met | Survey results are period-released aggregates; aggregate-only roles cannot difference them (QAD-A21, G-F9-8) | - |
| SL-19 | Scope and Limitations | Rules and thresholds only; no AI or predictive ML | G-F10-3, G-F11-4 | Met | Raw code rejected (QAD-A08); recommendations retrieved from configuration | - |
| SL-20 | Scope and Limitations | Beneficiaries are not system actors | PRD-F1, F3 | Met | No beneficiary role or sign-in in rbac-contract.json | - |
| SL-21 | Scope and Limitations | Public tracker excludes beneficiary-level, assessment and financial evidence | G-F13-1, G-F13-2 | Met | QAD-T11, QAD-A09 | - |
| SL-22 | Scope and Limitations | Adaptable to other organizations | G-F1-3 | Met | Organization isolation on every request (QAD-A05) | - |
| SL-23 | Scope and Limitations | Final decision, validation and approval remain with the organization | G-F10-4, G-F11-2 | Met | Alert dispositions and recommendation outcomes need a human actor and note; no autonomous action (G-F11-2, G-F11-4) | - |
