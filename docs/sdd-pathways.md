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

RLS supplements backend authorization. The approved revised [CSV auth contract](rfc-pathways-auth-rbac-isolation.md) controls atomic grants, role ceilings, supporting reads, hierarchy, and assignment scope. Migrations 0027/0028 revise restrictive checks and atomic aggregate entrypoint permissions while preserving the datamodel and existing business/lifecycle guards. API and frontend share the canonical ceiling; active database grants remain authoritative. Inspect policies, functions, ACLs, triggers, and assignment predicates separately from Prisma schema diffs. Preserve the single public ledger and exact archived bytes. Register the verified baseline on existing databases without executing its DDL; retain historical ledger rows.

PATHWAYS-dev 0020 retains the explicitly approved historical checksum exception; original applied SQL remains unavailable. The approved baseline registration and 0027/0028 corrections are verified with all 26 original ledger entries/checksums preserved (29 finished entries in total). 0015 differs only by CRLF representation. Financial, evaluation, reporting and publishing handlers are implemented in the current local source under the approved rollout Change Record; final verification is pending. Alert and recommendation controllers are implemented locally under the approved F10/F11 runtime CR. Hosted application and availability are deferred for both sets of features. Target beneficiaries remain active. The [approved project target-goal retirement](cr-pathways-retire-project-target-goal.md) preserves its nullable column and historical values while removing live inputs, outputs and comparisons. Local implementation and checks are verified; coordinated preview and release verification remain pending. Independent indicator targets and unavailable-metric semantics remain unchanged.

## 7. Runtime Sequences

### Import
private object -> batch -> raw rows -> mapping -> validation -> normalization -> audit

### Rule
trusted metrics -> structured rule -> snapshot -> alert -> predefined recommendation -> human outcome

### Private pending activity-proof inspection
The [approved inspection contract](cr-pathways-private-activity-proof-inspection.md) separates scoped advisory context from private transfer: initial human authorization -> bounded private object read outside transactions -> fresh live authorization and committed access audit -> safe attachment admission. It fixes pending/revision/pure-lineage guards, ten-second storage and thirty-second request bounds, 10 MiB size/digest verification and no cache/inline/public URL. Generic old downloads are withdrawn with the reviewed route/UI. Implementation and executable deadline/privacy checks remain pending.

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

## Core P1 supporting interfaces

The [core P1 supporting operations](cr-pathways-core-p1-supporting-operations.md) contract defines GET /beneficiaries/projects/:projectId/registration-context under beneficiaries.records.register and POST /imports/projects/:projectId/batches/:batchId/automatic-mapping under imports.upload for the current scoped uploader. Exact output allowlists, bounded definition discovery, revision-bound retries, locked definitions and millisecond transaction attribution are specified there. Supporting SQL remains an uninstalled forward proposal; preserved broad policies are not claimed to become universally narrow. Applied/archive migration history and the single Prisma ledger remain intact.
