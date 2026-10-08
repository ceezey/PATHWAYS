# Change Record: Documentation canonical reconciliation

**ID:** `cr-pathways-doc-reconciliation-2026-10-01`  
**Date:** 2026-10-01  
**Status:** Applied

## 1. Trigger

The documentation suite had drifted from the running system, the rev-2026 capstone manuscript and the new Pathways brand, color and UI foundations. Before feature development resumes, the suite was rebuilt from a document-suite template skeleton into one reconciled baseline. The developer approved decisions D1 to D16 on 2026-10-01.

## 2. Current Contract

Before this change the suite followed the 2026-09-28 baseline: Locked PRD acceptance summary, SAD and BUILD with their own section numbering, a root `IDEA.md` carrying a manuscript transcript, and a DSD describing only the implemented UI. Records (CRs, RFCs, audits, runbooks) described behavior accurately at the time they were written. Repository behavior is unchanged by this record: no code, migration or agent behavior changed.

## 3. Proposed Change

### 3.1 Source precedence

| Rank | Source | Decides |
|---|---|---|
| 1 | Repository: code, migrations, `rbac-contract.json`, `schema.prisma`, Applied CRs | What exists now |
| 2 | Rev-2026 manuscript | Purpose, context, problem, objectives, scope and limits, users, methodology, quality and evaluation plans |
| 3 | New brand, color and UI foundations | Design target only (D1) |
| 4 | Suite template | Headings and document order only; no wording, product terms or workflow names carried over |

When sources conflict on current behavior, the repository wins and the manuscript item is listed in section 3.7. The template is described here only as an external document-suite template; no other repository is named or credited.

### 3.2 Decisions

| # | Decision |
|---|---|
| D1 | New brand, color and UI foundations are the canonical design target. DSD carries a current versus target gap table and the UI migration is registered in `deferred-features.md`. |
| D2 | The name of the template source repository is removed from every tracked file, including the append-only `log-pathways.md` (section 3.4). |
| D3 | Root `IDEA.md` is a self-contained distillation of the rev-2026 manuscript, reconciled to the system; no transcript. |
| D4 | Topics without source material are not invented; a developer questionnaire precedes UES, GTM, PITCH, WRAP and the OPS SLO section. |
| D5 | Integration by local merge into `dev` and a push of `origin/dev` as `ceezey`; no pull request. |
| D6 | Suite docs are rebuilt from the template skeleton and repopulated under the precedence in section 3.1. |
| D7 | SAD and BUILD take the template section numbering; references in `.claude/agents/` and live docs are realigned (section 3.5). |
| D8 | The PRD carries a Requirements-Features Matrix and a Locked charter per feature with gates `G-F<n>-<m>`. |
| D9 | Each feature carries reconciled use cases `UC-F<n>-<m>` and workflows drawn as Mermaid diagrams. |
| D10 | The PRD carries `FR-<n>` and `NFR-<n>`; every NFR is tagged with one ISO/IEC 25010 characteristic. |
| D11 | Testing and evaluation are organized by the eight ISO/IEC 25010 characteristics. |
| D12 | SDD carries the Database Architecture: Repository Baseline and Production Requirements. |
| D13 | SDD carries the current tech stack with versions from the dependency files. |
| D14 | SDD section 2 carries component, deployment and request/trust-boundary views. |
| D15 | A Draft AWS hosting migration RFC records a phased strategy and authorizes no implementation. |
| D16 | A manuscript alignment audit traces the manuscript commitments to the system and gates production release. |

### 3.3 Design-authority change

The DSD previously described the implemented UI as the design authority. The new foundations are now the canonical target (D1). The implemented UI in `apps/web/src/app/globals.css` remains the current baseline until an approved change migrates it. The DSD section 2.1 gap table is the migration map; every "current" token is a real CSS variable and every new token is marked `(new)`. The migration is registered in [deferred-features](deferred-features.md). No document claims the new foundations are shipped.

### 3.4 One-time append-only exception for `log-pathways.md`

`log-pathways.md` is Control and append-only. The template source repository's name appeared in earlier entries. Under D2 the developer approved a single exception on 2026-10-01: the log is rewritten once, in the index and log task of this reconciliation, to remove that name and to add the reconciliation entries. No other rewrite is allowed, and later changes append only. Entry dates, ordering and meaning are preserved.

### 3.5 SAD and BUILD section map

Section references in `.claude/agents/`, `sad-pathways.md` and `build-pathways.md` point to the new numbers. Historical records keep their old numbers and use this map.

| Doc | Old section | New section | Concept |
|---|---|---|---|
| SAD | 1 Roster and Trigger Paths | 3.1 | roster |
| SAD | 2 Mandatory Engineering Rules | 3.2 | per-role subsections now ####; 2 is now Roster Design Rationale |
| SAD | 3 Sequenced Review Pipeline | 4.1 | Same concept |
| SAD | 3.1 Handoff Packet | 4.2 | Same concept |
| SAD | 4 Commands and Evidence | 4.3 | Same concept |
| SAD | 5 Deterministic Output Schema | 4.4 | Same concept |
| BUILD | 1 Read Order | 1.1 | Same concept |
| BUILD | 2 Source Authority | 1.2 | branch/release workflow and release sequence moved to 2.2 |
| BUILD | 2 Release sequence | 2.2 | Same concept |
| BUILD | 7 SAD review and sign-off | 2.1 | Same concept |
| BUILD | 3 Traceability | 1.3 | Same concept |
| BUILD | 4 Golden Paths | 4 | Same concept |
| BUILD | 5 Guardrails | 5 | Always/Never kept |
| BUILD | 6 Restraint Ladder | 5.3 | Same concept |
| BUILD | 7 Brownfield Change Workflow | 5.1 | Same concept |
| BUILD | 8 Human Intervention Contract | 5.4 | Same concept |
| BUILD | 9 Definition of Done | 5.5 | Same concept |
| BUILD | 10 Materialization | 6 | Same concept |

### 3.6 Manuscript use case disposition

Sources are manuscript Tables 6 to 31 (UC001 to UC026), reconciled to routes, permissions and state machines in the repository. Supported means restated to match actual behavior. Partly supported means written as implemented, with missing parts Not met and linked to [deferred-features](deferred-features.md). The manuscript table number is the use case number plus five.

| ID | Manuscript use case | Manuscript table | Disposition | PRD use cases or reason |
|---|---|---|---|---|
| UC001 | Login | Table 6 | Supported | UC-F1-1; lockout after 5 failures is G-F1-10 (Not met) |
| UC002 | Recover Account / Reset Password | Table 7 | Supported | UC-F1-2; recovery runs through the identity provider |
| UC003 | Manage User Profile | Table 8 | Supported | UC-F1-3; password change is part of recovery, not the profile form |
| UC004 | Manage Users and Roles | Table 9 | Partly supported | UC-F1-4; accounts are authorized from existing identity accounts, no in-app create and no emailed credentials |
| UC005 | View Audit Logs | Table 10 | Partly supported | UC-F1-5; `audit.read` is also granted to Program Manager and Project Manager; self-logging of views is not claimed |
| UC006 | Manage Project Profiles | Table 11 | Partly supported | UC-F2-1; archive is G-F2-4 (Not met); duplicate-name warning not implemented |
| UC007 | Track Project Activities and Milestones | Table 12 | Supported | UC-F2-2 to UC-F2-9; expense stages are verify, approve, sign-off; rejection replaces For Correction |
| UC008 | Manage Indicator | Table 13 | Partly supported | UC-F7-1; create and update supported, reuse across projects not carried forward |
| UC009 | Prepare Digital Data Collection Forms | Table 14 | Partly supported | UC-F5-1, UC-F5-3. Manuscript edit-only-if-no-data rule is replaced by versioning of published forms (POST versions) |
| UC010 | Encode Project Data | Table 15 | Partly supported | UC-F5-2. Participant data is encoded through forms and registration (UC-F3-1); a duplicate warning is handled by identity review (UC-F3-3) |
| UC011 | Import and Validate Field Metadata | Table 16 | Partly supported | UC-F6-1 to UC-F6-4. Manual linkage of unlinked records and duplicate-record prompts are not carried forward; invalid rows stay staged |
| UC012 | Manage Beneficiary Profiles | Table 17 | Partly supported | UC-F3-1 to UC-F3-3. Duplicates are flagged for review; merge and linkage flag are not carried forward (no merge route) |
| UC013 | Track Beneficiary Journey | Table 18 | Partly supported | UC-F4-1, UC-F4-2, UC-F4-3. Journey notes are not carried forward (G-F4-6 Not met); Evaluation Center PIN check is covered by the shared step-up gate |
| UC014 | View Participant and Beneficiary History | Table 19 | Supported | UC-F4-4 |
| UC015 | View Aggregated Monitoring Dashboards | Table 20 | Supported | UC-F8-1 |
| UC016 | View Descriptive Analytics | Table 21 | Partly supported | UC-F9-1; participation patterns view hidden, filters limited to project and period |
| UC017 | Perform SADDD Analysis | Table 22 | Partly supported | UC-F8-2; closed-period only, suppression applied, no drilldown |
| UC018 | Review Rule-Based Alerts | Table 23 | Supported | UC-F10-1, UC-F10-2; named-individual notification not carried forward (in-application notifications only) |
| UC019 | Review Rule-Based Project Recommendations | Table 24 | Partly supported | UC-F11-1, UC-F11-2; recommendation Auto-resolved status absent (G-F11-5) |
| UC020 | Generate Reports | Table 25 | Supported | UC-F12-1 |
| UC021 | View Data Visualizations | Table 26 | Partly supported | UC-F12-2; chart type selection and maps not built, descriptive views only |
| UC022 | Export Monitoring Outputs | Table 27 | Partly supported | UC-F12-3; all formats per report type not verified (G-F12-4) |
| UC023 | Configure Evaluation and Alert Parameters | Table 28 | Supported | UC-F10-3; overlap warning not established |
| UC024 | Manage Backup and Recovery | Table 29 | Not carried forward | No API handler for `backups.create` or `backups.restore`; recovery is the operational runbook docs/runbook-backup-restore.md |
| UC025 | Manage Public Project Tracker | Table 30 | Supported | UC-F13-1; update requires new revision and re-approval |
| UC026 | View Public Project Tracker | Table 31 | Partly supported | UC-F13-2; stakeholder access analytics not carried forward |

#### Manuscript use cases not carried forward

These manuscript behaviors are not in the PRD use cases.

| Manuscript use case | Part not carried forward | Reason |
|---|---|---|
| UC024 Manage Backup and Recovery | Whole use case | No API handler for `backups.create` or `backups.restore`; recovery is the operational runbook [runbook-backup-restore](runbook-backup-restore.md) |
| UC004 Manage Users and Roles | Credentials sent by email; in-app account creation | Existing identity accounts are authorized with a role |
| UC006 Manage Project Profiles | Duplicate-name warning | Not implemented |
| UC008 Manage Indicator | Reuse across projects | G-F7-5 Not met; registered in deferred-features |
| UC009 Prepare Digital Data Collection Forms | Edit only if no data collected | Replaced by new versions of published forms |
| UC011 Import and Validate Field Metadata | Manual linkage of unlinked records; duplicate-record prompts | Invalid rows stay staged; no linkage route |
| UC012 Manage Beneficiary Profiles | Merge and linkage flag | G-F3-6 Not met; no merge route |
| UC013 Track Beneficiary Journey | Journey notes and data ripple chain | G-F4-6 Not met; no note route or table |
| UC017 Perform SADDD Analysis | On-demand analysis for any project; drilldown | Closed period only with suppression |
| UC018 Review Rule-Based Alerts | Named-individual notification | In-application notifications only |
| UC019 Review Rule-Based Project Recommendations | Auto-resolved status | G-F11-5 Not met |
| UC021 View Data Visualizations | Chart type selection and maps | Descriptive views only |
| UC023 Configure Evaluation and Alert Parameters | Overlap warning | Not established |
| UC026 View Public Project Tracker | Stakeholder access analytics and public access logging | Not built |

### 3.7 Superseded manuscript items

The repository behavior is written in the suite; these manuscript statements are not.

| Manuscript item | Current behavior | Evidence |
|---|---|---|
| Grant Manager described as technical preparation and troubleshooting support (Table 3) | Grant Manager is assigned-project milestone and resource monitoring with aggregate-only beneficiary information | docs/prd-pathways.md section 2, rbac-contract.json |
| Survey grouping uses "interaction capability" and "flexibility" | Suite uses Usability and Portability (manuscript Quality Plan and Objective 3.4, 3.8 names) | IDEA.md section 4.4 |
| Step-up CR cites manuscript Objective 2.2 (earlier revision) | rev-2026 Objective 2.2 is descriptive analytics; access control is 1.8 | IDEA.md section 4.5 |
| Functional and non-functional rows marked "In Progress" or "Planned" (Table 5) | Status comes from docs/index.md section 6 and deferred-features.md: F1-F8 implemented, F9 four views, F10-F13 local APIs with verification pending | docs/index.md section 6; docs/deferred-features.md |
| Prescriptive analytics alongside descriptive analytics | Decision support is deterministic rule-based suggestions reviewed by people; no prescriptive engine | apps/api/src/modules/rules/rule-engine.ts |
| SADDD available on demand for any project | SADDD only for a fixed closed period, counts 1-4 suppressed, complementary suppression | docs/rfc-pathways-saddd-privacy.md |
| Recommendation lifecycle New, Reviewed, Actioned, Resolved, Dismissed, Auto-resolved | Alerts implement all six states; recommendations have New, Reviewed, Resolved, Dismissed | apps/api/src/modules/rules/alert-lifecycle.ts |
| Named-individual notification on outcomes; public access logging | In-application notifications only | apps/api/src/modules/rules/rules-human.controller.ts |
| UC009 edit allowed only if no data collected | Published forms change only by creating a new version | apps/api/src/modules/metadata/metadata.controller.ts |
| UC013 journey notes and data ripple chain | Journey routes cover stages, events and corrections only | apps/api/src/modules/participants/participants.controller.ts |
| Create user sends credentials by email (UC004) | Existing identity accounts are authorized with a role; no credential email | apps/api/src/modules/users/users.controller.ts (authorize-existing) |
| Only the System Administrator views audit logs (UC005) | `audit.read` is granted to System Administrator, Program Manager and Project Manager | apps/api/src/modules/auth/rbac-contract.json |
| Expense For Verification, Verified, For Correction (UC007) | Expense status is Pending, Verified, Approved or Rejected, then a separate Program or Grant sign-off | apps/api/prisma/migrations/0034_core_feature_completion/migration.sql (p34_review_expense) |
| Shared indicator library table (Table 42) | Indicator definitions live only on project indicators, with bindings and measurements in separate tables | apps/api/prisma/schema.prisma (ProjectIndicator) |
| Data dictionary lists 30 tables | Repository has 55 models, including step-up, publication, release and evaluation tables | docs/sdd-pathways.md section 3.2 |

### 3.8 Manuscript data dictionary mapping (Tables 32 to 61)

The manuscript lists 30 tables. The repository schema defines 55 models; models not listed here (step-up, publication, release, evaluation, proof and runtime tables) have no manuscript counterpart and are described in `sdd-pathways.md` section 3.

| Manuscript table | No. | Current model and table | Mapping |
|---|---|---|---|
| Organizations | 32 | `Organization` / `organizations` | Same |
| Roles | 33 | `Role` / `roles` | Same |
| Permissions | 34 | `Permission` / `permissions` | Same |
| Role Permissions | 35 | `RolePermission` / `role_permissions` | Same |
| System Users | 36 | `SystemUser` / `system_users` | Same |
| Audit Logs | 37 | `AuditLog` / `audit_logs` | Same |
| Programs | 38 | `Program` / `programs` | Same |
| Projects | 39 | `Project` / `projects` | Same |
| Project Activities | 40 | `ProjectActivity` / `project_activities` | Same |
| Project Milestones | 41 | `ProjectMilestone` / `project_milestones` | Same |
| Indicators | 42 | No separate shared indicator table; definitions live on `ProjectIndicator` / `project_indicators` | Merged |
| Project Indicators | 43 | `ProjectIndicator` / `project_indicators` | Same |
| Digital Forms | 44 | `DigitalForm` / `digital_forms` | Same |
| Form Fields | 45 | `FormField` / `form_fields` | Same |
| Data Import Batches | 46 | `DataImportBatch` / `data_import_batches` | Same |
| Metadata Mappings | 47 | `MetadataMapping` / `metadata_mappings` | Same |
| Form Submissions | 48 | `FormSubmission` / `form_submissions` | Same |
| Form Response Values | 49 | `FormResponseValue` / `form_response_values` | Same |
| Beneficiaries | 50 | `Beneficiary` / `beneficiaries` | Same |
| Beneficiary Project Enrollments | 51 | `BeneficiaryProjectEnrollment` / `beneficiary_project_enrollments` | Same |
| Beneficiary Activity Participation | 52 | `BeneficiaryActivityParticipation` / `beneficiary_activity_participations` | Renamed |
| Beneficiary Journey Events | 53 | `BeneficiaryJourneyEvent` / `beneficiary_journey_events` | Same |
| Project Budget Records | 54 | `ProjectBudgetRecord` / `project_budget_records` | Same |
| Assessment Results | 55 | `AssessmentResult` / `assessment_results` | Renamed |
| Alert Rules | 56 | `AlertRule` / `alert_rules` (conditions split to `AlertRuleCondition`, recommendations to `AlertRuleRecommendation`) | Split |
| Rule-Based Alerts | 57 | `RuleBasedAlert` / `rule_based_alerts` | Same |
| Decision Recommendations | 58 | `DecisionRecommendation` / `decision_recommendations` | Same |
| Budget Expense Entries | 59 | `BudgetExpenseEntry` / `budget_expense_entries` | Same |
| Journey Stage | 60 | `JourneyStage` / `journey_stages` | Renamed |
| Activity Journey Stage | 61 | `ActivityJourneyStageMapping` / `activity_journey_stage_mappings` | Renamed |

### 3.9 Manuscript Tables 62 to 64 against SDD 2.4

| Manuscript item | Manuscript value | SDD 2.4 and repository | Reconciliation |
|---|---|---|---|
| Table 62 Frontend | Next.js, Tailwind CSS, shadcn/ui, TanStack Table, Apache ECharts | `next`, `tailwindcss`, `echarts` listed; shadcn/ui is configured in `apps/web/components.json` over Radix UI primitives; `@tanstack/react-table` is in `apps/web/package.json` | SDD 2.4 is the version authority; shadcn/ui and TanStack Table are dependency-file entries not itemized in SDD 2.4 |
| Table 62 Backend | NestJS, Prisma ORM, SheetJS, Papa Parse | `@nestjs/core`, `prisma`, `@prisma/client` listed; SheetJS (`xlsx`) and `papaparse` are pinned in `packages/imports/package.json` | Same; import libraries live in the shared imports package |
| Table 62 Database | Supabase, PostgreSQL, Prisma ORM | PostgreSQL 17, Supabase Auth and Storage, Prisma 6.19.2 | Versions added; current hosting stays Supabase and Vercel |
| Table 62 Environment and design tools | Visual Studio Code, Git, GitHub, Postman or Bruno, browser developer tools, Google Docs, Figma, Canva | Not repository dependencies | Development practice, not stack; not carried into SDD 2.4 |
| Table 62 Gaps in the manuscript | Not listed | NestJS Swagger, Helmet, Pino, PDFKit, Sentry, Vitest, Playwright, GitHub Actions | Added in SDD 2.4 from dependency files |
| Table 63 Hardware | Minimum: Intel Core i3, 4 GB RAM, 128 GB SSD; recommended: Core i5, 8 GB, 256 GB SSD | Client is a browser; no server hardware is specified by the repository | Kept as the manuscript client baseline in PRD NFR-11; server sizing Not established |
| Table 64 Software | Minimum: Windows 10, any browser with internet; recommended: Windows 11, latest Chrome or Edge | CI and local development use Node 22 and pnpm 11.20.0 | Browser and OS baseline kept in PRD NFR-11; toolchain versions from SDD 2.4 |

### 3.10 ISO/IEC 25010 naming normalization

The manuscript survey grouping used "interaction capability" and "flexibility", which are names from a later edition. The suite uses the eight names of the Quality Plan and Objectives 3.1 to 3.8: Functional Suitability, Performance Efficiency, Compatibility, Usability, Reliability, Security, Maintainability, Portability. Interaction capability is mapped to Usability and flexibility to Portability. PRD NFR tags, QAD rows, the UAT instrument and SAD reviewer pillars use these names.

### 3.11 Not-established register

Missing source material is not invented. Each gap below is marked "Not established" in the named doc.

| Doc | Section | Missing information | Reason |
|---|---|---|---|
| IDEA.md | 9.4 Evaluation plan | Number of UAT respondents | Manuscript Chapter 3 data analysis names respondent types but no count |
| idea-pathways.md | 4 Success and Judging Criteria | Capstone judging criteria | No source in the manuscript; collected from the developer |
| brd-pathways.md | 3 Business Model | Funding sources, development and hosting cost figures, operating cost owner | No source in the manuscript; collected in the questionnaire |
| brd-pathways.md | 4 Business Model Canvas | Customer relationships, revenue streams, cost structure | No source in the manuscript |
| brd-pathways.md | 10 Stakeholders | Named future privacy and security owner | No named owner in the manuscript |
| prd-pathways.md | 3.2 Functional Requirements | Per-row priority for Table 5 functional rows | The extracted table loses column alignment; priority derived from feature |
| prd-pathways.md | 5.7 Non-Functional Requirements | Numeric thresholds for NFR-1 to NFR-15 except browser and OS baseline | Table 5 and the Quality Plan give no numbers |
| prd-pathways.md | 3.3 Matrix | Priority of NFR-13 to NFR-15 | The Quality Plan states no priority |
| prd-pathways.md | 3.3 Matrix | Status of NFR-7, NFR-11 and NFR-15 | No test evidence in repository docs |
| build-pathways.md | 5.2 Public Surface and Crawler Policy | Crawler and indexing policy | No policy in the F13 charter or repository |
| val-pathways.md, scrutiny-pathways.md | Calendar timebox | Delivery calendar | No calendar in the source material |
| val-pathways.md, scrutiny-pathways.md | Concept reactions and legal review | Recorded visual reactions and legal privacy review | None recorded |
| clr-pathways.md | Retention, terms, IP, platform compliance | Retention periods, terms, IP and platform compliance position | Nothing in the repository or the manuscript ethics section |
| ops-pathways.md | Alerting, on-call, metrics, traces, postmortems, scheduler owner | Operational ownership and targets | Nothing in the repository or the manuscript; SLOs await the questionnaire |

### 3.12 Gates not met at this baseline

Every Not met or Partly met gate is registered in [deferred-features](deferred-features.md) or in an existing Change Record, and the manuscript alignment audit gates production release on them.

| Gate | Condition | Missing behavior | Deferred register entry |
|---|---|---|---|
| G-F7-5 | Indicators can be linked and reused across projects | No cross-project reuse in apps/api/src/modules/indicators | deferred-features: Project Template Library and cross-project Indicator Library (MA-01) |
| G-F8-7 | Dashboard responsiveness verified at production scale | No scale verification evidence | deferred-features: Performance scaling CR steps 3-5 (MA-08) |
| G-F9-9 | Participation breakdowns, indicator trends, server budget aggregate | Views hidden or computed in browser | deferred-features: F9 participation breakdowns, F9 indicator trends, F9 server-side budget aggregate (MA-08) |
| G-F9-10 | Survey totals for aggregate-only roles via closed-period release | Restricted state for Program Manager and Grant Manager | deferred-features: F9 manager survey totals (MA-08) |
| G-F10-1 | One alert per episode with versioned evidence | Integration verification pending (Partly met) | deferred-features: Integration verification for alerts, recommendations and report scope (MA-11) |
| G-F10-5 | Alert permission and scope | Combined PostgreSQL evidence pending (Partly met) | deferred-features: Integration verification for alerts, recommendations and report scope (MA-11) |
| G-F10-6 | Budget, Beneficiary and survey rule metrics evaluate | Metrics unavailable in admitted catalog | deferred-features: Rule metrics for Budget, Beneficiary and survey (MA-09); cr-pathways-f10-f11-runtime-authority |
| G-F10-7 | Scheduled background evaluation hosted | Machine processing disabled by default; hosting deferred | deferred-features: Hosting, SSO and cloud move to the client AWS stack (MA-10) |
| G-F11-1 | Review of predefined recommendations | Integration verification pending (Partly met) | deferred-features: Integration verification for alerts, recommendations and report scope (MA-11) |
| G-F11-5 | Recommendation Auto-resolved with its alert | DecisionStatus has no Auto-resolved value | deferred-features: Recommendation Auto-resolved state (MA-12) |
| G-F12-1 | Role scope and suppression on outputs | Final verification pending (Partly met) | deferred-features: Integration verification for alerts, recommendations and report scope (MA-11) |
| G-F12-4 | All report types export in all formats | CSV generation gap | deferred-features: CSV report generation on the private bucket (MA-13) |
| G-F13-5 | Public pages verified hosted | Hosted application deferred | deferred-features: Hosting, SSO and cloud move to the client AWS stack (MA-10) |
| G-F3-6 | Registration sharing an identity is held for review; review step unreachable by default roles (permission granted to no role); no merge | Review permission not granted to any role; no merge or linkage-flag operation | deferred-features: Duplicate-identity review and merge (MA-14) |
| G-F4-6 | A user can attach a free-text note to a journey record | No note route or table for journey notes | deferred-features: Free-text journey note (MA-06) |
| G-F6-7 | Choosing a data type for a new field and translating values during import | On hold per developer request | deferred-features: Import data-type and value mapping (MA-07); superseded 2026-10-03: delivered by cr-pathways-import-value-map, G-F6-7 Met (QAD-T54) |
| G-F1-10 | The app locks sign-in after repeated failures | No in-app sign-in lockout; the API does not implement one (only the step-up PIN lockout exists, PRD-F3) | deferred-features: Sign-in lockout after repeated failures (MA-04) |
| G-F2-4 | A project can be archived by a role holding `projects.archive` | Permission granted in rbac-contract.json but no archive route or UI (projects.controller.ts has create and update only) | deferred-features: Project archive (MA-05); reconciled 2026-10-03: the archive route exists (`projects.controller.ts`), G-F2-4 is Met (QAD-P10, QAD-T40) |

### 3.13 Records touched

Superseded notes were added under the header of `cr-pathways-beneficiary-step-up.md`, `cr-pathways-beneficiary-step-up-pin.md` and `rfc-pathways-auth-rbac-isolation.md` (manuscript Objective 2.2 is now descriptive analytics; step-up is inferred under Objective 1.8) and `cr-pathways-sad-orchestration.md` (old SAD and BUILD section numbers, section 3.5). Record bodies and filenames are unchanged.

## 4. Impact

### Product
No runtime change. Status language in the PRD and QAD now follows gates.

### Data / Migration
None.

### Authorization / Privacy
None. Documents contain no personal data, credentials or environment values.

### API
None.

### UI
None. The UI migration to the new foundations is deferred (section 3.3).

### Tests
`pnpm docs:check` must pass with no failures or warnings; section 7 lists the reconciliation checks.

### Documentation
Every suite doc is rebuilt or re-verified; propagation below.

| Doc | Affected | Done |
|---|---|---|
| IDEA.md | Yes | [x] |
| idea-pathways.md | Yes | [x] |
| val-pathways.md | Yes | [x] |
| scrutiny-pathways.md | Yes | [x] |
| voice-pathways.md | Yes | [x] |
| brd-pathways.md | Yes | [x] |
| ues-pathways.md | Yes | [x] |
| prd-pathways.md | Yes | [x] |
| dsd-pathways.md | Yes | [x] |
| sdd-pathways.md | Yes | [x] |
| qad-pathways.md | Yes | [x] |
| sad-pathways.md | Yes | [x] |
| build-pathways.md | Yes | [x] |
| clr-pathways.md | Yes | [x] |
| aia-pathways.md | Yes | [x] |
| ops-pathways.md | Yes | [x] |
| gtm-pathways.md | Yes | [x] |
| pitch-pathways.md | Yes | [x] |
| wrap-pathways.md | Yes | [x] |
| log-pathways.md | Yes | [x] |
| index.md | Yes | [x] |
| rfc-pathways-aws-hosting-migration.md | Yes | [x] |
| audit-pathways-manuscript-alignment-20261001.md | Yes | [x] |
| deferred-features.md | Yes | [x] |
| state.md | Yes | [x] |

## 5. Alternatives Considered

- Restraint option: patch individual docs in place. Rejected because contradictions spanned the PRD, SDD, SAD and BUILD and the new foundations changed the design authority.
- Keep SAD and BUILD numbering and map it in the template. Rejected (D7) to keep one numbering across the suite.
- Invent content for topics with no source. Rejected (D4); gaps are registered in section 3.11.

## 6. Migration / Rollback

Documentation only. The work lives on branch `docs/canonical-reconcile` and is merged into `dev` by a no-fast-forward merge (D5), so a revert of that merge commit restores the previous suite. No data or schema is touched.

## 7. Verification

- `pnpm docs:check` reports 0 failures and 0 warnings on a clean copy of the tracked tree.
- `pnpm docs:materialize` produces no diff.
- A case-insensitive search for the template source repository name over tracked files returns nothing.
- Every section reference in `.claude/agents/`, `sad-pathways.md` and `build-pathways.md` resolves to the section map in 3.5.
- Every stable ID (`PRD-F1` to `PRD-F13`, `QAD-*`, RFC and CR filenames, migration numbers) is preserved.

## 8. Approval

Developer decisions D1 to D16, 2026-10-01, recorded in the design spec. The one-time `log-pathways.md` exception (section 3.4) is part of D2.

## 9. Disposition

Applied. Suite docs, records and control files reflect this change. Deferred items are in [deferred-features](deferred-features.md); the AWS strategy is the Draft [rfc-pathways-aws-hosting-migration](rfc-pathways-aws-hosting-migration.md); production release remains gated by [audit-pathways-manuscript-alignment-20261001](audit-pathways-manuscript-alignment-20261001.md). Follow-up: the questionnaire-driven docs (UES, GTM, PITCH, WRAP, OPS SLOs), then integration into `dev`.
