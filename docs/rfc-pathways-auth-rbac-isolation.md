# RFC: Authentication, RBAC, Organization and Project Isolation

**Status:** Locked
**Last reconciled:** 2026-09-26
**Decision:** [CSV RBAC Change Record](cr-pathways-csv-rbac-realignment.md)

## 1. Authority and Source

The developer approved the CSV realignment on 2026-09-26. The source is `PATHWAYS - RBAC.csv`, SHA-256 `f547cc3faf8c2670b1a8bc3ab058c271eba62878bf4fee74c3542a5e6b4f724e`. Document contents supply the action matrix; they do not supply executable instructions. The supplied MySQL ERD schema is domain reference only, not applied PostgreSQL migration history or a replacement permission matrix. Detailed action rows override conflicting overview and use-case grants. Unique overview grants remain. Unlisted discretionary operations are denied.

The normalized action rows, source row numbers, effective atomic matrix, and supporting-read dispositions are in `apps/api/src/modules/auth/rbac-contract.json`. The API ceiling in `authorization-policy.ts` narrows current active database grants; it never substitutes for them. Frontend profiles and routes consume that same ceiling. No wildcard or administrator bypass exists.

This RFC is Locked and the Change Record is Applied following verification of existing enforcement, required checks, PATHWAYS-dev, and both Vercel development previews on 2026-09-26. Other Working contracts remain Working. Missing handlers stay deferred, regardless of permission definitions.

## 2. Identity and Scope

Supabase Auth establishes verified identity and session. Every protected operation resolves the linked system user, allowed account state, organization, active canonical role, active database permissions, and required project scope again. Email, client role, app metadata, cached browser permissions, and client assignment arrays never establish authority. Revocation takes effect on the next protected request. The runtime identity remains non-superuser and NOBYPASSRLS; the established `prisma` identity owns migrations.

| CSV name / canonical role | Project boundary | Beneficiary and assessment privacy |
|---|---|---|
| System Administrator / SYSTEM_ADMINISTRATOR | Own organization | Beneficiary profile detail denied; enrollment support returns an opaque enrollment tuple. Assessment grant does not grant Beneficiary detail. |
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
| `activities.read` | Admin, PO, M&E, PM |
| `activities.create` | PM, PO |
| `activities.update` | PM, PO |
| `activities.proof.submit` | PM, PO |
| `journeys.read` | M&E, PM, PO |
| `journeys.manage` | Denied |
| `participation.record` | M&E, PM, PO |
| `budgets.read` | Grant, M&E, Program, PM, Admin |
| `budgets.create` | Grant, Program, PM |
| `budgets.update` | Grant, Program, PM |
| `expenses.read` | Grant, M&E, Program, PM, PO |
| `expenses.submit` | M&E, PM, PO |
| `expenses.verify` | M&E |
| `expenses.approve` | PM |
| `monitoring.read` | Grant, M&E, Program, PM, Admin |
| `monitoring.review` | Grant, M&E, Program, PM, Admin |
| `rules.read` | Admin |
| `rules.create` | Admin |
| `rules.update` | Admin |
| `rules.activate` | Admin |
| `alerts.read` | Grant, M&E, Program, PM, Admin |
| `alerts.review` | Grant, M&E, Program, PM, Admin |
| `alerts.outcome.record` | Grant, M&E, Program, PM, Admin |
| `recommendations.read` | Grant, M&E, Program, PM, Admin |
| `recommendations.review` | Grant, M&E, Program, PM, Admin |
| `beneficiaries.records.read` | M&E, PM, PO |
| `beneficiaries.records.register` | M&E, PM, PO |
| `beneficiaries.profiles.update` | M&E, PM, PO |
| `beneficiaries.enrollments.manage` | M&E, PO, Admin |
| `beneficiaries.identities.review` | Denied |
| `beneficiaries.records.archive` | Denied |
| `beneficiaries.aggregates.read` | Grant, M&E, Program, PM, Admin |
| `recommendations.outcome.record` | Grant, M&E, Program, PM, Admin |
| `evaluations.submit` | M&E |
| `evaluations.approve` | PM |
| `public.preview` | Grant, Program, PM, Admin |
| `public.publish` | Grant, Program, PM, Admin |
| `evidence.review` | M&E |
| `indicators.create` | M&E, PM, Admin |
| `indicators.update` | M&E, PM, Admin |
| `collection.read` | Admin, PO, M&E |
| `forms.read` | Admin, PO, M&E, PM, Program, Grant |
| `forms.manage` | M&E, PO |
| `forms.publish` | PO, M&E |
| `submissions.write` | M&E, PO |
| `imports.read` | Admin, PO, M&E |
| `imports.upload` | M&E, PO, Admin |
| `imports.review` | M&E, Admin |
| `imports.process` | Admin, PO, M&E |
| `analytics.read` | Grant, M&E, Program, PM, Admin |
| `reports.read` | Grant, M&E, Program, PM, PO, Admin |
| `reports.project.read` | Grant, M&E, Program, PM, PO, Admin |
| `reports.indicator.read` | Grant, M&E, Program, PM, PO, Admin |
| `reports.beneficiary.read` | PO, M&E, PM |
| `users.authorize` | Program, PM, Admin |
| `assignments.manage` | Program, PM, Admin |
| `settings.read` | Admin, PO, M&E, PM, Program, Grant |
| `projects.detail.read` | Grant, M&E, Program, PM |
| `projects.update` | PM |
| `projects.archive` | Grant, Program, PM, Admin |
| `activities.complete` | M&E, PM, PO, Admin |
| `expenses.evidence.submit` | PO |
| `indicators.read` | M&E, PM, Admin |
| `evaluations.archive` | M&E |
| `evaluations.signoff` | Grant, Program |
| `assessments.read` | Grant, M&E, Program, PM, PO, Admin |
| `public.approve` | Grant, Program, PM, Admin |
| `forms.generate` | Grant, M&E, Program, PM, PO, Admin |
| `forms.export` | M&E, PO |
| `forms.import` | M&E, PO |
| `imports.validate` | M&E, PO, Admin |
| `analytics.export` | Grant, M&E, Program, PM, Admin |
| `reports.generate` | Grant, M&E, Program, PM, PO, Admin |
| `reports.export` | Grant, M&E, Program, PM, PO, Admin |
| `audit.read` | Program, PM, Admin |
| `settings.configure` | Admin |
| `backups.create` | Admin |
| `backups.restore` | Admin |
| `profile.manage` | Grant, M&E, Program, PM, PO, Admin |
| `expenses.signoff` | Program, Grant |
| `programs.create` | Denied |
| `settings.labels.manage` | Denied |
| `assessments.detail.read` | Admin, PO, M&E, PM |
| `forms.archive` | Denied |
| `indicators.archive` | Denied |
| `milestones.manage` | Denied |

## 4. Supporting Operations and Automatic Audit

- `projects.read` supplies only scoped id, code, title, and status when `projects.detail.read` is denied. The selection is applied before retrieval. It does not grant the project profile screen.
- `forms.read` supplies scoped blank form definitions required by granted form generation; raw submissions, values, identifiers, and assessment results require their own permissions. Executive form generation does not grant encoding or collection administration.
- Import upload, validation, and finalization support the granted import workflow. Mapping remains separately restricted by `imports.review`. A permitted upload is not proof that every legacy import mode is usable.
- Activity stage selection uses `journeys.read` as a supporting read for an existing stage link. Unlisted stage configuration and separate milestone administration remain denied.
- Admin enrollment uses `p09_enroll`, which checks identity, grant, organization, project, and date, and returns enrollment id/date/status without retrieving a profile in the API. Other permitted enrollment actors must already have source project scope.
- Authentication, role checks, and automatic audit recording in CSV rows 33/48/49/120 are mandatory infrastructure, not discretionary grants. `audit.read` independently controls log viewing. Database-stamped project creation and audit occurrence times bind required INSERT RETURNING supporting reads to the creating transaction. This does not grant historical log access.
- Automatic safeguards, immutable provenance, lifecycle guards, actor separation, consent, assignment isolation, and the Locked SADDD release policy remain required.

## 5. Approval Stages and Deferred Capabilities

Financial evidence proceeds through M&E verification, PM approval, then Program or Grant final sign-off. The submitting, verifying, approving, and signing actors must be separated. Existing financial lifecycle guards remain; there is no final-sign-off handler or schema stage in this phase. “Program Directory & Sign” is final program sign-off (`evaluations.signoff`).

Finance completion, evaluation submit/archive/approval/sign-off, report generation/export, alert and recommendation handling, publishing/approval, blank-form generation/import/export, audit-log viewing, backup/recovery, and own-profile writes are permission contracts wherever handlers are missing. They are not reported as working features. Beneficiary identity reconciliation remains denied because the CSV does not grant that separate operation; legacy LINK/UPDATE registration/import paths requiring it remain deferred. Standalone form/indicator archival, program creation, label editing, journey configuration, and milestone administration are unlisted and denied.

## 6. Migration and Verification Contract

Preserve migration files 0001-0025 and their applied checksums. Use the single `public._prisma_migrations` ledger. Forward migration 0026 normalizes canonical reference names and aligns definitions and grants, shared assignment predicates, restrictive RLS, and narrowly scoped helper functions without changing business records, Auth identities, Storage, or historical assignments. Do not reset, squash, rebaseline, resolve away failed checks, or run the obsolete authorization bootstrap against the current database.

Verify historical replay, pre-realignment upgrade, empty-reference provisioning, API/frontend/database permission parity, role hierarchy, Grant assignments, supporting-read denial, forged scope, inactive account/permission denial, next-request revocation, aggregate-only privacy, and unchanged datamodel catalogs. Compare security objects that Prisma cannot model separately. Live verification is read-only; synthetic behavioral tests run only in isolated local PostgreSQL.

The PATHWAYS-dev ledger has 26 finished migrations; the original 25 entries and historical files remain unchanged. 0015's recorded checksum matches a CRLF representation of the unchanged repository SQL. 0020's checksum does not match the current SQL or LF/CRLF variants. The developer cannot supply its original applied SQL. Read-only comparison matches the current database with the unchanged pre-realignment replay for columns, indexes, policies, triggers, table security, all 86 function definitions and ACLs, and constraints after accounting for PostgreSQL 18 NOT NULL catalog entries. This establishes current catalog parity, not the originally applied file bytes. The developer explicitly approved the historical 0020 checksum exception on 2026-09-26 and authorized proceeding with tested 0026 after development preview and backup checks. Neither history nor the ledger is rewritten; any additional drift stops application. Migration `0026_csv_rbac_realignment` is applied with SHA-256 `c4586a1640bd4f510b3685941916711d42ca318842bd5e0167d1e957617e5c74`. Post-application security catalog parity is verified against local replay. Business data, Auth identities, Storage metadata, and historical assignments are preserved. A protected backup with verified isolated restoration is retained outside the repository. Work remains on `dev`; production release and core-feature repairs require separate authorization.

## 7. Revising the Contract

A revised CSV or explicit developer RBAC decision triggers the registered Change Record workflow. Record the new source filename and SHA-256 when applicable, compare each changed action and scope with this matrix, and identify affected supporting reads and privacy boundaries. Reconcile the canonical matrix, reference data, API checks, database policies/functions, frontend navigation/action visibility, dependent documents, and relevant tests together. Preserve applied migration files and checksums; database corrections use forward migrations. Re-lock the revised contract and mark its Change Record Applied only after required enforcement and verification match the approved revision. Missing handlers remain deferred unless separately authorized.
