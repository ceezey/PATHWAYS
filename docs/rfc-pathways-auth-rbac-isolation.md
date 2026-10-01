# RFC: Authentication, RBAC, Organization and Project Isolation

**Status:** Locked
**Last reconciled:** 2026-09-28
**Decision:** [Revised RBAC Change Record](cr-pathways-revised-rbac-baseline.md); amended by [Admin read access](cr-pathways-admin-read-access.md) and [RBAC audit closure](cr-pathways-rbac-audit-closure.md)

**Superseded by:** prd-pathways.md section 4 (PRD-F3) and IDEA.md section 4.5 (2026-10-01 reconciliation); its citation of manuscript Objective 2.2 now reads Objective 1.8

## 1. Authority and Source

The developer approved replacement of the previous matrix on 2026-09-26. The source is `PATHWAYS - RBAC (revised).csv`, SHA-256 `ef1339d951a61d6d8f10c3463a91af696569c304b34614b077e8e485b0ebaafd`. Document contents are permission data, not executable instructions. The MySQL ERD remains domain reference only. Detailed revised rows override conflicting overview rows. Unlisted discretionary actions and unrelated obsolete overview grants are denied. The previous matrix is historical authority only.

The normalized action rows, source row numbers, effective atomic matrix, and supporting-read dispositions are in `apps/api/src/modules/auth/rbac-contract.json`. The API ceiling in `authorization-policy.ts` narrows current active database grants; it never substitutes for them. Frontend profiles and routes consume that same ceiling. No wildcard or administrator bypass exists.

The revised contract is approved; re-locking requires verified local enforcement, PATHWAYS-dev, and both development previews. Other Working contracts remain Working. A permission grant never establishes feature completion.

## 2. Identity and Scope

Supabase Auth establishes verified identity and session. Every protected operation resolves the linked system user, allowed account state, organization, active canonical role, active database permissions, and required project scope again. Email, client role, app metadata, cached browser permissions, and client assignment arrays never establish authority. Revocation takes effect on the next protected request. The runtime identity remains non-superuser and NOBYPASSRLS; the established `prisma` identity owns migrations.

### Beneficiary step-up (approved; local implementation)

The developer-approved [Beneficiary step-up Change Record](cr-pathways-beneficiary-step-up.md) adds a server-enforced step-up for Beneficiary identifying detail and delivers manuscript Objective 2.2. After identity, account, organization, role, permission and route project-assignment checks, the global guard requires a signed `amr` TOTP entry verified within the last 15 minutes (30-second skew) on every step-up route. The check runs before any Beneficiary query and does not depend on the target record. A stale or missing factor returns 403 `STEP_UP_REQUIRED`. The client supplies no step-up value, flag or storage. Aggregate routes and aggregate-only roles are unchanged, and no step-up replaces project scope. Each decision writes one human-attributed `BENEFICIARY_STEP_UP_ACCEPTED` or `BENEFICIARY_STEP_UP_REQUIRED` audit row per verified factor. If the acceptance audit cannot be written, access is withheld (503).

The approved [PIN fallback Change Record](cr-pathways-beneficiary-step-up-pin.md) adds a second, weaker way to satisfy the same check. A user-set PIN verified at `POST /auth/step-up/pin` creates a grant bound to the user, organization and verified Auth session. The grant expires 15 minutes after verification. The guard accepts it only after scope authorization, reads it only from server-derived identity and session values, and rechecks session liveness in the same transaction. Setup and unlock require a fresh signed TOTP; change requires the current PIN or a fresh TOTP. Five consecutive failures lock the PIN under a row lock, and only a TOTP verified after the lock unlocks it. No administrator can view, set or reset a PIN. `BENEFICIARY_STEP_UP_ACCEPTED` records `method` (`TOTP` or `PIN`), and PIN audit events never contain the PIN or its hash. Aggregate-only roles remain denied detail regardless of any PIN.

### Approved F10/F11 machine exception (implementation pending)

The developer-approved [local runtime authority Change Record](cr-pathways-f10-f11-runtime-authority.md) defines a separate machine exception for local F10/F11 implementation/testing. It does not change the human identity chain, six-role ceiling, permissions or assignments. Approval does not establish available handlers or installed capabilities; machine operation remains disabled until exact implementation, specialist review and runtime verification pass.

Separate non-superuser/NOBYPASSRLS/NOINHERIT worker and sweeper identities use only fixed reviewed entrypoints under scoped RLS and narrow NOLOGIN owners. Worker may claim/capture/commit/release snapshot-bound work; sweeper may enqueue bounded hourly recovery for initialized state, without metric detail, evaluation or bootstrap authority. Neither may impersonate a human/MFA session, mutate sources, configure rules, approve eligibility or record human outcomes. No broad source/table access, privileged shared Prisma fallback or browser machine capability is permitted.

Only the exact POST machine drain/sweep handlers, under verified existing API-prefix behavior, use their distinct server-only credentials. Strict single Authorization-header parsing and constant-time fixed-length comparison apply. All ordinary routes retain the unchanged human guard and current-operation checks. SYSTEM evaluation/proposal attribution has null human actor references; HUMAN rows require genuine actors. Existing attribution/history remains intact. Calendar, whole-resource configuration denial, private note omission and compatibility requirements are specified in the approved Change Record. Hosted roles/database application, scheduler provisioning and production release remain separately gated. Private proof-inspection/download retirement now has separate [local developer approval](cr-pathways-private-activity-proof-inspection.md); implementation and verification remain pending.

| CSV name / canonical role | Project boundary | Beneficiary and assessment privacy |
|---|---|---|
| System Administrator / SYSTEM_ADMINISTRATOR | Own organization | Beneficiary and assessment/survey detail denied; analytical aggregates retain SADDD protections. Blank-form configuration grants no response-data access. |
| Program Manager / PROGRAM_MANAGER | Managed active programs or explicit active assignments | Aggregate-only, with existing SADDD suppression |
| Grant Manager / GRANT_MANAGER | Explicit active assignments | Aggregate-only, with existing SADDD suppression |
| Project Manager / PROJECT_MANAGER | Explicit active assignments | Permitted detail only within those assignments |
| M&E Officer / MONITORING_AND_EVALUATION_OFFICER | Explicit active assignments | Permitted detail only within those assignments |
| Project Officer / PROJECT_OFFICER | Explicit active assignments | Permitted detail only within those assignments |

Admin manages all six roles in its own organization. Program Manager manages PM and M&E within managed-program or assigned scope. PM manages PO and M&E within assigned scope. Only Admin can assign Grant Managers. Existing Grant Manager accounts without assignments gain no implicit organization portfolio. Historical assignments are preserved. A PM creating a project receives the existing automatic self-assignment in the creation transaction; it is not authority to assign another PM or transfer their scope.

This hierarchy applies to CSV rows 23-27 (Manage Users and Roles, Create User, Assign Role and related), which mark Program Manager and Project Manager without naming target roles. The developer confirmed it on 2026-09-28 ([RBAC audit closure](cr-pathways-rbac-audit-closure.md) A-06): Program Manager authorizes Project Manager and M&E Officer; Project Manager authorizes Project Officer and M&E Officer; only System Administrator assigns Grant Manager.

## 3. Effective Atomic Permissions

Admin = System Administrator; Program = Program Manager; Grant = Grant Manager; PM = Project Manager; M&E = Monitoring and Evaluation Officer; PO = Project Officer. Every project permission also requires the boundary above. Organization configuration and account operations require own-organization scope and role hierarchy.

| Permission | Role ceiling |
|---|---|
| `projects.read` | Admin, PO, M&E, PM, Program, Grant |
| `projects.create` | PM |
| `activities.read` | Admin, PO, M&E, PM |
| `activities.create` | PO, PM |
| `activities.update` | PM |
| `activities.proof.submit` | PO, PM |
| `journeys.read` | PO, M&E, PM (Admin lists stages through `journeys.manage`) |
| `journeys.manage` | Admin, M&E, PM |
| `participation.record` | PO, M&E, PM |
| `budgets.read` | Admin, PM, Program, Grant |
| `budgets.create` | PM, Program, Grant |
| `budgets.update` | PM, Program, Grant |
| `expenses.read` | M&E, PM, Program, Grant |
| `expenses.submit` | PO, M&E, PM |
| `expenses.verify` | M&E |
| `expenses.approve` | PM |
| `monitoring.read` | Admin, M&E, PM, Program, Grant |
| `monitoring.review` | Admin, M&E, PM, Program, Grant |
| `rules.read` | Admin |
| `rules.create` | Admin |
| `rules.update` | Admin |
| `rules.activate` | Admin |
| `alerts.read` | Admin, PO, M&E, PM, Program, Grant |
| `alerts.review` | Admin, PO, M&E, PM, Program, Grant |
| `alerts.outcome.record` | Admin, PO, M&E, PM, Program, Grant |
| `recommendations.read` | Admin, PO, M&E, PM, Program, Grant |
| `recommendations.review` | Admin, PO, M&E, PM, Program, Grant |
| `beneficiaries.records.read` | PO, M&E, PM |
| `beneficiaries.records.register` | PO, M&E, PM |
| `beneficiaries.profiles.update` | PO, M&E, PM |
| `beneficiaries.enrollments.manage` | PO, M&E, PM |
| `beneficiaries.identities.review` | M&E |
| `beneficiaries.records.archive` | Denied |
| `beneficiaries.aggregates.read` | Admin, PO, M&E, PM, Program, Grant |
| `recommendations.outcome.record` | Admin, PO, M&E, PM, Program, Grant |
| `evaluations.submit` | Reserved; granted to no role |
| `evaluations.approve` | Reserved; granted to no role |
| `public.preview` | Admin, PM, Program, Grant |
| `public.publish` | Admin, PM, Program, Grant |
| `evidence.review` | M&E |
| `indicators.create` | Admin, M&E, PM |
| `indicators.update` | Admin, M&E, PM |
| `collection.read` | Admin, PO, M&E |
| `forms.read` | Admin, PO, M&E |
| `forms.manage` | Admin, M&E |
| `forms.publish` | Admin, M&E |
| `submissions.write` | PO, M&E |
| `imports.read` | Admin, PO, M&E |
| `imports.upload` | Admin, PO, M&E |
| `imports.review` | Admin, M&E |
| `imports.process` | Admin, PO, M&E |
| `analytics.read` | Admin, PO, M&E, PM, Program, Grant |
| `reports.read` | Admin, PO, M&E, PM, Program, Grant |
| `reports.project.read` | Admin, PO, M&E, PM, Program, Grant |
| `reports.indicator.read` | Admin, PO, M&E, PM, Program, Grant |
| `reports.beneficiary.read` | PO, M&E, PM |
| `users.authorize` | Admin, PM, Program |
| `assignments.manage` | Admin, PM, Program |
| `settings.read` | Admin, PO, M&E, PM, Program, Grant |
| `projects.detail.read` | Admin, PO, M&E, PM, Program, Grant |
| `projects.update` | PM |
| `projects.archive` | Admin, PM, Program, Grant |
| `activities.complete` | PO, M&E, PM |
| `expenses.evidence.submit` | PO, M&E, PM |
| `indicators.read` | Admin, M&E, PM |
| `evaluations.archive` | Reserved; granted to no role |
| `evaluations.signoff` | Reserved; granted to no role |
| `assessments.read` | Admin, PO, M&E, PM, Program, Grant |
| `public.approve` | Admin, PM, Program, Grant |
| `forms.generate` | Admin, PO, M&E |
| `forms.export` | Admin, M&E |
| `forms.import` | Admin, PO, M&E |
| `imports.validate` | Admin, PO, M&E |
| `analytics.export` | Admin, M&E, PM, Program, Grant |
| `reports.generate` | Admin, PO, M&E, PM, Program, Grant |
| `reports.export` | Admin, PO, M&E, PM, Program, Grant |
| `audit.read` | Admin, PM, Program |
| `settings.configure` | Admin |
| `backups.create` | Admin |
| `backups.restore` | Admin |
| `profile.manage` | Admin, PO, M&E, PM, Program, Grant |
| `expenses.signoff` | Program, Grant |
| `programs.create` | Denied |
| `settings.labels.manage` | Reserved; granted to no role |
| `assessments.detail.read` | PO, M&E, PM |
| `forms.archive` | Denied |
| `indicators.archive` | Denied |
| `milestones.manage` | Denied |
| `activities.progress.update` | PO, M&E, PM |
| `evidence.read` | Admin, PO, M&E, PM, Program, Grant |
| `activities.escalations.read` | Admin, PO, M&E, PM, Program, Grant |
| `activities.escalations.raise` | Admin, PO, M&E, PM, Program, Grant |
| `forms.templates.import` | Admin, M&E |
| `evaluations.weights.configure` | Admin, M&E |
| `dashboards.customize` | Admin, PO, M&E, PM, Program, Grant |
| `analytics.descriptive.read` | Admin, M&E, PM, Program, Grant |
| `analytics.saddd.read` | Admin, PO, M&E, PM, Program, Grant |
| `activities.context.read` | Admin |

## 4. Supporting Operations and Automatic Audit

- All six roles have scoped project viewing. Shared responses omit beneficiary, assessment, financial, and other separately restricted tab data before retrieval.
- `activities.context.read` gives Admin scoped activity identifiers, titles, status, and stage identifiers for journey/indicator configuration. On its own it does not grant activity screens, proof notes, assignment identities, or budgets. Detail roles, and Admin under the [admin read access amendment](cr-pathways-admin-read-access.md), hold `activities.read`.
- Admin/M&E manage blank forms, create/edit/export forms, and import/extend templates. PO reads definitions to generate or encode/import collected data. `forms.templates.import` is distinct from collected-data import and dataset ingestion. Blank-form grants never authorize raw responses.
- Admin/M&E/PM configure journeys. Admin receives a scoped event-existence boolean to preserve freeze guards without retrieving beneficiary history. Journey events and participation detail additionally require beneficiary-record access.
- Admin normalization may read only its own imported submissions/values needed by processing, not arbitrary assessment records. Encoding and assessment-detail roles retain separately granted response access.
- Completion, enrollment, and participation support assigned PO/M&E/PM workflows. Admin enrollment is denied. Lifecycle, consent, and provenance guards remain.
- PO may open analytics, SADDD, alerts, and recommendations. Monitoring dashboards and descriptive analytics remain separately denied to PO. SADDD suppression applies to every role.
- Activity escalation grants scoped viewing and raising only. Resolution, approval, and financial actions require separate permissions.
- Authentication, role checks, and automatic audit recording remain mandatory for every protected operation. `audit.read` separately authorizes viewing. Transaction-bound INSERT RETURNING support does not grant historical log access.
- Approved F10/F11 in-app notification support derives the recipient from the current linked user and rechecks the applicable alert/recommendation permissions, account, project scope and whole-resource eligibility before retrieval, counting or read acknowledgement. Preview, confirmation and delivery recheck recipients independently. It adds no permission seed or unrestricted profile data access. This supporting disposition is approved for local implementation; handlers remain unavailable until verified.
- The [approved private pending-proof inspection](cr-pathways-private-activity-proof-inspection.md) permits only assigned, distinct M&E reviewers with both evidence grants and exact pending activity/update/proof scope. It preserves consent/classification and public restrictions, requires bounded verified bytes and final live authorization/audit, and withdraws generic uploader/PO/PM/post-review downloads. Local implementation and verification remain pending; this grants no new permission or broader media release.
- The [activity proof direct upload](cr-pathways-activity-progress-media.md), implemented on its feature branch with a reduced scope (its section 9), moves proof upload out of the API request body. Reservation and per-file finalize both stay behind the existing `activities.proof.submit` authority, an active personal activity assignment and no other pending update; the server alone derives the object key, verifies size/type/digest before any evidence becomes ready, and owns the final state change. A leaked upload token authorizes writing one server-derived object path only, never a read, and expires with the reservation. This grants no new permission. The private pending-proof inspection bounds above amend to ten proofs and `EVIDENCE_MAX_FILE_BYTES` for this evidence.
- The [approved project RBAC UI alignment and structured partners record](cr-pathways-project-rbac-ui-and-partners.md) adds the assignable-officer read (`GET projects/:projectId/activities/assignable-officers`). It admits only a caller who holds `activities.create` or `activities.update` (atomic, under the role ceiling) with project scope for that permission, which today is an assigned Project Officer or an assigned Project Manager; every other role is denied because it holds neither permission. It returns exactly the users `resolveAssignments` would accept as assignees: active `PROJECT_OFFICER` role, active unarchived account, active unended assignment to the caller's project in the caller's organization. Fields are limited to `userId` and `displayName`; no email, contact number, auth identifier, role list, account status, other-project data or assignment date is returned. Rows are bounded to 50, ordered by display name then ID, with scope applied in the query before retrieval. An inaccessible project returns the uniform 404. It adds no permission-matrix grant.

## 5. Approval Stages and Deferred Capabilities

Financial evidence retains M&E verification, PM approval, then Program/Grant final sign-off with actor separation. Removed overview grants for evaluation submission, approval, archival, and program sign-off remain denied. Evaluation-weight configuration is separately granted to Admin/M&E and may change only weights and timestamps, with lifecycle locks preserved.

Missing escalation handlers, generic activity-progress handlers, finance completion/final-sign-off, evaluation-weight UI/API, reporting/generation/export, alert/recommendation actions, publishing, blank-form generation (except the audited form-definition export under `forms.export` from the [import throughput record](cr-pathways-import-throughput-and-pdf.md)) or dedicated template-import handlers, audit viewing, backup/recovery, and own-profile writes remain deferred wherever absent.

**Reserved supporting permissions.** `evaluations.submit`, `evaluations.approve`, `evaluations.signoff`, `evaluations.archive`, `settings.read` and `settings.labels.manage` stay defined but back no API endpoint. They are reserved for future supporting operations. `evaluations.submit`, `.approve`, `.signoff`, `.archive` and `settings.labels.manage` are currently granted to no role; `settings.read` keeps its listed grants but gates no endpoint ([RBAC audit closure](cr-pathways-rbac-audit-closure.md) A-04).

**`monitoring.review`'s first enforced endpoint.** `monitoring.review` was previously defined in the RBAC contract but backed no endpoint. The [approved overdue-explanation record](cr-pathways-activity-overdue-explanation.md) adds its first: `POST /projects/:projectId/activities/:activityId/overdue-explanations`, scoped to the actor's active *project* assignment (the same `projectScope(actor)` rule applied to every other project-scoped M&E read: `SYSTEM_ADMINISTRATOR` org-wide, `PROGRAM_MANAGER` also via a managed program, every other role needs an active project assignment), matching migration 0043's RLS INSERT policy (`p05_has_project_permission`). A first pass mistakenly required an active personal `ProjectActivityAssignment` on the activity itself, mirroring `activities.progress.update`'s own per-activity assignment check; corrected the same day (2026-09-29) because M&E officers are normally assigned to the project, not to individual activities.

Existing handlers are aligned but not certified as usable core features. Identity reconciliation, standalone form/indicator archival, program creation, label editing, and milestone administration remain denied. Existing UI design and target-beneficiary fields remain. The [approved project target-goal retirement](cr-pathways-retire-project-target-goal.md) withdraws live benchmark inputs, outputs and comparisons while retaining historical storage; implementation/verification remain pending. It changes no human permission or scope boundary.

## 6. Migration and Verification Contract

The approved consolidation replaces active historical directories with `0000_pathways_baseline_through_0026`, `0027_revised_csv_rbac`, and the separately approved `0028_revised_aggregate_permission_guards`. Exact original 0001-0026 SQL and lock remain in `apps/api/prisma/history/through-0026.zip`, with names, SHA-256 values, Git provenance, purpose, superseded definitions, and retained invariants in its manifest. Verify/extract with `scripts/migrations/history.py`; historical runners stay local and guarded.

The baseline captures post-0026 tables, enums, constraints, indexes/defaults, canonical authorization references, policies, functions, ACLs, triggers, extensions, and portable ownership. It contains no business records, Auth identities, Storage content, credentials, or hosted ownership. Fresh provisioning uses the baseline with provider prerequisites and administrator ownership capabilities. Existing databases must never execute baseline DDL: verify catalog equivalence, register it through Prisma, preserve all 26 historical ledger rows/checksums, then deploy the approved forward corrections 0027 and 0028. The latter replaces obsolete aggregate role checks with atomic SADDD/monitoring permissions while preserving scope, privacy, audit, owners, and ACLs. Use the single public Prisma ledger. No resets, ledger cleanup, automatic restore, or obsolete bootstrap deployment is authorized.

Verify archived history, fresh baseline, 0026 upgrade through registration and 0027/0028, installed Prisma 6.19.2 status/deploy/datamodel comparison, and subsequent disposable migration creation/application. Provider schemas referenced by foreign keys must be included in datasource introspection; URL-only domain introspection gives P4002. Compare SQL-only security catalogs, effective privileges, ownership, and defaults independently. Unexpected divergence or a reset requirement blocks remote application.

The approved 0015 CRLF checksum explanation and 0020 exception remain unchanged. Original applied 0020 bytes are unavailable and unverifiable; current catalog parity does not prove those bytes. Historical SQL and ledger checksums are not rewritten. Historical 0026 checksum is `c4586a1640bd4f510b3685941916711d42ca318842bd5e0167d1e957617e5c74`. Remote application requires verified target/ledger/catalogs, a protected backup with isolated restoration, coordinated previews, and preserved business/Auth/Storage/assignment inventories. Synthetic behavioral tests remain local. Production release and core-feature repairs require separate authorization.

## 7. Revising the Contract

A revised CSV or explicit developer RBAC decision triggers the registered Change Record workflow. Record the new source filename and SHA-256 when applicable, compare each changed action and scope with this matrix, and identify affected supporting reads and privacy boundaries. Reconcile the canonical matrix, reference data, API checks, database policies/functions, frontend navigation/action visibility, dependent documents, and relevant tests together. Preserve exact archived/applied bytes and ledger checksums; corrections use forward migrations. Consolidation requires an explicit approved Change Record. Re-lock the revised contract and mark its Change Record Applied only after required enforcement and verification match the approved revision. Missing handlers remain deferred unless separately authorized.

The Budget tab requires `budgets.read` (Admin/PM/Program/Grant; Admin read-only). Assigned PO/M&E expense logging/review permissions authorize their respective operations without granting that tab or budget data; separate missing financial UI work remains deferred.

## Core P1 supporting authority

The [core P1 supporting operations](cr-pathways-core-p1-supporting-operations.md) contract retains the complete verified human/account/organization/current-grant/project-assignment chain. Blank registration-context reads support existing PO/M&E/PM registration authority without forms.read or collection/Beneficiary permission expansion. Server-derived mapping is current-uploader support under imports.upload; it confers neither manual imports.review nor imports.process. Protected retries reauthorize. Narrow supporting policies do not replace or misrepresent preserved broad policies; supported direct-registration writes acquire the exact pinned definition lock for every actor. No permission seed or six-role ceiling changes. Installation and runtime acceptance remain pending.
