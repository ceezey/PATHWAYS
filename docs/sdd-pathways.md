# System Design Document (SDD)

## 1. Architecture Principles

- backend authz authoritative;
- organization/project isolation explicit;
- data provenance traceable;
- metadata structures processing;
- monitoring metrics have trusted definitions;
- rules are deterministic;
- private data stays private by default;
- PostgreSQL portability preserved;
- deployment/SSO/AWS are not current feature-work acceptance criteria.

## 2. High-Level Architecture

Current direction:

```text
Web app
  ↓
NestJS API
  ↓
Authorization context
  ↓
Prisma
  ↓
PostgreSQL / Supabase
```

Supabase:
- Auth
- Storage

Core domain CRUD does not depend on direct browser PostgREST/Data API access.

## 3. Data Domains

Source: `apps/api/prisma/schema.prisma` (datasource `schemas = ["public", "pathways"]`; domain tables in `pathways`), active baseline `0000_pathways_baseline_through_0026` plus `0027_revised_csv_rbac` and `0028_revised_aggregate_permission_guards`; exact security/runtime history is archived and the PATHWAYS-dev transition is verified. Table names below are the `@@map` names, verified 2026-09-26.

| Domain | PRD | Tables |
|---|---|---|
| Identity / Organization | PRD-F1 | organizations, roles, permissions, role_permissions, system_users, audit_logs |
| Project / Activity | PRD-F2 | programs, projects, user_project_assignments, project_activities, activity_updates, project_activity_assignments, project_milestones |
| Collection / Metadata | PRD-F5, PRD-F6 | digital_forms, form_fields, data_import_batches, data_import_rows, metadata_mappings, form_submissions, form_response_values |
| Beneficiary | PRD-F3, PRD-F4 | beneficiaries, beneficiary_identifiers, beneficiary_project_enrollments, beneficiary_consent_records, journey_stages, activity_journey_stage_mappings, beneficiary_activity_participations, beneficiary_journey_events |
| Indicators / Monitoring | PRD-F7, PRD-F8 | project_indicators, activity_indicator_links, project_indicator_bindings, project_indicator_measurements, sensitive_aggregate_releases |
| Budget / Evaluation | PRD-F9 | project_budget_records, budget_expense_entries, assessment_results, project_evaluation_criteria, project_evaluations, project_evaluation_scores |
| Rules / Decision support | PRD-F10, PRD-F11 | alert_rules, alert_rule_conditions, alert_rule_recommendations, rule_based_alerts, decision_recommendations |
| Evidence / Reporting | PRD-F12, PRD-F13 | evidence_media, reports |

Enums are mapped in the same schema (for example `rule_metric`, `rule_operator`, `decision_status`). PRD-F10/F11 have local human, source-operation and default-disabled machine controllers. Forward migrations 0029-0033 support the integrated implementation. The [approved rollout Change Record](cr-pathways-self-managed-rollout-scenarios.md) adds local finance, evaluation, report and publication handlers with additive forward migration 0034. Final source/runtime verification remains pending; hosted schema application and availability are deferred.

## 4. Data Integrity

- consistent UUID strategy;
- organization/project anchors;
- cross-org/project FK prevention where feasible;
- business dates as `date`;
- event instants timezone-aware;
- domain-specific numeric constraints;
- sensitive history uses RESTRICT/archive where appropriate.

## 5. API Principles

Exact endpoint paths come from current repository.

All touched endpoints:
- validate DTO/input;
- use bounded queries;
- derive actor/scope server-side;
- enforce authz;
- avoid mass assignment;
- avoid internal-secret error leakage;
- support idempotency where processing can repeat;
- expose aggregate-only contracts to aggregate-only roles.

## 6. Security

Protected request:

```text
token validation
→ system user
→ lifecycle
→ org
→ role/permissions
→ assignments
→ Beneficiary step-up on marked detail routes (signed TOTP `amr` within 15 minutes, or a live session-bound PIN grant)
→ scoped Prisma query
```

Beneficiary step-up follows the [Beneficiary step-up Change Record](cr-pathways-beneficiary-step-up.md) as amended by the [PIN fallback Change Record](cr-pathways-beneficiary-step-up-pin.md). `RequireBeneficiaryStepUp` handlers return 403 `STEP_UP_REQUIRED` when the TOTP factor is stale and no live PIN grant exists. The grant is read only after scope authorization, only for the server-derived user, organization and verified session, in a transaction that rechecks session liveness. `GET /auth/step-up/status` reports freshness, method and `pinState` (`NONE`, `SET`, `LOCKED`). It returns no business data or attempt counts.

PIN verify, setup, change and unlock (`POST /auth/step-up/pin`, `/pin/setup`, `/pin/change`, `/pin/unlock`) take the PIN only in the JSON body. They call the migration 0037 SECURITY DEFINER functions; the PIN tables have RLS on and no API-role grants. Setup and unlock need a fresh TOTP from verified signed claims. Change needs the current PIN or a fresh TOTP. Failures are counted under a row lock, 5 failures lock the PIN, a locked PIN is not compared, and only a TOTP newer than the lock unlocks it. Audit rows and logs never contain the PIN or its hash.

Never:
- authorize via email;
- trust user metadata for role;
- trust client scope;
- expose private Beneficiary data through public surfaces.

Client read caching follows step 2 of the [performance and scaling Change Record](cr-pathways-performance-scaling.md). The API still authorizes every request. Authorized reads default to `live` (stale time 0, no retained cache). A read opts in to `summary` (30 seconds stale and retained) only for lists and summaries. Resources starting with `beneficiar`, `step-up` or `import-batch` are always `live`, even when a caller asks for `summary`. Query keys contain the organization, user, roles, permissions, assignments, session owner generation, resource and project. Sign-out and workspace changes remove every other identity's entries. Any 401 or 403 starts one new denial epoch (the client announcement and the reader's own failure share one token): inactive entries are removed, and data read before the epoch is hidden from every mounted reader. Each mounted reader then re-verifies at most once per epoch and shows a pending state while it does; a key whose last result was a 401 or 403 is recorded and does not fetch by itself again, even after it remounts, until an explicit retry or a new identity; it shows an error with a retry. A committed write removes inactive entries and re-reads active ones, so a later mount never shows pre-write data. Reads are GET only and never signal a write. No read is retried automatically.

RLS supplements backend authorization. The approved revised [CSV auth contract](rfc-pathways-auth-rbac-isolation.md) controls atomic grants, role ceilings, supporting reads, hierarchy, and assignment scope. Migrations 0027/0028 revise restrictive checks and atomic aggregate entrypoint permissions while preserving the datamodel and existing business/lifecycle guards. API and frontend share the canonical ceiling; active database grants remain authoritative. Inspect policies, functions, ACLs, triggers, and assignment predicates separately from Prisma schema diffs. Preserve the single public ledger and exact archived bytes. Register the verified baseline on existing databases without executing its DDL; retain historical ledger rows.

PATHWAYS-dev 0020 retains the explicitly approved historical checksum exception; original applied SQL remains unavailable. The approved baseline registration and 0027/0028 corrections are verified with all 26 original ledger entries/checksums preserved (29 finished entries in total). 0015 differs only by CRLF representation. Financial, evaluation, reporting and publishing handlers are implemented in the current local source under the approved rollout Change Record; final verification is pending. Alert and recommendation controllers are implemented locally under the approved F10/F11 runtime CR. Hosted application and availability are deferred for both sets of features. Target beneficiaries remain active. The [approved project target-goal retirement](cr-pathways-retire-project-target-goal.md) preserves its nullable column and historical values while removing live inputs, outputs and comparisons. Local implementation and checks are verified; coordinated preview and release verification remain pending. Independent indicator targets and unavailable-metric semantics remain unchanged.

## 7. Runtime Sequences

### Import
private object -> batch -> raw rows -> mapping -> validation -> normalization -> audit

Per the [import throughput and PDF](cr-pathways-import-throughput-and-pdf.md) contract, normalization runs in chunks: a claim of at most 100 rows loads its batch and form context once, then promotes chunks of at most 25 rows, each one verified transaction bounded to 30 seconds with re-verified identity and assignment. A failed chunk reruns row by row on the single-row path. Staged rows insert in 1,000-row batches. Approved import types are CSV, XLSX, XLS and text-layer PDF, all parsed in the sandbox worker. `GET /metadata/projects/:projectId/forms/:formId/export?format=CSV|XLSX|XLS|PDF` exports a blank form definition under `forms.export` with project scope applied before the form query, renders through the shared report artifact helper outside the transaction, writes one `FORM_DEFINITION_EXPORTED` audit row and returns a `no-store`, `nosniff` attachment.

### Rule
trusted metrics -> structured rule -> snapshot -> alert -> predefined recommendation -> human outcome

### Private pending activity-proof inspection
The [approved inspection contract](cr-pathways-private-activity-proof-inspection.md) separates scoped advisory context from private transfer: initial human authorization -> bounded private object read outside transactions -> fresh live authorization and committed access audit -> safe attachment admission. It fixes pending/revision/pure-lineage guards, ten-second storage and thirty-second request bounds, 10 MiB size/digest verification and no cache/inline/public URL. Generic old downloads are withdrawn with the reviewed route/UI. Implementation and executable deadline/privacy checks remain pending.

### Activity proof direct upload (reduced scope)
The [approved change record](cr-pathways-activity-progress-media.md) is implemented on its feature branch with a developer-authorized scope reduction, section 9. Only Submit proof changes: reserve (JSON, one activity update plus one to ten evidence rows, `storage_ready = false`) -> direct signed upload to `pathways-private` per file, outside the API request body -> per-file finalize (stored size, leading-byte signature and streamed SHA-256 against the declaration, `EVIDENCE_MAX_FILE_BYTES`) -> the existing `ACTIVITY_PROOF_FINALIZE` commit once every file is verified. Accepted types are PDF, JPEG, PNG, WebP, MP4, MOV and WebM. Activity-update evidence is typed `PHOTO`, `VIDEO` or `DOCUMENT` from the verified content type (migration `0041_activity_media_evidence`, widening `evidence_media_activity_update_check`); `PROGRESS_PROOF` and `COMPLETION_PROOF` stay valid on existing rows. The inspection bounds in the section above scale to ten proofs and `EVIDENCE_MAX_FILE_BYTES` for this path. Deferred, not built on this branch: files on Record progress, a combined Update-progress dialog, and upload progress bars. Record progress is unchanged.

## 8. Infrastructure

Current feature work does not implement:
- SSO;
- AWS hosting;
- deployment architecture beyond the separately authorized Vercel API/web release documented in OPS.

Existing CI/Docker behavior must be inspected rather than inferred.

## 9. Non-Functional Requirements

Security, privacy, integrity, auditability, recovery, bounded performance, accessibility, deterministic monitoring, safe imports, explainability.

## 10. AI Boundary

No runtime AI/ML product feature is currently approved.

## Self-Check

- [x] no AI overclaim
- [x] server-side authz explicit
- [x] metadata/rule flows explicit
- [x] table names reconciled with Prisma (2026-09-26)
- [ ] API endpoint inventory reconciled before Locked

## Revised Authorization Boundaries (PRD-F1/F2/F3/F4/F5/F6/F8)

All roles view scoped projects, with separate tab guards and selections. Admin activity context excludes detail and assignment identities. Blank-form management is separate from assessment access; Admin processing reads only its own imported submissions/values. Journey events and participation require beneficiary access; Admin configuration receives a scoped event-existence boolean. PO analytics/SADDD differs from monitoring/descriptive grants. Evaluation-weight writes change only weights/timestamp and retain lifecycle guards. Escalation permissions define viewing/raising; missing handlers remain deferred.

## Project workspace reads (PRD-F2/F7/F8)

- `GET /projects/:projectId/activities` (`activities.read`) returns a lean list projection: id, project, code, title, description, stored and presented status, dates, assignee ids and names, indicator and journey-stage ids, target beneficiaries, progress and `updatedAt`. Update history, proof metadata, assignee emails, budget and reach metrics come only from `GET /projects/:projectId/activities/:activityId`. There, `budgetLogged` is the APPROVED expense total recorded against the activity budget records and `budgetLoggedEntries` its entry count, returned only under `expenses.read` (the grant of the expense endpoint and the expense SELECT policy); both are `null` otherwise, never 0. List items stay plain objects so server-computed per-item fields can be added.
- Activity `update`, `transition` and `recordProgress` resolve project scope once per transaction and read the written activity back by organization, verified project and id in the same transaction.
- `GET /projects/:projectId/overview-metrics` (`projects.read`, project scope before any read) returns `project.overview-metrics.v1`. A section is `null` when the viewer lacks its source permission; a `MISSING` metric means the source has no data yet. Neither is reported as zero.
  - KPI achievement (`indicators.read` and `monitoring.read`), developer-approved 2026-09-28: mean of each reported indicator's baseline-to-target progress, rounded once to one decimal place, half away from zero. Indicators without an actual value are counted but excluded from the mean. When no indicator is reported the tile shows "None yet". This is the approved methodology that DSD section 4 requires for a project-level percentage.
  - Budget utilization (`budgets.read` and `expenses.read`): approved expense total over the planned project profile budget, in exact cents, rounded the same way and not clamped.
  - Beneficiaries reached (`beneficiaries.aggregates.read` and `analytics.saddd.read`): the distinct-individual total of the Locked [SADDD release](rfc-pathways-saddd-privacy.md), with counts 1-4 suppressed. Before the fixed project period closes it reports `RELEASED_AFTER_PROJECT_CLOSE`. No Beneficiary rows are read. The developer confirmed this SADDD-release-only behavior on 2026-09-28; no live aggregate or migration is planned.
  - Timeline: elapsed share of the inclusive project dates on the business date, clamped to 0-100.

## Core P1 supporting interfaces

The [core P1 supporting operations](cr-pathways-core-p1-supporting-operations.md) contract defines GET /beneficiaries/projects/:projectId/registration-context under beneficiaries.records.register and POST /imports/projects/:projectId/batches/:batchId/automatic-mapping under imports.upload for the current scoped uploader. Exact output allowlists, bounded definition discovery, revision-bound retries, locked definitions and millisecond transaction attribution are specified there. Supporting SQL remains an uninstalled forward proposal; preserved broad policies are not claimed to become universally narrow. Applied/archive migration history and the single Prisma ledger remain intact.
