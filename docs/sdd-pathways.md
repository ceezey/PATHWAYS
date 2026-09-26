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

Source: `apps/api/prisma/schema.prisma` (datasource `schemas = ["public", "pathways"]`; domain tables in `pathways`), migrations `0001_init` through `0026_csv_rbac_realignment` (0026 pending PATHWAYS-dev application), including `0005_supabase_security_adapter` and the runtime-grant migrations. Table names below are the `@@map` names, verified 2026-09-26.

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

Enums are mapped in the same schema (for example `rule_metric`, `rule_operator`, `decision_status`). Tables for PRD-F10 to PRD-F13 exist in the schema but have no API controllers yet (see `index.md` backend status).

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
→ scoped Prisma query
```

Never:
- authorize via email;
- trust user metadata for role;
- trust client scope;
- expose private Beneficiary data through public surfaces.

RLS supplements backend authorization. The approved [CSV auth contract](rfc-pathways-auth-rbac-isolation.md) controls atomic grants, role ceilings, supporting reads, hierarchy, and assignment scope. Migration 0026 adds restrictive checks while preserving the datamodel and existing business/lifecycle guards. API and frontend share the canonical ceiling; active database grants remain authoritative. Inspect policies, functions, ACLs, triggers, and assignment predicates separately from Prisma schema diffs. Preserve the single public ledger and all historical files.

PATHWAYS-dev 0020 checksum drift blocks remote correction pending the original applied SQL. 0015 differs only by CRLF representation. Missing financial/evaluation/reporting/alert/publishing handlers remain deferred. Target beneficiaries and project target goal are retained.

## 7. Runtime Sequences

### Import
private object -> batch -> raw rows -> mapping -> validation -> normalization -> audit

### Rule
trusted metrics -> structured rule -> snapshot -> alert -> predefined recommendation -> human outcome

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
