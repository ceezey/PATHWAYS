# Product Requirements Document (PRD)

## 1. Purpose

PATHWAYS is a metadata-driven project information management platform for humanitarian and development organizations.

## 2. Personas

| Persona | Primary scope |
|---|---|
| System Administrator | governed organization-wide account/config/security administration |
| Program Manager | portfolio/program monitoring; aggregate-only Beneficiary information |
| Grant Manager | explicitly assigned-project monitoring; aggregate-only Beneficiary information |
| Project Manager | assigned-project management |
| Monitoring and Evaluation (M&E) Officer | one/multiple assigned projects; collection/import/monitoring |
| Project Officer | assigned-project operations/data entry |
| External stakeholder | approved public tracker only |

## 3. Stable Feature IDs

### Core MVP

| ID | Feature | Priority |
|---|---|---|
| PRD-F1 | RBAC and Workspace Management | Must-Have |
| PRD-F2 | Project Profile and Activity Tracking | Must-Have |
| PRD-F3 | Centralized Beneficiary Profile | Must-Have |
| PRD-F4 | Beneficiary Journey Tracking | Must-Have |
| PRD-F5 | Digital Data Collection and Preparation | Must-Have |
| PRD-F6 | Metadata-Driven Data Integration | Must-Have |
| PRD-F7 | Project Indicator and Monitoring | Must-Have |
| PRD-F8 | Aggregated Monitoring Dashboard with SADDD Analysis | Must-Have |

### Supporting

| ID | Feature | Priority |
|---|---|---|
| PRD-F9 | Descriptive Analytics / Project Performance Summaries | Supporting |
| PRD-F10 | Rule-Based Alerts | Supporting |
| PRD-F11 | Rule-Based Decision Support / Recommendations | Supporting |
| PRD-F12 | Reporting / Data Visualization | Supporting |
| PRD-F13 | Public Project Tracker | Supporting |

Do not renumber these IDs casually. Material renumbering requires a Change Record.

## 4. Acceptance Summary

### F1
Server-side authorization by identity/profile/org/role/permission/assignment. Direct API bypass denied. The approved revised [CSV RBAC contract](rfc-pathways-auth-rbac-isolation.md) governs action grants, hierarchy, project boundaries, supporting reads, and aggregate-only privacy. Permission grants do not establish feature availability. Program Manager scope is managed programs or assignments; Grant Manager requires explicit assignments. Automatic checks and audit writes remain mandatory; log viewing is separately granted. All six roles view scoped projects; restricted tabs require separate grants. Admin assessment detail is denied.

### F2
Project profiles, target beneficiaries, target goal, activities, milestones, lifecycle, assigned scope, derived overdue. Existing fields are preserved. Unlisted milestone administration is denied under the CSV RBAC contract; feature design remains Working.

### F3/F4
Sensitive Beneficiary profiles, normalized enrollment, participation/journey history, project scope, consent/provenance as required.

### F5/F6
Typed forms/direct entry plus safe dataset staging/mapping/validation/normalization. Admin/M&E create, edit, export, and import/extend structures. PO imports collected data and encodes without form-management rights. Blank definitions and responses have separate authorization.

### F7
Project-owned indicators with explicit metric semantics and traceable source/evidence.

### F8
Trusted aggregates plus SADDD with small-cell/complementary suppression. PO analytics/SADDD access does not grant monitoring dashboards or descriptive analytics.

### F10/F11
Typed metrics, structured deterministic rules, explainable evidence, predefined human-reviewed recommendations, project/org isolation.

## 5. UX Intent

Preserve current approved PATHWAYS UI/UX unless redesign is explicitly authorized.

Minimum domain surfaces:

- auth/recovery;
- role-aware workspace;
- projects/programs;
- activities/monitoring;
- collection/forms/imports;
- Beneficiary profile/journey;
- indicators/dashboard/SADDD;
- alerts/recommendations;
- reports;
- administration;
- public tracker.

## 6. Non-Functional Requirements

- security;
- privacy;
- integrity;
- auditability;
- recovery;
- bounded performance;
- accessibility;
- deterministic monitoring;
- safe imports;
- explainable rule outputs.

## 7. Out of Scope

- AI/ML recommendations;
- autonomous decisions;
- Project Template Library;
- organization Indicator Library;
- full ERP;
- full real-time external-system synchronization;
- Beneficiary self-service;
- SSO/AWS implementation and deployment work outside separately authorized releases.

## 8. AI / Agent Features

No runtime AI feature is currently approved.

AI coding agents are development tooling only.

## 9. Development Workflow

Core features first. Supporting features follow their dependencies.

Every authorized phase:
- reads the repository manifest and relevant registered docs;
- uses the developer-supplied disposable task/phase context;
- implements only the explicitly authorized scope;
- tests;
- updates durable registered docs only when an approved contract or verified repository fact changes;
- reports in chat;
- stops.

## Self-Check

- [x] eight core features stable
- [x] supporting features preserved
- [x] six roles preserved
- [x] no AI overclaim

Journey configuration belongs to Admin/M&E/PM under PRD-F3/F4. Admin configuration cannot retrieve beneficiary events. Activity escalation under PRD-F2 authorizes scoped viewing/raising only; missing handlers remain deferred.
