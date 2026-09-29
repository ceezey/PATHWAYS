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
Server-side authorization by identity/profile/org/role/permission/assignment. Direct API bypass denied. The approved revised [CSV RBAC contract](rfc-pathways-auth-rbac-isolation.md) governs action grants, hierarchy, project boundaries, supporting reads, and aggregate-only privacy. Permission grants do not establish feature availability. Program Manager scope is managed programs or assignments; Grant Manager requires explicit assignments. Automatic checks and audit writes remain mandatory; log viewing is separately granted. All six roles view scoped projects; restricted tabs require separate grants. Admin assessment detail is denied. Beneficiary identifying-detail reads and writes also require a server-verified MFA step-up from the last 15 minutes (manuscript Objective 2.2; [Beneficiary step-up Change Record](cr-pathways-beneficiary-step-up.md)). A user-set PIN is an approved fallback: it opens a 15-minute grant bound to the user, organization and verified session, locks after 5 failures and unlocks only with the authenticator ([PIN fallback Change Record](cr-pathways-beneficiary-step-up-pin.md)).

### F2
Project profiles, target beneficiaries, activities, milestones, lifecycle, assigned scope, derived overdue. The [approved target-goal retirement](cr-pathways-retire-project-target-goal.md) removes the project benchmark from live inputs, outputs and comparisons while preserving database history; implementation and verification remain pending. Indicator-specific targets remain independent. Unlisted milestone administration is denied under the CSV RBAC contract; feature design remains Working.

The F2 pending activity-review workflow additionally follows the [approved private-proof inspection contract](cr-pathways-private-activity-proof-inspection.md). Only assigned, distinct M&E reviewers with both evidence grants inspect pure pending activity proofs; generic uploader/PO/PM/post-review downloads are withdrawn. Inspection establishes neither classification nor public consent. Local implementation/verification remains pending.

### F3/F4
Sensitive Beneficiary profiles, normalized enrollment, participation/journey history, project scope, consent/provenance as required.

The [approved default registration form contract](cr-pathways-default-registration-form.md) adds these acceptance criteria:

- Add Beneficiary is available in every existing project. When a project has no published registration form of its own, the first registrar use provisions one fixed, versioned system registration form, and every registration still goes through the same promotion path, consent records and audit.
- A new registration, and a profile edit that changes the birth date or age, rejects a Beneficiary younger than 5 ("Beneficiary must be at least 5 years old.") and a birth date after the business date ("Date of birth cannot be in the future."). Imported registration rows inherit both rules. Existing records under 5 stay valid, and no database constraint is added.

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

## Local PRD-F3/F5/F6 supporting repair

The [core P1 supporting operations](cr-pathways-core-p1-supporting-operations.md) contract specifies scoped blank registration definitions for existing authorized registration actors and conservative server-derived mapping for the current uploader. General form-management, manual review and normalization permissions remain unchanged. Individual registration selects an eligible published version, validates its supported canonical and custom fields, and independently reauthorizes at submission. No installed endpoint or completed acceptance is implied.
