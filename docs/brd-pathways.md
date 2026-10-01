# Business Requirements Document (BRD)

**Status:** Working
**Version:** 2.0
**Last reconciled:** 2026-10-01
**Owner:** PATHWAYS capstone team

This document states the business need for PATHWAYS and how success is judged. Problems (P1-P8), requirements (R1-R8) and objective numbers are defined in `IDEA.md` and are cited here, not redefined. Feature behavior lives in the PRD.

## 1. Executive Summary

PATHWAYS is an internal, metadata-driven project information management system with rule-based decision support for humanitarian and development organizations. It addresses delays in project-level evaluation, beneficiary progress tracking and timely decisions that arise when field data move through separate collection, monitoring and reporting tools and need repeated preparation before use. The manuscript estimates about forty cumulative working hours of preparation per reporting cycle in the pilot setting; that figure is an estimate to be confirmed in evaluation, not a measured saving. The business case is timeliness of usable information, continuity of beneficiary records and controlled stakeholder visibility, judged by objective completion and role-based user acceptance testing (UAT).

## 2. The Problem & Opportunity

Source: manuscript Chapter 1, Problem Analysis and Problem-Requirements Matrix (`IDEA.md` section 3).

| ID | Problem | Operational cost it creates | Requirement |
|---|---|---|---|
| P1 | Dependence on technical staff and uneven usability across roles | Non-technical users wait for prepared outputs instead of reaching project information directly | R1 |
| P2 | Repeated export-import handling and manual preparation of field data | Preparation effort repeats every reporting cycle before data can be used | R2 |
| P3 | Manual metadata and dashboard setup | Dashboards, summaries and reports are delayed by verification and configuration | R3 |
| P4 | No standard setup for recurring projects | Setup work is repeated for each recurring project type | R4 |
| P5 | Records spread across tools and files | Inconsistent information and weak project continuity | R5 |
| P6 | Difficulty tracking beneficiary participation across activities | Reach, engagement and progression are hard to review | R6 |
| P7 | Information not ready for action | Late evaluation, weak conditions found late, slower decisions | R7 |
| P8 | Limited visibility of approved information for external stakeholders | Weaker transparency and accountability to donors and sponsors | R8 |

**Opportunity.** Organize project, activity and beneficiary records in one environment, prepare collected data through metadata, produce monitoring outputs with less configuration and expose approved information under control, as an interoperable layer beside existing tools and not a replacement for them.

## 3. Business Model

PATHWAYS is an internal organizational system for humanitarian and development organizations. It is not a commercial product and no pricing is an active requirement.

| Item | Status |
|---|---|
| Funding sources | Client sponsorship; monthly amount Not established; funding after the capstone Not established (unknown) |
| Development and hosting cost figures | Client-sponsored; amounts and cost ceiling Not established (unknown) |
| Operating cost owner after the capstone | Capstone team until turnover, then PUP before release to Plan International Pilipinas; funding Not established |
| Pricing or revenue | Not applicable; no commercial model in the manuscript |

## 4. Business Model Canvas

| Block | Content | Source |
|---|---|---|
| Customer segments | Humanitarian and development organizations with program and project teams; Plan International Pilipinas is the concrete pilot setting; year one is 1 organization and about 15 staff users | Manuscript Ch1, Project Context |
| Value propositions | Usable project information with less repeated preparation; centralized project and beneficiary records; rule-based alerts and recommendations; controlled stakeholder visibility | Manuscript Ch1, Purpose and Description |
| Channels | Web application for internal roles; Public Project Tracker for external stakeholders | Manuscript Ch1, Scope and Limitations |
| Customer relationships | Not established | Not established; no source in the manuscript |
| Revenue streams | Not established | Not established; no commercial model stated |
| Key resources | The PATHWAYS web system and its metadata-driven data preparation, rule engine and role-based access control | Manuscript Ch1, Objectives 1 and 2 |
| Key activities | Project and beneficiary record management, form and dataset preparation, indicator and dashboard generation, alert and recommendation review | Manuscript Ch1, Objective 1 |
| Key partners | Donors, sponsors and partners as read-only viewers; existing collection and reporting platforms as interoperating tools | Manuscript Ch1, Purpose and Description |
| Cost structure | Client-sponsored hosting; amounts Not established | Developer answers 2026-10-01 |

## 5. Impact Variables

Impact is judged on these variables. None has a measured baseline in the manuscript, so each is evaluation evidence to be gathered, not a claimed result.

| Variable | Meaning | Tied to |
|---|---|---|
| Timeliness of usable information | Time from field collection to usable monitoring output | P3, P7; R3, R7 |
| Preparation effort | Repeated handling and setup effort per reporting cycle, including the estimated forty hours | P2, P3, P4; R2, R3, R4 |
| Beneficiary tracking continuity | One record and participation history across activities | P5, P6; R5, R6 |
| Early issue detection | Weak indicators, delayed timelines and progress issues flagged by rules before review | P7; R7 |
| Stakeholder visibility | Approved project information reachable by external stakeholders without internal access | P8; R8 |
| Direct access for intended users | Less dependence on technical staff to reach project information | P1; R1 |

## 6. Capital Philosophy Gate

The capstone scope has no funded deployment decision to gate. Capital, hosting and operating-cost decisions for any real deployment are recorded in the UES (`docs/ues-pathways.md`). Cost is client-sponsored; figures are Not established.

## 7. Strategic Alignment

Chapter 2 synthesis (`IDEA.md` section 8) supports two aims that PATHWAYS serves.

- **Humanitarian accountability.** Aid-funded organizations report to donors, management and communities; structured project information, milestones and controlled public visibility support transparency (P8, R8).
- **Inclusive SADDD monitoring.** Monitoring must go beyond counting: sex-, age- and disability-disaggregated analysis (Objective 2.3) with centralized beneficiary profiles and journey tracking (P5, P6).

Privacy and security are business requirements: beneficiaries are data subjects who may be children and vulnerable participants, so confidentiality and role-scoped access are conditions of adoption.

## 8. Scope

Scope is defined once. Coverage areas, limitations and system-wide bounds are in `IDEA.md` section 6; feature scope is in the PRD section 6. This document does not restate them.

## 9. Success Metrics

No numeric business KPI is invented. Success is judged by the evidence below.

| Measure | Evidence | Source |
|---|---|---|
| Objective 1.1 to 1.8 completion | Each objective met by its mapped PRD features and acceptance criteria | `IDEA.md` section 4.2 |
| Objective 2.1 to 2.4 applied | Metadata preparation, descriptive analytics, SADDD analysis and rule-based logic present in the system | `IDEA.md` section 4.3 |
| Objective 3.1 to 3.8 evaluated | UAT survey of 30 statements across the eight ISO/IEC 25010 characteristics | `IDEA.md` sections 4.4 and 9.4 |
| Authorization and isolation | Access and organization-isolation tests pass (Security) | QAD section 6 |
| Import traceability and metric correctness | Import and indicator tests pass | QAD section 6 |

**ISO/IEC 25010 characteristics evaluated:** Functional Suitability, Performance Efficiency, Compatibility, Usability, Reliability, Security, Maintainability, Portability.

**UAT instrument and thresholds.** A 5-point Likert scale; weighted mean per statement, composite mean per characteristic and an overall mean. Interpretation scale from the evaluation plan:

| Point | Scale range | Verbal interpretation |
|---|---|---|
| 5 | 4.21-5.00 | Strongly Agree |
| 4 | 3.41-4.20 | Agree |
| 3 | 2.61-3.40 | Neutral |
| 2 | 1.81-2.60 | Disagree |
| 1 | 1.00-1.80 | Strongly Disagree |

The manuscript sets no pass threshold beyond this scale and does not state the number of UAT respondents (Not established). Any acceptance threshold used by the suite is defined in the QAD.

## 10. Stakeholders & Owners

| Stakeholder | Interest | Relationship |
|---|---|---|
| PATHWAYS capstone team | Builds, evaluates and owns the system and this suite | Owner |
| Adviser and panel | Judges the capstone | Reviewer |
| System Administrator | Accounts, access and configuration | Internal role |
| Program Manager | Portfolio performance, aggregate-only beneficiary data | Internal role |
| Grant Manager | Milestones and resource use for assigned projects | Internal role |
| Project Manager | Status and performance of assigned projects | Internal role |
| Monitoring and Evaluation Officer | Dataset verification, forms, indicators, outputs | Internal role |
| Project Officer | Field data entry and import | Internal role |
| Donors, sponsors and partners | Approved progress and milestones | Tracker viewers only, no internal account |
| Future organizational privacy and security owners | Data protection for a real deployment | Not established; no named owner in the manuscript |

## Self-Check

- [x] Every problem P1-P8 has an operational cost and a requirement
- [x] Canvas cells are sourced or marked Not established
- [x] No numeric KPI or funding figure invented
- [x] Privacy and security treated as business requirements
