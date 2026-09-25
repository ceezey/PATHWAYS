# PATHWAYS — System Idea and Manuscript Baseline

> **Source of truth:** [*PATHWAYS: A Metadata-Driven Project Information Management with Rule-Based Decision-Support for Humanitarian and Development Organizations*](docs/NEW%20%5BGroup%2014%5D%20Capstone%20Manuscript%20rev%202026.pdf), September 2026, Chapters 1–3 (manuscript pages 1–196; PDF pages 8–203). Chapter text follows this working baseline, with the outdated use case diagrams and use case reports omitted as requested. Consult the PDF for the original layout, tables, figures, and any extraction artifacts.


## The idea

PATHWAYS is a web-based, metadata-driven **project information management** system with **rule-based decision support** for humanitarian and development organizations. Plan International Pilipinas is the organizational setting and workflow basis for the study. The system is meant to organize project and beneficiary-related monitoring information, prepare manually encoded and imported field records for use, and produce role-appropriate monitoring, evaluation, reporting, and approved public transparency outputs. It complements existing tools rather than replacing their specialist collection or higher-level reporting functions. See Chapter 1, Project Context, Purpose and Description, and Scope and Limitations.

The observed workflow uses **KOBO Tool/KoboCollect** to collect field forms and surveys, **YES!ME** for operational monitoring, and **PMERL** for higher-level reporting. Data moves through exports, imports, verification, metadata and indicator setup, dashboard configuration, and sometimes spreadsheet consolidation before it is usable. The manuscript estimates **approximately 40 cumulative working hours per reporting cycle** for this preparation in the pilot setting. The resulting delay affects project-level evaluation, beneficiary journey visibility, reporting, and timely response. The proposed system is an interoperable operational information layer that connects these activities while retaining human review and established organizational workflows. See Chapter 1, Project Context, Data and Processes, and Problem Analysis.

## Chapter 1 — Purpose, users, and boundaries

### Organizational context and current state

- Plan International Pilipinas works across children’s rights, education, livelihood, gender equality, youth empowerment, and other humanitarian and development programs. Projects involve activities, milestones, indicators, beneficiary records, participation, surveys and assessments, budgets, evidence, and reporting obligations to managers, donors, partners, and communities.
- Current users include Project Officers; Monitoring and Evaluation (M&E) Officers; a Grant Manager; a System Administrator/Superuser; Project Managers; Program Managers; and external donors or sponsors. The organization already uses laptops and mobile devices, cloud collaboration and file storage, regional/local servers and backups, dual internet links, SD-WAN, a Fortigate firewall, MFA/Okta Verify, VPNs, patching, and antivirus. These are descriptions of the **existing environment**, not mandates to rebuild it.
- The manuscript’s current-state diagrams show M&E preparing KOBO forms; Project Officers collecting beneficiary-provided field data; M&E and technical/administrative personnel exporting, importing, validating, and configuring data in YES!ME; and monitoring outputs moving into PMERL for managerial reporting and external review. The figures are on manuscript pages 13–15 (PDF pages 20–22).
- The root causes are grouped as **People, Process, Data/Information, and Technology**: reliance on technical staff, repeated cross-system preparation, fragmented records, and further configuration before outputs are usable. The eight entries in the Problem–Requirements Matrix are preserved in the source transcript below, including direct access for intended users, field-data preparation, coherent records, beneficiary tracking, timely performance and rule-based guidance, and approved external visibility.

### Product capabilities from the specific objectives

1. **Controlled access and workspaces:** Assign roles, permissions, organizations, projects, and auditability to authorized internal users. Sensitive modules and actions may require PIN-based step-up authentication.
2. **Projects, activities, and budget evidence:** Maintain program/project profiles, objectives, schedules, milestones, activities, assigned personnel, implementation status, expense entries, receipts or references, liquidation records, verification, and approval states.
3. **Beneficiary profiles and journeys:** Maintain centralized profiles, define journey stages, map activities to stages, and track enrollment, participation, movement, completion, branching paths, and follow-up status.
4. **Beneficiary-related monitoring records:** Encode, import, organize, and review participation, feedback, survey, pre-test, post-test, outcome, follow-up, and other organization-configured records as **project monitoring evidence**.
5. **Digital collection preparation and metadata mapping:** Configure forms and fields, upload datasets, map source fields to target fields, validate required values, and prepare records for monitoring, dashboards, reports, and project-level evaluation.
6. **Indicators and evaluation configuration:** Configure project-specific indicators, target and actual values, monitoring parameters, evaluation criteria, and tracking conditions.
7. **Monitoring outputs:** Show aggregated dashboards, descriptive analytics, target-versus-actual and timeline views, beneficiary participation summaries, visualizations, and **sex, age, and disability disaggregated data (SADDD)** analysis.
8. **Transparent rules and human decision support:** Trigger alerts for delays, underperforming indicators, budget concerns, missing follow-up records, weak outcome indicators, and related conditions. Record the alert lifecycle as **New, Reviewed, Actioned, Resolved, Dismissed, or Auto-resolved**; show predefined recommendations and review prompts to authorized people.
9. **Controlled public project tracker:** Let authorized staff publish approved, non-sensitive project summaries, milestones, selected progress and performance highlights, and transparency reports for donors, sponsors, partners, and other external stakeholders.

These are condensed from Specific Objectives 1.1–1.9 and 2.1–2.6. The complete wording, including the intended quality evaluation objectives 3.1–3.5, remains in the chapter text below.

### Explicit limits and safeguards

- PATHWAYS is a project information management and decision-support platform. The manuscript excludes a full project management or enterprise resource planning platform, full replacement of field collection systems, and guaranteed full real-time or API integration with KOBO, YES!ME, or PMERL.
- Beneficiaries are **data subjects, not public system actors**. They do not directly apply, self-register, log in, or submit personal data through PATHWAYS. Authorized internal staff handle beneficiary records under the organization’s consent and safeguarding procedures.
- The system does **not evaluate beneficiaries as individuals** or decide whether a person learned, succeeded, improved, or failed. Beneficiary-related records support evaluation of **projects**, inclusion, participation, outputs, and outcomes. Authorized personnel retain final interpretation, validation, action, and approval.
- Alerts and recommendations use configured rules, thresholds, criteria, and current/past descriptive information. The manuscript excludes advanced AI, predictive machine learning, and autonomous humanitarian decisions.
- Public pages show only approved, safe, high-level material. Confidential beneficiary data, private assessments, internal financial evidence, unapproved liquidation records, and restricted organizational data stay internal. See Scope and Limitations and Ethical Considerations.

## Chapter 2 — Research basis for the design

The literature review provides the rationale for PATHWAYS rather than a second product specification. Its themes are: humanitarian accountability and project information management; field collection followed by data preparation; metadata-driven integration and interoperability; beneficiary journeys and inclusive SADDD monitoring; dashboards, descriptive analytics, and project evaluation; transparent rule-based alerts and human-guided recommendations; criteria-based future-intervention planning; stakeholder and donor visibility; and human-centered, sustainable, scalable web implementation.

The manuscript compares these ideas with Philippine systems and studies including CBMS, Listahanan, SubayBAYAN, Project DIME, KALAHI-CIDSS PIMS, the PPP Center PIMS, RabDash DC, and local project monitoring and analytics studies. Its synthesis identifies the gap as a single humanitarian/development workflow connecting **field-data preparation → project information → beneficiary journeys → inclusive monitoring → dashboards and analytics → reviewable rule-based action → controlled donor visibility**. Existing collection, monitoring, and reporting systems remain part of the environment. The full literature discussion, citations, and synthesis are retained below.

## Chapter 3 — Functional and technical baseline

### Requirements and design

The manuscript’s Requirements–Features Matrix labels its feature groups **F1–F12**:

| ID | Feature |
| --- | --- |
| F1 | Role-Based Access Control |
| F2 | Project Profile and Activity Tracking |
| F3 | Centralized Beneficiary Profile |
| F4 | Beneficiary Journey Tracking |
| F5 | Digital Data Collection and Preparation |
| F6 | Metadata-Driven Data Integration |
| F7 | Project Indicator and Monitoring |
| F8 | Aggregated Monitoring Dashboard with SADDD Analysis |
| F9 | Descriptive Analytics |
| F10 | Rule-Based Alerts for Underperforming Indicators |
| F11 | Rule-Based Decision Support and Project Recommendation |
| F12 | Public Project Tracker for Donors |

The matrix also records the functional and non-functional requirements, relative priority, and manuscript planning status. The chapter’s activity diagrams, entity-relationship diagrams, and data dictionary provide workflow, field, relationship, and validation details. Those details are retained in the transcript and original PDF; this summary is an entry point, not a replacement for them.

The retained design figures span authentication; project setup; monitoring structures; forms and dataset import; beneficiary updates; analytics, alerts, and recommendations; reporting; public viewing; and relational data groups.

### Data model inventory

The Chapter 3 data dictionary names the following tables. Its full field definitions, types, defaults, constraints, descriptions, examples, and relationships remain in the source transcript and PDF:

| Area | Manuscript table names |
| --- | --- |
| Organization and access | `organizations`, `roles`, `permissions`, `role_permissions`, `system_users`, `audit_logs`, `user_project_assignments` |
| Programs and projects | `programs`, `projects`, `project_activities`, `project_milestones`, `project_activity_assignments`, `indicators`, `project_indicators` |
| Forms and integration | `digital_forms`, `form_fields`, `data_import_batches`, `metadata_mappings`, `form_submissions`, `form_response_values` |
| Beneficiaries and journeys | `beneficiaries`, `beneficiary_project_enrollments`, `beneficiary_activity_participation`, `beneficiary_journey_events`, `journey_stages`, `activity_journey_stage`, `assessment_results` |
| Budget, evidence, and output | `project_budget_records`, `budget_expense_entries`, `evidence_media`, `reports` |
| Evaluation and decisions | `project_evaluation_criteria`, `project_evaluations`, `project_evaluation_scores`, `alert_rules`, `alert_rule_conditions`, `alert_rule_recommendations`, `rule_based_alerts`, `decision_recommendations` |

### Delivery, testing, and evaluation

- **Process:** Agile SDLC with requirements gathering, requirements design, sprint-based coding, continuous testing and quality assurance, deployment preparation, and feedback/refinement. The manuscript’s process model is Figure 34.
- **Listed development tools:** Next.js, Tailwind CSS, shadcn/ui, TanStack Table, Apache ECharts; NestJS, Prisma ORM, SheetJS, Papa Parse; Supabase/PostgreSQL; Visual Studio Code, Git/GitHub, Postman or Brun, browser developer tools, Google Docs, Figma, and Canva. This is the manuscript’s proposed stack, not a statement that every component is already implemented.
- **Verification:** Unit, integration, system, security, performance, and role-based user acceptance testing. Integrated tests follow the route from login and project setup through forms/import and metadata validation to records, journeys, dashboards, rule outputs, reports, and the public tracker.
- **Quality model:** The chapter discusses functional suitability, performance efficiency, compatibility, usability or interaction capability, reliability, security, maintainability, and portability or flexibility. The source uses both ISO/IEC 25010:2011 and 25010:2023 terminology in different sections; retain the section-specific wording rather than silently treating the terms as identical.
- **Deployment sequence:** Prepare the web environment, accounts, permissions, project and monitoring configuration, data, and public visibility settings; conduct final testing and user validation; refine; then hand over to the administrator with operating, access, data maintenance, backup, and improvement guidance.
- **Evaluation:** Intended internal users and selected external tracker viewers perform role-based tasks and answer a five-point Likert survey. The manuscript specifies frequency, percentage, Average Weighted Mean, composite means, and optional qualitative feedback review. Its scale is **5 = Strongly Agree (4.21–5.00), 4 = Agree (3.41–4.20), 3 = Neutral (2.61–3.40), 2 = Disagree (1.81–2.60), 1 = Strongly Disagree (1.00–1.80)**. It says these scores alone do not prove ISO certification, complete standards compliance, or production readiness.
- **Ethics:** Apply voluntary informed participation, appropriate guardian consent for minors where relevant, confidentiality, safeguarding, access restriction, masking/anonymization or dummy data for testing and presentation, responsible reporting of findings, academic attribution, and Republic Act No. 10173 privacy safeguards. Only approved public material is released.

## Source fidelity and reading guide

The sections below preserve the extracted text of Chapters 1, 2, and 3 **except the outdated use case diagrams, use case reports, and incidental Chapter 3 references to those artifacts**. The remaining wording, citations, tables as extracted, data dictionary, evaluation details, and apparent inconsistencies are retained page by page. The extraction is from the supplied PDF, not from `docs/IDEA.md`. Printed manuscript page numbers are retained. For figures and any table whose columns are misaligned by plain-text extraction, use the linked PDF page; the PDF remains authoritative. Chapter 1 begins at PDF page 8, Chapter 2 at page 44, and Chapter 3 at page 67.

The manuscript itself contains some revision artifacts, including mismatched table-of-contents pagination, unnumbered `Table ??` labels late in the data dictionary, and mixed ISO/IEC 25010 edition terms. They are preserved in the transcription rather than corrected by assumption. Formulas whose PDF glyphs do not extract cleanly should be read in the original PDF; the stated calculations are average weighted mean `Σ(f × x) / N` and percentage `(f / N) × 100`.

---

## Complete Chapter 1 source text

<details>
<summary>Expand Chapter 1 transcript (PDF pages 8-43)</summary>

### Manuscript page 1 (PDF page 8)

~~~text
                                                                                                                   1

                                              Chapter 1​
                                          INTRODUCTION

Project Context
         Humanitarian and development organizations implement projects that address

complex social concerns such as education, livelihood, health, child protection, gender
equality, and youth empowerment. These organizations often manage multiple projects
across different communities and sectors while working under donor accountability,
reporting obligations, and measurable development targets. Because of this, project
information becomes essential not only for documentation, but also for monitoring
implementation, assessing beneficiary outcomes, supporting operational decisions, and
demonstrating evidence of impact. Crawford and Bryce (2003) explained that
aid-funded organizations operate within accountability environments where project
information must support multiple stakeholders, including donors, management, and
partner institutions. This highlights the need for information systems that can transform
collected records into usable and actionable project information rather than simply
storing data.

         Hamad et al. (2025) on project information systems emphasize that the value of
information systems lies in how effectively they transform project records into
accessible, timely, and relevant information that can support project monitoring and
management decisions. Despite the increasing use of digital tools in humanitarian and
development work, many organizations still experience fragmented monitoring
workflows, disconnected reporting environments, repeated manual preparation, and
delays in transforming field records into operationally usable information. Recent
discussions on humanitarian data systems emphasize that collecting digital data alone
~~~

### Manuscript page 2 (PDF page 9)

~~~text
                                                                                                                   2

does not automatically improve operational visibility or decision-making when
information remains inconsistent, delayed, or difficult to integrate across systems
(Squire, 2025). Similarly, studies on humanitarian data quality identify issues such as
duplicate records, inconsistent verification, weak coordination, and disconnected
monitoring environments that reduce the reliability and usability of project information
(Nyaga, 2025). The World Health Organization further explained that information
systems become more effective when data structures, analysis processes, and
information-use workflows are integrated rather than isolated into separate operational
tools (WHO, 2020). These findings suggest that the challenge is not simply the
absence of digital systems, but the difficulty of organizing collected field data into
structured and usable monitoring information.

         These operational issues can also be observed in development and youth
empowerment initiatives where implementation depends heavily on timely monitoring,
coordination, and reporting. Reports involving programs such as TUPAD, Tara Basa!,
the Government Internship Program (GIP), and the Joint Programme on Youth,
Employment and Migration (YEM) show how fragmented workflows, delayed
verification, inconsistent documentation, and disconnected monitoring systems can
contribute to stalled reporting, weak operational visibility, and delayed beneficiary
response. In multi-agency and community-based programs, collected datasets often
still require additional validation, consolidation, and preparation before they become
usable for monitoring and reporting activities. These conditions reinforce the need for
systems that improve the organization, accessibility, and operational usability of project
information across the implementation lifecycle.
~~~

### Manuscript page 3 (PDF page 10)

~~~text
                                                                                                                   3

         In the context of this study, Plan International Pilipinas provides a concrete
organizational setting where these information management challenges can be
observed. The organization implements humanitarian and development programs
focused on children’s rights, education, livelihood, gender equality, and youth
empowerment. These initiatives generate large volumes of beneficiary-level and
project-level information that move across several systems for collection, monitoring,
and reporting.

         In the current workflow, project officers use KOBO to collect beneficiary
registration forms, training surveys, pre-test and post-test assessments, and outcome
monitoring forms. The collected datasets are later reviewed through YES!ME for
monitoring activities, while PMERL supports higher-level reporting and management
review. Because these systems serve different operational functions, project
information remains distributed across separate collection, preparation, monitoring, and
reporting environments. Newly collected records do not automatically become ready for
project-level evaluation, beneficiary progress tracking, dashboard generation, or
reporting immediately after submission. Instead, datasets still need to be exported,
imported, verified, aligned with monitoring structures, configured into indicators and
dashboards, and sometimes consolidated through intermediate files before they
become operationally usable. Based on observed workflow cycles in the pilot setting,
preparing collected records into project-ready monitoring outputs may require
approximately forty cumulative working hours per reporting cycle.

         These conditions create delays in project-level evaluation, beneficiary tracking,
operational review, and timely response. Information usability may also depend heavily
on technically capable personnel who assist in validating datasets, preparing
~~~

### Manuscript page 4 (PDF page 11)

~~~text
                                                                                                                   4

dashboards, configuring indicators, and organizing reports before project teams can
meaningfully interpret project conditions. Baumann (2024) explained that organizations
operating with disconnected information environments often experience data silos,
redundant handling processes, and delays in accessing operationally relevant
information. Similarly, studies on dashboard usability emphasize that monitoring
systems are most effective when information is accessible, understandable, and
aligned with the operational needs of users rather than requiring excessive technical
preparation (Almasi et al., 2023; Siette et al., 2023; Stahlman et al., 2025).

         In humanitarian implementation settings, activity completion alone may not
sufficiently demonstrate whether interventions produce meaningful beneficiary
outcomes. Organizations also need to assess whether beneficiaries progress across
interventions, whether indicators align with intended outcomes, and whether
implementation conditions require operational review. This requires project information
to remain connected across activities, indicators, beneficiary records, and monitoring
outputs rather than being reviewed as isolated datasets.

         In response to these conditions, this study proposes PATHWAYS, a
metadata-driven project information management system with rule-based
decision-support for humanitarian and development organizations. Rather than
replacing existing workflows, the system is designed as an interoperable operational
information layer that complements existing collection, monitoring, and reporting
platforms. Through reusable metadata structures, project forms, indicators, activities,
and beneficiary records can be organized and prepared more consistently, reducing
repeated setup and improving the usability and accessibility of project information
across the implementation lifecycle.
~~~

### Manuscript page 5 (PDF page 12)

~~~text
                                                                                                                   5

         The system supports the transformation of collected field records into more
actionable monitoring information by integrating centralized beneficiary tracking,
aggregated dashboards, descriptive analytics, and rule-based operational
recommendations within one structured environment. This enables project teams to
review implementation progress, monitor beneficiary movement across interventions,
identify underperforming indicators and delayed activities, and assess whether project
conditions require operational response using predefined project parameters while
preserving human judgment. Through these capabilities, the system is expected to
improve monitoring continuity, reduce workflow fragmentation, strengthen operational
visibility, and support more timely project evaluation, reporting, and decision-making for
project officers, managers, monitoring personnel, and stakeholders.

         The development of this system aligns with the objectives of the Bachelor of
Science in Information Technology (BSIT) program of the Polytechnic University of the
Philippines, which emphasizes the design, development, and implementation of
computer-based information systems that address real-world organizational
challenges. The system is designed for practical deployment, enabling Plan
International Pilipinas to adopt, sustain, and potentially scale its use across multiple
programs. This allows the researchers to apply knowledge in information management,
systems analysis, database management, software development, and data
visualization in a real-world context while delivering a solution with tangible
organizational impact.

         Furthermore, the study also reflects the mission of the College of Computer and
Information Sciences (CCIS) to provide quality IT education that is responsive to the
changing needs of the industry and society, to embed a culture of research and
~~~

### Manuscript page 6 (PDF page 13)

~~~text
                                        6

innovation, and to produce highly employable graduates who can apply technology to
practical and organizational problems. The proposed project supports the college’s
goal of developing innovative systems and research with greater reliance on
technology, while strengthening students’ professional competence through real-world
application and collaboration with external institutions.

Technical Background

         Equipment/Hardware.​
         The company's existing equipment and hardware components are utilized to
support project operations and field data collection activities. For endpoint operations,
user access, and mobile data gathering, the workflow relies on a combination of
laptops, tablets, and smartphones. Network connectivity within the environment is
maintained through Wi-Fi routers to ensure all devices are seamlessly connected, while
each local server manages data storage and system processes in Luzon, Visayas, and
Mindanao. Additionally, printers and scanners are used by the staff for handling and
preparing physical reporting and documentation.

                                                     Table 1
                      Existing Equipment of Plan International Pilipinas

            Equipment         Quantity
               Laptops            10
                                  10
Smartphones / Mobile Devices       2
       Printers / Scanners         3
           Wi-Fi Routers          10
                Tablet             3
               Servers
~~~

### Manuscript page 7 (PDF page 14)

~~~text
                                                                      7

         Software.
         The current workflow operates on Windows 11 using web browsers like Google
Chrome, Microsoft Edge, Brave, or Firefox. It utilizes KOBO Tool / KoboCollect as the
data collection tool, while Youth Employment Solutions Monitoring and Evaluation
(YES!ME) and Program Monitoring, Evaluation, Research, and Learning (PMERL)
serve as the monitoring dashboard and higher-level reporting systems. Microsoft Excel
and Google Sheets are used as spreadsheet tools, alongside Microsoft Word and PDF
export tools for document preparation. For communication and cloud collaboration, the
workflow relies on Microsoft Outlook, Outlook Web Access, or Gmail, with files stored
and shared via SharePoint, OneDrive, and Google Drive.

                                                          Table 2​
                                                         Software

Software                       Description
Operating System
Web Browser                    Windows 11

Email Communication            Google Chrome, Microsoft Edge, Brave,
                               Firefox
Cloud Storage / Collaboration
                               Microsoft Outlook (Internal), Outlook
Final Data Collection Tool     Web Access / Gmail (External)
Monitoring Dashboard
                               Share Point (Internal), OneDrive and
Higher-Level Reporting System  Google Drive (Personal)

Spreadsheet Tool               KOBO Tool / KoboCollect
Document Preparation Tool
                               Youth Employment Solutions Monitoring
                               and Evaluation (YES!ME)

                               Program Monitoring, Evaluation,
                               Research, and Learning (PMERL)

                               Microsoft Excel, Google Sheets

                               Microsoft Word, PDF Reader / PDF
~~~

### Manuscript page 8 (PDF page 15)

~~~text
                                                                                      8

                            Export Tools

      ​

​     Peopleware/Manpower.

                            Table 3​

                 Plan International Pilipinas Organizational Chart

   No. User Roles           Responsibilities

   1     Project Officers   Responsible for collecting beneficiary registration
                            forms, training surveys, pre-test and post-test
                            assessments, and outcome monitoring surveys
                            through the KOBO Tool. They serve as the primary
                            field data collectors and help ensure that
                            project-related information is captured from
                            beneficiaries and field activities.

   2     Monitoring        and Responsible for reviewing collected beneficiary

         Evaluation Officers datasets, verifying information, monitoring indicators,

         (M&E)              conducting data auditing, and evaluating project and

                            program performance. They also participate in

                            preparing monitoring outputs and reports based on

                            collected and processed data.

   3     Grant Manager      Responsible for assisting in the technical preparation
                            of the monitoring environment, including data
                            verification support, metadata-related setup,
                            dashboard configuration, graph preparation, report
                            setup, and system-related troubleshooting.

   4     System             Responsible for giving access to users, permissions,

         Administrator/Superu projects, indicators, forms, system rules, audit logs,

         ser                backups, and public content. They maintain the

                            frontend demo environment and oversee

                            system-wide configuration and data access.

   5     Project Managers   Responsible for reviewing project output datasets,

                            monitoring project implementation, checking

                            accomplishment and progress outputs, and using

                            dashboards and reports for project-level monitoring

                            and decision-making.

   6     Program Managers Responsible for reviewing broader project and

                            program performance, interpreting monitoring

                            outputs, supporting decision-making across projects

                            or initiatives, and using reporting outputs for
~~~

### Manuscript page 9 (PDF page 16)

~~~text
                                                                    9

   managerial and operational review.

7  Donors / Sponsors As external stakeholders, Donors and Sponsors

   primarily review overall project progress. Their

   oversight is supported by standardized progress

   reports compiled and delivered by the Project and

   Program Managers in coordination with the PMERL

   (Planning, Monitoring, Evaluation, Research, and

   Learning) system.

Figure 1. Plan International Pilipinas Organization Chart

         Network Infrastructure/Architecture.
         The current monitoring and reporting workflow of Plan International Pilipinas
relies on a web-based and cloud-supported environment where project information
moves across several digital platforms, including KOBO, YES!ME, and PMERL. To
support these continuous online data transfers, the organization's network
infrastructure operates on a dual-line setup featuring two Internet Service Providers
(ISPs). This environment maintains an Software-Defined Wide Area Network
(SD-WAN) configuration that manages both a main and a backup internet connection. If
~~~

### Manuscript page 10 (PDF page 17)

~~~text
                                                                                                                 10

the primary connection goes down, the backup line automatically becomes active to
prevent any operational disruption.

         Architecturally, the network includes both Local Area Network (LAN) and Wide
Area Network (WAN) setups inside the office, utilizing two routers, a virtualized
VMware environment, and dedicated network security controls. To protect internal
project records, beneficiary data, and system communications, a Fortigate Firewall is
integrated into the infrastructure as a core component of their network security. This
robust network framework connects local office activities.

         Storage, Backup, and Recovery Procedure.
         Plan International Pilipinas currently manages its project and monitoring data
through a combination of cloud-based platforms and structured infrastructure, mainly
utilizing SharePoint and OneDrive for primary file storage and backups, where each
user account is allocated 1TB of OneDrive storage. To mitigate risks such as data loss
and virus vulnerabilities, the organization has shifted away from external hard drives
and now relies strictly on cloud storage and server-based backup systems.

         The organization's actual backup procedure utilizes local office servers,
Network-Attached Storage (NAS) devices, and regional servers distributed across
Luzon, Visayas, and Mindanao. According to the IT Team of Plan International Pilipinas
this geographically distributed setup establishes a redundant continuity mechanism:
“nagbabatuhan ng backup”, ensuring that data remains retrievable even if one
regional server or location becomes completely unavailable. The backup workflow
covers Virtual Machine (VMware) servers and system files using Veeam Backup or a
similar specialized backup application. These backups are executed on a daily,
~~~

### Manuscript page 11 (PDF page 18)

~~~text
                                                                                                                 11

monthly, and yearly basis using an incremental backup process, meaning only newly
added or modified files are uploaded to optimize bandwidth and storage capacity.

         For data resilience, the recovery procedure dictates that data restoration
protocols are tested or performed at least once a year, allowing files to be recovered
down to the individual file level when needed. While individual productivity files are
secured via OneDrive, the core project databases, beneficiary tracks, and monitoring
records are sustained across these platforms.

         Security Procedures.
         Plan International Pilipinas implements a comprehensive set of preventative
security measures and structured protocols to safeguard its digital infrastructure. To
actively lessen system vulnerabilities, the organization utilizes a network firewall,
Multi-Factor Authentication (MFA), Okta Verify, and Virtual Private Networks (VPNs) to
secure remote access for outside use. Furthermore, system endpoints are protected
using Heimdal for automated patch updates to eliminate security vulnerabilities,
alongside a globally acquired antivirus application for continuous threat detection
across its platforms. These tools collectively establish a secure environment for data
handling and system operations.

         In the event of a security breach or virus detection, a strict containment and
remediation process is immediately executed. The first phase of this incident response
protocol involves isolating the infected or affected computers, disabling any breached
user accounts, and enforcing immediate password changes. The IT team then
conducts extensive firewall checks, isolates the compromised devices or accounts, and
thoroughly verifies if malware or viruses have penetrated further into the network.
~~~

### Manuscript page 12 (PDF page 19)

~~~text
                                                                                                                 12

         To ensure continuous security and operational integrity, the internal IT team
works closely with external third-party security service providers who assist in
maintaining the servers and managing security incidents. The effectiveness of these
combined protocols was demonstrated in a previous system incident, where the virus
threat was completely contained with zero data loss.​

         Policies and Procedures.
         Plan International’s MERL Policy provides the strongest basis for the
organization’s policies and procedures related to monitoring, evaluation, research, and
learning. The policy applies to all work undertaken by Plan International offices under
the global Programme and Influence Quality Policy, regardless of funding source, and
covers development and humanitarian programmes, projects, and influencing work
(Plan International, 2024).

         The policy also explains that MERL activities are performed by multiple
functions across the organization and should not be understood as the responsibility of
MERL staff alone (Plan International, 2024). This supports the current workflow where
project officers, M&E staff, IT personnel, project managers, program managers, and
external stakeholders may all be involved in collecting, processing, reviewing, or using
project information.

         To maintain organizational accountability, transparency, and ethical operational
delivery, procedures require continuous, rigorous documentation of data streams and
beneficiary feedback systems (Plan International, n.d.). Plan International’s procedures
require continuous monitoring, collection, and analysis of data, including stakeholder
feedback, to provide management and key stakeholders with information about
~~~

### Manuscript page 13 (PDF page 20)

~~~text
                                                                                                                 13
progress, results, quality of implementation, relationships, and use of funds (Plan
International, 2024). The policy also states that evaluation activities should assess
ongoing or completed projects, programmes, or policies using qualitative and
quantitative data, stakeholder feedback, and analysis of Plan International’s
contribution to observed changes.​
Data and Processes
Figure 2. Level 0 - Data Flow Diagram (Context Diagram)

         Figure 2 presents the Level 0 Data Flow Diagram of the current project
monitoring and reporting workflow. It shows the high-level movement of data among
the main users and existing systems: Beneficiaries, Project Officer, Monitoring and
Evaluation Officer (M&E), Superuser/System Administrator, Project Manager, External
Users Donors & Sponsors, KOBO, YES!ME, and PMERL. In this process, The M&E
~~~

### Manuscript page 14 (PDF page 21)

~~~text
                                                                                                                 14
creates the digital forms, and once the Beneficiaries complete the survey data, the
Project Officer prepares and exports field data through KOBO, while the M&E staff
imports and uses the collected data in YES!ME for monitoring purposes. The
Superuser/System Administrator assists the Monitoring and Evaluation Officer (M&E) in
setting up and transferring monitoring data from YES!ME to PMERL, which serves as
the higher-level reporting platform. Project Managers, Program Manager, and external
stakeholders such as donors and sponsors access reports from PMERL to review
project progress and performance.
Figure 3. Level 1 - Data Flow Diagram (Context Diagram)

         Figure 3 presents the Level 1 Data Flow Diagram, which expands the current
workflow into more detailed processes. The process begins with the Monitoring and
~~~

### Manuscript page 15 (PDF page 22)

~~~text
                                                                                                                 15

Evaluation Officers (M&E) preparing and managing KOBO forms, then collecting and
storing field data in the KOBO submission records by the Project Officer that was
provided by the Beneficiaries by completing the survey forms. The collected dataset is
exported from KOBO and imported by the Monitoring and Evaluation Officers (M&E)
and Superuser/System Administrator into YES!ME for monitoring use. Afterward, the
imported dataset is configured through metadata setup, indicators, graphs, and
dashboards before monitoring outputs are generated. These outputs are then
transferred or prepared by the Superuser/System Administrator and Monitoring and
Evaluation Officer (M&E) for PMERL reporting. PMERL stores the generated
higher-level reports, which can then be accessed by Project Manager then will be
reported and validated by the Program Manager, then will be viewed by External Users
Donors & Sponsors. Overall, the diagram shows that the current workflow depends on
several systems and manual data preparation steps before project information
becomes usable for monitoring, evaluation, reporting, and decision-making.

Problem Analysis

         Fishbone Diagram.

Figure 4. Fishbone Diagram
~~~

### Manuscript page 16 (PDF page 23)

~~~text
                                                   16

​  The fishbone diagram identifies the root causes of delays in project-level

evaluation, beneficiary tracking, and timely decision-making at Plan International

Pilipinas, grouped into four categories: People, Process, Data/Information, and

Technology. Dependence on technical staff and uneven usability across user roles limit

direct access to monitoring outputs for non-technical users. Repeated export-import

handling across KOBO, YES!ME, and PMERL, along with manual metadata setup,

spreadsheet consolidation, and the absence of standard project structures, contribute

to approximately forty (40) cumulative working hours of preparation per reporting cycle.

At the same time, fragmented records across different tools and files make beneficiary

participation more difficult to trace, while the existing platforms still require additional

configuration before outputs become usable. Together, these conditions delay the

transformation of collected field data into usable project information for monitoring,

evaluation, and reporting, which may limit the ability of project teams to respond

promptly to emerging program and community needs.
~~~

### Manuscript page 17 (PDF page 24)

~~~text
                                            17

   Problem and Solution Statement.

​  Humanitarian and development organizations experience delays in project-level

evaluation, beneficiary progress tracking, and timely decision-making because field

data often move through separate collection, monitoring, and reporting tools that

require repeated preparation before becoming operationally usable for responding to

project, community, and stakeholder needs.

         This problem is evident in workflows where project data do not automatically
become ready for evaluation and reporting after collection. Instead, datasets still need
to be exported, imported, verified, mapped, configured into indicators and dashboards,
and sometimes manually consolidated before they can be used meaningfully. These
conditions delay access to project information, make beneficiary progression harder to
trace, and reduce the ability of project teams and managers to detect issues early and
respond effectively. In humanitarian and development settings, where accountability,
stakeholder reporting, and timely project action are important, such delays weaken
both operational responsiveness and the practical value of monitoring and evaluation.

         To address these issues, the study proposes PATHWAYS, a metadata-driven
project information management with rule-based decision-support for humanitarian and
development organizations. The system is designed to organize project, activity, and
beneficiary information in a more structured environment, while also preparing and
integrating collected field data so that they can be used more readily for monitoring,
evaluation, reporting, and decision-making.
~~~

### Manuscript page 18 (PDF page 25)

~~~text
                                                                             18

Problem-Requirements Matrix.

                                       Table 4​
                       Problem-Requirements Matrix

            Problem                           Requirements

1 Dependence on technical staff R1 The system must provide a more

and uneven usability across user      structured and usable project

roles. Project teams do not always    information environment in which

access usable project information     project, activity, and beneficiary

directly because some users still     records shall be accessed,

depend on more technical staff        reviewed, and updated more

before outputs become ready for       directly by intended users.

use.

2 Repeated export-import handling R2 The system must support the

and manual preparation of field       organized preparation and

data. Field data still go through     integration of collected field data so

repeated transfer, checking, and      that imported records shall be

preparation before they can be        recognized, aligned, and used with

used for monitoring, evaluation, and  less repeated handling across

reporting.                            project workflows.

3 Manual metadata and dashboard R3 The system must support the

setup. Monitoring outputs still       organized generation of monitoring

require metadata verification,        outputs so that dashboards,

indicator setup, and dashboard        summaries, and reports shall be

preparation before they become        produced with less manual

operationally usable.                 configuration.

4 No standard setup for recurring R4 The system must support more

projects. Recurring project types     consistent project setup through

still require repeated setup work     reusable project structures, activity

because project structures, activity  arrangements, indicator definitions,

groupings, and indicator              and monitoring configurations that

configurations are not standardized.  shall be applied to recurring project

                                      types.

5 Records spread across different R5 The system must maintain project

tools and files. Project and          and beneficiary information in a

beneficiary records remain            centralized and organized

distributed across different systems  environment so that project records,

and files, increasing the risk of     participation history, and related

inconsistent information and making   monitoring information are less

project continuity harder to          fragmented.

maintain.
~~~

### Manuscript page 19 (PDF page 26)

~~~text
                                                                                        19

6 Difficulty tracking beneficiary          R6 The system must support clearer
       participation across activities.          tracking of beneficiary participation
       Participation across activities is        and progression across project
       difficult to trace clearly.               activities so that project teams can
                                                 better review project reach,
                                                 engagement patterns, and
                                                 activity-level movement for
                                                 monitoring and evaluation
                                                 purposes.

7 Information not ready for action. R7 The system must provide timely

Because project information is             project performance summaries,

delayed and not readily usable,            structured, rule-based issue flags,

project teams experience difficulty        and action-oriented decision

in project-level evaluation,               guidance so that users assess

identifying weak conditions early,         project conditions, identify weak

and making timely decisions.               performance earlier, and respond

                                           more effectively.

8 Limited visibility of approved           R8 The system must provide controlled

project information for external           stakeholder-facing visibility of

stakeholders. External                     approved project information,

stakeholders do not always receive         including selected progress

timely and accessible visibility into      summaries, milestone status, and

approved project progress and              performance highlights, in order to

performance.                               support transparency and

                                           accountability.

Purpose and Description

         The project addresses delays in project-level evaluation, beneficiary progress
tracking, beneficiary outcome assessment, and timely decision-making when field data
move through separate collection, monitoring, and reporting tools that still require
repeated preparation before becoming operationally usable.

         In the current workflow, project information may already be collected digitally,
but it does not yet move through one organized and readily usable environment from
collection to monitoring, evaluation, reporting, and stakeholder response. Because of
this, project teams and managers experience difficulty in accessing information quickly
~~~

### Manuscript page 20 (PDF page 27)

~~~text
                                                                                                                 20

enough to assess project conditions, track beneficiary progress clearly, and respond to
project, community, and stakeholder needs in a timely manner.

         This project intends to improve the way project information is organized,
prepared, interpreted, and used by providing a more structured and integrated digital
environment for project and beneficiary records. PATHWAYS is a project-centered
information system designed to transform raw field data into usable outputs for
project-level evaluation, beneficiary progress tracking, reporting, and timely
decision-making. Intended for program and project teams—including managers,
officers, and monitoring and evaluation (M&E) personnel—the system addresses
critical operational delays caused by field data moving through separate collection and
reporting tools that require approximately forty cumulative working hours of manual
preparation before becoming operationally usable. The system functions as an
interoperable information layer compatible with existing platforms, allowing
organizations to maintain established workflows and user autonomy while providing
centralized project information management, beneficiary profiles, journey tracking, and
aggregated dashboards. This metadata-driven architecture improves the timeliness of
information by utilizing descriptive analytics to monitor past and current performance
through KPI visualizations and beneficiary segment insights, alongside prescriptive
analytics that propose specific courses of action to achieve desired organizational
goals. By integrating these analytics as a decision-support system featuring rule-based
alerts for underperformance and a Public Project Tracker for stakeholder transparency,
PATHWAYS ensures that project information is timely, inclusive, and actionable for
those responding to community and stakeholder needs.

Specific Objectives
~~~

### Manuscript page 21 (PDF page 28)

~~~text
                                                                                                                 21

1. To develop PATHWAYS: A Metadata-Driven Project Information Management
with Rule-Based Decision-Support for Humanitarian and Development
Organizations, specifically:

         1.1 To develop a role-based access control and workspace management
         feature that allows authorized users such as Project Officers, Monitoring and
         Evaluation Officers, Grant Manager, Project Managers, Program Managers, and
         System Administrators to access system functions based on their assigned
         responsibilities and permissions.

         1.2 To develop a project-related budget evidence, project profile, and activity
         tracking module that allows authorized users to create, update, organize, and
         monitor project information, including project objectives, timelines, milestones,
         implementation status, activities, assigned personnel, project-related records,
         expense entries, receipt references, liquidation records, verification status, and
         approval status for project monitoring and reporting purposes.

         1.3 To develop a centralized beneficiary profile and beneficiary journey tracking
         module that allows authorized users to maintain beneficiary records, journey
         stage configuration, map project activities to journey stages, and monitor
         beneficiary participation, movement, completion, branching path, and follow-up
         status across project activities and interventions.

         1.4 To develop a beneficiary-related monitoring records feature that allows
         authorized users to encode, import, organize, and review participation records,
         feedback records, pre-test and post-test results, outcome survey results,
~~~

### Manuscript page 22 (PDF page 29)

~~~text
                                                                                                        22

follow-up records, and other project-level monitoring data configured by the
organization.

1.5 To develop a data collection and metadata-driven data integration feature
that allows authorized users to configure digital forms, define form fields, upload
field datasets, map source fields, validate required records, and process
collected data for project monitoring, dashboard generation, reporting, and
project-level evaluation.

1.6 To develop a project indicator and monitoring feature that allows
organizations to configure project-specific indicators, target values, actual
values, monitoring parameters, evaluation criteria, and tracking conditions for
consistent project implementation and evaluation.

1.7 To develop aggregated monitoring dashboards, descriptive analytics,
SADDD analysis, beneficiary participation summaries, and data visualization
features that help users evaluate project performance, identify trends, review
project reach, and prepare monitoring outputs efficiently.

1.8 To develop rule-based alerts and decision-support recommendation
features that assist authorized users in identifying underperforming indicators,
delayed timelines, budget utilization concerns, missing follow-up records, weak
project outcome indicators, and possible actions for project improvement. The
alert workflow shall support lifecycle states such as New, Reviewed, Actioned,
Resolved, Dismissed, and Auto-resolved to reflect the handling status of each
triggered condition.
~~~

### Manuscript page 23 (PDF page 30)

~~~text
                                                                                                                 23

         1.9 To develop a controlled public project tracker and transparency reporting
         feature that allows donors, sponsors, partners, and other external stakeholders
         to view approved and non-sensitive project summaries, milestone status,
         selected progress updates, performance highlights, and approved transparency
         reports without exposing confidential beneficiary-level records, internal financial
         evidence, unapproved liquidation records, or restricted organizational data.

2. To discuss the technologies, system design approaches, and computational
methods applied in the development of PATHWAYS, namely:

         2.1 Metadata-driven data preparation using configurable forms, form fields, data
         types, required fields, validation rules, metadata mappings, source field names,
         and target system fields to support consistent processing of manually encoded
         and imported field datasets.

         2.2 Role-based access control using user roles, permissions, project
         assignment, organization-based access, audit logs, and PIN-based step-up
         authentication for sensitive modules to protect project records,
         beneficiary-related monitoring records, budget evidence, liquidation records,
         and administrative functions from unauthorized access.

         2.3 Descriptive analytics and dashboard visualization using project indicators,
         target-versus-actual values, activity completion status, participation records,
         assessment results, budget utilization, and timeline data to summarize current
         and past project performance.
~~~

### Manuscript page 24 (PDF page 31)

~~~text
                                                                                                                 24

         2.4 SADDD analysis using sex, age, and disability-related beneficiary fields to
         support inclusive monitoring of project reach, participation, and beneficiary
         distribution across demographic groups.

         2.5 Rule-based alerts and decision-support logic using predefined if-then
         conditions, thresholds, monitoring parameters, and alert lifecycle states for
         delayed activities, underperforming indicators, budget concerns,
         beneficiary-related monitoring issues, missing follow-up records, weak project
         outcome indicators, and project progress-based evaluation results.

         2.6 Controlled public visibility using approved project data, visibility settings,
         non-sensitive summaries, and role-restricted publication controls to support
         donor and stakeholder transparency without exposing confidential beneficiary
         records.

3. To evaluate the developed PATHWAYS system using selected ISO/IEC
25010:2023 software product quality characteristics and their corresponding
evaluation parameters through role-based user acceptance testing with intended
users from humanitarian and development organization workflows,
supplemented by researcher-executed technical verification using documented
test evidence for quality characteristics that cannot be adequately assessed
through user perception alone, specifically:

         3.1 To evaluate the functional suitability of the system in terms of functional
         completeness, functional correctness, and functional appropriateness in
         supporting project information management; project-level beneficiary tracking
         and evaluation; metadata-driven dataset preparation and mapping; project
~~~

### Manuscript page 25 (PDF page 32)

~~~text
                                                                                                        25

monitoring; report generation; descriptive analytics; and transparent rule-based
alerts and recommendations intended for human review and decision-making.​

3.2 To evaluate the interaction capability of the system - referred to as usability
in ISO/IEC 25010:2011 - in terms of appropriateness recognizability, learnability,
operability, user error protection, user engagement, inclusivity, user assistance,
and self-descriptiveness for intended users with different technical
backgrounds, including System Administrators, Program Managers, Grant
Managers, Project Managers, Monitoring and Evaluation Officers, and Project
Officers.​

3.3 To evaluate the security of the system in terms of confidentiality, integrity,
authenticity, accountability, non-repudiation, and resistance, as operationalized
through user authentication, organization-, project-, and role-based access
control, audit trails, protection of sensitive beneficiary, financial, and
documentary evidence records, prevention of unauthorized changes, and
controlled visibility of information through the public project tracker.
3.4 To evaluate the performance efficiency of the system in terms of time
behaviour, resource utilization, and capacity while performing normal system
operations, including data entry, dataset import, metadata mapping, dashboard
viewing, record filtering, analytics viewing, report generation, and public project
tracker access under defined test-data, browser, device, network, and workload
conditions.​
~~~

### Manuscript page 26 (PDF page 33)

~~~text
                                                                                                                 26

         3.5 To evaluate the reliability, maintainability, and flexibility of the system -
         flexibility superseding portability in ISO/IEC 25010:2023 - in terms of: (a)
         faultlessness, availability, fault tolerance, and recoverability; (b) modularity,
         reusability, analysability, modifiability, and testability; and (c) adaptability,
         scalability, installability, and replaceability, respectively, in supporting consistent
         project monitoring operations, recovery from expected interruptions, future
         system improvements, configuration for evolving project and indicator
         requirements, and deployment and access through intended modern web
         browsers, internet-enabled devices, and operating environments.
Scope and Limitations

         This study focuses on the design and development of PATHWAYS, a
web-based Project Information Management System with Rule-Based
Decision-Support for humanitarian and development organizations. The proposed
system is intended to support the organization of project, activity, beneficiary-related
monitoring, feedback, assessment, budget evidence and liquidation support, and
reporting information in a more structured digital environment. The system covers
Authentication and Profile Management, User and Access Management, Project
Information Management, Data Collection and Integration, Beneficiary Management,
Beneficiary Journey Tracking, Beneficiary-Related Monitoring Records, Monitoring,
Analytics and Evaluation, Budget Expense Entries, Reporting and Outputs, Rule-Based
Alerts, Decision-Support Recommendations, System Administration, and Public Project
Visibility. Through these functions, the system is intended to improve project-level
evaluation, beneficiary-related monitoring, reporting preparation, and timely
decision-making.
~~~

### Manuscript page 27 (PDF page 34)

~~~text
                                                                                                                 27

         The study uses the workflow context of Plan International Pilipinas as the basis
for identifying the current process, user roles, and operational issues addressed by the
system. In this context, the proposed system is intended for internal project and
monitoring users, including Program Managers, Project Managers, Project Officers,
Monitoring and Evaluation Officers, Grant Manager, and the System Administrator or
Superuser. These users are responsible for managing project records, preparing or
importing data, maintaining beneficiary information, recording participation and
feedback records, reviewing dashboards, evaluating project information, and
generating reports. The Public Project Tracker is intended to provide donors, sponsors,
partners, and other external stakeholders with controlled visibility of approved and
non-sensitive project information only. Although grounded in the workflow context of
Plan International Pilipinas, the system is conceptually designed to be adaptable to
other humanitarian and development organizations with similar project-based
monitoring, evaluation, and reporting conditions.

         However, the study has several limitations. PATHWAYS is limited to project
information management with rule-based decision-support features and is not designed
to function as a full-fledged project management platform, enterprise resource planning
system, or replacement for all existing organizational systems. It does not fully replace
specialized field data collection platforms, nor does it guarantee full real-time
synchronization or complete API-based integration with third-party systems such as
KOBO, YES!ME, or PMERL.

         The system does not evaluate beneficiaries as individuals and does not
determine whether a beneficiary has personally learned, improved, succeeded, or
failed. Beneficiary-related records such as participation history, feedback records,
~~~

### Manuscript page 28 (PDF page 35)

~~~text
                                                                                                                 28

survey responses, pre-test and post-test results, and follow-up records are handled
only as project monitoring data. These records may support project-level evaluation by
helping authorized users review project reach, activity participation, inclusion, output
achievement, and outcome indicators. Final interpretation of project effectiveness,
beneficiary outcomes, and required interventions remains the responsibility of
authorized humanitarian and development organization personnel.

         The analytical, decision-support, and recommendation functions of the system
are limited to predefined parameters, rules, thresholds, and structured criteria. These
features do not include advanced artificial intelligence, predictive machine learning, or
autonomous humanitarian decision-making. The system may generate alerts, review
prompts, and suggested actions, but the final decision, validation, and approval shall
remain under the responsibility of the humanitarian and development organization.

         Moreover, the system shall not allow beneficiaries to directly apply, register
themselves, log in, or submit personal information through PATHWAYS as public users.
Beneficiaries are treated as data subjects and beneficiary records, not as direct system
actors. Their participation records, feedback records, assessment-related records, and
follow-up information shall be encoded, imported, or reviewed only by authorized
internal users. External visibility through the Public Project Tracker is restricted to
high-level approved information and shall not expose confidential beneficiary-level
records, private assessment records, internal financial evidence, or restricted
organizational data. The overall development of the platform remains subject to the
time, technical scope, and resource constraints typical of an information technology
capstone project.
~~~

### Manuscript page 29 (PDF page 36)

~~~text
                              29

Definition of Terms

​  For clarity and consistency, the following terms are operationally defined as

they are used in this study.

   ●​ Activity Tracking. The system function that records, organizes, and monitors
       project-related activities, including their schedules, implementation status,
       milestones, and related progress details.

   ●​ Aggregated Monitoring Dashboards. Consolidated visual interfaces that
       present project indicators, participation data, progress updates, and other
       relevant information in one view to support monitoring and evaluation.

   ●​ Alert Lifecycle. This refers to the handling status of a system-generated alert
       from the time it is triggered until it is closed. In this study, alert lifecycle states
       may include New, Reviewed, Actioned, Resolved, Dismissed, and
       Auto-resolved.

   ●​ Beneficiaries. The individuals, groups, or communities who receive services,
       support, training, or interventions from humanitarian and development projects.

   ●​ Beneficiary-Level. A level of information focused on the data, records,
       characteristics, and activity history of individual beneficiaries.

   ●​ Beneficiary Journey Tracking. The process of monitoring a beneficiary’s
       participation, movement, and progression across project activities, services, or
       interventions over time.

   ●​ Beneficiary-Related Monitoring Records. These refer to project monitoring
       data connected to beneficiaries, such as participation records, feedback
       records, survey responses, pre-test and post-test results, outcome survey
       results, follow-up records, and other assessment-related records collected or
       encoded by authorized internal users. In this study, these records are not used
~~~

### Manuscript page 30 (PDF page 37)

~~~text
                                                                                                             30

    to evaluate beneficiaries as individuals. Instead, they serve as project-level
    monitoring evidence that helps authorized users review project reach, activity
    participation, inclusion, output achievement, outcome indicators, and reporting
    needs.
●​ Budget Evidence. This refers to the system-supported recording budget
    expense entries, uploading or referencing receipts, tracking liquidation status,
    verifying submitted expenses, approving or rejecting liquidation entries, and
    preparing approved transparency reports for project monitoring and reporting
    purposes.
●​ Centralized Beneficiary Profile. A structured and unified record of beneficiary
    information maintained in one system to support continuity of monitoring,
    evaluation, and beneficiary tracking.
●​ Community-Based. A condition in which project implementation, participation,
    and monitoring activities are carried out within local communities and are
    closely linked to community needs, contexts, and stakeholders.
●​ Data Collection. The process of gathering project-related, beneficiary-related,
    and monitoring-related information from forms, surveys, observations, or other
    structured sources for later processing and analysis.
●​ Data Visualization. The graphical or tabular presentation of project and
    monitoring data to make patterns, trends, and performance conditions easier to
    understand.
●​ Decision Support. The system function that assists users in interpreting
    project information and identifying possible actions, priorities, or responses
    based on organized project and monitoring data and defined project
~~~

### Manuscript page 31 (PDF page 38)

~~~text
                                                                                                             31

    parameters. In this study, decision support is intended to aid human judgment
    rather than replace it.
●​ Descriptive Analytics. The process of summarizing and presenting
    measurable project conditions such as budget utilization, target-versus-actual
    KPI results, survey score improvement, participation patterns, and timeline
    status in order to describe what is happening or what has already happened in
    a project.
●​ Digital Data Collection and Preparation. The use of digital tools and
    system-based processes to capture, organize, clean, and prepare project and
    beneficiary data for monitoring, evaluation, and reporting.
●​ Field-Based. A condition in which project activities and data collection are
    carried out in actual implementation areas or operational sites rather than only
    within an office-based environment.
●​ Humanitarian and Development Organization. An institution that designs,
    implements, and manages projects or programs intended to address social,
    economic, health, education, protection, livelihood, inclusion, or other
    development-related concerns for communities and beneficiaries.
●​ Indicator. A measurable variable or reference point used to track project
    progress, performance, outcomes, participation, or other conditions relevant to
    monitoring and evaluation.
●​ Information Technology (IT) Head & Staff. The personnel responsible for the
    technical preparation, configuration, and support of the monitoring environment,
    including assistance in data verification, metadata-related setup, dashboard
    configuration, report preparation, and system troubleshooting. In this study, the
~~~

### Manuscript page 32 (PDF page 39)

~~~text
                                                                                                             32

    term refers to the technical users who help ensure that project information can
    be processed and made usable within the system environment.
●​ Journey Stage Configuration. This refers to the system function that allows
    authorized users to define project journey stages, map activities to stages,
    configure stage order, identify branching paths, and handle terminal or
    open-ended follow-up stages for beneficiary journey tracking.
●​ KOBO. The digital field data collection platform used in the study context for
    collecting beneficiary registration forms, surveys, assessments, and other
    structured field data. In this study, the term refers to the KOBO Tool or
    KoboCollect environment used for project data capture.
●​ Metadata. Structured information that describes the meaning, format, attributes,
    and relationships of data elements, allowing data to be recognized, organized,
    mapped, and processed more consistently across systems.
●​ Metadata-Driven Data Integration. The system process of organizing,
    mapping, and preparing collected data by using metadata structures so that
    datasets can be more efficiently processed for monitoring, evaluation,
    dashboards, and reporting.
●​ Monitoring. The continuous process of tracking project implementation,
    activities, participation, indicators, and progress to determine whether
    operations are proceeding as intended.
●​ Monitoring and Evaluation (M&E) Staff. The personnel responsible for
    reviewing collected datasets, verifying information, monitoring indicators,
    conducting data auditing, and evaluating project and program performance. In
    this study, they are also among the primary users who interpret project
~~~

### Manuscript page 33 (PDF page 40)

~~~text
                                                                                                             33

    information and prepare monitoring outputs and reports based on collected and
    processed data.
●​ PATHWAYS. The proposed system developed in this study, formally identified
    as A Metadata-driven Project Information Management with Rule-based
    Decision-support for Humanitarian and Development Organizations.
●​ Plan International Pilipinas. The humanitarian and development organization
    used in this study as the concrete organizational setting and process basis for
    examining the workflow problems addressed by the proposed system.
●​ PIN-Based Step-Up Authentication. This refers to an additional authentication
    step required before accessing sensitive system modules or restricted records.
    In this study, PIN-based step-up authentication supports role-based access
    control by adding another layer of verification for sensitive beneficiary-related
    records, budget evidence, and restricted workflow actions.
●​ Program Manager. The managerial user responsible for reviewing broader
    project and program performance, interpreting monitoring outputs, and
    supporting decision-making across projects or initiatives. In this study, the term
    refers to users who rely on organized project information, summaries, and
    reports for managerial and operational review at a broader level than a single
    project.
●​ Program Monitoring, Evaluation, Research, and Learning (PMERL). The
    higher-level organizational environment or system used for broader
    performance monitoring, reporting, and learning functions beyond project-level
    operational use.
●​ Project Activities. The specific tasks, events, sessions, interventions, or
    implementation actions carried out under a project in order to achieve its
~~~

### Manuscript page 34 (PDF page 41)

~~~text
                                                                                                             34

    objectives and intended outputs. In this study, project activities are among the
    operational elements that must be organized, tracked, and linked to timelines,
    milestones, and beneficiary progress within the proposed system.
●​ Project Information. The collection of structured details related to a project,
    such as objectives, timelines, milestones, activities, indicators, beneficiary
    records, outputs, progress status, and related monitoring and evaluation data.
●​ Project Information Management. The organized handling of project-related
    data and records to support storage, access, updating, monitoring, evaluation,
    reporting, and decision-making.
●​ Project-Level. A level of information focused on a specific project’s
    implementation, indicators, activities, outputs, progress, and performance
    conditions.
●​ Project Manager. The managerial user responsible for reviewing project
    datasets, monitoring project implementation, checking accomplishment and
    progress outputs, and using dashboards and reports for project-level monitoring
    and decision-making. In this study, the term refers to users who directly oversee
    the status and performance of specific projects through organized project
    information and monitoring outputs.
●​ Project Profile. A structured record within the system that contains the
    essential details of a project, including its title, objectives, timelines, milestones,
    indicators, status, and related implementation information.
●​ Project Recommendation. A suggested project-related course of action,
    continuation direction, improvement option, or review prompt generated from
    defined rules, structured criteria, and project performance conditions such as
~~~

### Manuscript page 35 (PDF page 42)

~~~text
                                                                                                             35

    budget, KPI results, survey improvement, or timeline status. In this study,
    project recommendations are intended for human review and decision-making.
●​ Public Project Tracker for Donors. A controlled system view that allows
    donors or sponsors to access approved and limited project information, such as
    project descriptions, milestones, progress updates, selected indicators, and
    accomplishment summaries.
●​ Role-Based Access Control. A security mechanism that restricts system
    access and functions according to the responsibilities and permissions
    assigned to each user role.
●​ Rule-Based Alerts for Underperforming Indicators. System-generated
    notifications triggered by predefined conditions showing that certain indicators,
    activities, budget-related measures, or timeline-related measures are delayed,
    weak, or below expected levels.
●​ SADDD Analysis. The analysis of Sex, Age, and Disability Disaggregated Data
    to examine participation, reach, and project-related conditions across different
    demographic groups.
●​ Stakeholders. The individuals, groups, or institutions that have an interest in,
    responsibility for, or relationship to the project, including implementers,
    managers, beneficiaries, donors, and other concerned parties.
●​ System Administrator or Superusers. Users with higher-level administrative
    or privileged access, particularly within broader organizational systems, who are
    authorized to manage advanced controls, configurations, and reporting
    functions.
~~~

### Manuscript page 36 (PDF page 43)

~~~text
                                                                                                             36

●​ Web-Based. A system characteristic in which the platform is accessed through
    a web browser over a network or internet connection rather than through a
    purely locally installed application.

●​ Youth Employment Solutions Monitoring and Evaluation (YES!ME). The
    monitoring dashboard environment used in the study context for reviewing
    datasets, validating information, visualizing indicators, and generating project
    monitoring outputs at the operational level.
~~~

</details>

## Complete Chapter 2 source text

<details>
<summary>Expand Chapter 2 transcript (PDF pages 44-66)</summary>

### Manuscript page 37 (PDF page 44)

~~~text
                                                                                                                 37

                                              Chapter 2
                REVIEW OF LITERATURE, STUDIES, AND SYSTEMS​

Humanitarian Accountability and Project Information Management
         The foundation of humanitarian work is built on the idea that managing

information is a key part of accountability, rather than just an extra administrative task.
Humanitarian and development organizations handle complex social issues like health,
education, and livelihood, which require constant oversight. Because these projects
often use external funding, they operate in strict environments where they must report
to many different groups, including donors, partner agencies, and the communities they
serve. Crawford and Bryce (2003) explain that aid agencies must satisfy these strict
reporting requirements because projects are answerable to multiple stakeholders.
Hamad et al. (2025) further emphasize that the real value of an information system is
its ability to turn simple project records into information that is easy to access and helps
people make timely management decisions. If this information is delayed or hard to
understand, project teams will struggle to judge project conditions or keep their
interventions going effectively.

         A major challenge in this sector is that general project management software is
often not enough for the unique needs of non-governmental organizations (NGOs).
Golini and Landoni (2014) argue that NGOs work with limited resources and high
uncertainty, which basic commercial tools are not designed to handle. Even with these
challenges, using formal management practices is still a very important part of project
success. Golini et al. (2015) found that adopting these practices leads to better results,
while Ika and Donnelly (2017) emphasize that success in capacity-building depends on
specific conditions like collaboration, adaptation, leadership, and constant monitoring.
~~~

### Manuscript page 38 (PDF page 45)

~~~text
                                                                                                                 38

         The humanitarian monitoring and evaluation guidance of the International
Federation of Red Cross and Red Crescent Societies (2011) emphasizes that project
and programme M&E should cover the entire information lifecycle, including identifying
stakeholder needs, planning data collection, data analysis, and reporting. While this
framework provides a solid foundation, traditional tracking methods often struggle to
manage this data cycle efficiently due to fragmented data sources and slow reporting
times. To address these operational challenges, modern organizations rely on
technology-driven tools. As Inisha and Elly (2022) explain, robust M&E systems are
essential for improving accountability, transparency, and data-driven decision-making in
project management. Rather than treating evaluation as a passive, post-project task,
digital platforms use analytics to create feedback loops. This capability ensures that
field data can be quickly used for immediate course corrections and better resource
allocation. Additionally, successful project tracking depends heavily on stakeholder
involvement. By actively engaging field teams, funding bodies, and communities,
technology-driven systems foster institutional ownership and provide tailored reporting
that strengthens overall program effectiveness.

         The recent Philippine project information management practice provides a
closer local basis for this theme. The Department of Social Welfare and Development
Field Office X (2023) described KALAHI-CIDSS monitoring and evaluation work in
which municipal database managers were trained to strengthen data management,
ensure quality data encoding, check inconsistencies, and use the KALAHI-CIDSS
Project Information Management System (PIMS) as part of monitoring and evaluation
practice. The same source connects accurate and complete data with data-driven
decisions, improved project management, and assessment of outcomes. At a broader
government-project level, the Public-Private Partnership Governing Board (2025)
~~~

### Manuscript page 39 (PDF page 46)

~~~text
                                                                                                                 39

established a responsive Project Information Management System (PIMS) for PPP
projects as a central repository of project information and documents, with modules for
project approvals, monitoring, virtual data rooms, report generation, analytics, access
rights, and data security. These local sources collectively clarify that project information
management is not the same as generic project management software; rather, it
represents a specialized discipline. While the DSWD (2023) case emphasizes the
operational rigor required for data quality, encoding, and monitoring evidence, the PPP
(2025) framework adds the necessary technical infrastructure for document
repositories and role-based access. Together, they define PIM as the organized
handling of information, documents, and reporting evidence throughout the project
cycle.

         Taken together, this literature and the local Philippine PIMS examples justify the
inclusion of project profiles, activity tracking, milestones, implementation status, target
tracking, project records, report-ready outputs, and project-level performance
summaries in humanitarian and development information systems. The discussion also
positions the proposed platform as a project information management and monitoring
environment rather than a simple dashboard or a project management scheduling tool.
Since donor accountability also shapes humanitarian work, van Voorst et al. (2022) add
further justification for report-ready outputs and controlled donor visibility by showing
that large donors rely on evaluative project data when assessing humanitarian aid
NGOs.​

Field Data Collection and Post-Collection Data Preparation
         Digital field data collection tools are valuable in community-based work because

they allow field staff to capture structured records outside a traditional office setting.
~~~

### Manuscript page 40 (PDF page 47)

~~~text
                                                                                                                 40

KoboToolbox (2025) explains that KoboCollect allows users to download forms, collect
responses without an internet connection, save drafts, finalize forms, and upload
submissions when connectivity becomes available. Roberts et al. (2023) likewise noted
that tools such as ODK, KoboToolbox, SurveyCTO, Ona, and CommCare are widely
used in challenging environments because they support offline-capable data collection
and structured electronic forms. These features help organizations gather beneficiary
registration records, surveys, assessments, and monitoring responses in field
conditions.

         At the same time, the literature shows that collecting data digitally does not
automatically make information ready for monitoring and decision-making. Roberts et
al. (2023) observed that many mobile electronic data collection tools lack built-in
mechanisms for verifying beneficiary identity or linking records over time, which can
affect longitudinal tracking. Danquah et al. (2019), in their mobile application for Ebola
contact tracing, showed that digital tools can improve completeness, accuracy,
validation, storage, and repeated-visit handling when they are designed around
monitoring workflows rather than simple form capture. Their work also shows that field
systems still require attention to training, connectivity, device reliability, and operational
fit.

         These studies help frame the workflow problem addressed in the present study:
field data may already be collected digitally, but the main difficulty appears after
collection. A monitoring platform does not need to replace KOBO or other field data
collection tools to be useful; rather, it must support the post-collection stage in which
records are organized, mapped, validated, linked to project structures, and converted
into dashboards, evaluation outputs, alerts, and reports. The literature therefore
supports an information layer that bridges field data capture and project-level use.
~~~

### Manuscript page 41 (PDF page 48)

~~~text
                                                                                                                 41

Metadata-Driven Integration and Interoperability
         Interoperability literature shows that monitoring systems become more useful

when data structures, meanings, and workflows are coordinated across tools. The
World Health Organization (2021) emphasized that digital systems should be
developed through integrated strategies that align human, organizational, financial, and
technological resources. The World Health Organization (2023) also highlighted the
value of standards-based approaches, including standardized indicators, analyses,
dashboards, and visualizations for data use. Similarly, the WHO SMART Guidelines
promote reusable digital components such as interoperability standards, algorithms,
technical specifications, and code libraries that support more consistent data sharing
and indicator computation (World Health Organization, n.d.).

         The role of metadata is central to this issue. Ulrich et al. (2022) described
metadata as structured information that creates a shared understanding of data and its
context. Shukair et al. (2013) argued that common metadata, reusable schemata,
taxonomies, and codelists can reduce divergent interpretations and improve system
integration. Sinaci and Laleci Erturkmen (2013) further showed that metadata registries
make common data elements referenceable, queryable, and reusable, while Davies et
al. (2020) explained that semantic interoperability depends on representing real-world
meaning and contextual metadata. These studies support the idea that systems should
not only transfer fields but also preserve what those fields mean.

         In practical monitoring environments, reusable metadata structures can reduce
repeated setup. Torab-Miandoab et al. (2023) found that poor interoperability between
information systems can produce redundant, disorganized, inaccessible, and wasteful
information flows. Thalhath et al. (2025) added that metadata application profiles can
improve interoperability and reuse by making semantics explicit and
~~~

### Manuscript page 42 (PDF page 49)

~~~text
                                                                                                                 42

machine-actionable. DHIS2 provides an applied example: its integration resources
distinguish between integration and interoperability, while its health data toolkit offers
metadata packages with preconfigured data elements and indicators that can be
adapted for implementation settings (DHIS2, n.d.-a, n.d.-b).

         A humanitarian-specific data standard also strengthens this argument. The
United Nations Office for the Coordination of Humanitarian Affairs (2022) describes the
Humanitarian Exchange Language as a standard that speeds up data processing and
supports interoperability across data sources. Although the present study does not
require a full humanitarian data-exchange standard as a separate framework, this
source supports the broader design principle that humanitarian data become more
useful when they are structured, tagged, and prepared in ways that improve processing
and interpretation. Holeman et al. (2024) likewise found that community health
information systems are expected to support common features, multiple user roles,
routine reporting, referrals, and interoperability use cases. Together, these works justify
metadata-driven data preparation that can make recurring project setup more
consistent and reduce repeated dashboard configuration.

Beneficiary Journey Tracking and Inclusive SADDD Monitoring
         Humanitarian and development projects often need to understand not only how

many activities were conducted but also who participated, which groups were reached,
and how beneficiaries moved through activities over time. Beneficiary record
management is therefore necessary for project continuity. Roberts et al. (2023) showed
that mobile data collection tools may capture submissions effectively but may still
struggle to link beneficiary records longitudinally. This supports the need for systems
~~~

### Manuscript page 43 (PDF page 50)

~~~text
                                                                                                                 43

that can maintain continuity between beneficiary profiles, activity participation, and
project-level monitoring records.

         Inclusive monitoring strengthens this need because aggregate data can hide
differences in access, participation, and benefit. Benelli et al. (2012) argued that sex-
and age-disaggregated data improve humanitarian response by showing how women,
men, girls, boys, adults, and older people experience crises differently. UNICEF,
Humanity & Inclusion, and the International Disability Alliance (2019) emphasized that
disability-disaggregated data are necessary across preparedness, needs assessment,
planning, implementation, monitoring, and evaluation, yet such data remain scarce and
inconsistently used in humanitarian settings. The Washington Group on Disability
Statistics (2025) provides a structured child functioning module for humanitarian
contexts, illustrating how disability-related information can be collected more
consistently and adapted to different operational stages.

         Philippine systems also show the importance of disaggregated and
beneficiary-oriented records. The Community-Based Monitoring System is legally
intended to generate updated and disaggregated data for beneficiary targeting, poverty
analysis, needs prioritization, policy and intervention design, and impact monitoring
(Philippine Statistics Authority, n.d.). DSWD Listahanan is likewise described as an
information management system that identifies who the poor are and where they are
located and provides a database for social protection stakeholders (Department of
Social Welfare and Development, n.d.). These systems reinforce the need for
centralized beneficiary profiles, beneficiary journey tracking, and SADDD analysis
when project teams evaluate reach, inclusion, and progress across activities.
~~~

### Manuscript page 44 (PDF page 51)

~~~text
                                                          44

Monitoring Dashboards, Descriptive Analytics, and Evaluation for Project
Performance

   Dashboards become useful when they help users understand information and

perform actual monitoring tasks. Almasi et al. (2023) found that dashboard usability

depends on criteria such as usefulness, operability, learnability, ease of use, task

suitability, situational awareness, satisfaction, interface quality, content, and system

capability. Nadj et al. (2020) also showed that interactive analytical dashboard features

can affect situation awareness and task performance. Siette et al. (2023) found that

dashboard acceptance depends on how information is displayed, whether features

match user needs, and whether users can fit the dashboard into their routines. These

findings show that dashboards should be designed around user roles and monitoring

responsibilities rather than visual presentation alone.​

​  It is also important for dashboards to be actionable. Stahlman et al. (2025)

argued that many dashboards focus too much on passive surveillance of data instead

of supporting actual decision-making and operational response. In project-based

environments, dashboards should assist project officers, managers, and donors in

interpreting field records, identifying implementation gaps, and responding to

performance issues using evidence-based insights. To support this process, descriptive

analytics is integrated into monitoring systems to summarize historical and current

project data through statistical aggregation, trend analysis, comparative reporting, and

data visualization techniques such as charts, graphs, KPI summaries, and performance

dashboards (Liu et al., 2023).​

​  From a technical perspective, descriptive analytics enables the system to

transform raw project records into structured monitoring outputs that support evaluation

and organizational decision-making. Tableau (n.d.) explained that descriptive analytics
~~~

### Manuscript page 45 (PDF page 52)

~~~text
                                                                          45

operates through processes such as data collection, cleaning, aggregation,

segmentation, historical trend analysis, and visualization. In the context of project

monitoring, these processes allow the system to organize records from attendance

sheets, accomplishment reports, financial documents, surveys, and field submissions

into measurable indicators that reflect project progress and operational performance.

Similarly, Domo (2025) emphasized that descriptive analytics supports organizations by

converting raw operational data into interactive dashboards, reports, and KPIs that

improve monitoring efficiency and performance tracking.​

​  Within the proposed system, descriptive analytics may be used to summarize

project records into indicators such as activity completion rates, budget utilization,

beneficiary participation, document submission compliance, and project

accomplishment percentages. Historical trend analysis may also support comparisons

of monthly or quarterly project performance, which can help managers review

implementation progress and observe possible delays, resource constraints, or

variations in participation over time. Statistical techniques such as frequency analysis,

measures of central tendency, standard deviation, and cross-tabulation can further help

summarize project conditions and identify patterns across different locations, activities,

or beneficiary groups (Domo, 2025). These analytical summaries allow project

managers and donors to evaluate whether implementation targets are being achieved

and whether interventions are producing meaningful operational results.​

​  Interactive dashboards strengthen this process by allowing users to filter, drill

down, and visualize indicators dynamically according to project type, reporting period,

location, or stakeholder role. Instead of manually reviewing spreadsheets and narrative

reports, users can monitor performance indicators through visual summaries and

KPI-based reporting. De Jesus and Buenas (2023) demonstrated how interactive
~~~

### Manuscript page 46 (PDF page 53)

~~~text
                                                                              46

charts and flexible key performance indicators (KPIs) can be used in the Philippines to

monitor programs and activities effectively. Few (2019) further emphasized that

dashboards should present critical information clearly and efficiently to support

at-a-glance monitoring and decision-making. This approach improves monitoring

efficiency because decision-makers can quickly identify implementation issues,

deliverables, and performance deviations without extensive manual analysis.​

​  To support scalability and adaptability, the system relies on a metadata-driven

architecture, which separates monitoring rules and reporting structures from hardcoded

application logic. Shrivastava (2024) explained that metadata-driven systems optimize

data platforms by defining project structures, indicators, relationships, and

transformation rules through configurable metadata instead of fixed software code. In

this setup, metadata defines how project records are categorized, validated, mapped,

and transformed into monitoring outputs. This enables the system to automatically

adjust dashboards, summaries, and reports whenever project indicators or evaluation

requirements change, reducing the need for manual redevelopment.​

​  The integration of metadata-driven processing with descriptive analytics also

improves standardization across multiple projects and reporting environments. During

data ingestion, metadata definitions guide the system in mapping records from different

sources into standardized indicators and KPI categories. This ensures consistency in

how monitoring data is interpreted, aggregated, and visualized across projects. As a

result, dashboards and evaluation reports can be generated more efficiently while

minimizing technical intervention and reducing inconsistencies in reporting outputs

(Shrivastava, 2024).​

​  Project evaluation should also align with recognized professional standards to

ensure that monitoring outputs remain meaningful and evidence-based. The OECD
~~~

### Manuscript page 47 (PDF page 54)

~~~text
                                                           47

(2021) provides a widely used evaluation framework based on relevance,

effectiveness, efficiency, impact, and sustainability. These criteria emphasize that

monitoring systems should not only track completed activities but also assess whether

projects create measurable outcomes and long-term value. Guerra-Lopez and Hicks

(2015) explained that effective monitoring systems should provide continuous feedback

mechanisms that guide organizational action and performance improvement. Similarly,

Liberati et al. (2020) emphasized that selecting appropriate indicators is essential for

evaluating whether programs achieve intended objectives.​

​  Evaluation should also examine deeper organizational outcomes, particularly in

capacity-building and training interventions. O’Malley et al. (2013) and Saleh et al.

(2022) argued that evaluation should move beyond attendance counts and focus on

learning outcomes, behavioral improvement, and organizational change. Through

descriptive analytics, the system can summarize training participation records,

compare pre- and post-activity performance indicators, analyze completion trends, and

generate detailed performance summaries that support evidence-based evaluation. By

integrating descriptive analytics, interactive dashboards, metadata-driven architectures,

and internationally recognized evaluation standards, the proposed information system

can transform administrative records into actionable organizational intelligence that

supports project monitoring, operational evaluation, donor reporting, and long-term

sustainability assessment.

Rule-Based Alerts, Decision Support, and Human-Guided Action
Recommendations

         Monitoring information is most valuable when it identifies specific actions
needed to improve project results. Wissuchek and Zschech (2025) describe
prescriptive analytics as the most advanced level of data use, designed to guide the
~~~

### Manuscript page 48 (PDF page 55)

~~~text
                                                                                                                 48

best course of action by considering various factors and constraints to achieve a
desired outcome. In the management of social initiatives—such as technical-vocational
skills training—this does not require fully autonomous artificial intelligence. Instead, it
can be designed as rule-based support that uses defined thresholds, targets, and
progress levels to flag concerns and suggest next steps. Wissuchek and Zschech
(2025) explain that these systems can support organizational decisions through
different relationships, including advisory, executive, adaptive, and self-governing roles.
A system for managing vocational programs is best aligned with the advisory role
because it is intended to assist users in identifying interventions rather than replacing
their professional judgment.

           The move toward decision-support is necessary because of the high mental
demands placed on program staff. An average adult makes approximately 35,000
decisions per day, which can lead to "decision fatigue," a state where the speed and
quality of decisions decline over time (ReachLink, 2026). According to Choudhury and
Saravanan (2026) and Comes (2016) found that high workloads and having to choose
between many different alternatives make this mental exhaustion worse, often leading
to "cognitive biases" and errors. Furthermore, digital environments often create
"extraneous load" through cluttered interfaces or constant notifications that force the
brain to work harder without adding value. By delegating some of this mental
processing to structured rules, organizations can significantly reduce the "cognitive
effort" required of their staff. This frees up mental capacity for the high-level reasoning
needed to ensure a project’s long-term success.

         To set up effective rule-based alerts for underperforming indicators, a system
must first establish clear measures of success. According to the Environmental
Protection Agency (2010), every performance measure should include a baseline (the
~~~

### Manuscript page 49 (PDF page 56)

~~~text
                                                                                                                 49

current state), a target (the desired level), and a timeline (the goal date). Using "if-then"
logic, the system can automatically trigger notifications when an indicator—such as a
student’s assessment scores or a project’s budget utilization—falls below these
predefined thresholds. This ensures that weak performance is detected early, allowing
project teams to make immediate course corrections rather than waiting for a
post-project evaluation. Haber et al. (2026) demonstrate that such rule-based filtering
can also improve reliability by automatically excluding resources or options that do not
meet mandatory safety or eligibility requirements.

         System-generated recommendations are set up by formalizing professional
knowledge into structured rules and facts. Rahman and El-Gayar (2025) establish that
social welfare initiatives operate within a complex environment involving at least 61
distinct decision factors, ranging from organizational goals to staff availability. To
manage this, Haber et al. (2026) suggest using a rule-based expert system that
evaluates multiple combinations of resources and ranks them to recommend the most
suitable allocation for each order. These systems act as a consultant, guiding users by
leveraging expert knowledge to solve complex problems. This ensures that decisions,
such as selecting follow-up interventions for beneficiaries, are based on logical
evidence rather than subjective impressions, making the process more objective and
justifiable to donors and communities.

         While these quantitative tools provide essential benefits, the literature
emphasizes that they must be balanced with human reasoning to avoid critical failures.
There is a significant risk of "automation bias," where users place too much trust in
system outputs and stop checking for errors. Goddard et. al. (2012) found that
decision-support tools can introduce new mistakes when people over-rely on
automated suggestions instead of thinking critically. Geairon (2026) also warns that by
~~~

### Manuscript page 50 (PDF page 57)

~~~text
                                                                                                                 50

translating complex realities into models and scores, systems can create an "illusion of
precision" and objectivity that may not exist. Over-reliance on these outputs can lead to
a condition described as "looking at the world through a straw," where a manager’s
perspective is limited only to the small set of options or targets the system chooses to
display. To mitigate these risks, the literature suggests a "human-in-the-loop"
framework where the system serves as a partner rather than a replacement. Protection
of program quality depends less on technical performance than on the human
judgment with which these tools are used. Therefore, rule-based alerts and
recommendations should be presented as explainable advisory or decision-support
prompts. Authorized personnel must still review the local context, community needs,
and ethics before taking final action. By maintaining this balance, organizations can
leverage the speed of prescriptive analytics without undermining the context-sensitive
reasoning and accountability required in social welfare work.​

Criteria-Based Project Recommendation and Future Intervention Planning
         Strategic decision support assists users in moving beyond simple monitoring to

identifying the next logical steps for project success. Roy and Dutta (2022) described
recommender systems as tools that act as filters to help users navigate large
information spaces and identify the most relevant options. While these are often
associated with commercial platforms, Ko et al. (2022) demonstrated that
recommendation features can be implemented through diverse techniques depending
on the organization's needs and data availability. For the management of social
initiatives—such as technical-vocational skills training—this does not require
autonomous artificial intelligence; instead, it is best implemented as a rule-based
support that leverages professional knowledge and defined parameters.
~~~

### Manuscript page 51 (PDF page 58)

~~~text
                                                                                                                 51

         For organizational decision-making where data may be limited or specific to
new contexts, a Knowledge-Based Recommender System (KBRS) is the most
appropriate approach. Unlike models that rely on user-behavior patterns, a rule-based
KBRS uses predefined semantic rules and constraints to suggest actions (Uta et. al.,
2024). This methodology is particularly effective for managing unique project scenarios
because it is immune to the "cold-start" problem, allowing it to provide guidance even
when extensive historical data is not yet available for a new region or beneficiary
group. By using structured logic to query project records, the system can proactively
suggest whether a project should be continued, redesigned, or followed up with a new
intervention.

         Using specific criteria to plan strategic interventions is a well-established
practice for handling resource scarcity. Ghasemzadeh and Archer (2000) explained
that choosing the right project portfolio is difficult because organizations face limited
resources, multiple criteria, and various risks. To address this complexity, Marques et
al. (2022) found that utilizing multicriteria decision support significantly reduces the
"cognitive effort" or mental workload required of managers during evaluation cycles.
This ensures that resource allocation is objective, justifiable to donors, and based on
logical evidence rather than subjective intuition.

         This function transforms observed conditions into future roadmaps. The inputs
for these rules include evaluation outputs, KPI status, participation patterns, and survey
outcomes. The system applies trigger rules to these conditions to suggest specific next
actions. For example, if a vocational program shows low target achievement but high
beneficiary need, the logic can trigger a "project redesign" prompt to improve usability.
Conversely, high success rates combined with growth opportunities can trigger a
"continuation" or "follow-up intervention" recommendation. By remaining transparent
~~~

### Manuscript page 52 (PDF page 59)

~~~text
                                                                                                                 52

and criteria-based, these recommendations help users understand the logic behind a
suggestion, fostering institutional trust.

         A fundamental limitation of this is that the system remains strictly human-led. It
acts as an advisory or decision-support tool that recommends actions but does not
make final decisions. Literature on "automation bias" warns that over-reliance on
system-generated suggestions can lead users to stop critically checking for errors. For
this reason, recommendations are presented as explainable advisory prompts, such as
"project review notes" and "priority flags". Authorized personnel must still review all
suggested actions based on their professional experience and the local community
context, ensuring that humans remain the final responsible authority for every
intervention.​

Stakeholder Transparency, Donor Visibility, and Public Project Tracking
         Humanitarian and development organizations are accountable not only to

internal managers but also to donors, partner institutions, and the communities they
serve. Van Voorst et al. (2022) showed that humanitarian aid NGOs are shaped by
accountability relationships with large donors, who rely on evaluative information to
assess project results. This supports the need for report-ready outputs, selected project
progress summaries, and controlled stakeholder visibility. Transparency, however,
should be balanced against privacy and role-appropriate access, as project information
may include sensitive beneficiary data.

         The value of structured transparency is also reflected in the International Aid
Transparency Initiative (n.d.), which provides a data standard for publishing useful
development and humanitarian data and describes transparency as a way to improve
coordination, accountability, and effectiveness. This is relevant to a controlled public
~~~

### Manuscript page 53 (PDF page 60)

~~~text
                                                                                                                 53

project tracker because external visibility should not expose all internal records; it
should provide selected, organized, and understandable project information that
stakeholders can use for visibility and accountability.

         Philippine public systems provide useful local examples of project visibility and
monitoring. The DILG SubayBAYAN system is an online platform for real-time
monitoring and reporting of infrastructure projects implemented by local government
units and presents information through text, charts, and graphs for analysis
(Department of the Interior and Local Government, n.d.). Project DIME, or Digital
Information for Monitoring and Evaluation, was developed to use technologies such as
satellites, drones, and geotagging to monitor and evaluate the status, progress, and
activities of big-ticket government projects (Department of Budget and Management,
n.d.). The Open Government Partnership (n.d.) also identifies Project DIME as a
commitment relevant to transparency and public service delivery. These systems
support the value of a donor-facing project tracker, while also showing that a
humanitarian and development platform should be adapted to NGO project contexts
rather than copied from infrastructure monitoring.

Human-Centered, Sustainable, and Scalable Web-Based Implementation
         The long-term usefulness of a digital system depends on its fit with people,

workflows, and infrastructure. Labrique et al. (2018) found that digital health projects in
low- and middle-income countries achieve scale and sustainability when they address
a real need, involve users and stakeholders, use simple and adaptable technical
design, operate within supportive policy environments, and consider available
infrastructure. Kaboré et al. (2022) similarly identified infrastructure, internet access,
equipment, staff competence, motivation, stakeholder involvement, and trust as
~~~

### Manuscript page 54 (PDF page 61)

~~~text
                                                                                                                 54

important barriers and facilitators for digital health sustainability. Although these studies
come from digital health, their implementation lessons apply to humanitarian and
development information systems because both operate in resource-sensitive and
field-based environments.

         Human-centered implementation is especially important when users have
different roles and technical capacities. Thomas et al. (2023) argued that digital
systems often fail to scale when they do not address user needs or fit real work
settings. Their Vinyasa Tool highlights the need to examine workflow, roles, information
needs, privacy, security, interoperability, adoption behavior, and technical support
before deployment. This supports a role-based web platform that can be used by
project officers, M&E staff, managers, and donor-facing users without unnecessary
technical complexity.

         Open-source and modular systems also demonstrate how platforms can
support scale while remaining adaptable. openIMIS (n.d.) describes itself as a modular,
customizable, and scalable platform that manages complex data flows involving
beneficiaries, providers, and payers while supporting recognized information exchange
standards. This example supports the design principle that a web-based monitoring
platform should not be over-specialized for only one workflow, but should use
configurable structures, reusable templates, and maintainable access controls so that it
can remain practical for different humanitarian and development project settings.

Related Systems in the Philippine Context
         Several existing systems in the Philippines establish a strong local foundation

for centralized project information and decision support. The Community-Based
Monitoring System (CBMS) demonstrates that updated and disaggregated data are
~~~

### Manuscript page 55 (PDF page 62)

~~~text
                                                                                                                 55

essential for identifying community needs, designing interventions, and monitoring
actual project impact (Philippine Statistics Authority, n.d.). Similarly, DSWD Listahanan
serves as a structured beneficiary database that helps social protection stakeholders
identify exactly who and where the poor are located (Department of Social Welfare and
Development, n.d.). These government-led systems reinforce the importance of
maintaining organized beneficiary records and using evidence-based targeting within
the Philippine setting.

         Government platforms for infrastructure and public service provide relevant
benchmarks for project transparency and oversight. The DILG SubayBAYAN system
supports the real-time monitoring and reporting of local infrastructure projects through
an online platform that uses visual information displays (Department of the Interior and
Local Government, n.d.). DBM Project DIME illustrates the use of modern technologies
to monitor and evaluate big-ticket government projects, while the Open Government
Partnership presents it as a Philippine commitment connected to transparency and
public service delivery (Department of Budget and Management, n.d.; Open
Government Partnership, n.d.). These systems justify the inclusion of public project
tracker, while also showing that the present study remains distinct because it focuses
on humanitarian and development projects involving beneficiaries, activities, indicators,
inclusion, and donor accountability.

         Other Philippine project information initiatives, such as the KALAHI-CIDSS
Project Information Management System and the PPP Center's Project Information
Management System, further show the local relevance of centralized project records,
monitoring information, data-quality practices, controlled access, and project reporting
in public and development-oriented project environments (Department of Social
~~~

### Manuscript page 56 (PDF page 63)

~~~text
                                                                                                                 56

Welfare and Development Field Office X, 2023; Public-Private Partnership Governing
Board, 2025).

         Two local academic and health-related systems also support the proposed
analytics and decision-support direction. RabDash DC, supported by DOST-PCHRD, is
a rabies data analytics dashboard that consolidates data and includes decision-support
tools that generate recommendations for targeted vaccination campaigns and
community awareness efforts (Philippine Council for Health Research and
Development, n.d.). De Jesus and Buenas (2023) developed descriptive analytics and
interactive visualizations for monitoring extension services programs, projects, and
activities, while Dizon and Sonza (2023) developed a project monitoring system with
decision support for a university infrastructure office. These systems show that
dashboards, analytics, and decision-support features are already relevant in Philippine
IT research and public service contexts. The present study extends this direction by
combining these functions with metadata-driven data preparation, beneficiary journey
tracking, SADDD analysis, role-based access, and controlled donor visibility for
humanitarian and development organizations.​

Synthesis of the Study
         The reviewed literature shows that project information is central to humanitarian

and development work because projects must be planned, implemented, monitored,
evaluated, reported, and justified to multiple stakeholders. Studies on aid project
monitoring, NGO project management, development project success, and donor
accountability support the need for a system that can organize project profiles,
activities, milestones, targets, performance summaries, and reporting outputs. Recent
Philippine PIM references from KALAHI-CIDSS and the PPP Center further show that
~~~

### Manuscript page 57 (PDF page 64)

~~~text
                                                                                                                 57

project information management is treated as a structured practice for centralizing
project data, maintaining data quality, managing access, generating reports, and
supporting monitoring across project stages. This establishes the foundation for a
project information management and decision-support system rather than a
dashboard-only solution.

         The literature also shows that digital data collection is only one part of the
monitoring process. Tools such as KoboCollect and related mobile data collection
platforms are useful for offline field data capture, but post-collection data still need to
be organized, linked, mapped, validated, summarized, and interpreted. Metadata and
interoperability studies explain how reusable data structures, common semantics,
metadata registries, and application profiles can reduce repeated configuration and
improve consistency across systems. These findings support metadata-driven data
preparation especially in workflows where collected field data must become usable for
dashboards, reports, and evaluation outputs.

         The review further shows that beneficiary-centered and inclusive monitoring
requires more than counting activities. Literature on beneficiary linkage, sex- and
age-disaggregated data, disability-disaggregated data, and Philippine beneficiary
information systems supports centralized beneficiary profiles, beneficiary journey
tracking, and SADDD analysis. Dashboard, descriptive analytics, and evaluation
literature also shows that monitoring outputs must be usable, actionable,
role-appropriate, and based on meaningful indicators and recognized evaluation
criteria. Local studies and systems such as MET Online Services, RabDash DC,
SubayBAYAN, Project DIME, CBMS, Listahanan, KALAHI-CIDSS PIMS, and the PPP
Center PIMS show that project information practices, project monitoring, data
~~~

### Manuscript page 58 (PDF page 65)

~~~text
                                                                                                                 58

visualization, beneficiary information, transparency, and decision-support functions are
already relevant in Philippine public service and research contexts.

         At the same time, the literature clarifies the limits that the proposed system
must observe. Prescriptive analytics and recommender systems can support users by
generating alerts, action suggestions, and future project recommendations, but these
outputs should remain decision-support, rule-based, transparent, and subject to human
review. Automation bias literature shows that users may over-rely on automated
recommendations if controls are weak. These sources support the study's limitation
that the system will not replace human judgment, will not use advanced artificial
intelligence or predictive machine learning, and will not expose full internal data to
external stakeholders.

         Taken together, the reviewed literature reveals the main gap addressed by the
present study. Existing literature and systems support project information management,
project monitoring, field data collection, metadata standards, humanitarian data
interoperability, dashboards, beneficiary databases, disaggregated data, decision
support, recommender systems, privacy, security controls, evaluation criteria, and
transparency. However, these areas are often treated separately or implemented in
sector-specific systems such as public infrastructure monitoring, PPP oversight, health
surveillance, social protection targeting, or general project portfolio selection. There
remains a practical need for a metadata-driven, role-based, humanitarian and
development project platform that connects field data preparation, project information
management, beneficiary journey tracking, inclusive SADDD monitoring, dashboards,
descriptive analytics, rule-based alerts, project recommendations, and controlled donor
visibility without replacing existing field data collection or higher-level reporting
systems. PATHWAYS addresses this gap by integrating these functions into one
~~~

### Manuscript page 59 (PDF page 66)

~~~text
                                                                                                                 59

web-based system designed to make project information more organized, timely,
usable, actionable, and responsibly accessible for humanitarian and development
organization
~~~

</details>

## Chapter 3 source text (outdated use case material omitted)

<details>
<summary>Expand Chapter 3 transcript (PDF pages 67-203)</summary>

### Manuscript page 60 (PDF page 67)

~~~text
                                                                                                                   60

                                               Chapter 3
                                          METHODOLOGY
         This chapter presents the methods and processes used in the development of
the proposed system. It covers requirements analysis, design
specifications, development methodology, testing procedures, system requirements,
quality planning, evaluation planning, ethical considerations, and data analysis.
Furthermore, it outlines the tools, models, and techniques used to ensure the system’s
functionality, reliability, usability, security, and overall effectiveness.
​
Requirements Analysis
         ​Requirements – Features Matrix.
         The Requirements–Features Matrix presents the alignment between the
identified system requirements and the proposed features of the PATHWAYS platform.
This matrix serves as a structured validation tool to ensure that each functional and
non-functional requirement is properly addressed by corresponding system capabilities.
Through this matrix, developers can verify that the proposed metadata-driven project
information management platform remains aligned with the system’s intended scope,
monitoring workflows, and rule-based decision-support objectives.

Legends:
F1 – Role-Based Access Control
F2 – Project Profile and Activity Tracking
F3 – Centralized Beneficiary Profile
F4 – Beneficiary Journey Tracking
F5 – Digital Data Collection and Preparation
F6 – Metadata-Driven Data Integration
~~~

### Manuscript page 61 (PDF page 68)

~~~text
                                                                                                                   61

F7 – Project Indicator and Monitoring
F8 – Aggregated Monitoring Dashboard with SADDD Analysis
F9 – Descriptive Analytics
F10 – Rule-Based Alerts for Underperforming Indicators
F11 – Rule-Based Decision Support and Project Recommendation
F12 – Public Project Tracker for Donors

                                                      Table 5
                                    Requirements – Features Matrix.

              F1  F2  F3  F4  F5  F6  F7  F8  F9   F   F   F
                                                   10  11  12

                          Functional Requirements

Users must

be able to

securely log

in and                                                                   In
                                                                     Progress
access        ✓                                                High

role-based

organization

al

workspaces

Users must

be able to

create,

manage, and

monitor

project           ✓                   ✓   ✓   ✓    ✓   ✓   ✓   High      In
                                                                     Progress
profiles,

activities,

milestones,

and

implementati

on status

Users must            ✓✓✓✓                ✓✓                   High      In
be able to                                                           Progress
register,
organize,
and maintain
~~~

### Manuscript page 62 (PDF page 69)

~~~text
                                            62

centralized     ✓✓✓  ✓✓✓✓✓            High      In
beneficiary                                 Progress
profiles
                ✓✓✓✓✓✓✓✓✓             High      In
Users must                                  Progress
be able to                   ✓✓✓
track                        ✓✓✓✓✓✓✓               In
beneficiary                           High Progress
participation,
progression,                                       In
and journey                           High Progress
events
across
project
activities

Users must
be able to
encode,
import,
organize,
and review
beneficiary-r
elated
monitoring
records such
as
participation
records,
feedback
records,
pre-test and
post-test
results,
outcome
survey
results, and
follow-up
records as
project-level
monitoring
data.

Users must
be able to
create and
configure
digital
monitoring
forms and
monitoring-re
lated fields

Users must
be able to
~~~

### Manuscript page 63 (PDF page 70)

~~~text
                                                        63

upload, map,    ✓✓✓✓✓✓✓✓✓✓                       High       In
validate, and                                           Progress
process
collected       ✓        ✓✓✓✓✓✓✓                 High       In
field datasets                                          Progress

Users must         ✓✓✓✓✓✓✓✓✓                     High       In
be able to                                              Progress
centralize
manually        ✓  ✓  ✓  ✓  ✓  ✓  ✓  ✓  ✓  ✓  ✓  High       In
encoded and                                             Progress
imported
monitoring      ✓✓✓         ✓✓✓✓✓✓               Mediu  Planned
records                                            m

Users must
be able to
configure
project
indicators
and
monitoring
parameters

Users must
be able to
generate
aggregated
monitoring
dashboards
and
SADDD-bas
ed
summaries

Users must
be able to
generate
descriptive
analytics,
project
performance
summaries,
and
monitoring
outputs

The system
must
generate
rule-based
alerts for
delayed
timelines,
underperfor
~~~

### Manuscript page 64 (PDF page 71)

~~~text
                                            64

ming
indicators,
budget
concerns,
and
beneficiary
progress
issues

Users must

be able to

encode,

submit,

verify,

approve,

reject, and

organize

budget

expense

entries,

receipt       ✓    ✓  ✓  ✓  ✓  ✓  ✓  High       In
references,                                 Progress

liquidation

records, and

supporting

financial

evidence for

project

monitoring

and

transparency

reporting

purposes.

The system    ✓✓✓  ✓✓✓✓✓✓            Mediu  Planned
must provide                           m
predefined
recommenda
tion prompts
and
monitoring
support
guidance
based on
configured
monitoring
conditions

Authorized                                                                                                         In
users must
be able to    ✓ ✓ ✓ ✓ ✓ ✓ ✓ ✓ ✓ ✓ ✓ ✓ High Progress
generate
monitoring
reports and
visual
~~~

### Manuscript page 65 (PDF page 72)

~~~text
                                                                          65

outputs

Authorized

users must

be able to

publish

approved        ✓✓                ✓✓✓                       ✓  Mediu  Planned
project                                                          m

information

through a

public project

tracker

External                             ✓✓                     ✓  Mediu  Planned
stakeholders                                                     m
must be able
to view
approved
public project
summaries
and
monitoring
highlights

                         Non-Functional Requirements

The system

should

maintain

secure

role-based      ✓                                              High   In

access                                                                Progress

control and

organization

al workspace

isolation

The system

should

protect

sensitive

beneficiary     ✓  ✓  ✓  ✓  ✓  ✓  ✓  ✓  ✓             ✓  ✓  ✓  High       In
and project                                                           Progress

information

from

unauthorized

access

The system                  ✓  ✓  ✓  ✓  ✓             ✓  ✓  ✓  Mediu  Planned
should                                                           m
provide
responsive
dashboard
generation
and
~~~

### Manuscript page 66 (PDF page 73)

~~~text
                                                       66

monitoring     ✓✓✓✓✓✓✓✓✓✓                       High       In
operations                                             Progress
under normal
usage                   ✓✓✓✓✓                   High       In
conditions                                             Progress

The system     ✓  ✓  ✓  ✓  ✓  ✓  ✓  ✓  ✓  ✓  ✓  Mediu  Planned
should                                            m
maintain
centralized                                                                                                 In
and
consistent     ✓ ✓ ✓ ✓ ✓ ✓ ✓ ✓ ✓ ✓ ✓ High Progress
monitoring
records
across
project
workflows

The system
should
support
metadata-dri
ven
configuration
without
requiring
repeated
database
restructuring

The system
should
provide a
user-friendly
and
organized
monitoring
interface for
users with
varying
technical
experience

The system
should
maintain
operational
reliability
during
project
monitoring
and reporting
activities
~~~

### Manuscript page 67 (PDF page 74)

~~~text
                                                            67

The system

should

support

scalability for

increasing       ✓  ✓  ✓  ✓  ✓  ✓  ✓  ✓  ✓  ✓  ✓  ✓  Mediu  Planned
projects,                                              m

beneficiaries,

and

organization

al records

The system          ✓  ✓  ✓  ✓  ✓  ✓  ✓  ✓  ✓  ✓  ✓  High       In
should                                                      Progress
maintain
accurate
processing
of monitoring
data,
dashboards,
and
analytical
summaries

The system             ✓✓✓✓✓✓✓✓✓                     High       In
should                                                      Progress
properly
validate
uploaded
datasets and
prevent
invalid
monitoring
records from
being
processed

The system

should

remain

accessible

through          ✓  ✓  ✓  ✓  ✓  ✓  ✓  ✓  ✓  ✓  ✓  ✓  Mediu  Planned
modern web                                             m

browsers

and

internet-enab

led devices

The system

should

maintain

auditability                                                                                                          In
and
                 ✓ ✓ ✓ ✓ ✓ ✓ ✓ ✓ ✓ ✓ ✓ ✓ High Progress

traceability of

important

monitoring
~~~

### Manuscript page 68 (PDF page 75) — retained portion

~~~text
                                                                                                                   68

and
administrativ
e actions
~~~

> **Omitted:** The outdated use case diagrams and use case reports occupy the remainder of manuscript page 68 through the beginning of page 97.

### Manuscript page 97 (PDF page 104) — retained portion

~~~text
Design Specifications
         ​Activity Diagram.

Figure 15. Activity Diagram - User Password Recovery
~~~

### Manuscript page 98 (PDF page 105)

~~~text
                                                                                                                   98

                                                                                                                    ​
Figure 16. Activity Diagram - User Login, MFA, Role-Based Access
~~~

### Manuscript page 99 (PDF page 106)

~~~text
  99
​
~~~

### Manuscript page 100 (PDF page 107)

~~~text
                                                                                                                  100
Figure 17. Activity Diagram - Project Setup

Figure 18. Activity Diagram - Project Monitoring Structure Configuration
~~~

### Manuscript page 101 (PDF page 108)

~~~text
                                                                                                                  101
Figure 19. Activity Diagram - Digital Form and Input Structure

                                                                                                                    ​
~~~

### Manuscript page 102 (PDF page 109)

~~~text
                                                                                                        102
Figure 20. Activity Diagram - Direct Dataset Entry and Field Dataset Import

                                                                                                          ​
~~~

### Manuscript page 103 (PDF page 110)

~~~text
                                                                                                                  103
Figure 21. Activity Diagram - Records Centralization and Beneficiary Update

                                                                                                                ​
~~~

### Manuscript page 104 (PDF page 111)

~~~text
                                                                                                                  104
Figure 22. Activity Diagram - Monitoring Outputs, Rule-Based Alerts, Analytics, and
Rule-Based Decision Support

                                                                                                               ​
~~~

### Manuscript page 105 (PDF page 112)

~~~text
                                                                                                                  105
Figure 23. Activity Diagram - Report and Visualization Output

Figure 24. Activity Diagram - Public Project Transparency Viewing
~~~

### Manuscript page 106 (PDF page 113)

~~~text
                                                                                                                  106

                                                                                                                    ​
         Database Schema.
Figure 25. ERD - User and Organization Access, ‘system_users’ relationships
~~~

### Manuscript page 107 (PDF page 114)

~~~text
107
     ​
~~~

### Manuscript page 108 (PDF page 115)

~~~text
                                                                                                                  108
Figure 26. ERD - User and Organization Access, ‘organizations’ relationships.​

                                                                                                                       ​
​
~~~

### Manuscript page 109 (PDF page 116)

~~~text
                                                                                                                  109
Figure 27. ERD - Programs, Project, Activities, and Milestones, ‘projects’ relationships.​
~~~

### Manuscript page 110 (PDF page 117)

~~~text
                                                                                                                  110
Figure 28. ERD - Programs, Project, Activities, and Milestones, ‘projects_activities’
relationships.​

                                                                                                                  ​
~~~

### Manuscript page 111 (PDF page 118)

~~~text
                                                                                                                  111
Figure 29. ERD - Indicators and Monitoring​

                                                                                                                       ​
~~~

### Manuscript page 112 (PDF page 119)

~~~text
                                                                                                                  112
Figure 30. ERD - Digital Forms, Field Data, and Metadata Integration.

                                                                                                                ​
~~~

### Manuscript page 113 (PDF page 120)

~~~text
                                                                                                                  113
Figure 31. ERD - Beneficiary Profiles and Beneficiary Journey Tracking

                                                                                                                       ​
~~~

### Manuscript page 114 (PDF page 121)

~~~text
                                                                                                                  114
Figure 32. ERD - Budget, Analytics, Alerts, and Decision Support, ‘rule_based_alerts’
relationships.

Figure 33. ERD - Budget, Analytics, Alerts, and Decision Support, ‘assessment_results’
relationships.
~~~

### Manuscript page 115 (PDF page 122)

~~~text
                                                                                                                  115

Figure ??. ERD - Budget, Analytics, Alerts, and Decision Support, ‘project_evaluations’
relationships.
~~~

### Manuscript page 116 (PDF page 123)

~~~text
                                                                                                                  116
Figure ??. ERD - Reports and Evidence Media.
~~~

### Manuscript page 117 (PDF page 124)

~~~text
                                                                                                        117

Data Dictionary.
                                           Table 32​

                           Data Dictionary: Organizations
~~~

### Manuscript page 118 (PDF page 125)

~~~text
                                                                                  118

Table Name: organizations

     Table       This table stores information about humanitarian and development

Description: organizations using PATHWAYS.

Related Table/s: system_users, programs, projects, indicators, beneficiaries,
                         alert_rules, reports

Key  Field       Data   Length  Default       Field    Descripti     Sample
     Name        Type            Value      Validatio      on          Data

                                                 n

                                                       Unique

PK   organizati  INT       —       Auto     Not Null,  identifier              1
       on_id                    Increment   Primary     for each
                                                       organizati
                                               Key

                                                       on.

     organizati VARCHA     200  None        Not Null    Name of
                                                           the
     on_name     R
                                                       humanitar Plan
                                                         ian or Internatio

                                                       developm nal
                                                           ent Pilipinas

                                                       organizati
                                                           on.

     organizati VARCHA     100  Humanitar   Nullable    Type or      Humanitar
                                  ian and              classificati    ian and
     on_type     R                                      on of the
                                Developm               organizati    Developm
                                    ent                                  ent
                                                           on.
                                Organizati                           Organizati
                                     on                                   on

                                                                     Organizati

     descriptio  TEXT      —    None        Nullable      Brief          on
          n                                            descriptio     focused
                                                        n of the
                                                       organizati        on
                                                                     children’s
                                                           on.       rights and
                                                                      equality

                                                                     for girls.

     contact_e VARCHA      150  None        Nullable    Contact
                                                         email
     mail        R
                                                        address info@exa
                                                         of the mple.org

                                                       organizati
                                                           on.

                                                       Contact

     contact_n VARCHA      50   None        Nullable   number of     +6391712
                                                           the         34567
     umber       R
                                                       organizati

                                                       on.
~~~

### Manuscript page 119 (PDF page 126)

~~~text
                                                                               119

                                                            Address Makati

     address TEXT       —          None          Nullable   of the      City,

                                                            organizati Philippine

                                                            on.         s

                                                            Indicates

                                                            whether

                                                            the

     status ENUM        —          Active        Active, organizati     Active
                                                 Inactive on is

                                                            active in

                                                            the

                                                            system.

                                                            Date and

                                                            time when

     created_a TIMESTA          CURREN                      the 2026-01-1

            t    MP     —       T_TIMES Not Null organizati             5

                                   TAMP                     on record 10:30:00

                                                            was

                                                            created.

                                ​

                             Table 33

                        Data Dictionary: Roles

Table Name: roles

     Table       This table stores the user roles used for role-based access control.

Description:

Related Table/s: system_users, role_permissions

Key  Field       Data   Length  Default            Field    Descripti   Sample
     Name        Type            Value           Validatio      on        Data

                                                      n

PK role_id       INT    —          Auto          Not Null,   Unique     1
                                Increment        Primary    identifier
                                                            for each
                                                    Key     user role.

     role_nam VARCHA    100        None          Not Null,  Name of      Project
                                                  Unique    the user    Manager
            e    R
                                                              role.

                                                            Descriptio Manageri

                                                            n of the al user

     descriptio  TEXT   —          None          Nullable   role and responsibl
          n
                                                            its         e for

                                                            responsibi project-lev

                                                            lities. el review.
~~~

### Manuscript page 120 (PDF page 127)

~~~text
                                                                                   120

                                      Table 34​
                       Data Dictionary: Permissions

Table Name: permissions

     Table       This table stores the specific system permissions that may be

Description: assigned to user roles.

Related Table/s: role_permissions

Key  Field       Data    Length       Default      Field    Descripti   Sample
     Name        Type                  Value     Validatio      on        Data

                                                      n

                                                            Unique

PK   permissio   INT     —               Auto    Not Null,  identifier          1
        n_id                          Increment  Primary     for each
                                                            permissio
                                                    Key

                                                            n.

                                                            System-re

     permissio VARCHA    100          None       Not Null,   adable     MANAGE
                                                  Unique     code for   _PROJEC
     n_code      R
                                                                the          TS
                                                            permissio

                                                            n.

     permissio VARCHA    150          None       Not Null   User-read   Manage
                                                               able     Projects
     n_name      R
                                                             name of
                                                                the

                                                            permissio
                                                                 n.

                                                                        Allows

     descriptio  TEXT    —            None       Nullable   Descriptio  user to
          n                                                 n of what   create,
                                                                        update,
                                                                the
                                                            permissio     and
                                                            n allows.   archive
                                                                        project

                                                                        profiles.

                                    Table 35​
                 Data Dictionary: Role Permissions

Table Name: role_permissions

     Table       This table connects roles to permissions and defines what each

Description: role is allowed to access or perform.

Related Table/s: roles, permissions
~~~

### Manuscript page 121 (PDF page 128)

~~~text
                                                                                 121

Key  Field      Data  Length  Default         Field    Descripti   Sample
     Name       Type     —     Value        Validatio      on        Data
                         —
                         —                       n

                                                       Unique

                                                       identifier

PK   role_perm  INT              Auto       Not Null,   for each   1
     ission_id                Increment     Primary    role-permi

                                               Key        ssion

                                                       assignme

                                                       nt.

                                                       Reference

FK role_id      INT           None          Not Null,  s the role  3
                                            Foreign    assigned

                                               Key       with a
                                                       permissio

                                                       n.

                                                       Reference

                                                       s the

     permissio                              Not Null, permissio
        n_id
FK              INT           None Foreign             n           5

                                            Key assigned

                                                       to the

                                                       role.

                                     Table 36​
                     Data Dictionary: System Users

Table Name: system_users

     Table      This table stores internal users of PATHWAYS. Beneficiaries are

Description: not included as system users.

Related Table/s: organizations, roles, audit_logs, programs, projects,
                         user_project_assignments, project_activities,
                         project_activity_assignments, indicators, digital_forms,
                         data_import_batches, form_submissions, beneficiaries,
                         journey_stages, activity_journey_stage,
                         beneficiary_activity_participation, beneficiary_journey_events,
                         project_budget_records, budget_expense_entries,
                         assessment_results, project_evaluation_criteria,
                         project_evaluations, alert_rules, alert_rule_recommendations,
                         rule_based_alerts, decision_recommendations, evidence_media,
                         reports

Key  Field      Data  Length  Default         Field    Descripti   Sample
     Name       Type           Value        Validatio      on        Data

                                                 n

PK user_id      INT       —   Auto Not Null, Unique                1
~~~

### Manuscript page 122 (PDF page 129)

~~~text
                                                                     122

                             Increment Primary       identifier
                                                Key  for each
                                                     internal

                                                       user.

FK  organizati  INT     —    None     Not Null,      Organizati   1
      on_id                           Foreign        on where
                                                      the user
                                         Key          belongs.

FK role_id      INT     —    None     Not Null,        Role       4
                                      Foreign        assigned

                                         Key           to the
                                                       user.

    full_name   VARCHA  150  None     Not Null       Complete     Juan Dela
                     R                                name of        Cruz
                                                     the user.

    email       VARCHA  150  None     Not Null,         Email
                     R                 Unique         address
                                                      used for juan@exa
                                                     login and mple.org
                                                     communic

                                                        ation.

                                                     Securely

    password VARCHA                                  hashed $2b$10$s

    _hash       R       255  None     Not Null       password ampleHas

                                                     of the       h

                                                     user.

    position_ti VARCHA  150  None     Nullable         Official    M&E
                                                     position or  Officer
    tle         R                                    designatio

                                                      n of the
                                                        user.

    contact_n VARCHA    50   None     Nullable        Contact     +6391712
                                                     number of      34567
    umber       R                                     the user.

                                      Active, Current

    account_s   ENUM    —    Active    Inactive, account          Active
       tatus                          Suspende status of

                                      d              the user.

    last_login DATETIM  —    NULL     Nullable       Date and     2026-02-1
                                                       time of          0
    _at         E
                                                     the user’s    09:15:00
                                                     last login.

    created_a TIMESTA   —    CURREN   Not Null       Date and     2026-01-1
                             T_TIMES                 time when          5
    t           MP
                               TAMP                      the       10:30:00
                                                      account
~~~

### Manuscript page 123 (PDF page 130)

~~~text
                                                                         123

                                                          was
                                                        created.

                                                        Date and

     updated_ TIMESTA          —  NULL       Nullable,  time when   2026-02-0
                                               Auto         the           1
            at   MP
                                              Update     account     13:20:00
                                                         was last

                                                        updated.

                                       Table 37​
                         Data Dictionary: Audit Logs

Table Name: audit_logs

     Table       This table records user activities for accountability, traceability, and

Description: system monitoring.

Related Table/s: system_users

Key  Field       Data    Length   Default      Field    Descripti   Sample
     Name        Type       —      Value     Validatio      on        Data
                            —
                           100                    n
                           100
PK   audit_log_  BIGINT     —        Auto    Not Null,   Unique     1
          id                —     Increment  Primary    identifier
                                                        for each
                                                Key     audit log.

FK user_id       INT                           Nullable, User who
                                  NULL Foreign performed 2

                                                  Key the action.

     action_typ VARCHA            None       Not Null    Type of    CREATE_
                                                          action    PROJEC
            e    R                                      performed
                                                                         T
                                                              .

     table_na VARCHA              None       Nullable   Name of     projects
                                                        the table
     me          R                                      affected

                                                         by the
                                                         action.

                                                        Identifier

     record_id INT                None       Nullable    of the     15
                                                        affected

                                                        record.

                                                        Details of Created a

     action_de   TEXT             None       Nullable   the         new
     scription
                                                        performed project

                                                        action. profile.
~~~

### Manuscript page 124 (PDF page 131)

~~~text
                                                                                   124

                                                                 IP

     ip_addres VARCHA   100     None       Nullable    address               192.168.1
                                                         used                    .10
            s    R
                                                      during the

                                                                 action.

                                                                 Date and

     created_a TIMESTA          CURREN                time when 2026-02-1

            t    MP     —       T_TIMES Not Null the action                    0

                                TAMP                             was 09:15:00

                                                                 recorded.

                                     Table 38​
                        Data Dictionary: Programs

Table Name: programs

     Table       This table stores broader programs that may contain multiple

Description: projects.

Related Table/s: organizations, system_users, projects, reports

Key  Field       Data   Length  Default      Field    Descripti              Sample
     Name        Type      —     Value     Validatio      on                   Data
                           —
                          200                   n

PK   program_i   INT       —       Auto    Not Null,              Unique       1
          d                —    Increment  Primary               identifier
                                                                 for each
                                              Key                program.

FK   organizati  INT            None       Not Null,  Organizati               1
       on_id                               Foreign      on that
                                                      owns the
                                              Key     program.

     program_ VARCHA            None       Not Null              Name of       Youth
                                                                    the      Employm
     name        R
                                                                 program.        ent
                                                                             Program

                                                                             Program

                                                                             focused

     descriptio  TEXT           None       Nullable   Descriptio              on youth
          n                                            n of the              livelihood
                                                      program.
                                                                                 and
                                                                             employme

                                                                               nt

                                                                             support.

        program_                           Nullable, Assigned
FK manager_ INT
                                NULL Foreign Program                           5
             id
                                           Key Manager.
~~~

### Manuscript page 125 (PDF page 132)

~~~text
                                                                                   125

     start_date DATE    —       None       Nullable   Program 2026-01-0
                                                      start date. 1

     end_date DATE      —       None       Nullable   Program 2026-12-3

                                                      end date.   1

                                           Planned,

     status ENUM        —       Planned    Ongoing,   Current     Ongoing
                                           Complete   program
                                                       status.
                                             d, On
                                             Hold,

                                           Cancelled

                                                      Date and

                                                      time when

     created_a TIMESTA          CURREN                the 2026-01-1
                                T_TIMES Not Null
     t          MP      —                             program     5
                                  TAMP
                                                      record 10:30:00

                                                      was

                                                      created.

                                    Table 39​
                        Data Dictionary: Projects

Table Name: projects

    Table       This table stores project profile, implementation, and controlled
Description:    public-visibility information, including objectives, timeline,
                implementation area, status, approval, and publication details.

Related Table/s: programs, organizations, system_users,
                         user_project_assignments, project_activities, project_milestones,
                         project_indicators, digital_forms, data_import_batches,
                         form_submissions, beneficiary_project_enrollments,
                         journey_stages, beneficiary_journey_events,
                         project_budget_records, assessment_results,
                         project_evaluation_criteria, project_evaluations, rule_based_alerts,
                         decision_recommendations, evidence_media, reports

Key  Field      Data    Length  Default      Field    Descripti   Sample
     Name       Type             Value     Validatio      on        Data

                                                n

PK project_id INT       —          Auto    Not Null,  Unique      1
                                Increment  Primary    identifier
                                                      for each
                                              Key     project.

FK   program_i  INT     —       NULL       Nullable,  Program     1
          d                                Foreign    where the

                                              Key       project
                                                      belongs.

FK organizati INT       —       None Not Null, Organizati 1
~~~

### Manuscript page 126 (PDF page 133)

~~~text
                                                                     126

    on_id                              Foreign on that
                                         Key owns the
                                                      project.

                                                  Unique

    project_co VARCHA    80   None     Not Null,    code        YEP-2026
                                        Unique    assigned         -001
    de          R
                                                    to the

                                                  project.

    project_titl VARCHA  250  None     Not Null                  Futurema
                                                  Title of the kers
    e           R
                                                    project. Training
                                                                   Project

    project_d   TEXT     —    None     Nullable   Descriptio     Youth
    escription                                     n of the      skills
                                                   project.     training
                                                                project.

                                                                Improve

    project_o   TEXT     —    None     Nullable   Objective     employabi
    bjectives                                      s of the        lity of
                                                   project.        youth

                                                                beneficiari

                                                                es.

    implement   VARCHA   255  None     Nullable    Location     Manila
    ation_are        R                              or area      City
                                                  where the
          a                                       project is
                                                  implement

                                                      ed.

    start_date DATE      —    None     Nullable     Project 2026-01-1
                                                  start date. 5

    end_date DATE        —    None     Nullable   Project 2026-09-3

                                                  end date.     0

    implement            —    Planned  Planned,    Current      Ongoing
    ation_stat ENUM                    Ongoing,   implement
                                       Complete
         us                                          ation
                                            d,     status of
                                       Delayed,
                                       On Hold,       the
                                       Cancelled    project.

    project_m                          Nullable, Assigned
    anager_id
FK              INT      —    NULL Foreign Project              4

                                       Key Manager.

    public_visi          —    Private   Private,  Controls      Private
    bility_stat ENUM                       For    whether

         us                             Review,      the
                                       Approved,   project
~~~

### Manuscript page 127 (PDF page 134)

~~~text
                                                              127

                                Published remains
                                                private,
                                                 awaits
                                               review, is

                                               approved,
                                                   or is

                                                publicly
                                               published.

                                          Approved

                                          non-sensit

    public_su  TEXT    —  NULL  Nullable  ive project      Approved
     mmary                NULL            summary          summary
                          NULL             intended        of project
                          NULL                             progress.
                          NULL                 for
                                          controlled

                                          public

                                          visibility.

                                          Internal

                                          user who

                                          approved

    public_ap                   Nullable, the

FK proved_b INT        —        Foreign project            5

    y                           Key informatio

                                          n for

                                          public

                                          visibility.

    public_ap DATETIM  —        Nullable  Date and
    proved_at E                           time when

                                              the
                                            project 2026-03-2
                                          informatio 0
                                            n was 10:00:00
                                          approved
                                          for public
                                           visibility.

                                          Date and

                                          time when

    published DATETIM  —        Nullable      the          2026-03-2
                                          approved               1
    _at        E
                                            project         09:00:00
                                          informatio

                                          n was

                                          published.

                                          User who

    created_b                   Nullable, created
         y
FK             INT     —        Foreign   the              2

                                Key       project

                                          record.
~~~

### Manuscript page 128 (PDF page 135)

~~~text
                                                                                         128

                                                         Date and

     created_a TIMESTA     —       CURREN     Not Null   time when                    2026-01-1
                                   T_TIMES                   the                            5
            t   MP
                                     TAMP                  project                     10:30:00
                                                             was

                                                         created.

                                                         Date and

     updated_ TIMESTA      —       NULL       Nullable,  time when                    2026-02-0
                                                Auto         the                            1
            at  MP
                                               Update      project                     13:20:00
                                                          was last

                                                         updated.

                                  Table 40​
                Data Dictionary: Project Activities

Table Name: project_activities

     Table      This table stores project activities, sessions, interventions, or

Description: implementation actions under a project.

Related Table/s: projects, system_users, project_activity_assignments,
                         activity_journey_stage, beneficiary_activity_participation,
                         beneficiary_journey_events, project_budget_records,
                         assessment_results, rule_based_alerts, evidence_media

Key  Field      Data       Length  Default      Field    Descripti                    Sample
     Name       Type                Value     Validatio      on                         Data

                                                   n

                                                         Unique

PK activity_id INT         —          Auto    Not Null,  identifier                   1
                                   Increment  Primary    for each
                                                          project
                                                 Key

                                                         activity.

FK project_id INT          —       None       Not Null,   Project                     1
                                              Foreign    where the

                                                 Key       activity
                                                         belongs.

     activity_c VARCHA     80      None       Nullable   Unique or                    ACT-001
                                                          internal
     ode        R                                         code of
                                                             the
                                                          activity.

     activity_titl VARCHA  250     None                    Title of the Technical
                                              Not Null project Skills
            e   R
                                                             activity. Training

     activity_d TEXT       —       None Nullable Descriptio Conduct
~~~

### Manuscript page 129 (PDF page 136)

~~~text
                                                                 129

    escription                                   n of the      training
                                                 activity.     for youth
                                                              beneficiari

                                                                  es.

    activity_ty VARCHA  100  None                    Type or
                                      Nullable category Training
    pe           R
                                                    of activity.

    planned_s    DATE   —    None     Nullable    Planned     2026-02-0
     tart_date                                     activity         1
                                                 start date.

    planned_     DATE   —    None     Nullable   Planned      2026-02-0
    end_date                                      activity          5
                                                 end date.

    actual_sta   DATE   —    None     Nullable     Actual     2026-02-0
      rt_date                                      activity         2
                                                 start date.

    actual_en    DATE   —    None     Nullable     Actual     2026-02-0
     d_date                                       activity          6
                                                 end date.

                                      Not

    activity_st  ENUM   —      Not     Started,  Current      Complete
       atus                  Started  Ongoing,   status of         d
                                      Complete
                                                    the
                                           d,    activity.
                                      Delayed,

                                      Cancelled

                                                 User who

    created_b                         Nullable, created
         y
FK               INT    —    NULL Foreign        the          3

                                      Key        activity

                                                 record.

                                                 Date and

    created_a TIMESTA   —    CURREN   Not Null   time when    2026-01-2
                             T_TIMES                 the            0
    t            MP
                               TAMP                activity    11:00:00
                                                     was

                                                 created.

                                                 Date and

    updated_ TIMESTA    —    NULL     Nullable,  time when    2026-02-0
                                        Auto         the            6
    at           MP
                                       Update      activity    16:00:00
                                                  was last

                                                 updated.
~~~

### Manuscript page 130 (PDF page 137)

~~~text
                                                                                   130

                                    Table 41​
                 Data Dictionary: Project Milestones

Table Name: project_milestones

     Table       This table stores important project milestones, target dates,

Description: completion dates, and milestone status.

Related Table/s: projects

Key  Field       Data      Length  Default      Field    Descripti     Sample
     Name        Type               Value     Validatio      on          Data

                                                   n

PK   milestone   INT       —          Auto    Not Null,    Unique               1
         _id                       Increment  Primary     identifier
                                                          for each
                                                 Key     milestone.

FK project_id INT          —       None       Not Null,   Project               1
                                              Foreign    where the
                                                         milestone
                                                 Key     belongs.

     milestone VARCHA      250     None       Not Null   Title of the  Complete
                                                         milestone.     Training
     _title      R                                                      Batch 1

     milestone   TEXT      —       None       Nullable   Descriptio    Completio
     _descripti                                           n of the      n of first
                                                                        training
         on                                              milestone.      batch.

                                                         Target

     target_dat  DATE      —       None       Nullable   date of 2026-03-0
          e
                                                         the                    1

                                                         milestone.

     completio   DATE      —       None       Nullable     Actual      2026-03-0
      n_date                                             completio           2

                                                          n date.

                                              Pending,

     milestone   ENUM      —       Pending    Ongoing,    Current      Complete
      _status                                 Complete   milestone          d

                                                   d,      status.

                                              Delayed

                                                         Date and

     created_a TIMESTA     —       CURREN     Not Null   time when     2026-01-2
                                   T_TIMES                   the             0
            t    MP
                                     TAMP                milestone      11:00:00
                                                             was

                                                         created.
~~~

### Manuscript page 131 (PDF page 138)

~~~text
                                                                                        131

                                     Table 42​
                        Data Dictionary: Indicators

Table Name: indicators

     Table        This table stores the indicator library used for project monitoring,

Description: evaluation, and dashboard generation.

Related Table/s: organizations, system_users, project_indicators

Key  Field        Data  Length  Default      Field      Descripti      Sample
     Name         Type     —     Value     Validatio        on           Data
                           —
                           80                   n
                          250
PK   indicator_i  INT      —       Auto    Not Null,     Unique        1
           d                    Increment  Primary      identifier
                           —                            for each
                          100                 Key       indicator.

FK   organizati   INT           None       Not Null,    Organizati     1
       on_id                               Foreign        on that
                                                        owns the
                                              Key       indicator.

     indicator_ VARCHA          None       Nullable       Code         KPI-001
                                                        assigned
     code         R
                                                          to the
                                                        indicator.

     indicator_ VARCHA                                  Name of Training

     name         R             None       Not Null               the Completio

                                                        indicator. n Rate

                                                                       Measures

     indicator_   TEXT          None       Nullable     Descriptio         the
     descriptio                                         n of what      percentag

          n                                                 the            e of
                                                         indicator     beneficiari
                                                        measures.
                                                                         es who
                                                                       completed

                                                                       training.

     indicator_t  ENUM          Output      Output,      Type or       Outcome
         ype                               Outcome,     category
                                            Activity,
                                            Budget,         of
                                           Timeline,    indicator.
                                           Participati

                                               on,
                                            Survey
                                             Score

     unit_of_m VARCHA           None       Nullable     Unit used Percentag

     easure       R                                               for  e
~~~

### Manuscript page 132 (PDF page 139)

~~~text
                                                                                       132

                                                          measuring
                                                              the

                                                           indicator.

     data_sour VARCHA   150     None       Nullable       Source of     Training
                                                           data for    Attendanc
     ce          R
                                                              the        e Form
                                                          indicator.

                                                          Indicates

                                                          whether

     is_saddd_ BOOLEA                                     the

     related     N      —       FALSE Not Null indicator               1

                                                          is related

                                                          to SADDD

                                                          analysis.

FK   created_b   INT    —       NULL       Nullable,      User who     2
          y                                Foreign         created

                                              Key             the
                                                          indicator.

                                                          Date and

     created_a TIMESTA  —       CURREN     Not Null       time when    2026-01-2
                                T_TIMES                       the            0
            t    MP
                                  TAMP                     indicator    11:00:00
                                                              was

                                                          created.

                                    Table 43​
                 Data Dictionary: Project Indicators

Table Name: project_indicators

     Table       This table stores project-specific indicator targets, actual values,

Description: baseline values, and status.

Related Table/s: projects, indicators, rule_based_alerts

Key  Field       Data   Length  Default      Field        Descripti    Sample
     Name        Type      —     Value     Validatio          on         Data
                           —
                                                n                          1

PK   project_in  INT               Auto    Not Null,       Unique          1
     dicator_id                 Increment  Primary        identifier
                                                          for each
                                              Key          project
                                                          indicator.

FK project_id INT               None       Not Null,       Project
                                           Foreign        where the
                                                          indicator
                                              Key          is used.
~~~

### Manuscript page 133 (PDF page 140)

~~~text
                                                                     133

FK  indicator_i  INT      —      None    Not Null,    Indicator   1
          d                      None    Foreign      assigned

                                    0       Key         to the
                                 None                  project.
                                 None
    target_val   DECIMAL  12,2   None    Nullable       Target    100.00
        ue                                             value to
                                  Not
                                Started                   be
                                                      achieved.
                                 NULL
    actual_val   DECIMAL  12,2                           Actual   75.00
         ue                              Nullable recorded

                                                         value.

    baseline_    DECIMAL  12,2           Nullable      Baseline   30.00
      value                                              value
                                                        before

                                                      implement
                                                         ation.

    current_v    DECIMAL  12,2                          Current   75.00
       alue                              Nullable measured

                                                         value.

                                                      Target

    target_dat   DATE     —              Nullable      date for   2026-06-3
         e                                            achieving         0

                                                          the

                                                      indicator.

    indicator_   ENUM     —                  Not                  At Risk
      status                              Started, Current
                                         On Track, performan
                                          At Risk, ce status
                                         Underperf of the
                                          orming, indicator.
                                         Achieved

                                                      Date and

    updated_ TIMESTA      —              Nullable,    time when   2026-03-0
                                           Auto           the           1
    at           MP
                                          Update       indicator   14:00:00
                                                       was last

                                                      updated.

                                     Table 44​
                      Data Dictionary: Digital Forms

Table Name:      digital_forms

     Table       This table stores digital forms used for project, beneficiary, activity,
Description:     assessment, and monitoring data collection.
~~~

### Manuscript page 134 (PDF page 141)

~~~text
                                                                                  134

Related Table/s: projects, system_users, form_fields, data_import_batches,
                         form_submissions

Key  Field      Data    Length  Default      Field      Descripti    Sample
     Name       Type             Value     Validatio        on         Data

                                                n

                                                        Unique

PK form_id INT          —          Auto    Not Null,    identifier          1
                                Increment  Primary      for each
                                                         digital
                                              Key

                                                        form.

FK project_id INT       —       None       Not Null,     Project            1
                                           Foreign      where the

                                              Key          form
                                                        belongs.

     form_nam VARCHA    200     None       Not Null     Name of      Beneficiar
                                                        the digital       y
     e          R
                                                           form.     Registrati
                                                                      on Form

     form_type ENUM     —       Other      Beneficiar   Type of      Beneficiar
                                                y        digital          y
                                                         form.
                                           Registrati                Registrati
                                               on,                        on

                                            Training
                                            Survey,
                                           Pre-Test,
                                           Post-Test,
                                           Outcome
                                           Monitorin
                                           g, Activity
                                           Monitorin
                                            g, Other

                                                                            Form

     form_des   TEXT    —       None                     Descriptio used to
      cription                             Nullable n of the register

                                                            form. beneficiari

                                                                            es.

     form_stat  ENUM    —       Draft         Draft, Current
         us                                Published status of Published
                                           , Archived the form.

     created_b                             Nullable, User who
          y
FK              INT     —       NULL Foreign created                        3

                                           Key the form.

     created_a TIMESTA  —       CURREN     Not Null     Date and     2026-02-0
                                T_TIMES                 time when          1
     t          MP                                       the form
                                  TAMP                                09:00:00
                                                            was
~~~

### Manuscript page 135 (PDF page 142)

~~~text
                                                                                     135

                                                        created.

                                      Table 45​
                        Data Dictionary: Form Fields

Table Name: form_fields

     Table        This table stores field definitions and metadata for each digital

Description: form.

Related Table/s: digital_forms, metadata_mappings, form_response_values

Key  Field        Data    Length  Default      Field    Descripti     Sample
     Name         Type       —     Value     Validatio      on          Data
                             —
                            200                   n
                            120
PK field_id       INT                Auto    Not Null,   Unique          1
                             —    Increment  Primary    identifier
                                                         for each
                             —                  Key     form field.
                             —
FK form_id INT                    None       Not Null,     Form          1
                                             Foreign    where the

                                                Key        field
                                                        belongs.

                                                        Display

     field_label  VARCHA          None       Not Null   label of         Sex
                       R                                the form

                                                        field.

     field_code   VARCHA          None       Not Null,  System           sex
                       R                      Unique    code for
                                             per Form   the form

                                                          field.

                                             Text,

                                             Number,

     data_type ENUM               None       Decimal,   Expected         Select
                                               Date,    data type

                                             Boolean,     of the
                                              Select,      field.
                                             Multiple

                                             Select,

                                             Long Text

                                                        Indicates

     is_require BOOLEA            FALSE      Not Null    whether         1
                                                        the field is
            d     N

                                                        required.

     is_metada BOOLEA                                   Indicates

     ta_key       N               FALSE Not Null whether                 1

                                                        the field is
~~~

### Manuscript page 136 (PDF page 143)

~~~text
                                                                               136

                                                        used as
                                                       metadata

                                                          key.

                                                       Indicates

                                                       whether

     is_saddd_ BOOLEA  —         FALSE      Not Null   the field is         1
                                  None                  used for
     field      N                 None

                                                       SADDD

                                                       analysis.

                                                       List of

     allowed_v  TEXT   —                    Nullable    allowed      Male,Fem
        alues                                          values for    ale,Other

                                                         select

                                                       fields.

                                                       Display

     sequence   INT    —                    Nullable    order of            1
         _no                                           the field in

                                                       the form.

                                     Table 46​
                Data Dictionary: Data Import Batches

Table Name: data_import_batches

     Table      This table stores uploaded datasets imported from KOBO,

Description: spreadsheets, manual uploads, or other sources.

Related Table/s: projects, digital_forms, system_users, metadata_mappings,
                         form_submissions

Key  Field      Data   Length    Default      Field    Descripti         Sample
     Name       Type              Value     Validatio      on              Data

                                                 n

                                                       Unique

PK   import_ba  INT    —            Auto    Not Null,  identifier           1
       tch_id                    Increment  Primary    for each
                                                        import
                                               Key

                                                       batch.

                                                       Project

                                            Not Null, where the

FK project_id INT      —         None Foreign imported                      1

                                            Key dataset

                                                       belongs.

                                                       Related

                                            Nullable, form used

FK form_id INT         —         NULL Foreign                 for           1

                                            Key mapping

                                                              the
~~~

### Manuscript page 137 (PDF page 144)

~~~text
                                                                    137

                                                     imported
                                                     dataset.

                                         KOBO,

                                         Spreadsh Source of

    source_sy   ENUM     —    Spreadsh eet,             the      KOBO
       stem                                          imported
                              eet        Manual

                                         Upload, dataset.

                                         Other

    original_fil VARCHA  255  None                      Original kobo_trai
                                         Nullable uploaded ning_data
    e_name      R
                                                       file name. .xlsx

    file_type ENUM       —    CSV         CSV,       File type   XLSX
                                         XLSX,         of the
                                          XLS,
                                         JSON,       uploaded
                                         Other       dataset.

FK  uploaded    INT      —    NULL       Nullable,   User who    3
       _by                               Foreign     uploaded

                                            Key          the
                                                      dataset.

    import_st   ENUM     —    Uploaded   Uploaded,    Current    Validated
       atus                               Mapped,     status of
                                         Validated,  the import
                                         Processe
                                          d, Failed    batch.

    validation  TEXT     —    None       Nullable      Notes      Missing
     _notes                                          regarding      field
                                                     validation
                                                                 corrected.
                                                      results.

                                                     Date and

    uploaded TIMESTA     —    CURREN     Not Null    time when   2026-02-1
                              T_TIMES                    the           0
    _at         MP
                                TAMP                  dataset     10:00:00
                                                         was

                                                     uploaded.

                                                     Date and

                                                     time when

    processed DATETIM                                the 2026-02-1

    _at         E        —    NULL       Nullable    dataset     0

                                                     was 10:30:00

                                                     processed

                                                     .

                              Table 47​

                Data Dictionary: Metadata Mappings
~~~

### Manuscript page 138 (PDF page 145)

~~~text
                                                                                  138

Table Name: metadata_mappings

     Table        This table stores the mapping between imported dataset fields and

Description: system form fields.

Related Table/s: data_import_batches, form_fields

Key  Field        Data  Length    Default            Field    Descripti     Sample
     Name         Type     —       Value           Validatio      on          Data
                           —
                          200                           n
                           —
                          150                                 Unique
                           —
PK   mapping_i    INT      —         Auto          Not Null,  identifier    1
           d                      Increment        Primary    for each
                                                              metadata
                                                      Key

                                                              mapping.

FK   import_ba    INT             None             Not Null,   Import       1
       tch_id                                      Foreign      batch
                                                                being
                                                      Key     mapped.

                                                              Field

     source_fie VARCHA            None             Not Null     name        beneficiar
                                                              from the        y_sex
     ld_name      R                                           uploaded

                                                              dataset.

                                                              Form field

     target_fiel                                   Nullable, matched
        d_id
FK                INT             NULL Foreign to the                       5

                                                   Key        source

                                                              field.

                                                              Target

                                                              system

     target_sys VARCHA            None             Nullable   field if not  sex
                                                               mapped
     tem_field    R

                                                              to a form

                                                              field.

     mapping_     ENUM            Pending          Pending,   Status of     Mapped
       status                                      Mapped,    the field
                                                    Invalid,  mapping.
                                                   Ignored

                                                              Validation Source

     validation                                               message field
     _message
                  TEXT            None             Nullable   for           mapped

                                                              mapping successfu

                                                              issues.       lly.
~~~

### Manuscript page 139 (PDF page 146)

~~~text
                                                                                 139

                                   Table 48​
                Data Dictionary: Form Submissions

Table Name: form_submissions

     Table      This table stores form submissions from direct encoding or

Description: imported datasets.

Related Table/s: digital_forms, projects, data_import_batches, system_users,
                         form_response_values, assessment_results

Key  Field      Data  Length     Default      Field    Descripti    Sample
     Name       Type              Value     Validatio      on         Data

                                                 n

                                                       Unique

PK   submissio  INT   —             Auto    Not Null,   identifier            1
        n_id                     Increment  Primary     for each

                                               Key        form
                                                       submissio

                                                       n.

                                                       Form

                                            Not Null, used for

FK form_id INT        —          None Foreign          the                    1

                                            Key submissio

                                                       n.

                                                       Project

                                            Not Null, related to

FK project_id INT     —          None Foreign          the                    1

                                            Key submissio

                                                       n.

                                                       Import

FK   import_ba  INT   —          NULL       Nullable,     batch               1
       tch_id                               Foreign    where the
                                                       submissio
                                               Key
                                                        n came

                                                       from.

                                                       User who

FK   submitted  INT   —          NULL       Nullable,  encoded                3
         _by                                Foreign         or

                                               Key     submitted
                                                           the

                                                       record.

                                            Direct Source of

     submissio  ENUM  —            Direct Encoding, the Imported
     n_source                    Encoding Imported submissio Dataset

                                            Dataset    n.

     submissio  ENUM  —          Draft      Draft, Current Processe
      n_status
                                            Validated, status of              d
~~~

### Manuscript page 140 (PDF page 147)

~~~text
                                                                          140

                                                Processe the

                                                d, submissio

                                                Rejected   n.

     is_dummy BOOLEA      —                                    Indicates
                                                               whether
     _record    N
                                                                   the
                                  FALSE Not Null submissio 1

                                                                  n is
                                                                dummy

                                                                 data.

                                                           Date and

     submitted TIMESTA            CURREN                   time when 2026-02-1

     _at        MP        —       T_TIMES Not Null the form            0

                                  TAMP                     was 10:30:00

                                                           submitted.

                                      Table 49​
                Data Dictionary: Form Response Values

Table Name: form_response_values

     Table      This table stores the actual values or answers submitted for each

Description: form field.

Related Table/s: form_submissions, form_fields

Key  Field      Data      Length  Default         Field    Descripti   Sample
     Name       Type         —     Value        Validatio      on        Data
                             —
                             —                       n
                             —
                                                           Unique

PK   response   BIGINT               Auto       Not Null,  identifier  1
     _value_id                    Increment     Primary    for each
                                                           response
                                                   Key

                                                           value.

                                                           Submissio

     submissio                                  Not Null, n where
        n_id
FK              INT               None Foreign             the         1

                                                Key response

                                                           belongs.

                                                Not Null, Form field

FK field_id     INT               None Foreign being                   5

                                                Key answered.

     response   TEXT              None          Nullable     Actual    Female
      _value                                               response

                                                               or
                                                           encoded

                                                             value.
~~~

### Manuscript page 141 (PDF page 148)

~~~text
                                                                                          141

                                      Table 50​
                       Data Dictionary: Beneficiaries

Table Name: beneficiaries

     Table       This table stores centralized beneficiary profile records.

Description:

Related Table/s: organizations, system_users, beneficiary_project_enrollments,
                         beneficiary_activity_participation, beneficiary_journey_events,
                         assessment_results, evidence_media

Key  Field       Data      Length  Default      Field    Descripti           Sample
     Name        Type               Value     Validatio      on                Data

                                                   n

                                                         Unique

PK   beneficiar  INT       —          Auto    Not Null,  identifier          1
        y_id                       Increment  Primary     for each
                                                         beneficiar
                                                 Key

                                                         y.

                                                         Organizati

     organizati                               Not Null, on that
       on_id
FK               INT       —       None Foreign owns the                     1

                                              Key beneficiar

                                                         y record.

                                                         Unique

                                                         code

     beneficiar VARCHA     100     None       Not Null,  assigned BEN-2026
                                               Unique
     y_code      R                                       to the              -001

                                                         beneficiar

                                                         y.

     first_nam VARCHA      100     NULL       Nullable      First            Maria
                                                          name of
            e    R
                                                             the
                                                         beneficiar

                                                              y.

     middle_na VARCHA      100     NULL       Nullable     Middle            Santos
                                                          name of
     me          R
                                                             the
                                                         beneficiar

                                                              y.

     last_name   VARCHA    100     NULL       Nullable      Last             Reyes
                      R                                   name of

                                                             the
                                                         beneficiar

                                                              y.

     sex         ENUM      —          Not      Male,     Sex of the          Female
                                   Specified  Female,    beneficiar
~~~

### Manuscript page 142 (PDF page 149)

~~~text
                                                               142

                                    Other,      y for
                                  Prefer not  SADDD
                                              analysis.
                                    to say,
                                      Not

                                  Specified

                                              Birth date

birth_date DATE      —    NULL    Nullable    of the 2005-03-2

                                              beneficiar   0

                                              y.

                                              Age of the

age_at_re                                     beneficiar
gistration
             INT     —    NULL Nullable y during           21

                                              registratio

                                              n.

                                  With

                                  Disability, Disability

disability_  ENUM    —       Not Without status for Without
  status                  Specified Disability, SADDD Disability

                                  Not analysis.

                                  Specified

location_b VARCHA    150  None    Nullable    Barangay
                                                of the Barangay
arangay      R
                                              beneficiar 123
                                                   y.

location_c   VARCHA  150  None    Nullable      City or    Manila
ity_munici        R                           municipali
                                               ty of the
   pality                                     beneficiar

                                                   y.

location_p VARCHA    150  None    Nullable    Province     Metro
                                                of the     Manila
rovince      R
                                              beneficiar
                                                   y.

                                              Current

profile_sta  ENUM    —    Active   Active, status of       Active
    tus                           Inactive, the
                                  Archived beneficiar

                                              y profile.

                                              Indicates

consent_r BOOLEA                              whether

ecorded      N       —    FALSE Not Null consent           1

                                              was

                                              recorded.

             BOOLEA                           Indicates
                  N
is_minor             —    FALSE Not Null whether           0

                                              the
~~~

### Manuscript page 143 (PDF page 150)

~~~text
                                                                                 143

                                            beneficiar
                                            y is below
                                            18 years

                                                old.

                                            Indicates

                                            whether

    guardian_                               guardian
    consent_r
     ecorded   BOOLEA  —  FALSE   Not Null  consent                           0
                    N                         was

                                            recorded

                                            for

                                            minors.

                                            Indicates

                                            whether

    is_dummy BOOLEA                         the record

    _record    N       —  FALSE Not Null    is                                1

                                            dummy/sa

                                            mple

                                            data.

                                            User who

    created_b                     Nullable, created
         y
FK             INT     —  NULL Foreign      the                               3

                                  Key beneficiar

                                            y record.

                                            Date and

                                            time when

    created_a TIMESTA     CURREN            the 2026-02-1

    t          MP      —  T_TIMES Not Null beneficiar                         0

                          TAMP              y record 10:30:00

                                            was

                                            created.

                                            Date and

                                            time when

    updated_ TIMESTA              Nullable, the 2026-02-1

    at         MP      —  NULL    Auto beneficiar                             5

                                  Update y record 13:20:00

                                            was last

                                            updated.

                                           Table 51​
              Data Dictionary: Beneficiary Project Enrollments

Table Name:    beneficiary_project_enrollments

     Table     This table links beneficiaries to the projects where they are
Description:   enrolled.
~~~

### Manuscript page 144 (PDF page 151)

~~~text
                                                                                 144

Related Table/s: beneficiaries, projects

Key  Field       Data  Length             Default      Field      Descripti   Sample
     Name        Type     —                Value     Validatio        on        Data
                          —
                          —                               n
                          —
                          —                                       Unique
                          —
PK   enrollmen   INT                         Auto    Not Null,    identifier  1
         t_id                             Increment  Primary       for each
                                                                  enrollmen
                                                        Key

                                                                  t record.

FK   beneficiar  INT                      None       Not Null,    Beneficiar  1
        y_id                                         Foreign      y enrolled

                                                        Key          in the
                                                                   project.

                                                                  Project

                                                     Not Null, where the

FK project_id INT                         None Foreign beneficiar             1

                                                     Key          y is

                                                                  enrolled.

                                                                  Date

     enrollmen   DATE                     None       Nullable     when the    2026-02-0
       t_date                                                     beneficiar        1

                                                                    y was

                                                                  enrolled.

                                                     Active,

     enrollmen   ENUM                     Active     Complete      Current    Active
      t_status                                            d,      enrollmen
                                                                   t status.
                                                     Dropped,
                                                     Transferre

                                                     d, Inactive

     remarks TEXT                         None       Nullable     Additional  Enrolled
                                                                    notes      in first
                                                                               batch.
                                                                  about the
                                                                  enrollmen

                                                                       t.

                                           Table 52​
              Data Dictionary: Beneficiary Activity Participation

Table Name: beneficiary_activity_participation

    Table        This table records beneficiary attendance status, participation date,
Description:     progress status, and related notes for monitoring beneficiary
                 participation and activity-level movement.

Related Table/s: beneficiaries, project_activities, system_users

Key Field        Data Length Default Field Descripti Sample
~~~

### Manuscript page 145 (PDF page 152)

~~~text
                                                                   145

    Name Type             Value Validatio on                 Data
                                            n

                                                Unique

PK  participati  INT   —     Auto    Not Null,  identifier   1
      on_id               Increment  Primary     for each
                                                participati
                                        Key

                                                on record.

                                                Beneficiar

    beneficiar                       Not Null, y who
       y_id
FK               INT   —  None Foreign participate 1

                                     Key d in the

                                                activity.

                                                Activity

                                     Not Null, attended

FK activity_id INT     —  None Foreign by the                2

                                     Key beneficiar

                                                y.

                                     Present,

    attendanc    ENUM  —  Present     Absent,   Attendanc    Present
    e_status                         Complete       e or

                                       d, Not   participati
                                     Complete   on status.

                                          d,

                                     Excused

    participati  DATE  —  None       Nullable    Date of     2026-02-0
     on_date                                    participati        5

                                                    on.

                                     Not Progress

                                     Started, In status of

    progress_    ENUM  —  In Progress, the Complete
      status
                          Progress Complete beneficiar       d

                                     d, Needs y in the

                                     Follow-Up activity.

    progress_    TEXT  —  None       Nullable     Notes      Complete
       notes                                      about      d training
                                                beneficiar   requireme

                                                     y            nt.
                                                progress.

                                                User who

    recorded_                        Nullable, recorded
         by
FK               INT   —  NULL Foreign          the          3

                                     Key participati

                                                on.

    recorded_ TIMESTA     CURREN                Date and 2026-02-0

    at           MP    —  T_TIMES Not Null time when 5

                          TAMP                  participati 15:00:00
~~~

### Manuscript page 146 (PDF page 153)

~~~text
                                                                               146

                                                            on was
                                                           recorded.

                                           Table 53​
                 Data Dictionary: Beneficiary Journey Events

Table Name: beneficiary_journey_events

     Table       This table stores the chronological journey history of beneficiaries

Description: across projects and activities.

Related Table/s: beneficiaries, projects, project_activities, system_users

Key  Field       Data  Length  Default          Field      Descripti        Sample
     Name        Type     —     Value         Validatio        on             Data
                          —
                          —                        n
                          —
                                                           Unique
                          —
PK   journey_e   INT              Auto        Not Null,    identifier       1
      vent_id                  Increment      Primary      for each
                                                           journey
                                                 Key

                                                           event.

                                                           Beneficiar

     beneficiar                               Not Null, y related
        y_id
FK               INT           None Foreign to the                          1

                                              Key journey

                                                           event.

                                                           Project

                                              Not Null, related to

FK project_id INT              None Foreign                   the           1

                                              Key journey

                                                           event.

                                                           Activity

                                              Nullable, related to

FK activity_id INT             NULL Foreign                   the           2

                                              Key journey

                                                           event.

                                              Enrollmen

                                              t,

                                              Participati

     event_typ   ENUM          None               on,       Type of         Participati
          e                                   Progress     beneficiar           on
                                               Update,     y journey
                                              Completio
                                                             event.
                                                   n,

                                              Follow-Up

                                              , Dropout,

                                              Transfer
~~~

### Manuscript page 147 (PDF page 154)

~~~text
                                                                                  147

                                                             Date

     event_dat   DATE   —           None          Nullable   when the 2026-02-0
          e
                                                             event       5

                                                             occurred.

                                                                         Beneficiar

                                                             Descriptio  y

     event_des   TEXT   —           None          Nullable   n of the completed
       cription
                                                             journey     first

                                                             event. training

                                                                         activity.

                                                             User who

     recorded_                                    Nullable, recorded
          by
FK               INT    —           NULL Foreign             the         3

                                                  Key journey

                                                             event.

                                                             Date and

     created_a TIMESTA          CURREN                       time when 2026-02-0

            t    MP     —       T_TIMES Not Null the event               5

                                    TAMP                     was 15:00:00

                                                             recorded.

                                        Table 54​
                 Data Dictionary: Project Budget Records

Table Name: project_budget_records

     Table       This table stores planned budget, actual spending, and spending

Description: status for projects and activities.

Related Table/s: projects, project_activities, system_users, budget_expense_entries

Key  Field       Data   Length      Default         Field    Descripti   Sample
     Name        Type      —         Value        Validatio      on        Data
                           —                                                 1
                           —                           n
                                                                             1
PK   budget_re   INT               Auto           Not Null,  Unique
      cord_id                   Increment         Primary    identifier      2
                                                             for each
                                                     Key      budget
                                                              record.

FK project_id INT                   None          Not Null,   Project
FK activity_id INT                                Foreign    where the

                                                     Key       budget
                                                               record
                                                             belongs.

                                                  Nullable, Activity

                                    NULL          Foreign related to

                                                  Key        the
~~~

### Manuscript page 148 (PDF page 155)

~~~text
                                                                                148

                                                    budget
                                                    record.

    budget_c VARCHA     150   None  Nullable          Budget      Training
                                                     category     Materials
    ategory    R
                                                         or
                                                    classificati

                                                        on.

    planned_                                        Planned
     budget
               DECIMAL  14,2  0     Nullable budget 50000.00

                                                    amount.

    actual_sp                                       Actual
     ending
               DECIMAL  14,2  0     Nullable amount 48000.00

                                                    spent.

                                    Within

                                    Budget,

                                    Near Assessme

    spending_  ENUM     —     Not   Limit,          nt of         Within
      status
                              Assessed Over spending Budget

                                    Budget, condition.

                                    Not

                                    Assessed

    remarks TEXT        —     None  Nullable        Notes         Spending
                                                    about         remained
                                                    budget
                                                     use.           within
                                                                  approved
                                                                   budget.

                                                    User who

    recorded_                       Nullable, recorded
         by
FK             INT      —     NULL Foreign          the           4

                                    Key             budget

                                                    data.

                                                    Date and

                                                    time when

    recorded_ TIMESTA         CURREN                the 2026-02-1
                              T_TIMES Not Null
    at         MP       —                           budget        0
                                TAMP
                                                    record 11:00:00

                                                    was

                                                    created.

                                    Table 55​
               Data Dictionary: Assessment Results

Table Name:    assessment_results

     Table     This table stores assessment scores from pre-tests, post-tests,
Description:   outcome surveys, and feedback surveys.
~~~

### Manuscript page 149 (PDF page 156)

~~~text
                                                                                    149

Related Table/s: projects, project_activities, beneficiaries, form_submissions,
                         system_users

Key  Field       Data     Length  Default      Field    Descripti    Sample
     Name        Type              Value     Validatio      on         Data

                                                  n

                                                        Unique

        assessme          —          Auto    Not Null,   identifier              1
PK nt_result_i INT                Increment  Primary     for each
                                                        assessme
              d                                 Key

                                                        nt result.

                                                        Project

                                             Not Null, related to

FK project_id INT         —       None Foreign          the                      1

                                             Key assessme

                                                        nt.

                                                        Activity

                                             Nullable, related to

FK activity_id INT        —       NULL Foreign          the                      2

                                             Key assessme

                                                        nt.

                                                        Beneficiar

     beneficiar                              Nullable, y who
        y_id
FK               INT      —       NULL Foreign took the                          1

                                             Key assessme

                                                        nt.

                                             Pre-Test,

                                             Post-Test, Type of

     assessme                                Outcome assessme
      nt_type
                 ENUM     —       None       Survey,    nt Post-Test

                                             Feedback conducted

                                             Survey,    .

                                             Other

     score DECIMAL 10,2           None       Nullable     Score      85.00
                                                         obtained

                                                           in the
                                                        assessme

                                                             nt.

     maximum     DECIMAL  10,2    None                     Maximum
       _score                                Nullable possible 100.00

                                                             score.

                                                        Date

                                                        when the

     assessme    DATE     —       None       Nullable   assessme 2026-02-0
      nt_date
                                                        nt was                   6

                                                        conducted

                                                        .
~~~

### Manuscript page 150 (PDF page 157)

~~~text
                                                                                       150

                                                        Related

                                                        form

       source_su                           Nullable, submissio
FK bmission_ INT
                         —       NULL Foreign n where                   10
             id
                                           Key the score

                                                        came

                                                        from.

                                                        User who

     recorded_                             Nullable, recorded
          by
FK               INT     —       NULL Foreign           the                         3

                                           Key assessme

                                                        nt result.

                                     Table 56​
                       Data Dictionary: Alert Rules

Table Name: alert_rules

     Table       This table stores alert-rule definitions used to evaluate project

Description: conditions and trigger rule-based alerts.

Related Table/s: organizations, system_users, alert_rule_conditions,
                         alert_rule_recommendations, rule_based_alerts

Key  Field       Data    Length  Default      Field Descripti           Sample
     Name        Type             Value    Validation on                  Data

PK   alert_rule  INT     —          Auto     Not Null,   Unique                     1
         _id                     Incremen  Primary Key  identifier
                                                        for each
                                      t                 alert rule.

                                                        Organizati

FK   organizati  INT     —       None        Not Null, on that                      1
       on_id                               Foreign Key owns the

                                                        alert rule.

     rule_nam VARCHA                                    Name of Low KPI

            e    R       200     None      Not Null     the alert Achievem

                                                        rule.           ent

                                           Underperfor

                                           ming

                                           Indicator,

                                           Delayed Type of

                                           Timeline, issue Underperf

     rule_type ENUM      —       None Budget detected orming

                                           Concern, by the Indicator

                                           Beneficiary rule.

                                           Progress

                                           Issue,

                                           Survey
~~~

### Manuscript page 151 (PDF page 158)

~~~text
                                                                      151

                                       Improveme
                                       nt, Missing
                                       Follow-Up,

                                          Weak
                                        Outcome
                                        Indicator,
                                       Combined
                                        Condition

                                                    Paramete

    parameter VARCHA     150   None    Nullable     r checked actual_val

    _name       R                                   by the      ue

                                                    rule.

                                                    Comparis

                                       <, <=, =, >=, on

    operator ENUM        —     <       >,           operator    <

                                       BETWEEN used in

                                                    the rule.

    threshold   DECIMAL  12,2  None    Nullable     Minimum     75.00
     _value                                         or primary
                                                    threshold

                                                      value.

    threshold                  None    Nullable     Maximum     90.00
    _value_m DECIMAL 12,2                           threshold
                                                    value for
        ax                                          BETWEE
                                                     N rules.

    severity ENUM        —     Medium    Low,       Severity    High
                                       Medium,      assigned
                                                    when the
                                         High,
                                        Critical      rule is
                                                    triggered.

                                                    Current

    rule_statu  ENUM     —     Active  Active,      status of   Active
         s                             Inactive     the alert

                                                    rule.

                                                    User who

FK  created_b   INT      —     NULL      Nullable, created      2
         y                             Foreign Key the alert

                                                    rule.

                                                    Date and

    created_a TIMESTA          CURRE                time when 2026-02-0
                               NT_TIM
    t           MP       —     ESTAMP  Not Null     the rule    1

                                                    was 09:00:00

                                                    created.
~~~

### Manuscript page 152 (PDF page 159)

~~~text
                                                                                       152

                                     Table 57​
                  Data Dictionary: Rule-Based Alerts

Table Name: rule_based_alerts

     Table        This table stores actual alerts triggered when project data meet

Description: predefined alert rule conditions.

Related Table/s: projects, alert_rules, project_indicators, project_activities,
                         system_users, decision_recommendations

Key  Field        Data    Length  Default         Field    Descripti             Sample
     Name         Type             Value        Validatio      on                  Data

                                                     n

                                                           Unique

PK alert_id       INT     —          Auto       Not Null,  identifier            1
                                  Increment     Primary    for each
                                                           triggered
                                                   Key

                                                           alert.

FK project_id INT         —       None          Not Null,   Project              1
                                                Foreign    where the
                                                           alert was
                                                   Key     triggered.

FK   alert_rule   INT     —       NULL          Nullable,  Alert rule            1
         _id                                    Foreign       that

                                                   Key     triggered
                                                           the alert.

FK   related_in   INT     —       NULL          Nullable,   Project              3
     dicator_id                                 Foreign    indicator
                                                           related to
                                                   Key     the alert.

     related_a                                  Nullable, Activity
     ctivity_id
FK                INT     —       NULL Foreign related to                        2

                                                Key the alert.

                                                                                 Training

                  VARCHA                                   Title of the Completio
                       R
     alert_title          250     None          Not Null   triggered n Rate

                                                           alert.                Below

                                                                                 Target

                                                                                 Actual

     alert_mes    TEXT    —       None          Not Null   Descriptio            completio
        sage                                                n of the              n rate is
                                                              alert.             below the
                                                                                   target

                                                                                 value.

     severity ENUM        —       Medium          Low,     Severity              High
                                                Medium,    level of
~~~

### Manuscript page 153 (PDF page 160)

~~~text
                                                              153

                                   High, the alert.
                                  Critical

    alert_stat  ENUM   —  New        New,                New
        us                        Reviewed

                                        ,
                                  Actioned, Current
                                  Resolved, status of
                                  Dismissed the alert.

                                        ,
                                  Auto-resol

                                      ved

    reviewed_                     Nullable, User who
         by
FK              INT    —  NULL Foreign reviewed          4

                                  Key the alert.

                                             Date and

    reviewed_ DATETIM                        time when 2026-03-0

    at          E      —  NULL    Nullable   the alert   1

                                             was 14:00:00

                                             reviewed.

    outcome ENUM       —  NULL    Accept,    Human-re    Accept
                                  Partially    viewed
                                  Accept,    outcome
                                  Decline,   recorded
                                  Escalate     for the
                                             triggered
                                                alert.

                                             Notes

    outcome_    TEXT   —  NULL    Nullable   explaining  Corrective
       note                                      the       action
                                                             was
                                              outcome
                                              or action  approved.
                                             taken for

                                             the alert.

                                             Internal

    outcome_                      Nullable, user who
         by
FK              INT    —  NULL Foreign recorded          5

                                  Key the alert

                                             outcome.

                                             Date and

    outcome_ DATETIM   —  NULL    Nullable   time when   2026-03-2
                                              the alert        0
    at          E                             outcome
                                                          09:00:00
                                                 was

                                             recorded.

    created_a TIMESTA     CURREN             Date and 2026-03-0

    t           MP     —  T_TIMES Not Null time when 1

                          TAMP               the alert 13:00:00
~~~

### Manuscript page 154 (PDF page 161)

~~~text
                                                                                154

                                                          was
                                                        created.

                                          Table 58​
                Data Dictionary: Decision Recommendations

Table Name: decision_recommendations

     Table      This table stores rule-based suggested actions, review prompts,

Description: priority flags, or future project suggestions for human review.

Related Table/s: projects, rule_based_alerts, alert_rule_recommendations,
                        system_users

Key  Field      Data Type Length  Default      Field    Description        Sample
     Name                          Value     Validatio                       Data

                                                  n

                                                        Unique

        recomme      —               Auto    Not Null,  identifier for        1
PK ndation_i INT                  Increment  Primary        each

             d                                  Key     recommend

                                                        ation.

                                                        Project

                                             Not Null, related to

FK project_id INT    —            None Foreign             the                1

                                             Key recommend

                                                        ation.

FK alert_id     INT  —            NULL       Nullable,  Alert related         1
                                             Foreign        to the

                                                Key     recommend
                                                            ation.

                                                        Pre-written

                                                           rule

                                                        recommend

     source_ru                               Nullable,  ation used
                                             Foreign      as the
FK   le_recom   INT  —            NULL                                        2
     mendatio                                   Key     source of
                                                            the
     n_id

                                                        generated

                                                        recommend

                                                        ation.

     recomme                      None       Not Null   Title of the        Review
     ndation_ti VARCHAR 250                             recommend          Training
                                                                           Completi
         tle                                                ation.
                                                                               on
~~~

### Manuscript page 155 (PDF page 162)

~~~text
                                                             155

                                                        Strategy

                                                        Review

                                                        attendan

    recomme    TEXT   —  None  Not Null    Suggested        ce
    ndation_t                               action or   barriers
                                             review
        ext                                  prompt.       and
                                                        consider

                                                        follow-up

                                                        sessions.

                               Budget,

                               KPI,

                               Survey Basis used

    recomme                    Improvem    for
    ndation_b
               ENUM   —  None  ent, generating          KPI
       asis
                               Timeline,   the

                               Beneficiar recommend

                               y           ation.

                               Progress,

                               Combined

                               Suggeste

                               d Action,

                               Priority

    recomme                    Flag,       Type of
    ndation_t
               ENUM   —  Suggeste Review recommend Review
       ype
                         d Action Prompt,  ation        Prompt

                               Future generated.

                               Project

                               Suggestio

                               n

                               New,

                               Reviewed, Current

                               Actioned, human-revie

    review_st  ENUM   —  New   Resolved, w lifecycle    New
       atus
                               Dismissed status of the

                               ,           recommend

                               Auto-resol ation.

                               ved

                                           User who

    reviewed                   Nullable, reviewed
       _by
FK             INT    —  NULL Foreign      the          4

                               Key recommend

                                           ation.

                                           Date and

    reviewed DATETIM  —  NULL  Nullable     time when   2026-03-
                                                the         01
    _at        E
                                           recommend    15:00:00
                                            ation was

                                           reviewed.
~~~

### Manuscript page 156 (PDF page 163)

~~~text
                                                                         156

     outcome ENUM        —         NULL   Accept,      Human-revi        Accept
                                          Partially        ewed
                                   None   Accept,
                                          Decline,       outcome
                                   NULL   Escalate     recorded for

                                   NULL                      the
                                 CURREN                recommend
                                 T_TIMES
                                                           ation.
                                   TAMP
                                                           Notes or       Project
                                                           remarks       manager

     outcome_  TEXT      —                Nullable      about the        requested
        note                                           action taken       revised

                                                       or  result after  implement
                                                           review.          ation

                                                                         schedule.

                                                       Internal user

     outcome_                             Nullable,        who
          by
FK             INT       —                Foreign recorded the 5

                                          Key recommenda

                                                       tion outcome.

                                                           Date and

     outcome_                                          time when 2026-03-2
          at
               DATETIME  —                Nullable     the outcome 0

                                                           was           09:15:00

                                                       recorded.

                                                       Date and

     created_a TIMESTA   —                Not Null      time when        2026-03-
                                                            the              01
     t         MP
                                                       recommend         13:30:00
                                                        ation was

                                                       generated.

                                      Table 59​
               Data Dictionary: Budget Expense Entries

Table Name: budget_expense_entries

    Table      This table allows authorized users to encode expense descriptions,
Description:   expense amounts, expense dates, receipt file references, liquidation
               status, verification details, approval details, and rejection reasons.
               The table supports budget monitoring, financial evidence
               organization, liquidation tracking, and project-level reporting.

Related Table/s: project_budget_records, system_users

Key  Field     Data Type Length  Default    Field      Description       Sample
     Name                         Value   Validatio                        Data

                                               n
~~~

### Manuscript page 157 (PDF page 164)

~~~text
                                                                         157

                                                      Unique

PK  expense_     INT      —        Auto    Not Null,  identifier for  1
     entry_id                   Increment  Primary    each budget

                                           Key        expense

                                                      entry.

                                                      Budget

    budget_re                              Not Null, record where
     cord_id
FK               INT      —     None Foreign the expense 1

                                           Key        entry

                                                      belongs.

    expense_                                          Description Training
    description
                 TEXT     —     None       Nullable or purpose of materials
                                                        the expense. purchase

                                                      Amount

    expense_     DECIMAL  14,2  0.00       Not Null   spent for the   12500.00
     amount                                             expense

                                                      entry.

    expense_     DATE     —     NULL       Nullable    Date when      2026-03-1
       date                                           the expense           5
                                                      was incurred.

                                                      Internal user

    submitted                              Nullable,  who
        _by
FK               INT      —     NULL Foreign submitted the 4

                                           Key        expense

                                                      entry.

                                                      Date and

    submitted TIMESTAM    —       Current  Nullable    time when 2026-03-1
                                Timestamp             the expense 5
    _at          P
                                                       entry was 09:30:00

                                                      submitted.

                                                      File path or

                                                           URL        /uploads/r
                                                      reference of    eceipts/re

    receipt_url VARCHAR 500     None       Nullable   the uploaded    ceipt-001.
                                                        receipt or        pdf
                                                       supporting

                                                      document.

    liquidation                            Pending,    Current
     _status ENUM                          Verified,  liquidation

                          —     Pending    Approved,  status of the   Pending
                                           Rejected     expense

                                                      entry.
~~~

### Manuscript page 158 (PDF page 165)

~~~text
                                                                        158

                                                      Internal user

FK verified_by INT      —   NULL       Nullable,      who verified   5
                                       Foreign        the expense

                                       Key             entry or
                                                      supporting

                                                      evidence.

                                                      Date and

                                                      time when 2026-03-1

    verified_at DATETIME —  NULL Nullable the expense 6

                                                      entry was 13:20:00

                                                      verified.

                                                      Internal user

    approved_                          Nullable,      who
         by
FK               INT    —   NULL Foreign approved the 6

                                       Key            expense

                                                      entry.

                                                      Date and

    approved_ DATETIME —    NULL                      time when 2026-03-1
         at                            Nullable the expense 7

                                                      entry was 10:00:00

                                                      approved.

                                                      Reason why

    rejection_r                                       the expense Receipt is
      eason
                 TEXT   —   None       Nullable entry was unreadabl

                                                      rejected, if   e

                                                      applicable.

    created_at TIMESTAM —   Current    Nullable       Date and       2026-03-1
                                                      time when            5

                 P          Timestamp                  the record    09:30:00
                                                      was created.

                                                      Date and

    updated_a TIMESTAM                 Nullable,      time when 2026-03-1
                                         Auto
    t            P      —   NULL                      the record     7
                                        Update
                                                      was last 10:00:00

                                                      updated.

                                      Table 60​
                      Data Dictionary: Journey Stage

Table Name:      journey_stages

     Table       This table allows the system to represent ordered stages, branching
Description:     stages, terminal stages, and open-ended follow-up stages
~~~

### Manuscript page 159 (PDF page 166)

~~~text
                                                                                 159

Related Table/s: projects, journey_stages, activity_journey_stage, system_users

Key  Field       Data Type Length  Default      Field    Description     Sample
     Name                           Value     Validatio                    Data

                                                   n

                                              Not Null,  Unique
                                              Primary
PK stage_id INT           —           Auto               identifier for  1
                                   Increment     Key     each journey

                                                         stage.

FK project_id INT         —        None       Not Null,      Project     1
                                              Foreign      where the
                                                         journey stage
                                              Key
                                                         belongs.

                                                         Short code

     stage_cod                                           used to

     e           VARCHAR 50         None      Not Null identify the J2.1
                                    None
                                    None                 journey
                                   NULL
                                    Core                 stage.
                                   FALSE
                                    None                 Name or            Skills
                                                                          Training
     stage_na    VARCHAR  200                 Not Null   label of the    Follow-Up
         me                                                journey
                                                            stage.

                                                         Numeric

     stage_ord INT                                       order of the

     er                   —                   Not Null stage within 3

                                                         the project

                                                         journey.

     parent_sta                               Nullable, Parent stage
        ge_id                                             used for
FK               INT      —                   Foreign    branching       2
                                                Key      journeys.

                                              Entry, Classification

     stage_typ   ENUM     —                    Core,      of the         Follow-Up
          e                                   Branch,    journey

                                              Follow-Up stage.

                                                         Indicates

                                                         whether the

     is_terminal BOOLEAN —                                   stage is an
                                              Nullable ending stage FALSE

                                                         in the

                                                         journey.

     description TEXT     —                                 Description Open-end
                                              Nullable of the stage ed
~~~

### Manuscript page 160 (PDF page 167)

~~~text
                                                                             160

                                                          and its follow-up

                                                          monitoring after

                                                          purpose. training

                                                                          completio

                                                                          n

FK   created_b   INT       —        NULL      Nullable,  Internal user    3
          y                                   Foreign    who created
                                                         the journey
                                                 Key
                                                             stage.

                                                          Date and

                 TIMESTAM          CURRENT                time when 2026-02-0
                       P
     created_at            —       _TIMESTA Nullable the journey          5

                                    MP                    stage was 10:30:00

                                                          created.

                                       Table 61​
                 Data Dictionary: Activity Journey Stage

Table Name: activity_journey_stage

    Table        This table allows the system to determine which activities belong to
Description:     a specific journey stage, whether the activity is required, and the
                 sequence of activities within the stage. This supports configurable
                 journey tracking, stage-based participation monitoring, branching
                 paths, and open-ended follow-up handling without hardcoding
                 activity-stage relationships.

Related Table/s: project_activities, journey_stages, system_users

Key  Field       Data Type Length   Default     Field    Description      Sample
     Name                            Value    Validatio                     Data

                                                   n

                                                          Unique

     mapping_i                        Auto    Not Null, identifier for
           d                       Increment
PK               INT       —                  Primary              each   1

                                              Key activity-to-sta

                                                         ge mapping.

FK activity_id INT         —        None      Not Null,      Project      2
                                              Foreign    activity linked
                                                          to a journey
                                                 Key
                                                             stage.

FK stage_id INT            —        None      Not Null,    Journey        3
                                              Foreign    stage where
                                                          the activity
                                                 Key
                                                           belongs.
~~~

### Manuscript page 161 (PDF page 168)

~~~text
                                                                               161

                                                           Indicates

     is_require  BOOLEAN  —              TRUE                whether the    TRUE
          d                                    Nullable activity is

                                                             required for

                                                           the stage.

                                                           Order of the

     sequence    INT      —              None  Nullable    activity within  1
       _order                                               the journey

                                                            stage.

FK created_b INT                               Nullable, Internal user
             y
                          —              NULL Foreign who created 3

                                               Key the mapping.

     created_at TIMESTAM  —        CURRENT                 Date and         2026-02-0
                                   _TIMESTA Nullable       time when              5

                 P                       MP                the mapping      10:30:00
                                                           was created.

                                          Table ??​
                 Data Dictionary: User Project Assignments

Table Name: user_project_assignments

     Table       This table assigns internal users to projects and records who made

Description: the assignment, its active state, and its effective dates.

Related Table/s: system_users, projects

Key  Field       Data Type Length  Default       Field     Description      Sample
     Name                           Value      Validatio                      Data

                                               n

                                                           Unique

PK assignme INT                                Primary identifier of
           nt_id
                          —              None Key, Auto     the             1

                                               Increment user-project

                                                           assignment.

                                               Not Null,

FK user_id       INT      —              None  Foreign     Internal user    5
                                                 Key,      assigned to

                                               Unique      the project.
                                                 with

                                               project_id

FK project_id INT         —              None  Not Null, Project to         3
                                               Foreign which the
~~~

### Manuscript page 162 (PDF page 169)

~~~text
                                                                                    162

                                                     Key,       user is
                                                   Unique     assigned.

                                                     with
                                                   user_id

FK assigned    INT      —        NULL              Nullable,  Internal user  2
                                                   Foreign    who created

     _by                                           Key              the
                                                              assignment.

                                                              Current

     assignme                                      Active, status of the
     nt_status ENUM     —        Active Inactive                             Active
                                                              project

                                                              assignment.

                                                              Date and

     assigned TIMESTA   —        CURREN                       time when      2026-03-
                                 T_TIMES Nullable                 the            01

     _at       MP                TAMP                         assignment     09:00:00
                                                                   was

                                                              created.

                                                              Date and

               DATETIM                                        time when 2026-12-
                    E
     ended_at           —        NULL              Nullable   the            31

                                                              assignment 17:00:00

                                                              ended.

                                          Table ??​
               Data Dictionary: Project Activity Assignments

Table Name: project_activity_assignments

     Table     This table assigns internal users to project activities and records

Description: who made the assignment, its status, and when it was created.

Related Table/s: project_activities, system_users

Key  Field     Data Type Length  Default             Field    Description    Sample
     Name                         Value            Validatio                   Data

                                                        n

        activity_a                                 Primary      Unique
PK ssignmen INT                                               identifier of
                        —        None              Key, Auto                 1
            t_id                                   Increment   the activity
                                                              assignment.
~~~

### Manuscript page 163 (PDF page 170)

~~~text
                                                                                    163

                                           Not Null,     Project
                                                        activity to
FK activity_id INT     —          None     Foreign      which the               12
                                             Key,

                                           Unique         user is
                                             with       assigned.

                                           user_id

                                           Not Null,

FK user_id      INT    —          None     Foreign      Internal user           5
                                             Key,       assigned to
                                                        the activity.
                                           Unique
                                             with

                                           activity_id

FK   assigned   INT    —          NULL     Nullable,    Internal user           2
        _by                                Foreign      who created

                                              Key             the
                                                        assignment.

                                           Active, Current

     assignme   ENUM   —          Active   Complete status of the      Active
     nt_status
                                           d,           activity

                                           Removed assignment.

                                                        Date and

     assigned TIMESTA             CURREN                time when      2026-03-
                                                        the activity
                       —          T_TIMES  Nullable                        01
     _at        MP                  TAMP                assignment     09:30:00
                                                             was

                                                        created.

                                         Table ??​
                Data Dictionary: Project Evaluation Criteria

Table Name: project_evaluation_criteria

    Table       This table stores weighted criteria used to evaluate project
Description:    performance across indicators, timelines, budgets, beneficiary
                reach, and other measures.

Related Table/s: projects, system_users, project_evaluation_scores

Key  Field      Data Type Length  Default    Field      Description    Sample
                                           Validatio
     Name                         Value                                Data
                                           n
~~~

### Manuscript page 164 (PDF page 171)

~~~text
                                                                   164

                                              Unique

evaluatio                        Primary identifier of

PK n_criterio INT     —    None  Key, Auto    the             1
                           None
n_id                             Increment evaluation
                           None
                           None               criterion.
                           NULL
                                 Not Null,
                              0
                                 Foreign

FK project_id INT     —             Key,      Project to      3
                                  Unique      which the
                                               criterion
                                    with
                                 criterion_t
                                 ype and applies.

                                 criterion_n

                                 ame

                                 Not Null;

                                 KPI,

                                 Timeline

                                 Complian Category of

criterion_t  ENUM     —          ce,          project         KPI
    ype
                                 Budget evaluation

                                 Efficiency, criterion.

                                 Beneficiar

                                 y Reach,

                                 Other

                                 Not Null,

                                 Unique Name of the Outcome
                                    with
criterion_   VARCHAR  200        project_id     project       indicator
  name                                        evaluation      achievem
                                     and       criterion.
                                 criterion_t                      ent

                                 ype

                                                              Measure

criterion_                                      Detailed           s
                                              explanation     achievem
descriptio TEXT       —          Nullable
                                                 of the           ent
n                                              criterion.      against

                                                              target

                                                              KPIs.

weight_p     DECIMAL  5,2        Not Null     Percentage      25.00
ercentage                                        weight

                                              assigned to
                                              the criterion.
~~~

### Manuscript page 165 (PDF page 172)

~~~text
                                                                          165

     is_active BOOLEAN —          TRUE     Nullable    Indicates       TRUE
                                                      whether the
                                                       criterion is

                                                         active.

     created_b                             Nullable, Internal user
          y
FK              INT     —         NULL Foreign who created 5

                                           Key the criterion.

                                                      Date and

     created_a TIMESTA            CURREN              time when 2026-03-

            t   MP      —         T_TIMES Nullable the criterion 01

                                  TAMP                            was  10:00:00

                                                      created.

     updated_ TIMESTA   —         NULL     Nullable,   Date and
                                             Auto      time when 2026-03-
            at  MP                                    the criterion 05
                                            Update      was last 14:00:00
                                                        updated.

                                    Table ??​
                Data Dictionary: Project Evaluations

Table Name: project_evaluations

     Table      This table stores formal project evaluations, scoring periods, review

Description: commentary, lifecycle status, and sign-off details.

Related Table/s: projects, system_users, project_evaluation_scores

Key  Field      Data Type Length  Default    Field    Description      Sample
     Name                          Value   Validatio                     Data

                                                n

PK evaluatio    INT     —         None      Primary     Unique         1
                                           Key, Auto  identifier of

     n_id                                  Increment  the project
                                                      evaluation.

                                           Not Null, Project

FK project_id INT       —         None Foreign        being            3

                                           Key evaluated.

     evaluatio VARCHAR 250        None     Not Null   Title of the       2026
       n_title                                          project        Midyear
                                                                       Project
                                                      evaluation.
~~~

### Manuscript page 166 (PDF page 173)

~~~text
                                                                     166

                                                                Evaluatio
                                                                     n

    evaluatio                                    Label for the January–
    n_period
                VARCHAR  100   NULL   Nullable evaluation June
                               NULL
                               NULL              period.        2026
                               NULL
                               NULL              Start date of

    period_st DATE       —     Draft  Nullable   the            2026-01-
                               NULL
    art_date                   NULL              evaluation 01

                                                 period.

                                                 End date of

    period_en   DATE     —            Nullable   the            2026-06-

    d_date                                       evaluation 30

                                                 period.

    overall_sc  DECIMAL  10,2         Nullable     Overall      87.50
        ore                                        project
                                                 evaluation
                                                   score.

                                                                The

                                                 Overall project

    evaluatio                                    commentary met most

    n_comme TEXT         —            Nullable   recorded for targets

    ntary                                        the            within the

                                                 evaluation. review

                                                                period.

                                      Draft,

    evaluatio                         Submitted  Current        Reviewe
                                            ,    lifecycle

    n_status ENUM        —            Reviewed,  status of the  d
                                        Signed   evaluation.

                                      Off,

                                      Archived

                                                 Internal user

    evaluated                         Nullable,  who
        _by
FK              INT      —            Foreign performed         5

                                      Key        the

                                                 evaluation.

    evaluated DATETIM    —            Nullable   Date and       2026-07-
                                                 time when          05
    _at         E
                                                     the        10:00:00
                                                 evaluation
~~~

### Manuscript page 167 (PDF page 174)

~~~text
                                                              167

                                                was
                                            performed.

                                            Internal user

    reviewed                    Nullable,   who

FK  _by        INT     —  NULL Foreign reviewed            2

                                Key         the

                                            evaluation.

    reviewed DATETIM   —  NULL  Nullable    Date and       2026-07-
                                            time when          08
    _at        E
                                                the        14:00:00
                                            evaluation

                                                was
                                            reviewed.

                                            Feedback       Clarify
                                            recorded         the

    review_fe  TEXT    —  NULL  Nullable      during       variance
     edback                                 evaluation         in

                                            review.        beneficiar
                                                            y reach.

FK  signed_of  INT     —  NULL  Nullable,   Internal user  1
       f_by                     Foreign     who signed

                                   Key          off the
                                             evaluation.

    signed_of DATETIM  —  NULL  Nullable     Date and      2026-07-
                                            time when          10
    f_at       E
                                                 the       09:00:00
                                            evaluation
                                            was signed

                                                 off.

                                            Date and

    created_a TIMESTA  —  CURREN            time when      2026-07-
                          T_TIMES Nullable       the           01
    t          MP
                            TAMP            evaluation     08:00:00
                                            record was

                                            created.

    updated_ TIMESTA   —  NULL  Nullable,    Date and      2026-07-
                                  Auto      time when          10
    at         MP
                                 Update          the       09:00:00
                                            evaluation
                                            record was
~~~

### Manuscript page 168 (PDF page 175)

~~~text
                                                                               168

                                                          last
                                                       updated.

                                        Table ??​
                Data Dictionary: Project Evaluation Scores

Table Name: project_evaluation_scores

     Table      This table stores criterion-level scores, maximum scores, weighted

Description: scores, and commentary for each project evaluation.

Related Table/s: project_evaluations, project_evaluation_criteria

Key  Field      Data Type Length  Default    Field     Description          Sample
     Name                          Value   Validatio                          Data

                                                n

                                                                   Unique

        evaluatio                          Primary identifier of
PK n_score_i INT
                     —            None Key, Auto                   the      1
             d
                                           Increment evaluation

                                                                   score.

                                           Not Null,

FK   evaluatio  INT  —            None      Foreign       Project           1
        n_id                                  Key,      evaluation
                                                       to which the
                                             Unique
                                               with        score

                                           evaluation
                                           _criterion_ belongs.

                                           id

                                           Not Null,

        evaluatio                          Foreign     Evaluation
FK n_criterio INT                            Key,       criterion

           n_id      —            None       Unique                 being   4
                                               with                scored.

                                           evaluation

                                           _id

     score DECIMAL 10,2           NULL                       Score          85.00
                                           Nullable achieved for

                                                         the criterion.

     maximum                      NULL     Nullable     Maximum             100.00
       _score DECIMAL 10,2                               possible
                                                       score for the
                                                         criterion.
~~~

### Manuscript page 169 (PDF page 176)

~~~text
                                                                           169

     weighted    DECIMAL      10,2  NULL     Nullable    Weighted       21.25
      _score                        NULL                    score

                                                         calculated
                                                           for the
                                                          criterion.

                                                        Commentar Performa
                                                                        nce was
     comment     TEXT         —              Nullable   y supporting     slightly
         ary                                            the criterion   below the
                                                                          target.
                                                            score.

                                      Table ??​
                 Data Dictionary: Alert Rule Conditions

Table Name: alert_rule_conditions

    Table        This table stores the ordered conditions evaluated for an alert rule,
Description:     including parameters, comparison operators, thresholds, and logical
                 connectors.

Related Table/s: alert_rules

Key  Field       Data Type Length   Default    Field    Description     Sample
     Name                            Value   Validatio                    Data

                                                  n

     rule_cond                               Primary       Unique
                                                         identifier of
PK ition_id      INT          —     None     Key, Auto                  1
                                             Increment  the alert rule
                                                         condition.

FK   alert_rule  INT          —     None     Not Null,  Alert rule to   3
         _id                                 Foreign     which the
                                                         condition
                                                Key
                                                         belongs.

                                                        Project data

     paramete    VARCHAR      150   None     Not Null    parameter      actual_va
      r_name                                             evaluated          lue

                                                           by the

                                                         condition.

                                             Not Null;  Comparison
                                                          operator
     operator ENUM            —     None     <, <=, =,                  <
                                              >=, >,    used by the
                                                         condition.
                                             BETWEE
                                                  N
~~~

### Manuscript page 170 (PDF page 177)

~~~text
                                                                                   170

     threshold   DECIMAL  12,2     NULL     Nullable          Primary    75.00
      _value                       NULL                      threshold
                                   AND                     value used
                                   NULL
                                   NULL                          for
                                                           comparison.

     threshold                              Nullable           Upper     90.00
     _value_m DECIMAL 12,2                                  threshold
                                                           used when
         ax                                                the operator

                                                                  is
                                                           BETWEEN.

                                                           Logical

     logical_co  ENUM     —                 AND, OR        connector to  AND
      nnector                                                the next

                                                           condition.

                                                           Evaluation

     sequence                                              order of the

     _no         INT      —                 Nullable condition           1

                                                           within the

                                                           rule.

                                                                         Trigger

                                                           Human-read when

     condition                                             able          indicator

     _descripti TEXT      —                 Nullable       explanation performa

     on                                                    of the        nce is

                                                           condition. below 75

                                                                         percent.

                                            Table ??​
                 Data Dictionary: Alert Rule Recommendations

Table Name: alert_rule_recommendations

     Table       This table stores reusable recommendations associated with alert

Description: rules for later generation and human review.

Related Table/s: alert_rules, system_users, decision_recommendations

Key  Field       Data Type Length  Default    Field        Description   Sample
                                            Validatio
     Name                          Value                                 Data
                                            n
~~~

### Manuscript page 171 (PDF page 178)

~~~text
                                                                 171

                                             Unique

        rule_reco                 Primary identifier of
PK mmendati INT
                      —     None Key, Auto the rule          1
           on_id
                                  Increment recommend

                                             ation.

                                             Alert rule

    alert_rule                    Not Null, that owns
        _id
FK              INT   —     None Foreign     the             3

                                  Key recommend

                                             ation.

                                             Short title of

    recomme                                  the             Review
    ndation_ti VARCHAR 250
                            None  Not Null   recommend activity
        tle
                                             ed action or implemen

                                             review          tation

                                             prompt.

                                                             Coordinat

                                             Detailed        ea

    recomme                                  recommend corrective
    ndation_t
                TEXT  —     None  Not Null   ation           -action
        ext
                                             associated review

                                             with the with the

                                             alert rule. project

                                                             team.

                                  Suggeste

                                  d Action,

                                  Priority

    recomme                       Flag, Classificatio
    ndation_t
                ENUM  —     Suggeste Review n of the Suggeste
       ype                  d Action Prompt, recommend d Action

                                  Future     ation.

                                  Project

                                  Suggestio

                                  n

    is_active BOOLEAN —     TRUE  Nullable    Indicates      TRUE
                                             whether the
                                             recommend
                                              ation may

                                               be used.
~~~

### Manuscript page 172 (PDF page 179)

~~~text
                                                                                      172

                                                      Internal user

     created_b                             Nullable, who created
          y
FK              INT     —         NULL Foreign        the                          5

                                           Key recommend

                                                      ation.

                                                      Date and

     created_a TIMESTA  —         CURREN   Nullable    time when            2026-03-
                                  T_TIMES                  the                  01
            t   MP
                                    TAMP              recommend             11:00:00
                                                       ation was

                                                      created.

                                                      Date and

                                                      time when

     updated_ TIMESTA                      Nullable,  the                   2026-03-
                                             Auto
            at  MP      —         NULL                recommend 05
                                            Update
                                                      ation was 15:00:00

                                                      last

                                                      updated.

                                     Table ??​
                    Data Dictionary: Evidence Media

Table Name: evidence_media

     Table      This table stores controlled project evidence files, verification

Description: details, consent status, and approval information for public use.

Related Table/s: projects, project_activities, beneficiaries, system_users

Key  Field      Data Type Length  Default    Field    Description           Sample
     Name                          Value   Validatio                          Data

                                           n

                                                      Unique

        evidence        —         None      Primary   identifier of                1
PK _media_i INT                            Key, Auto       the
                                           Increment
             d                                         evidence
                                                         media

                                                      record.

                                           Not Null,    Project
                                                      associated
FK project_id INT       —         None     Foreign                                 3
                                             Key       with the
                                                      evidence.
~~~

### Manuscript page 173 (PDF page 180)

~~~text
                                                                        173

                                                    Project

                                         Nullable, activity

FK activity_id INT        —    NULL Foreign associated 12

                                         Key        with the

                                                    evidence.

    beneficiar                           Nullable, Beneficiary
       y_id                                         associated
FK               INT      —    NULL      Foreign      with the     105
                                           Key      evidence.

                                         Document

                                         , Photo,

                                         Video,     Classificatio
                                                       n of the
    evidence     ENUM     —    Document  Progress    evidence.     Photo
      _type                                Proof,

                                         Completio

                                         n Proof,

                                         Other

    file_name VARCHAR 255      NULL      Nullable    Original or
                                                       display progress

                                                    name of the _photo_0
                                                     evidence 1.jpg
                                                         file.

    file_refere  VARCHAR  500  None      Not Null   Stored file    evidence/
        nce                                           path or      projects/3
                                                                   /progress
                                                    reference      _photo_0
                                                      for the
                                                                      1.jpg
                                                    evidence.

                                                                   Photo

                                                    Description documen

    descriptio   TEXT     —    NULL      Nullable     of the           ting
         n                                          evidence       completio
                                                                    n of the
                                                     and its

                                                    context. training

                                                                   activity.

                                                    Internal user

    submitted                            Nullable,  who
        _by
FK               INT      —    NULL Foreign submitted              5

                                         Key        the

                                                    evidence.
~~~

### Manuscript page 174 (PDF page 181)

~~~text
                                                                     174

                                                  Date and

    submitted TIMESTA     —  CURREN               time when      2026-03-
                             T_TIMES Nullable         the            15

    _at          MP          TAMP                 evidence       10:30:00
                                                     was

                                                  submitted.

                                      Pending, Current

    verificatio  ENUM     —  Pending   Verified, verification    Verified
    n_status                          Approved, status of the

                                      Rejected evidence.

    verified_b                        Nullable,   Internal user
                                                  who verified
FK               INT      —  NULL     Foreign                    2
    y                                   Key           the
                                                  evidence.

                                                  Date and

    verified_a DATETIM                            time when 2026-03-

    t            E        —  NULL     Nullable    the            16

                                                  evidence 09:00:00

                                                  was verified.

    rejection_   TEXT     —  NULL     Nullable    Reason          Image
     reason                                       recorded       does not
                                                  when the        clearly
                                                                 show the
                                                  evidence is
                                                   rejected.     complete
                                                                 d output.

    consent_     BOOLEAN  —  FALSE    Nullable     Indicates     TRUE
    confirmed                                       whether
                                                   required
                                                  consent for

                                                       the
                                                   evidence

                                                      was
                                                  confirmed.

                                       Private,   Approval
                                          For
    public_ap    ENUM     —  Private                   state       For
    proval_st                          Review,     governing     Review
                                      Approved    public use of
       atus                           for Public
                                                        the

                                                  evidence.
~~~

### Manuscript page 175 (PDF page 182)

~~~text
                                                                                 175

                                                              Internal user

     public_ap                              Nullable,            who
                                            Foreign           approved
FK proved_b INT         —          NULL                                      1
                                   NULL                             the
            y                               Key               evidence for

                                                              public use.

                                                              Date and

                                                              time when

     public_ap DATETIM                                        public use of 2026-03-
     proved_at E
                        —                   Nullable              the        20

                                                              evidence 11:00:00

                                                                  was

                                                              approved.

                                    Table ??​
                        Data Dictionary: Reports

Table Name: reports

     Table       This table stores generated-report metadata, scope, output format,

Description: status, file reference, and generation details.

Related Table/s: organizations, programs, projects, system_users

Key  Field       Data Type Length  Default    Field           Description    Sample
                                            Validatio
     Name                          Value                                     Data
                                            n

                                                              Unique

                                            Primary identifier of

PK report_id INT        —          None Key, Auto the report                 1

                                            Increment metadata

                                                              record.

     organizati                             Not Null, Organizatio
       on_id
FK               INT    —          None Foreign n that owns                  2

                                            Key the report.

     program_i                              Nullable, Program
          d
FK               INT    —          NULL Foreign covered by                   4

                                            Key the report.

                                            Nullable, Project

FK project_id INT       —          NULL Foreign covered by                   3

                                            Key the report.
~~~

### Manuscript page 176 (PDF page 183)

~~~text
                                                                     176

                                                      Display     2026
                                                   name of the
    report_na    VARCHAR  250  None    Not Null                   Midyear
        me                                            report.     Monitorin

                                                                  g Report

                                       Project

                                       Summary,

                                       Indicator

                                       Summary,

                                       Beneficiar

                                       y

    report_typ                         Summary, Classificatio     Monitorin
         e                                                        g Report
                 ENUM     —    Other   Survey/Fo   n of the
                                            rm     report.

                                       Results,

                                       Evaluation

                                       Report,

                                       Monitoring

                                       Report,

                                       Other

                                       Nullable; File format

    output_fo             —            PDF,        of the
                 ENUM          NULL    XLSX, generated PDF
    rmat

                                       CSV         report.

                                       Draft,      Current

    report_sta   ENUM     —    Draft   Generate lifecycle Generate
        tus
                                       d, status of the d

                                       Archived report.

    file_refere  VARCHAR  500  NULL    Nullable    Stored file    reports/2
        nce                                          path or      026/midy
                                                                  ear-monit
                                                   reference      oring.pdf
                                                     for the
                                                     report
                                                     output.

FK  generate     INT      —    NULL    Nullable,   Internal user  5
      d_by                             Foreign          who

                                          Key       generated
                                                    the report.

    generate TIMESTA           CURREN              Date and 2026-07-
                                                   time when
    d_at         MP       —    T_TIMES Nullable    the report         15
                                 TAMP              metadata       09:00:00
~~~

### Manuscript page 177 (PDF page 184)

~~~text
                                                         177

                              record was
                               created.

Development Methodology

         This section presents the development methodology employed in the study. It
describes the process model followed by the researchers and explains how each phase
guided the team’s workflow from planning to refinement. The methodology helped the
team organize tasks, prioritize requirements, integrate feedback, and maintain a
systematic development process throughout the study.

​  Process Model.

Figure 34. Agile SDLC Model​

​

​  This study employed the Agile Software Development Life Cycle (SDLC) model.

Agile SDLC was selected because it follows an iterative and incremental approach that

emphasizes flexibility, collaboration, and continuous feedback (GeeksforGeeks, 2025).

Unlike a strictly sequential development model, Agile allows the development process to

be divided into smaller iterations or sprints, where tasks can be planned, developed,

tested, reviewed, and improved continuously. This made the model appropriate for the
~~~

### Manuscript page 178 (PDF page 185)

~~~text
                                                                                                                  178

study because it allowed the researchers to refine requirements, prioritize essential
tasks, and incorporate adviser and client feedback throughout the development process.

         The development process began with the requirement gathering phase, where
the researchers identified the objectives, scope, user needs, and major functional
requirements of the study. During this phase, the team reviewed the current workflow,
gathered relevant feedback from consultations, and determined the key problems that
the project needed to address. The gathered requirements served as the basis for
organizing the development priorities and planning the succeeding sprints.

         After gathering the requirements, the study proceeded to the design of
requirements phase. In this phase, the identified requirements were translated into
system design outputs, including workflow structures, database
planning, interface layouts, and feature mappings. This phase helped the researchers
determine how the required functions would be represented, structured, and connected
before actual development began.

         The next phase was the coding phase, where the researchers developed the
project in smaller working increments. Tasks were divided into sprints and prioritized
based on their importance to the study. Higher-priority requirements were addressed first
so that the essential components could be developed, reviewed, and improved before
proceeding to the next set of features. This approach helped the team manage the
workload more efficiently while allowing the project to improve gradually through each
development cycle.

         The testing and quality assurance phase was conducted throughout the
development process. After each sprint, the completed outputs were checked to identify
errors, missing requirements, usability concerns, and areas for improvement. Testing
~~~

### Manuscript page 179 (PDF page 186)

~~~text
                                                                   179

was not treated as a final activity only, but as a continuous part of the development
workflow. This helped the researchers detect issues earlier and apply corrections before
moving to the next development cycle.

         The study then proceeded to the deployment preparation phase, where the
developed components were organized and prepared for demonstration, evaluation, and
further review. During this phase, the researchers checked whether the completed
outputs were aligned with the identified requirements and whether the project was ready
for evaluation by the intended users and reviewers.

         The final phase was the feedback and refinement phase. Feedback from
consultations, reviews, testing activities, and client or adviser comments was
incorporated into the succeeding development cycles. This allowed the researchers to
revise incomplete parts, improve usability, and refine the project based on actual
evaluation results. Through this process, the Agile SDLC model helped ensure that the
study followed an organized and methodical workflow while supporting the quality,
efficiency, and effectiveness of the development process from start to finish.

​Development Tools.

                                Table 62

                         Development Tools

Frontend Programming Languages  Next.js, Tailwind CSS, shadcn/ui,
                                TanStack Table, Apache ECharts.

Backend Programming Languages   NestJS, Prisma ORM, SheetJS, Papa
                                Parse.

Database                        Supabase, PostgreSQL, Prisma ORM.

Development Environment         Visual Studio Code, Git, GitHub,
                                Postman / Brun, Browser Developer
~~~

### Manuscript page 180 (PDF page 187)

~~~text
                                                                                                                  180

                                                            Tools, Google Docs.
 Web Application Design and Prototype Figma and Canva
Test Methodology/Procedures

         To ensure that PATHWAYS functions according to its intended purpose, testing
procedures will be conducted to validate the system’s functionality, usability, reliability,
security, and overall performance. The testing process will focus on checking whether
the system features operate as specified in the requirements, whether errors are
properly identified and corrected, and whether users can perform their assigned tasks
effectively. Since PATHWAYS involves project information management,
metadata-driven data integration, beneficiary tracking, monitoring dashboards,
evaluation support, reporting, and controlled public project visibility, the testing
procedures will cover both individual modules and the integrated workflow of the system.

         Unit Testing will be conducted to verify the smallest testable parts of the system
in isolation. This will include checking individual functions, forms, buttons, validations,
data-entry processes, metadata mapping rules, dashboard filters, report generation
functions, and access control checks. The purpose of unit testing is to identify coding
errors, validation issues, and logic problems early before they affect larger parts of the
system.

         Integration Testing will be performed to ensure that related modules work
together properly. This will include testing the connection between project profiles and
activities, digital forms and metadata mapping, imported datasets and centralized
records, beneficiary profiles and beneficiary journey tracking, monitoring dashboards and
processed data, evaluation support and rule-based alerts, and reports or public tracker
~~~

### Manuscript page 181 (PDF page 188)

~~~text
                                                                                                                  181

outputs. This test ensures that data passed from one module to another remains
accurate, complete, and usable.

         System Testing will evaluate the complete system as a whole to determine
whether it meets the specified requirements. This will involve testing the full workflow
from user login and role-based access to project setup, data entry or import, metadata
validation, record centralization, dashboard generation, analytics and evaluation outputs,
report generation, and public project tracker viewing. System testing will help verify that
all major features are included, properly connected, and functioning according to the
intended process.

         User Acceptance Testing (UAT) will be conducted with selected intended users
to determine whether the system is acceptable for actual use. Users may include Project
Officers, Monitoring and Evaluation Officers, Grant Manager, Project Managers, Program
Managers, and selected external stakeholders for the public project tracker. During UAT,
users will perform role-based tasks such as managing project profiles, encoding or
importing data, tracking beneficiary progress, viewing dashboards, generating reports,
reviewing evaluation outputs, and accessing approved public project information. Their
feedback will be used to assess usability, task completion, satisfaction, and areas for
improvement.

         Security Testing will be conducted to verify that the system protects data and
restricts access according to user roles and permissions. This will include checking login
authentication, password handling, role-based access control, restricted internal pages,
public tracker visibility, and protection of beneficiary information. Security testing is
important because the system handles project and beneficiary-related data, and external
stakeholders should only be able to view approved public information.
~~~

### Manuscript page 182 (PDF page 189)

~~~text
                                                       182

         Performance Testing will be performed to check whether the system responds
properly under expected use conditions. This includes testing page loading, dashboard
viewing, data filtering, file upload, report generation, and public tracker access. The
purpose of performance testing is to ensure that the system remains usable and
responsive when handling project records, beneficiary data, monitoring outputs, and
uploaded datasets.

System Requirements

                          Table 63​

                          Hardware Requirements

            Category      Minimum Requirement                Recommended
            Processor     Intel Core i3 or equivalent     Intel Core i5 or higher

                RAM                     4GB                    8GB or higher
              Storage       128 GB SSD available         256 GB SSD or higher
             Database
      Peripheral Devices              storage                 Supabase and
     Other Requirements          Supabase and                   PostgreSQL

            Category               PostgreSQL          Printer if printed reports or
       Operating System     Not required for basic       documents are needed
                                                        Stable internet and LAN
          Web Browser                 access                       access
                            Internet connection for
​
Quality Plan                     online features

                          Table 64​

                          Software Requirements

                          Minimum Requirement                Recommended
                                  Windows 10                    Windows 11
                                       N/A
                                                        Latest version of Google
                                                       Chrome or Microsoft Edge

         The Quality Plan defines the strategies and criteria that will be used to ensure
that PATHWAYS satisfies the expected level of software product quality. As a web-based
~~~

### Manuscript page 183 (PDF page 190)

~~~text
                                                                                                                  183

project information management and decision-support system for humanitarian and
development organizations, the system must be evaluated not only based on whether its
features function correctly, but also on whether it is efficient, secure, usable, reliable,
maintainable, compatible with the intended work environment, and practical to deploy.
The quality plan will guide the researchers in assessing whether the system supports its
intended users, including project officers, monitoring and evaluation officer, grant
manager, project managers, program managers, and donor-facing users.

         The software product quality assessment of PATHWAYS will be guided by the
ISO/IEC 25010 quality model, which provides a reference model for specifying,
measuring, and evaluating the quality of software and ICT products. The model
organizes software quality into characteristics and sub-characteristics that help define
how a system should be assessed during development, testing, and evaluation (ISO
25000, n.d.). In this study, the selected quality characteristics are functional suitability,
performance efficiency, compatibility, usability, reliability, security, maintainability, and
portability. These characteristics will serve as the basis for evaluating the quality of
PATHWAYS in relation to its required functions, user experience, system behavior, data
protection, and long-term maintainability.

                                                     Table 65​
                                                  Quality Plan

          Software Product Quality                             Description
                 Characteristics
                                          This refers to the degree to which the
Functional Suitability                    system provides the required functions
(Functional completeness, functional      needed to accomplish its intended purpose.
correctness, functional appropriateness)  The system should be able to support the
                                          complete flow of project information
                                          handling, from organizing project and
~~~

### Manuscript page 184 (PDF page 191)

~~~text
                                             184

                                             beneficiary records to producing monitoring,
                                             evaluation, reporting, and decision-support
                                             outputs. It should also generate accurate
                                             results and provide functions that are
                                             appropriate to the actual workflow and
                                             responsibilities of its intended users.

Performance Efficiency                       This refers to how efficiently the system
(Time behavior, resource utilization,        performs under expected operating
capacity)                                    conditions. The system should respond
                                             within an acceptable time when users
                                             access records, process data, view
                                             summaries, generate outputs, or move
                                             between system pages. It should also use
                                             available computing resources properly and
                                             support the expected volume of users,
                                             records, and project data without
                                             unnecessary delay, slowdown, or
                                             interruption.

Compatibility (Co-existence,                 This refers to the ability of the system to
interoperability)                            operate properly within the intended
                                             technical environment and work alongside
                                             existing tools and workflows. The system
                                             should be able to support practical data
                                             exchange, import, export, and output
                                             preparation without causing disruption to the
                                             organization’s current processes. It should
                                             also allow project information to remain
                                             usable across related monitoring, evaluation,
                                             and reporting activities.

Usability (Appropriateness recognizability,  This refers to how easily users can
learnability, operability, user error        understand, learn, and operate the system.
protection, user interface aesthetics,       The interface should be clear, organized,
accessibility)                               and task-oriented so that users with different
                                             responsibilities and technical abilities can
                                             complete their work with minimal confusion.
                                             The system should also help prevent user
                                             errors through understandable labels, proper
                                             validations, clear prompts, and helpful
                                             feedback messages.

Reliability (Maturity, availability, fault   This refers to the ability of the system to
tolerance, recoverability)                   perform consistently and remain available
                                             during normal use. The system should save,
                                             retrieve, process, and present information
                                             correctly while users perform their tasks. It
                                             should also handle errors, interruptions, or
                                             unexpected conditions properly and support
~~~

### Manuscript page 185 (PDF page 192)

~~~text
                                            185

                                            recovery procedures that help reduce the
                                            risk of data loss or incomplete processing.

Security (Confidentiality, integrity,       This refers to the ability of the system to
non-repudiation, authenticity,              protect project-related, beneficiary-related,
accountability)                             monitoring, and reporting information from
                                            unauthorized access, misuse, or alteration.
Maintainability (Modularity, reusability,   The system should verify user identity, limit
analyzability, modifiability, testability)  access according to authorized
                                            responsibilities, preserve the accuracy of
Portability (Adaptability, installability,  stored records, and maintain accountability
replaceability)                             for user actions. This is important because
                                            the system handles sensitive organizational
  Implementation Plan                       and beneficiary-level information.

                                            This refers to how easily the system can be
                                            corrected, improved, updated, and tested.
                                            The system should be developed using
                                            organized structures, reusable components,
                                            clear coding practices, and proper
                                            documentation. This will help the
                                            researchers or future maintainers identify
                                            issues, apply changes, test system
                                            components, and improve the system as
                                            requirements or organizational needs
                                            change.

                                            This refers to the ability of the system to be
                                            deployed and used in the intended
                                            environment with minimal technical barriers.
                                            The system should be able to run on
                                            commonly available devices and standard
                                            web environments without requiring complex
                                            installation procedures for ordinary users.
                                            This supports practical adoption and allows
                                            the system to remain usable across different
                                            workstations or deployment settings.

         The implementation plan outlines how the developed system will be prepared,
configured, and introduced for actual use. Implementation will begin after the completion
of system development and internal testing, starting with the preparation of the
web-based environment, configuration of user roles, access permissions, project
~~~

### Manuscript page 186 (PDF page 193)

~~~text
                                                                                                                  186

structures, monitoring parameters, and public project visibility settings. Before
deployment, necessary resources will also be prepared, including user devices,
supported web browsers, stable internet connection, authorized user accounts, project
data, beneficiary records, and monitoring-related files. These activities will be conducted
during the pre-deployment stage to ensure that the system environment, data, and
access setup are ready for proper operation.

         After the initial setup, the system will proceed to the final testing and user
validation stage, where selected users will review the major system functions, including
project profile management, beneficiary record handling, metadata-driven data
preparation, monitoring dashboards, reporting, and public project tracking. Feedback
gathered during this stage will be used to apply necessary refinements before actual
use. Once the system has been validated, it will move to the turnover stage, where the
system will be handed over to the assigned system administrator or authorized
personnel, together with basic guidelines for operation, user access management, data
maintenance, backup procedures, and future improvements. This process identifies the
activities to be done, the implementation sequence, the people involved, and the
resources needed for successful system deployment.

Evaluation Plan

         The evaluation of PATHWAYS will be conducted after the completion of the major
development and testing phases of the system. This evaluation process serves as an
important step in determining whether the developed system satisfies the identified
requirements and operational needs of humanitarian and development organizations. To
ensure that the system functions properly and achieves its intended objectives, several
~~~

### Manuscript page 187 (PDF page 194)

~~~text
                                                                                                                  187

testing procedures will be conducted in a sequential manner before the final user
evaluation phase.

         Unit Testing will be continuously performed during the development phase to
evaluate the correctness of individual modules, functions, and components of the
system. This includes testing the login and role-based access functions, project setup
processes, metadata-driven data integration, beneficiary tracking functions, dashboard
generation, reporting tools, and public project tracker features. The purpose of this
testing is to identify coding errors, validation issues, and logic problems early before they
affect other parts of the system.

         Integration Testing will be conducted after the completion of the individual
modules to ensure that connected components work properly together. This testing
procedure will verify the interaction between project profiles, activities, digital forms,
metadata mapping, imported datasets, beneficiary records, dashboards, evaluation
support outputs, reports, and public tracker information. The test ensures that data
transferred from one module to another remains accurate, complete, and properly
processed throughout the workflow of the system.

         System Testing will be performed after integration testing to evaluate the
complete system as a whole. This testing phase will examine the overall functionality,
usability, performance, compatibility, and reliability of the system according to the
specified requirements. The complete operational workflow of the system will be tested,
including project setup, activity tracking, data entry and import, metadata validation,
centralized record management, beneficiary journey tracking, monitoring dashboards,
descriptive analytics, evaluation support, rule-based alerts, and public project viewing.
~~~

### Manuscript page 188 (PDF page 195)

~~~text
                                                                                                                  188

This process ensures that all system components function correctly in an integrated
environment.

         Security Testing will also be conducted to verify that the system properly protects
project and beneficiary-related data. This includes testing login authentication,
role-based access control, restricted user permissions, secure handling of beneficiary
information, and controlled public visibility of approved project information. Security
testing is important because the system handles internal project records while also
allowing selected project information to be shared publicly through the public project
tracker.

         After completing the major testing procedures, User Acceptance Testing (UAT)
will be conducted with selected intended users of the system, including Project Officers,
Monitoring and Evaluation Officer, Grant Manager, Project Managers, Program
Managers, and selected external stakeholders for the public project tracker. During this
phase, the users will perform tasks based on their assigned roles, such as creating
project profiles, preparing digital forms, importing datasets, managing beneficiary
records, viewing dashboards, generating reports, reviewing evaluation outputs, and
accessing public project information. Their participation will help determine whether the
system is acceptable for actual organizational use.

         During the User Acceptance Testing phase, a survey questionnaire based on
selected quality characteristics adapted from the ISO/IEC 25010:2023 product quality
model will be administered to gather quantitative feedback regarding the users’
perception of the system. The evaluation criteria may include Functional Suitability,
Performance Efficiency, Compatibility, Interaction Capability, Reliability, Security,
~~~

### Manuscript page 189 (PDF page 196)

~~~text
                                                                                                                  189
Maintainability, and Flexibility. The questionnaire will use a 5-point Likert scale to
evaluate the overall quality and usability of the system from the users’ perspective.

                                                     Table 66​
                                             5-Point Likert Scale

Point                   Scale Range   Verbal Interpretation
  5                      4.21 - 5.00      Strongly Agree
  4                      3.41 - 4.20            Agree
  3                      2.61 - 3.40           Neutral
  2                      1.81 - 2.60          Disagree
  1                      1.00 - 1.80
                                        Strongly Disagree

         The results gathered during the evaluation process will be analyzed using
descriptive statistical treatments such as frequency, percentage, and Average Weighted
Mean (AWM). The findings will help determine the strengths of the system, identify areas
for improvement, and evaluate whether PATHWAYS achieved its intended objectives
and quality expectations.

Ethical Considerations

         Throughout the development and evaluation of PATHWAYS, ethical
considerations shall be observed to ensure responsible conduct, beneficiary protection,
data integrity, confidentiality, safeguarding, and academic honesty. Since the system
involves project information, beneficiary records, monitoring data, evaluation outputs,
and approved stakeholder-facing project information, the study shall ensure that all
system development, data gathering, testing, and presentation activities are conducted
with respect for the rights, dignity, privacy, and safety of all beneficiaries. These
~~~

### Manuscript page 190 (PDF page 197)

~~~text
                                                                                                                  190

considerations are aligned with Plan International’s accountability commitments, which
emphasize transparency, safeguarding, ethical practice, responsible use of resources,
and protection of children and programme beneficiaries (Plan International, n.d.).

         Beneficiaries involved in consultations, interviews, system testing, and user
evaluation shall be properly informed about the purpose of the study, their role in the
evaluation, the nature of the data to be collected, and how their responses will be used.
Participation shall be voluntary, and respondents shall be allowed to withdraw from the
evaluation process without penalty or consequence. In accordance with Republic Act No.
10173, also known as the Data Privacy Act of 2012, all personal and sensitive
information shall be processed with confidentiality, limited access, and proper data
protection measures (National Privacy Commission, 2012).

         The study shall also observe the ethical handling of data collected by Plan
International Pilipinas. Any project, beneficiary, monitoring, evaluation, or field data
provided by the organization shall be treated as confidential organizational data and
shall only be used within the approved scope of the study. The researchers shall not
disclose raw beneficiary-level data, personally identifiable information, sensitive
beneficiary details, or internal organizational records to unauthorized persons. Where
such data are needed for testing, demonstration, or presentation, dummy data, sample
data, anonymized data, or masked records shall be used instead of real beneficiary
information. This is aligned with Plan International’s MERL Standards, which require
informed, documented, and voluntary consent, parent or guardian consent when
beneficiaries are under 18 years old, confidentiality and anonymity for beneficiaries, and
appropriate support when safeguarding or sensitive issues may arise (Plan International,
2018).
~~~

### Manuscript page 191 (PDF page 198)

~~~text
                                                                                                                  191

         In relation to this standard, PATHWAYS shall not allow beneficiaries to directly
apply, register themselves, or submit personal information through the system as public
users. Beneficiary records shall only be encoded, imported, updated, and managed by
authorized internal users after the proper consent and organizational data collection
procedures have been followed. This limitation is necessary because humanitarian and
development data may involve children, young people, and vulnerable programme
beneficiaries, and their participation in data collection must be handled through informed
consent, safeguarding procedures, confidentiality, and appropriate organizational
oversight. The system shall therefore function as an internal project information
management and decision-support platform, not as a public beneficiary application
portal.

         The system shall apply privacy and safeguarding measures appropriate to
humanitarian and development work. Internal access shall be controlled through
role-based access permissions to ensure that users can only access information and
functions relevant to their responsibilities. Beneficiary-related data shall not be exposed
in dashboards, reports, or public-facing pages unless the information has been
approved, aggregated, anonymized, or deemed safe for disclosure. External
stakeholders shall only view selected and approved project information through the
Public Project Tracker. This follows Plan International’s MERL Policy, which requires
ethical and safeguarding standards in monitoring, evaluation, and research activities to
protect the well-being, dignity, rights, and safety of children, young people, and other
beneficiaries in data collection (Plan International, 2024).

         The study shall also uphold transparency and honesty in presenting system
testing results, survey responses, and evaluation findings. Data shall not be altered,
fabricated, or manipulated to favor the system. Any limitations, errors, usability concerns,
~~~

### Manuscript page 192 (PDF page 199)

~~~text
                                                                                                                  192

or areas for improvement identified during testing and evaluation shall be properly
acknowledged. Findings and data shall be presented responsibly and only for the
purposes for which consent and authorization were given, consistent with Plan
International’s MERL Standards on responsible presentation and use of findings (Plan
International, 2018).

         Finally, the researchers shall observe academic integrity throughout the conduct
of the study. All external sources, standards, frameworks, methodologies, policies, and
related literature used in the manuscript shall be properly cited and acknowledged.
Plagiarism, fabrication of results, misrepresentation of data, and unauthorized use of
intellectual materials shall be avoided. This is consistent with the Intellectual Property
Code of the Philippines, which recognizes the protection of intellectual property rights
and proper attribution of works (Republic Act No. 8293, 1997).

Data Analysis (Procedure and Treatment)

         The data analysis procedure will be conducted in a step-by-step manner to
ensure that the evaluation results are organized, accurate, and properly interpreted. The
participants of this study will be the selected intended users of PATHWAYS, including
Project Officers, Monitoring and Evaluation Officer, Grant Manager, Project Managers,
Program Managers, and selected external stakeholders who will evaluate the public
project tracker. The primary research instrument will be a survey questionnaire adapted
from selected ISO/IEC 25010:2023 quality characteristics and measured using a 5-point
Likert scale.

The following steps will be followed in analyzing the gathered data:
~~~

### Manuscript page 193 (PDF page 200)

~~~text
                                                                                                             193

1.​ Selection of Respondents. The respondents will be selected based on their
    involvement in project information management, monitoring and evaluation,
    reporting, system administration, or stakeholder viewing of approved project
    information.

2.​ Data Collection. The survey questionnaire will be administered after the
    respondents have tested or reviewed the system based on their assigned roles.
    The responses will measure their level of agreement, perception, and satisfaction
    with the system.

3.​ Data Organization. The collected responses will be grouped according to the
    evaluation criteria, such as functional suitability, performance efficiency,
    compatibility, interaction capability, reliability, security, maintainability, and
    flexibility.

4.​ Data Validation. The responses will be reviewed to identify incomplete, unclear,
    or inconsistent entries. Only valid and usable responses will be included in the
    final analysis.

5.​ Statistical Processing. The quantitative responses will be tallied and processed
    using descriptive statistics, particularly frequency, percentage, and Average
    Weighted Mean. These will be used to determine the overall assessment of each
    evaluation criterion.

6.​ Qualitative Feedback Review. Comments and suggestions from the
    questionnaire will be reviewed to identify recurring concerns, user difficulties, and
    possible areas for improvement.

7.​ Presentation and Interpretation of Results. The analyzed data will be presented
    in tabular form and interpreted using the scale provided in the statistical
    treatment section. The results will be used to determine the system’s strengths,
    weaknesses, and overall acceptability.
~~~

### Manuscript page 194 (PDF page 201)

~~~text
                                                                                                                  194

Statistical Treatments

         Descriptive statistics will be used to organize, summarize, and interpret the
quantitative data gathered from the respondents’ evaluation of PATHWAYS. The study
will use the adapted PATHWAYS Survey Questionnaire, which was based on the
ISO/IEC 25010 evaluation instrument presented and used by Baladjay et al. (2025). The
questionnaire is guided by the ISO/IEC 25010 software product quality model and
contains 30 evaluation statements covering eight quality characteristics: Functional
Suitability, Performance Efficiency, Compatibility, Usability, Reliability, Security,
Maintainability, and Portability.

         The 30 statements are distributed as follows: three statements for Functional
Suitability, three for Performance Efficiency, two for Compatibility, six for Usability, four
for Reliability, five for Security, five for Maintainability, and two for Portability. Each
statement will be rated using a five-point Likert scale ranging from 5 – Strongly Agree to
1 – Strongly Disagree.

         Frequency and percentage will be used to summarize the respondents according
to their respondent type, age group, and sex. These measures will also be used, when
necessary, to present the distribution of responses for each rating option. The optional
names of the respondents will not be included in the statistical analysis.

         The weighted mean will be computed for each evaluation statement to determine
the respondents’ average level of agreement. A composite mean will then be computed
for each of the eight ISO/IEC 25010:2011 quality characteristics based on the
statements assigned to that characteristic. An overall mean may also be calculated from
all 30 evaluation statements to provide a general summary of the respondents’
assessment of PATHWAYS.
~~~

### Manuscript page 195 (PDF page 202)

~~~text
                                                                           195
               Table 67
       5-Point Likert Scale

Point                           Scale Range                          Verbal Interpretation
  5                              4.21 - 5.00                             Strongly Agree
  4                              3.41 - 4.20                                   Agree
  3                              2.61 - 3.40                                  Neutral
  2                              1.81 - 2.60                                 Disagree
  1                              1.00 - 1.80
                                                                       Strongly Disagree

         Table 67 presents the five-point Likert scale that will be used to interpret the
weighted mean, composite mean, and overall mean. An equal interval of 0.80 will be
used to establish the scale ranges. The verbal interpretations will indicate the
respondents’ level of agreement with the evaluation statements and their perceptions of
the quality of PATHWAYS. These interpretations will not, by themselves, be presented as
proof of ISO certification, full standards compliance, or production readiness.

Average Weighted Mean Formula:

                                                              ∑������������

                                ������������������ = ������

Where:

AWM = average weighted mean​
f = frequency of responses for each rating​
x = assigned value of each rating​
N = total number of respondents
~~~

### Manuscript page 196 (PDF page 203)

~~~text
                                                                                                                  196

         The average weighted mean will be used to determine the overall level of
agreement of the respondents for each quality criterion. This will show whether the users
strongly agree, agree, remain neutral, disagree, or strongly disagree with the evaluation
statements related to the system.

Percentage Formula:

                     ������ =  ������  ������ 100
                           ������

Where:

P = percentage​
f = frequency of responses​
N = total number of respondents

         The percentage will be used to determine the proportion of respondents who
selected each response option in the evaluation survey. This will help summarize the
distribution of responses for each ISO-aligned criterion and support the interpretation of
user feedback regarding the system’s functionality, usability, performance, reliability,
security, maintainability, and overall quality.
~~~

</details>
