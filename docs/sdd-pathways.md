# System Design Document (SDD)

**Status:** Working. Reconcile with current repository before locking.

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

### Identity / Organization
organizations, roles, permissions, role_permissions, system_users, audit_logs

### Project
programs, projects, user_project_assignments, project_activities, project_activity_assignments, project_milestones, project_indicators

### Collection / Metadata
digital_forms, form_fields, data_import_batches, data_import_rows, metadata_mappings, form_submissions, form_response_values

### Beneficiary
beneficiaries, beneficiary_project_enrollments, journey_stages, activity_journey_stage_mappings, beneficiary_activity_participations, beneficiary_journey_events

### Monitoring / Supporting
budget records/expenses, assessments/evaluations, alert rules/conditions/recommendations, alerts, decision recommendations, evidence media, reports

Exact current table/model names must be reconciled with Prisma before this section is Locked.

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

RLS may supplement but not replace backend authz.

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
- [ ] reconcile current repo before Locked
