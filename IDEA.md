# PATHWAYS: System Idea and Manuscript Baseline

**Status:** Locked
**Version:** 2.0
**Last reconciled:** 2026-10-01
**Owner:** PATHWAYS capstone team

This file is the self-contained idea baseline for PATHWAYS. It distills the rev-2026 capstone manuscript (Chapters 1 to 3) and reconciles it to the running system. The manuscript is a source record, not a live document, and this file stands on its own. Where the manuscript and the repository disagree about current behavior, the repository wins and the manuscript content is recorded as superseded in section 12.

**One-line pitch:** PATHWAYS is a metadata-driven project information management system with rule-based decision support that turns collected field data into ready-to-use monitoring information for humanitarian and development organizations.

**Problem:** Field data move through separate collection, monitoring and reporting tools and need repeated export, import, verification, mapping and consolidation before anyone can evaluate a project, trace beneficiary progress or act on it.

**Insight (why us, why now):** Field data are already collected digitally, so the gap is the post-collection step; a thin interoperable layer that prepares, links and explains that data, rather than a replacement for KOBO, YES!ME or PMERL, closes the gap, and the pilot organization workflow gives the team a concrete setting to build and test against.

**Primary user (named, specific):** The Monitoring and Evaluation Officer on a humanitarian project team, who reviews collected datasets, verifies them, configures indicators and dashboards, and prepares monitoring outputs for project and program managers.

**Their moment of pain:** At the close of each reporting cycle the officer exports, re-imports, aligns and consolidates datasets across several tools before any dashboard or report is usable, which the manuscript estimates at about forty cumulative working hours per cycle.

**If we only ship one thing:** Metadata-driven import and mapping that turns an uploaded field dataset into validated, centralized project and beneficiary records that feed indicators and dashboards without rework (PRD-F5 and PRD-F6 feeding PRD-F7 and PRD-F8).

## 1. The Idea

### 1.1 Purpose

The purpose is to design and evaluate a metadata-driven project information management system that addresses delays in four activities when field data move through separate collection, monitoring and reporting tools:

- project-level evaluation;
- beneficiary progress tracking;
- beneficiary outcome assessment;
- timely decision-making.

Project information may already be collected digitally, but it does not yet move through one organized environment from collection to monitoring, evaluation, reporting and stakeholder response. Project teams and managers therefore struggle to assess project conditions, trace beneficiary progress and respond to project, community and stakeholder needs in time.

### 1.2 Description

PATHWAYS is a project-centered information system. It transforms raw field data into usable outputs for project-level evaluation, beneficiary progress tracking, reporting and decision-making. It is intended for program and project teams, including managers, officers and monitoring and evaluation personnel.

The manuscript claims these capabilities:

- Centralized project information, beneficiary profiles, journey tracking and aggregated dashboards.
- Metadata-driven data preparation, so forms, fields, mappings and validation rules are configured once and reused.
- Descriptive analytics that summarize past and current performance through KPI visualizations and beneficiary segment insights, including SADDD (sex, age and disability disaggregated data) views.
- Rule-based decision support: alerts for underperformance and predefined recommendations that propose courses of action toward organizational goals.
- A Public Project Tracker that gives donors, sponsors and other external stakeholders approved, non-sensitive project information.
- Role-based access control, so each internal user sees only what their responsibility requires.

### 1.3 An interoperable layer, not a replacement

PATHWAYS sits beside the existing collection, monitoring and reporting platforms. It lets organizations keep established workflows and user autonomy.

| Existing platform | Function in the pilot workflow | Relationship to PATHWAYS |
|---|---|---|
| KOBO Tool and KoboCollect | Field collection of registration forms, surveys, pre-test and post-test assessments and outcome monitoring forms | Source of datasets that PATHWAYS imports, maps and validates |
| YES!ME | Operational monitoring dashboard for reviewing datasets and visualizing indicators | Stays in place; PATHWAYS supplies prepared project information |
| PMERL | Higher-level monitoring, reporting and learning environment | Stays in place; PATHWAYS supplies report-ready outputs |
| Spreadsheets and document tools | Intermediate consolidation and report preparation | PATHWAYS reduces the need for manual consolidation |

The manuscript does not claim real-time synchronization or full API integration with these platforms. Exchange is by file import and export (see section 6).

### 1.4 The forty-hour claim

The manuscript states that preparing collected records into project-ready monitoring outputs may take approximately forty cumulative working hours per reporting cycle. This figure is an estimate from observed workflow cycles in the pilot setting. It is evaluation evidence to be confirmed, not a measured result of the system, and no document in this suite treats it as a verified saving.

### 1.5 Expected outcomes

The manuscript expects the system to:

- improve monitoring continuity across the implementation lifecycle;
- reduce workflow fragmentation between collection, monitoring and reporting;
- strengthen operational visibility for project teams and managers;
- let teams review implementation progress and monitor beneficiary movement across interventions;
- identify underperforming indicators and delayed activities using predefined project parameters;
- support timely project evaluation, reporting and decision-making while preserving human judgment.

### 1.6 What the system is not

- Not a full project management platform, ERP or replacement for all organizational systems.
- Not a field data collection platform that replaces KOBO.
- Not an evaluator of individual beneficiaries.
- Not an artificial intelligence or machine learning decision-maker.

## 2. Organizational Context

### 2.1 The pilot setting

Plan International Pilipinas is the concrete organizational setting used to observe the problem. It implements humanitarian and development programs on children's rights, education, livelihood, gender equality and youth empowerment. Its initiatives generate large volumes of beneficiary-level and project-level information that move across several systems for collection, monitoring and reporting. The manuscript uses this workflow as the basis for identifying the current process, user roles and operational issues. It is context, not a mandate: nothing in the system is specific to one organization.

### 2.2 The observed workflow

1. Project Officers collect beneficiary registration forms, training surveys, pre-test and post-test assessments and outcome monitoring forms in KOBO.
2. Datasets are reviewed through YES!ME for monitoring.
3. PMERL supports higher-level reporting and management review.
4. Between these steps, datasets are exported, imported, verified, aligned with monitoring structures, configured into indicators and dashboards, and sometimes consolidated through intermediate files.

Newly collected records therefore do not become ready for project-level evaluation, beneficiary progress tracking, dashboard generation or reporting immediately after submission. Usability of the information also depends on technically capable personnel who validate datasets, prepare dashboards and configure indicators before project teams can interpret conditions.

### 2.3 Existing environment

The manuscript describes the pilot environment as context for deployment planning.

| Aspect | Pilot environment |
|---|---|
| Devices | Laptops, tablets, smartphones, printers and scanners across office and field work |
| Operating system and browsers | Windows 11 with Chrome, Edge, Brave or Firefox |
| Collection and monitoring | KOBO Tool or KoboCollect, YES!ME, PMERL |
| Office tools | Spreadsheets, word processing and PDF tools, email, cloud file sharing |
| Network | Dual internet lines with automatic failover, firewall-protected office network |
| Storage and backup | Cloud file storage plus local office servers and regional servers, with incremental backups and an annual restore test |

The manuscript lists minimum client requirements of a Windows 10 device with an Intel Core i3 class processor, 4 GB of memory, 128 GB of storage and a current Chrome or Edge browser. It recommends Windows 11, an Intel Core i5 class processor, 8 GB of memory and 256 GB of storage. The system itself is web-based and needs only a browser and an internet connection for online features.

### 2.4 Multi-organization domain model

The pilot is one organization, but the domain model is multi-organization. Users, projects, programs and records belong to an organization, and organization isolation is enforced on the server. The manuscript states that the system is conceptually adaptable to other humanitarian and development organizations with similar project-based monitoring, evaluation and reporting conditions.

### 2.5 Pilot roles in the manuscript

The manuscript describes the pilot organization's roles as follows. The system's own roles are defined in section 5 and follow the repository, not this table.

| Pilot role | Responsibility described in the manuscript |
|---|---|
| Project Officers | Collect registration forms, training surveys, pre-test and post-test assessments and outcome monitoring surveys in KOBO |
| Monitoring and Evaluation Officers | Review datasets, verify information, monitor indicators, audit data, evaluate performance and prepare monitoring outputs |
| Grant Manager | Assist in technical preparation of the monitoring environment: verification support, metadata setup, dashboard configuration, report setup and troubleshooting |
| System Administrator or Superuser | Give access to users, permissions, projects, indicators, forms, rules, audit logs, backups and public content |
| Project Managers | Review project output datasets and use dashboards and reports for project-level monitoring and decisions |
| Program Managers | Review broader program performance and support decisions across projects |
| Donors and sponsors | External reviewers of overall progress, served by standard progress reports |

### 2.6 Program alignment

The work supports the Bachelor of Science in Information Technology program of the Polytechnic University of the Philippines and the mission of its College of Computer and Information Sciences: applying information management, systems analysis, database management, software development and data visualization to a real organizational problem.

## 3. Problem Analysis

### 3.1 Problem statement

Humanitarian and development organizations experience delays in project-level evaluation, beneficiary progress tracking and timely decision-making because field data often move through separate collection, monitoring and reporting tools that require repeated preparation before becoming operationally usable.

Datasets still need to be exported, imported, verified, mapped, configured into indicators and dashboards, and sometimes consolidated by hand. The delays make project information slow to reach users, make beneficiary progression hard to trace, and reduce the ability of teams and managers to detect issues early.

### 3.2 Root causes (fishbone categories)

| Category | Root causes |
|---|---|
| People | Dependence on technical staff to validate datasets, prepare dashboards and configure indicators; uneven usability across user roles limits direct access to monitoring outputs for non-technical users |
| Process | Repeated export-import handling across KOBO, YES!ME and PMERL; manual metadata setup; spreadsheet consolidation; no standard project structures for recurring project types |
| Data/Information | Fragmented records across tools and files make beneficiary participation hard to trace; risk of inconsistent information and weak project continuity |
| Technology | Existing platforms need extra configuration before outputs become usable; collection, monitoring and reporting environments are not connected to one another |

Together these conditions account for the estimated forty working hours of preparation per reporting cycle (section 1.4).

### 3.3 Problem-Requirements Matrix

Each problem maps to one requirement. The labels P1 to P8 and R1 to R8 are stable and are cited by the PRD, the audits and the change records.

| Problem | Statement | Requirement | Statement |
|---|---|---|---|
| P1 | Dependence on technical staff and uneven usability across user roles; project teams do not always reach usable project information directly | R1 | A more structured and usable project information environment in which project, activity and beneficiary records are accessed, reviewed and updated more directly by intended users |
| P2 | Repeated export-import handling and manual preparation of field data before use in monitoring, evaluation and reporting | R2 | Organized preparation and integration of collected field data, so imported records are recognized, aligned and used with less repeated handling |
| P3 | Manual metadata and dashboard setup: metadata verification, indicator setup and dashboard preparation before outputs are usable | R3 | Organized generation of monitoring outputs, so dashboards, summaries and reports are produced with less manual configuration |
| P4 | No standard setup for recurring projects; structures, activity groupings and indicator configurations are not standardized | R4 | More consistent project setup through reusable project structures, activity arrangements, indicator definitions and monitoring configurations applied to recurring project types |
| P5 | Records spread across different tools and files, risking inconsistent information and weak project continuity | R5 | Project and beneficiary information kept in a centralized, organized environment, so project records, participation history and related monitoring information are less fragmented |
| P6 | Difficulty tracking beneficiary participation across activities | R6 | Clearer tracking of beneficiary participation and progression across project activities, to review reach, engagement patterns and activity-level movement |
| P7 | Information not ready for action: delayed, hard-to-use information makes project-level evaluation, early detection of weak conditions and timely decisions difficult | R7 | Timely project performance summaries, structured rule-based issue flags and action-oriented decision guidance, so users assess conditions, identify weak performance earlier and respond more effectively |
| P8 | Limited visibility of approved project information for external stakeholders | R8 | Controlled stakeholder-facing visibility of approved project information, including selected progress summaries, milestone status and performance highlights, to support transparency and accountability |

### 3.4 How the requirements are met

| Requirement | Main PRD features | Note |
|---|---|---|
| R1 | PRD-F1, PRD-F2, PRD-F3 | Role-scoped workspaces give intended users direct access |
| R2 | PRD-F5, PRD-F6 | Forms, dataset staging, mapping and validation |
| R3 | PRD-F7, PRD-F8, PRD-F9, PRD-F12 | Indicators, dashboards, analytics and reports derived from prepared data |
| R4 | PRD-F2, PRD-F7 | Reusable structures for recurring project types are a known gap; it is examined in the manuscript alignment audit and is not claimed as met here |
| R5 | PRD-F2, PRD-F3 | Centralized project and beneficiary records |
| R6 | PRD-F4 | Journey stages and participation history |
| R7 | PRD-F9, PRD-F10, PRD-F11 | Summaries, alerts and recommendations |
| R8 | PRD-F13 | Public Project Tracker |

### 3.5 Evidence from the literature

The manuscript grounds the problem in published findings, summarized here without the citations.

- Aid-funded organizations work under accountability environments where project information must serve donors, management and partners, so collected records must become usable information and not just stored data.
- Collecting data digitally does not by itself improve operational visibility when information stays inconsistent, delayed or hard to integrate across systems.
- Humanitarian data quality problems include duplicate records, inconsistent verification, weak coordination and disconnected monitoring environments.
- Disconnected information environments create data silos, redundant handling and delays in reaching operationally relevant information.
- Monitoring dashboards work best when information is accessible and understandable to users without heavy technical preparation.
- Activity completion alone does not show beneficiary outcomes, so activities, indicators, beneficiary records and monitoring outputs must stay connected.
- Youth and employment programs in the Philippine setting show the same pattern of delayed verification, inconsistent documentation and stalled reporting.

## 4. Objectives

### 4.1 General objective

To develop PATHWAYS: A Metadata-Driven Project Information Management with Rule-Based Decision-Support for Humanitarian and Development Organizations.

The general objective has three groups of specific objectives: build the system (1.x), discuss the technologies and methods applied (2.x) and evaluate the system against ISO/IEC 25010 (3.x). The numbering below is the rev-2026 numbering and is stable.

### 4.2 Objective 1: develop the system

| No. | Objective | PRD feature(s) |
|---|---|---|
| 1.1 | Design and build a web-based, metadata-driven project information management and decision-support system that centralizes project information, activity records, beneficiary information and beneficiary progress data | PRD-F2, PRD-F3, PRD-F4, PRD-F6 |
| 1.2 | Develop a project profile, activity tracking module and project-related budget evidence so authorized users organize objectives, timelines, milestones, implementation status, activities and expense entries in one structured environment | PRD-F2 |
| 1.3 | Integrate a centralized beneficiary profile and journey tracking module to encode, organize, monitor and evaluate beneficiary participation, movement, progression, completion and follow-up across project activities | PRD-F3, PRD-F4 |
| 1.4 | Develop data collection and metadata-driven data integration so authorized users configure digital forms, define fields, upload field datasets, map source fields, validate required records and process collected data for monitoring, dashboards and reporting | PRD-F5, PRD-F6 |
| 1.5 | Develop a project monitoring structure to configure activities, define indicators and target values and organize tracking parameters for consistent implementation and evaluation | PRD-F2, PRD-F7 |
| 1.6 | Develop aggregated monitoring dashboards, descriptive analytics, SADDD analysis, beneficiary progress summaries and data visualization to evaluate performance, identify trends and outcomes and prepare monitoring outputs efficiently | PRD-F8, PRD-F9, PRD-F12 |
| 1.7 | Incorporate rule-based alerts and decision-support recommendations that help identify underperforming indicators, delayed timelines, beneficiary progress issues and low assessment improvement, and suggest actions for improvement | PRD-F10, PRD-F11 |
| 1.8 | Implement secure role-based access control and a public project tracker so internal users access functions appropriate to their responsibilities while donors, sponsors and other external stakeholders view approved project information without access to confidential beneficiary records | PRD-F1, PRD-F13 |

### 4.3 Objective 2: technologies, design approaches and computational methods

| No. | Method | PRD feature(s) |
|---|---|---|
| 2.1 | Metadata-driven data preparation using configurable forms, form fields, data types, required fields, validation rules, metadata mappings, source field names and target system fields, for consistent processing of manually encoded and imported field datasets | PRD-F5, PRD-F6 |
| 2.2 | Descriptive analytics and dashboard visualization using project indicators, target-versus-actual values, activity completion status, participation records, assessment results, budget utilization and timeline data to summarize current and past performance | PRD-F8, PRD-F9 |
| 2.3 | SADDD analysis using sex, age and disability-related beneficiary fields, for inclusive monitoring of reach, participation and distribution across demographic groups | PRD-F8 |
| 2.4 | Rule-based alerts and decision-support logic using predefined if-then conditions, thresholds and monitoring parameters for delayed activities, underperforming indicators, budget concerns, beneficiary progress issues, missing follow-up records and low assessment improvement | PRD-F10, PRD-F11 |

### 4.4 Objective 3: evaluation

Objective 3 is to evaluate the system through role-based user acceptance testing (UAT) in humanitarian and development organization workflows, based on the eight software product quality characteristics of ISO/IEC 25010.

| No. | Characteristic | Evaluated by |
|---|---|---|
| 3.1 | Functional Suitability | UAT survey statements, system testing of the end-to-end workflow |
| 3.2 | Performance Efficiency | UAT survey statements, performance testing of page loads, filtering, upload and report generation |
| 3.3 | Compatibility | UAT survey statements, import and export checks against existing tools |
| 3.4 | Usability | UAT survey statements, role-based task completion |
| 3.5 | Reliability | UAT survey statements, error handling and recovery checks |
| 3.6 | Security | UAT survey statements, security testing of authentication, access control and public visibility |
| 3.7 | Maintainability | UAT survey statements, unit testing and code organization review |
| 3.8 | Portability | UAT survey statements, browser and workstation coverage |

### 4.5 Objective numbering note

Older change records may cite manuscript objective numbers from an earlier manuscript revision. Those citations are traced in the manuscript alignment audit; the numbers above are authoritative for new work.

## 5. Users and Roles

### 5.1 Internal roles

The system has six internal roles. Names below are the readable forms of the RBAC role codes.

| Role | Code | Responsibility |
|---|---|---|
| System Administrator | `SYSTEM_ADMINISTRATOR` | Governs organization-wide accounts, configuration and security administration |
| Project Officer | `PROJECT_OFFICER` | Field data collector and data-entry role: imports collected data and encodes records for assigned projects without form-management rights |
| Monitoring and Evaluation Officer | `MONITORING_AND_EVALUATION_OFFICER` | Reviews and verifies datasets, configures forms and indicators, monitors performance and prepares monitoring outputs for one or more assigned projects |
| Project Manager | `PROJECT_MANAGER` | Oversees the status and performance of specific assigned projects through dashboards and reports |
| Program Manager | `PROGRAM_MANAGER` | Reviews broader program and portfolio performance and supports decisions across projects, with aggregate-only beneficiary information |
| Grant Manager | `GRANT_MANAGER` | Tracks milestones and resource use for explicitly assigned projects against benchmarks, with aggregate-only beneficiary information |

Access is granted by organization, project assignment, role and permission, and the server decides it. The exact permission grants live in the RBAC contract and the PRD, not here.

### 5.2 External stakeholders

Donors, sponsors, partners and other external stakeholders read the Public Project Tracker only. They have no internal account and see only approved, non-sensitive, high-level project information such as descriptions, milestones, progress updates, selected indicators and accomplishment summaries.

### 5.3 Beneficiaries are data subjects

Beneficiaries are data subjects, never users. They cannot apply, register themselves, log in or submit personal information through PATHWAYS. Authorized internal users encode, import, update and review their records after the organization's consent and data collection procedures have been followed. Beneficiaries may be children, young people and vulnerable participants, so safeguarding and confidentiality apply.

### 5.4 Who PATHWAYS serves first

| Persona | Need | Served by |
|---|---|---|
| Monitoring and Evaluation Officer | Stop hand-preparing datasets every cycle | PRD-F5, PRD-F6, PRD-F7 |
| Project Officer | Enter and import field data without technical help | PRD-F3, PRD-F5 |
| Project Manager | See project status without waiting for a prepared report | PRD-F8, PRD-F9 |
| Program Manager | Compare performance across projects and spot weak conditions early | PRD-F8, PRD-F10, PRD-F11 |
| Grant Manager | Track milestones and resource use against benchmarks | PRD-F2, PRD-F9 |
| System Administrator | Control accounts, access and configuration | PRD-F1 |
| External stakeholder | See approved progress and milestones | PRD-F13 |

## 6. Scope and Limitations

### 6.1 Coverage areas

The manuscript scopes PATHWAYS to these coverage areas, shown with the PRD features that carry them.

| Coverage area | PRD feature(s) |
|---|---|
| Authentication and Profile Management | PRD-F1 |
| User and Access Management | PRD-F1 |
| Project Information Management | PRD-F2 |
| Data Collection and Integration | PRD-F5, PRD-F6 |
| Beneficiary Management | PRD-F3 |
| Beneficiary Journey Tracking | PRD-F4 |
| Beneficiary-Related Monitoring Records (participation, feedback, survey responses, pre-test and post-test results, outcome survey results, follow-up records) | PRD-F3, PRD-F4, PRD-F5 |
| Monitoring, Analytics and Evaluation | PRD-F7, PRD-F8, PRD-F9 |
| Budget Expense Entries (budget evidence and liquidation support) | PRD-F2 |
| Reporting and Outputs | PRD-F12 |
| Rule-Based Alerts | PRD-F10 |
| Decision-Support Recommendations | PRD-F11 |
| System Administration | PRD-F1 |
| Public Project Visibility | PRD-F13 |

### 6.2 Limitations

Each limitation is a binding bound on the design and is carried into the PRD, SDD and QAD.

- PATHWAYS is limited to project information management with rule-based decision support. It is not a full project management platform, an enterprise resource planning system or a replacement for all existing organizational systems.
- It does not fully replace specialized field data collection platforms.
- It does not guarantee real-time synchronization or complete API-based integration with third-party systems such as KOBO, YES!ME or PMERL.
- It does not evaluate beneficiaries as individuals and does not decide whether a beneficiary personally learned, improved, succeeded or failed.
- Beneficiary-related records (participation history, feedback, survey responses, pre-test and post-test results, follow-up records) are handled only as project monitoring data, supporting project-level review of reach, participation, inclusion, output achievement and outcome indicators.
- Final interpretation of project effectiveness, beneficiary outcomes and required interventions remains with authorized organization personnel.
- Analytics, decision support and recommendations use predefined parameters, rules, thresholds and structured criteria only. There is no advanced artificial intelligence, predictive machine learning or autonomous decision-making.
- The system may produce alerts, review prompts and suggested actions, but final decision, validation and approval remain with the organization.
- Beneficiaries cannot apply, register themselves, log in or submit personal information as public users.
- The Public Project Tracker exposes only high-level approved information and never confidential beneficiary-level records, private assessment records, internal financial evidence or restricted organizational data.
- Development is bounded by the time, technical scope and resource constraints of an information technology capstone project.

### 6.3 System-wide bounds

| Bound | Meaning |
|---|---|
| Rules only | Deterministic rules and thresholds; no predictive model |
| Human in the loop | Alerts and recommendations are reviewed and decided by people |
| Project-level evaluation | Beneficiary data describe projects, not individuals |
| Private by default | Beneficiary-level data never reach the public tracker |
| Internal beneficiaries | Beneficiaries are records entered by staff |
| File-based exchange | Import and export, not live synchronization with other platforms |
| Not a full PM or ERP platform | Information management, monitoring and decision support only |

## 7. Requirements-Features Summary

The manuscript's Requirements-Features Matrix aligns functional and non-functional requirements with twelve features, F1 to F12. The current PRD uses stable IDs PRD-F1 to PRD-F13. Manuscript F1 to F11 map to PRD-F1 to PRD-F11, and manuscript F12 (Public Project Tracker for Donors) maps to PRD-F13. PRD-F12 (Reporting and Data Visualization) is a repository feature that has no separate manuscript feature number.

Feature detail, charters, gate criteria and use cases live in [the PRD](docs/prd-pathways.md).

| Manuscript | PRD ID | Feature | Priority |
|---|---|---|---|
| F1 | PRD-F1 | RBAC and Workspace Management | Must-Have |
| F2 | PRD-F2 | Project Profile and Activity Tracking | Must-Have |
| F3 | PRD-F3 | Centralized Beneficiary Profile | Must-Have |
| F4 | PRD-F4 | Beneficiary Journey Tracking | Must-Have |
| F5 | PRD-F5 | Digital Data Collection and Preparation | Must-Have |
| F6 | PRD-F6 | Metadata-Driven Data Integration | Must-Have |
| F7 | PRD-F7 | Project Indicator and Monitoring | Must-Have |
| F8 | PRD-F8 | Aggregated Monitoring Dashboard with SADDD Analysis | Must-Have |
| F9 | PRD-F9 | Descriptive Analytics and Project Performance Summaries | Supporting |
| F10 | PRD-F10 | Rule-Based Alerts | Supporting |
| F11 | PRD-F11 | Rule-Based Decision Support and Recommendations | Supporting |
| None | PRD-F12 | Reporting and Data Visualization | Supporting |
| F12 | PRD-F13 | Public Project Tracker | Supporting |

## 8. Related Systems and Synthesis

Chapter 2 reviewed literature and local systems. The synthesis relevant to this idea is short.

- **Project information is central.** Studies of aid project monitoring, NGO project management and donor accountability support a system that organizes project profiles, activities, milestones, targets, performance summaries and reporting outputs. Philippine project information management references such as KALAHI-CIDSS and the PPP Center show that this is a structured practice covering data centralization, data quality, access management and reporting.
- **Collection is only one step.** Offline-capable tools such as KoboCollect capture field data well, but post-collection data still need to be organized, linked, mapped, validated and interpreted. The literature therefore supports an information layer that bridges field capture and project-level use.
- **Metadata preserves meaning.** Metadata and interoperability studies show that reusable data structures, common semantics and metadata registries reduce repeated configuration and keep the meaning of fields across systems. This supports metadata-driven preparation.
- **Inclusive monitoring needs more than counting.** Work on beneficiary linkage and on sex-, age- and disability-disaggregated data supports centralized beneficiary profiles, journey tracking and SADDD analysis.
- **Dashboards must be usable.** Dashboard and descriptive analytics research shows that outputs must be actionable, role-appropriate and tied to meaningful indicators.
- **Decision support needs limits.** Prescriptive analytics and recommender literature supports rule-based, transparent, human-reviewed suggestions. Automation bias research shows users can over-rely on automated output when controls are weak, which supports the bounds in section 6.
- **Local systems.** Philippine systems such as SubayBAYAN, Project DIME, CBMS, Listahanan, MET Online Services and RabDash DC show that project monitoring, visualization, beneficiary information, transparency and decision support are already relevant in the Philippine public service and research context.

**Gap addressed.** These areas are usually treated separately or built into sector-specific systems such as public infrastructure monitoring, PPP oversight, health surveillance or social protection targeting. The manuscript finds a practical need for a metadata-driven, role-based, humanitarian and development project platform that connects field data preparation, project information management, beneficiary journey tracking, inclusive SADDD monitoring, dashboards, descriptive analytics, rule-based alerts, project recommendations and controlled donor visibility, without replacing existing collection or reporting systems. PATHWAYS is that integration.

## 9. Methodology, Quality and Evaluation

### 9.1 Development process

The team used the Agile software development life cycle: iterative sprints with continuous feedback from the adviser and client.

| Phase | Activity |
|---|---|
| Requirement gathering | Identify objectives, scope, user needs and major functional requirements from the current workflow and consultations |
| Design of requirements | Translate requirements into workflow structures, use case diagrams, database planning, interface layouts and feature mappings |
| Coding | Build in small increments, highest-priority requirements first |
| Testing and quality assurance | Check each sprint's output for errors, missing requirements and usability concerns; testing is continuous |
| Deployment preparation | Organize components for demonstration, evaluation and review against requirements |
| Feedback and refinement | Fold consultation, review and test feedback into later cycles |

### 9.2 Test methodology

| Test type | Focus |
|---|---|
| Unit | Functions, forms, validations, data-entry processes, mapping rules, dashboard filters, report generation and access control checks |
| Integration | Project profiles with activities, forms with metadata mapping, imported datasets with centralized records, beneficiary profiles with journey tracking, dashboards with processed data, alerts with evaluation support, reports and public tracker outputs |
| System | The full workflow from login and role-based access to project setup, data entry or import, validation, centralization, dashboards, analytics, reports and public tracker viewing |
| User acceptance | Role-based tasks by selected intended users, with feedback on usability, task completion and satisfaction |
| Security | Authentication, password handling, role-based access control, restricted pages, public tracker visibility and protection of beneficiary information |
| Performance | Page loading, dashboard viewing, data filtering, file upload, report generation and public tracker access under expected use |

### 9.3 ISO/IEC 25010 quality characteristics

The Quality Plan assesses eight ISO/IEC 25010 product quality characteristics. Objective 3.1 to 3.8 maps one to one to them.

| Characteristic | Sub-characteristics named in the plan | What the plan expects |
|---|---|---|
| Functional Suitability | Functional completeness, correctness, appropriateness | The system supports the complete flow from organizing records to producing monitoring, evaluation, reporting and decision-support outputs, accurately and appropriately to user responsibilities |
| Performance Efficiency | Time behavior, resource utilization, capacity | Acceptable response when users access records, process data, view summaries, generate outputs or move between pages, at the expected volume |
| Compatibility | Co-existence, interoperability | Works alongside existing tools, with practical import, export and output preparation that does not disrupt current processes |
| Usability | Appropriateness recognizability, learnability, operability, user error protection, user interface aesthetics, accessibility | Clear, organized, task-oriented interface that helps users with different abilities finish work and prevents errors through labels, validation and feedback |
| Reliability | Maturity, availability, fault tolerance, recoverability | Consistent, available operation; correct saving and retrieval; proper handling of errors and interruptions; recovery that limits data loss |
| Security | Confidentiality, integrity, non-repudiation, authenticity, accountability | Verified identity, access limited to authorized responsibilities, preserved record accuracy and accountability for user actions |
| Maintainability | Modularity, reusability, analyzability, modifiability, testability | Organized structures, reusable components, clear coding practice and documentation so maintainers can find, change and test issues |
| Portability | Adaptability, installability, replaceability | Runs on commonly available devices and standard web environments without complex installation |

### 9.4 Evaluation plan

- **Sequence.** Unit, integration, system and security testing run first; user acceptance testing follows.
- **Respondents.** Selected intended users: Project Officers, Monitoring and Evaluation Officers, the Grant Manager, Project Managers and Program Managers, plus selected external stakeholders who evaluate the public tracker. Selection rests on involvement in project information management, monitoring and evaluation, reporting, system administration or stakeholder viewing of approved information. The number of respondents is Not established in the manuscript.
- **Instrument.** A survey questionnaire of 30 evaluation statements adapted from an ISO/IEC 25010 evaluation instrument used in earlier Philippine capstone work, rated on a 5-point Likert scale.
- **Statement distribution.** Functional Suitability 3, Performance Efficiency 3, Compatibility 2, Usability 6, Reliability 4, Security 5, Maintainability 5, Portability 2.
- **Treatment.** Frequency and percentage summarize respondents by type, age group and sex and the distribution of ratings. A weighted mean is computed per statement, a composite mean per characteristic and an overall mean across all 30 statements. Respondent names are optional and excluded from analysis.
- **Procedure.** Select respondents, collect responses after role-based testing, organize by criterion, validate and discard incomplete or inconsistent entries, process statistically, review qualitative comments, then present and interpret results in tables.

The interpretation scale uses equal intervals of 0.80.

| Point | Scale range | Verbal interpretation |
|---|---|---|
| 5 | 4.21-5.00 | Strongly Agree |
| 4 | 3.41-4.20 | Agree |
| 3 | 2.61-3.40 | Neutral |
| 2 | 1.81-2.60 | Disagree |
| 1 | 1.00-1.80 | Strongly Disagree |

The manuscript sets no pass threshold beyond this interpretation scale. Any acceptance threshold used by this suite is defined in the QAD, not here.

### 9.5 UAT tasks by role

The manuscript expects respondents to perform tasks that match their assigned role.

| Respondent role | Example UAT tasks |
|---|---|
| Project Officer | Import datasets, encode records, manage beneficiary records |
| Monitoring and Evaluation Officer | Prepare digital forms, map and validate imports, review evaluation outputs |
| Project Manager and Program Manager | View dashboards, review performance, generate reports |
| Grant Manager | Create project profiles, review milestones and resource use |
| External stakeholder | Access approved information on the public project tracker |

### 9.6 Implementation plan

Implementation starts after development and internal testing. Pre-deployment prepares the web environment, user roles, permissions, project structures, monitoring parameters and public visibility settings, and readies user devices, browsers, connectivity, authorized accounts and project data. A final testing and user validation stage follows, then turnover to the assigned system administrator with guidelines for operation, user access management, data maintenance, backup procedures and future improvements.

### 9.7 Ethics

- Participants in consultations, testing and evaluation are informed of purpose, role and data use; participation is voluntary and withdrawal carries no penalty.
- Personal and sensitive information is processed under the Data Privacy Act of 2012 (Republic Act No. 10173) with confidentiality, limited access and proper protection.
- Organization data are confidential and used only within the approved scope. Raw beneficiary-level data and identifying details are not disclosed; testing, demonstration and presentation use dummy, sample, anonymized or masked data.
- Consent practice follows the organization's monitoring, evaluation, research and learning standards, including parent or guardian consent for beneficiaries under 18.
- Beneficiary data are not shown in dashboards, reports or public pages unless approved, aggregated, anonymized or safe for disclosure.
- Test results and findings are reported honestly, without alteration or fabrication, and limitations are acknowledged.
- Sources are cited and academic integrity is observed.

## 10. Technology Summary

Current stack, from the project dependency files. Detail and rationale live in [SDD section 2](docs/sdd-pathways.md).

| Layer | Technology |
|---|---|
| Frontend | Next.js ^15.2.2, React ^19.0.0, TypeScript ^5.9.3, Tailwind CSS ^3.4.17 |
| Backend | NestJS ^10.4.15, Prisma 6.19.2 |
| Database and platform | Supabase (PostgreSQL 17, Auth with MFA, Storage), Vercel hosting |
| Tools | pnpm 11.20.0, Node 22, Biome, Vitest, Playwright, GitHub Actions |

The manuscript's own tool table also lists shadcn/ui, TanStack Table, Apache ECharts, SheetJS, Papa Parse, Visual Studio Code, Git, GitHub, Postman or Bruno, Figma and Canva. Where the manuscript and the repository differ on a version or tool, the repository wins.

## 11. Definition of Terms

Terms are used as defined here by later documents.

| Term | Definition |
|---|---|
| Activity tracking | Recording, organizing and monitoring project activities, including schedules, status, milestones and progress details |
| Aggregated monitoring dashboard | Consolidated visual interface presenting indicators, participation data and progress updates in one view |
| Alert lifecycle | The handling states of a system-generated alert from trigger to closure: New, Reviewed, Actioned, Resolved, Dismissed and Auto-resolved |
| Beneficiary | An individual, group or community that receives services, support, training or interventions from a project; a data subject, not a system user |
| Beneficiary-level | Information about the data, records and activity history of individual beneficiaries |
| Beneficiary journey tracking | Monitoring a beneficiary's participation, movement and progression across activities or interventions over time |
| Beneficiary-related monitoring records | Participation, feedback, survey, pre-test and post-test, outcome survey and follow-up records used as project-level monitoring evidence, never to evaluate a beneficiary as an individual |
| Budget evidence | Budget expense entries with receipts, liquidation status, verification and approval, prepared for monitoring and transparency reporting |
| Centralized beneficiary profile | A structured, unified record of beneficiary information kept in one system |
| Data collection | Gathering project, beneficiary and monitoring information from forms, surveys and other structured sources |
| Decision support | Helping users interpret organized project information and identify possible actions using defined parameters, to aid human judgment and not replace it |
| Descriptive analytics | Summarizing measurable project conditions such as budget utilization, target-versus-actual KPI results, survey score improvement, participation patterns and timeline status |
| Digital data collection and preparation | Using digital tools to capture, organize, clean and prepare project and beneficiary data for monitoring and reporting |
| Grant Manager | The administrative user who tracks milestones and resource use for assigned projects against benchmarks |
| Indicator | A measurable variable used to track progress, performance, outcomes or participation |
| Journey stage configuration | Defining journey stages, mapping activities to stages, ordering stages, identifying branches and handling terminal or open-ended follow-up stages |
| KOBO | The field data collection platform (KOBO Tool or KoboCollect) used in the pilot workflow |
| Metadata | Structured information describing the meaning, format, attributes and relationships of data elements |
| Metadata-driven data integration | Organizing, mapping and preparing collected data through metadata structures for monitoring, dashboards and reporting |
| Monitoring | Continuously tracking implementation, activities, participation, indicators and progress |
| Monitoring and Evaluation (M&E) Officer | The user who reviews datasets, verifies information, monitors indicators, audits data and prepares monitoring outputs |
| PATHWAYS | The system: a metadata-driven project information management system with rule-based decision support for humanitarian and development organizations |
| PIN-based step-up authentication | An extra verification step before sensitive beneficiary-related records, budget evidence and restricted actions |
| PMERL | Program Monitoring, Evaluation, Research, and Learning; the higher-level reporting and learning environment in the pilot workflow |
| Program Manager | The managerial user who reviews broader program performance across projects |
| Project Manager | The managerial user who oversees the status and performance of specific projects |
| Project Officer | The field data collector and data-entry user for assigned projects |
| Project profile | A structured record of a project's title, objectives, timelines, milestones, indicators, status and implementation information |
| Project recommendation | A suggested course of action, continuation direction or review prompt generated from rules and project performance conditions, for human review |
| Public Project Tracker | A controlled public view of approved, limited project information for donors and other external stakeholders |
| Role-based access control (RBAC) | A mechanism that restricts access and functions by the responsibilities and permissions of each role |
| Rule-based alert | A notification triggered by a predefined condition showing that an indicator, activity, budget measure or timeline measure is delayed, weak or below expectation |
| SADDD | Sex, Age and Disability Disaggregated Data, analyzed to examine reach and participation across demographic groups |
| System Administrator | The privileged user who manages accounts, configuration and security |
| YES!ME | Youth Employment Solutions Monitoring and Evaluation; the operational monitoring dashboard in the pilot workflow |

## 12. Superseded Manuscript Content

The manuscript's use case diagrams and use case reports, activity diagrams, entity relationship diagram and data dictionary were drawn before the current system existed and describe behavior and tables that have since changed. They are not reproduced here and are not authoritative. Current use cases and workflows are in PRD sections 4 and 5 and the data model is in SDD section 3. Specific manuscript items that differ from the repository, and the disposition of each manuscript use case, are recorded in `docs/cr-pathways-doc-reconciliation-2026-10-01.md`.
