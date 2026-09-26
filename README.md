# PATHWAYS

**PATHWAYS** is a metadata-driven project information management platform with deterministic rule-based decision-support features for humanitarian and development organizations.

It centralizes project, activity, Beneficiary, indicator, monitoring, and reporting information; structures data preparation through metadata; supports descriptive dashboards and SADDD; and provides explainable rule-based alerts plus predefined recommendation prompts for human review.

## Current Direction

- PostgreSQL / Supabase development path
- Prisma data/migration layer
- Supabase Auth and Storage
- six canonical roles including Grant Manager
- core feature development first
- `Backend-DB` for development; `origin/master` for deployment
- Vercel API/web release authorized; SSO and AWS hosting postponed
- no user-facing prototype/mock/presentation-only product framing
- no AI/autonomous humanitarian decisions

Do not infer feature completion from documentation alone. The current repository and executed tests are the implementation authority.

## AI-Assisted Development Workflow

PATHWAYS adopts a curated documentation-first workflow based on the supplied ArkiLaunch repository.

Start substantial work in this order:

1. [`docs/index.md`](docs/index.md): manifest, statuses, traceability, Change Log, and Health Check.
2. [`AGENTS.md`](AGENTS.md): AI/agent build rules and guardrails.
3. Relevant Locked/Working PRD / SDD / RFC / DSD / QAD documents for the task.
4. Current repository code, migrations, tests, and configuration.
5. Implement only the explicitly authorized task/phase.
6. Update durable documentation only when an approved contract or verified repository fact changes.
7. Report the phase result in chat.
8. Stop before the next phase unless explicitly authorized.

Task TODOs, temporary source-of-truth notes, phase prompts, and phase-report templates are **disposable workflow context** and are not stored in the repository.

The documentation workflow is maintained in-repository. No external documentation engine is required.

## Core MVP

1. Role-Based Access Control and Workspace Management
2. Project Profile and Activity Tracking
3. Centralized Beneficiary Profile
4. Beneficiary Journey Tracking
5. Digital Data Collection and Preparation
6. Metadata-Driven Data Integration
7. Project Indicator and Monitoring
8. Aggregated Monitoring Dashboard with SADDD Analysis

Supporting features:

- descriptive analytics;
- rule-based alerts;
- predefined human-reviewed recommendations;
- reporting/data visualization;
- controlled public project tracker.

## Security Model

Protected request path:

```text
Supabase Auth identity
→ linked PATHWAYS system user
→ active account state
→ organization
→ canonical role
→ permissions
→ project assignment where required
→ scoped backend query
```

Frontend visibility is not authorization.

Program Manager and Grant Manager are aggregate-only for Beneficiary information.

## Documentation

The full documentation manifest is [`docs/index.md`](docs/index.md).

High-use documents:

| Document | Purpose |
|---|---|
| `docs/index.md` | manifest, statuses, traceability, Change Log, Health Check |
| `BRAND.md` | materialized PATHWAYS brand/product identity |
| `DESIGN.md` | materialized PATHWAYS UI/design-system reference |
| `docs/prd-pathways.md` | product requirements / stable feature IDs |
| `docs/sdd-pathways.md` | architecture / security / data direction |
| `docs/qad-pathways.md` | QA, abuse, privacy, acceptance |
| `docs/dsd-pathways.md` | UI/design governance |
| `docs/build-pathways.md` | canonical build/agent guide |
| `docs/ops-pathways.md` | operational/recovery guidance |
| `docs/rfc-pathways-rule-alerts-decision-support.md` | dynamic rule/decision-support design |

Root `AGENTS.md` is materialized from `docs/build-pathways.md`.

Root `BRAND.md` and `DESIGN.md` are materialized from canonical `docs/dsd-pathways.md`. Regenerate them with `pnpm docs:materialize` and validate the suite with `pnpm docs:check`; never hand-edit materialized files.

Disposable phase/task workflow artifacts are intentionally kept out of the repository.

## Development Restraint

Prefer the smallest implementation that satisfies approved requirements without weakening:

- security;
- privacy;
- data integrity;
- validation;
- auditability;
- migration safety;
- recovery;
- accessibility;
- testability.

## Scope Note

The Vercel API/web release was authorized on 2026-09-26 (see `docs/ops-pathways.md`, including its open items). SSO and AWS hosting are not current feature-work acceptance criteria and require a future explicit authorization.
