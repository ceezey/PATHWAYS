# Change Record: Retire Project Target Goal

**ID:** `cr-pathways-retire-project-target-goal`

**Date:** 2026-09-26

**Status:** Approved; implementation and verification pending

**Approval:** Developer-approved Three-chat workflow, Chat A: remove target-goal inputs, displays and API requirements while retaining the database column and historical values.

## 1. Decision

Retire the project percentage benchmark from live project creation/editing, ordinary project responses and activity/indicator comparisons. Preserve the nullable `projects.target_goal` column, every historical value and existing audit records. Creation and ordinary updates omit the column; updates never clear or replace historical values. No migration or replay is required.

Target beneficiaries remain active. Indicator-specific baseline, target, direction, current measurement and progress remain independent of the retired project benchmark. Missing values and invalid denominators retain established unavailable states; no replacement percentage or invented zero is introduced. F10/F11 uses indicator-specific metrics; a private source receipt may fingerprint preserved historical storage solely to prove it was not changed.

## 2. Contract and Compatibility

Create/update DTOs omit `targetGoal`. The existing whitelist and `forbidNonWhitelisted` validation rejects legacy goal-carrying requests with 400; no alternate permissive endpoint is added. Project responses omit the field. Activity and project-indicator responses omit `projectGoalComparison`. The named ProjectIndicator schema becomes the strict MonitoringIndicator schema alias. Browser inputs, types, draft allowlists and displays follow that shape.

Rollout requires coordinated API/web preview verification. An old indicator response containing the withdrawn comparison fails the new strict schema; old goal-carrying clients cannot continue writes. No compatibility adapter is approved in this slice.

Human permissions, project/organization predicates, optimistic concurrency, transactions, audits and centralized error handling remain intact. Activity clients allowlist existing output fields instead of preserving arbitrary top-level response properties. This grants no new proof, Beneficiary or private-note access.

## 3. Verification and State

Required checks cover goal-free creation, unknown-field rejection, updates preserving non-null historical Decimal and null values, output/audit omission, old draft omission, unaffected target-beneficiary behavior, and independent indicator/unavailable calculations. Shared client/type changes require relevant API/web/shared tests and typechecks, documentation checks, and renewed digest-bound SAD reviews/sign-off.

This record approves implementation; it does not claim those checks have run or that previews have been verified. Applied status requires final evidence. No hosted database changes, deployment, scheduler provisioning, private proof inspection or release is authorized here.

## 4. Supersession and Traceability

This decision supersedes the live target-goal preservation requirements in the [CSV RBAC realignment](cr-pathways-csv-rbac-realignment.md) and [revised RBAC baseline](cr-pathways-revised-rbac-baseline.md) records. Their historical approvals and migration evidence remain unchanged.

Traceability: PRD-F2, PRD-F7, PRD-F10/F11; SDD project/monitoring contracts; QAD-R08; Locked auth RFC protected-request and project scope requirements. Target-beneficiary and independent indicator requirements are retained.
