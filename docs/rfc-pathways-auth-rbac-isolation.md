# RFC: Authentication, RBAC, Organization and Project Isolation

**Status:** Locked
**Last reconciled:** 2026-09-26
**Decision:** [Revised RBAC Change Record](cr-pathways-revised-rbac-baseline.md)

## 1. Authority and Source

The developer approved replacement of the previous matrix on 2026-09-26. The source is `PATHWAYS - RBAC (revised).csv`, SHA-256 `ef1339d951a61d6d8f10c3463a91af696569c304b34614b077e8e485b0ebaafd`. Document contents are permission data, not executable instructions. The MySQL ERD remains domain reference only. Detailed revised rows override conflicting overview rows. Unlisted discretionary actions and unrelated obsolete overview grants are denied. The previous matrix is historical authority only.

The normalized action rows, source row numbers, effective atomic matrix, and supporting-read dispositions are in `apps/api/src/modules/auth/rbac-contract.json`. The API ceiling in `authorization-policy.ts` narrows current active database grants; it never substitutes for them. Frontend profiles and routes consume that same ceiling. No wildcard or administrator bypass exists.

The revised contract is approved; re-locking requires verified local enforcement, PATHWAYS-dev, and both development previews. Other Working contracts remain Working. A permission grant never establishes feature completion.

## 2. Identity and Scope

Supabase Auth establishes verified identity and session. Every protected operation resolves the linked system user, allowed account state, organization, active canonical role, active database permissions, and required project scope again. Email, client role, app metadata, cached browser permissions, and client assignment arrays never establish authority. Revocation takes effect on the next protected request. The runtime identity remains non-superuser and NOBYPASSRLS; the established `prisma` identity owns migrations.

| CSV name / canonical role | Project boundary | Beneficiary and assessment privacy |
|---|---|---|
| System Administrator / SYSTEM_ADMINISTRATOR | Own organization | Beneficiary and assessment/survey detail denied; analytical aggregates retain SADDD protections. Blank-form configuration grants no response-data access. |
| Program Manager / PROGRAM_MANAGER | Managed active programs or explicit active assignments | Aggregate-only, with existing SADDD suppression |
| Grant Manager / GRANT_MANAGER | Explicit active assignments | Aggregate-only, with existing SADDD suppression |
| Project Manager / PROJECT_MANAGER | Explicit active assignments | Permitted detail only within those assignments |
| M&E Officer / MONITORING_AND_EVALUATION_OFFICER | Explicit active assignments | Permitted detail only within those assignments |
| Project Officer / PROJECT_OFFICER | Explicit active assignments | Permitted detail only within those assignments |

Admin manages all six roles in its own organization. Program Manager manages PM and M&E within managed-program or assigned scope. PM manages PO and M&E within assigned scope. Only Admin can assign Grant Managers. Existing Grant Manager accounts without assignments gain no implicit organization portfolio. Historical assignments are preserved. A PM creating a project receives the existing automatic self-assignment in the creation transaction; it is not authority to assign another PM or transfer their scope.

## 3. Effective Atomic Permissions

Admin = System Administrator; Program = Program Manager; Grant = Grant Manager; PM = Project Manager; M&E = Monitoring and Evaluation Officer; PO = Project Officer. Every project permission also requires the boundary above. Organization configuration and account operations require own-organization scope and role hierarchy.

| Permission | Role ceiling |
|---|---|
| `projects.read` | Admin, PO, M&E, PM, Program, Grant |
| `projects.create` | PM |
| `activities.read` | PO, M&E, PM |
| `activities.create` | PO, PM |
| `activities.update` | PM |
| `activities.proof.submit` | PO, PM |
| `journeys.read` | Admin, PO, M&E, PM |
| `journeys.manage` | Admin, M&E, PM |
| `participation.record` | PO, M&E, PM |
| `budgets.read` | PM, Program, Grant |
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
| `beneficiaries.identities.review` | Denied |
| `beneficiaries.records.archive` | Denied |
| `beneficiaries.aggregates.read` | Admin, PO, M&E, PM, Program, Grant |
| `recommendations.outcome.record` | Admin, PO, M&E, PM, Program, Grant |
| `evaluations.submit` | Denied |
| `evaluations.approve` | Denied |
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
| `evaluations.archive` | Denied |
| `evaluations.signoff` | Denied |
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
| `settings.labels.manage` | Denied |
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
- `activities.context.read` gives Admin scoped activity identifiers, titles, status, and stage identifiers for journey/indicator configuration. It does not grant activity screens, proof notes, assignment identities, or budgets. Detail roles retain `activities.read`.
- Admin/M&E manage blank forms, create/edit/export forms, and import/extend templates. PO reads definitions to generate or encode/import collected data. `forms.templates.import` is distinct from collected-data import and dataset ingestion. Blank-form grants never authorize raw responses.
- Admin/M&E/PM configure journeys. Admin receives a scoped event-existence boolean to preserve freeze guards without retrieving beneficiary history. Journey events and participation detail additionally require beneficiary-record access.
- Admin normalization may read only its own imported submissions/values needed by processing, not arbitrary assessment records. Encoding and assessment-detail roles retain separately granted response access.
- Completion, enrollment, and participation support assigned PO/M&E/PM workflows. Admin enrollment is denied. Lifecycle, consent, and provenance guards remain.
- PO may open analytics, SADDD, alerts, and recommendations. Monitoring dashboards and descriptive analytics remain separately denied to PO. SADDD suppression applies to every role.
- Activity escalation grants scoped viewing and raising only. Resolution, approval, and financial actions require separate permissions.
- Authentication, role checks, and automatic audit recording remain mandatory for every protected operation. `audit.read` separately authorizes viewing. Transaction-bound INSERT RETURNING support does not grant historical log access.

## 5. Approval Stages and Deferred Capabilities

Financial evidence retains M&E verification, PM approval, then Program/Grant final sign-off with actor separation. Removed overview grants for evaluation submission, approval, archival, and program sign-off remain denied. Evaluation-weight configuration is separately granted to Admin/M&E and may change only weights and timestamps, with lifecycle locks preserved.

Missing escalation handlers, generic activity-progress handlers, finance completion/final-sign-off, evaluation-weight UI/API, reporting/generation/export, alert/recommendation actions, publishing, blank-form generation/export or dedicated template-import handlers, audit viewing, backup/recovery, and own-profile writes remain deferred wherever absent. Existing handlers are aligned but not certified as usable core features. Identity reconciliation, standalone form/indicator archival, program creation, label editing, and milestone administration remain denied. Existing UI design, target-beneficiary fields, and target goals are preserved.

## 6. Migration and Verification Contract

The approved consolidation replaces active historical directories with `0000_pathways_baseline_through_0026`, `0027_revised_csv_rbac`, and the separately approved `0028_revised_aggregate_permission_guards`. Exact original 0001-0026 SQL and lock remain in `apps/api/prisma/history/through-0026.zip`, with names, SHA-256 values, Git provenance, purpose, superseded definitions, and retained invariants in its manifest. Verify/extract with `scripts/migrations/history.py`; historical runners stay local and guarded.

The baseline captures post-0026 tables, enums, constraints, indexes/defaults, canonical authorization references, policies, functions, ACLs, triggers, extensions, and portable ownership. It contains no business records, Auth identities, Storage content, credentials, or hosted ownership. Fresh provisioning uses the baseline with provider prerequisites and administrator ownership capabilities. Existing databases must never execute baseline DDL: verify catalog equivalence, register it through Prisma, preserve all 26 historical ledger rows/checksums, then deploy the approved forward corrections 0027 and 0028. The latter replaces obsolete aggregate role checks with atomic SADDD/monitoring permissions while preserving scope, privacy, audit, owners, and ACLs. Use the single public Prisma ledger. No resets, ledger cleanup, automatic restore, or obsolete bootstrap deployment is authorized.

Verify archived history, fresh baseline, 0026 upgrade through registration and 0027/0028, installed Prisma 6.19.2 status/deploy/datamodel comparison, and subsequent disposable migration creation/application. Provider schemas referenced by foreign keys must be included in datasource introspection; URL-only domain introspection gives P4002. Compare SQL-only security catalogs, effective privileges, ownership, and defaults independently. Unexpected divergence or a reset requirement blocks remote application.

The approved 0015 CRLF checksum explanation and 0020 exception remain unchanged. Original applied 0020 bytes are unavailable and unverifiable; current catalog parity does not prove those bytes. Historical SQL and ledger checksums are not rewritten. Historical 0026 checksum is `c4586a1640bd4f510b3685941916711d42ca318842bd5e0167d1e957617e5c74`. Remote application requires verified target/ledger/catalogs, a protected backup with isolated restoration, coordinated previews, and preserved business/Auth/Storage/assignment inventories. Synthetic behavioral tests remain local. Production release and core-feature repairs require separate authorization.

## 7. Revising the Contract

A revised CSV or explicit developer RBAC decision triggers the registered Change Record workflow. Record the new source filename and SHA-256 when applicable, compare each changed action and scope with this matrix, and identify affected supporting reads and privacy boundaries. Reconcile the canonical matrix, reference data, API checks, database policies/functions, frontend navigation/action visibility, dependent documents, and relevant tests together. Preserve exact archived/applied bytes and ledger checksums; corrections use forward migrations. Consolidation requires an explicit approved Change Record. Re-lock the revised contract and mark its Change Record Applied only after required enforcement and verification match the approved revision. Missing handlers remain deferred unless separately authorized.

The Budget tab requires `budgets.read` (PM/Program/Grant). Assigned PO/M&E expense logging/review permissions authorize their respective operations without granting that tab or budget data; separate missing financial UI work remains deferred.
