# PATHWAYS Backend Completion - TODO

## Status

- [x] Phase 1 PASS: outstanding contracts reconciled, prioritized, and grouped into work packages.
- [x] Migration 0021 source, SHA-256, tests, disposable replay, managed read-only preflight, and recovery readiness verified.
- [x] Exact migration 0021 approval phrase prepared but not executed.
- [ ] Await explicit authorization for the next backend work package.

Current repository identity:

- Backend-DB: `23d0028d9814d691d6160b0b5e3d30aa0136ae3a`
- Integrated Frontend-UI/UX: `a0ea9cf98396dfd7cceddb8a1c4100aafd57abde`
- Migration 0021 SHA-256: `b2cc161a80f2989784bf5fd304b3a5b5657b1f481ade6af41c002b56f7d035e6`

## Phase 1 - Reconciliation and readiness

- [x] Read repository and frontend-backend integration controls.
- [x] Verify current branch, local/remote SHA, history, and worktree inventory.
- [x] Keep the developer manuscript PDF untracked and unstaged.
- [x] Review current web routes and truthful unavailable states.
- [x] Review API/shared contracts and authorization policy.
- [x] Review Prisma schema and migrations through 0021.
- [x] Reconcile UC001-UC026 manuscript requirements with current implementation.
- [x] Build the complete P0/P1/P2/Deferred priority matrix.
- [x] Separate implementation gaps from genuine policy decisions.
- [x] Record normalized schema implications and no-fabricated-backfill rules.
- [x] Define ordered, bounded backend work packages.
- [x] Pin migration 0021 exact source and checksum.
- [x] Confirm migrations 0001-0020 remain byte-identical to the approved backend base.
- [x] Run Prisma validation and focused API/shared/web role and indicator tests.
- [x] Replay all migrations through 0021 on disposable PostgreSQL with runtime-equivalent checks.
- [x] Diagnose the local PostgreSQL JIT mismatch and pass replay under the managed PATHWAYS-dev JIT setting without changing source or security/timeouts.
- [x] Run PATHWAYS-dev migration/RLS/role/assignment preflight in read-only transactions.
- [x] Verify adequate application-database backup and restore evidence for the exact 0021 rollout.
- [x] Confirm zero managed writes in Phase 1.
- [x] Confirm P07-W10 remains open/deferred and untouched.
- [x] Create backend-completion Source of Truth, TODO, and reference-only phase report template.

## Work Package A - Managed 0021 indicator rollout

- [ ] Obtain exact approval using the prepared phrase in Source of Truth.
- [ ] Reconfirm PATHWAYS-dev target, ledger through 0020, checksum, backup applicability, runtime role, RLS, and synthetic assignments.
- [ ] Apply only `0021_project_manager_indicator_access`.
- [ ] Verify ledger/checksum and exact PM/M&E/other-role runtime behavior.
- [ ] Confirm no unrelated permission/grant/RLS/Auth/Storage/data change.
- [ ] Update controls and stop.

## Work Package B - Finance ledger and approvals

- [ ] Implement project budget and expense API/service contracts against existing normalized models.
- [ ] Enforce submit, verify, approve, reject, and evidence state transitions and separation of actors.
- [ ] Preserve project/organization scope, RLS, audit, and current role ceilings.
- [ ] Wire existing latest frontend controls without visual or interaction redesign.
- [ ] Run finance, evidence, authorization, runtime, and UI integration tests.

## Work Package C - Collection closeout

- [ ] Implement scoped saved direct-entry draft listing.
- [ ] Implement deterministic form export in an approved format.
- [ ] Test privacy, scope, export fidelity, and frontend adapters.

## Work Package D - Project lifecycle

- [ ] Obtain decisions for project code, partners, sector, targets, initial budget, team replacement, and archive consequences.
- [ ] Design/review normalized schema additions; do not duplicate budgets or assignments.
- [ ] Implement complete create/edit/reassignment/archive contracts.
- [ ] Test history, audit, RLS, state transitions, and preserved frontend behavior.

## Work Package E - Beneficiary privacy and journey commands

- [ ] Obtain decisions for server step-up, expiry, duplicate handling, media, and participation transition provenance.
- [ ] Design/review normalized grant and duplicate-lineage schema as required.
- [ ] Implement sensitive operations without treating PIN `2468` as server authorization.
- [ ] Test step-up expiry, privacy, scope denial, immutable history, and UI flows.

## Work Package F - Evaluation workflow

- [ ] Implement criteria, evaluation, score, approval, and recommendation outcome APIs against existing models.
- [ ] Preserve submitter/approver separation and immutable history.
- [ ] Integrate finance evidence and indicator results.
- [ ] Run role/state/audit/runtime/UI tests.

## Work Package G - Rules, alerts, and recommendations

- [ ] Obtain notification/escalation decision.
- [ ] Implement in-app rule, alert, recommendation, and outcome lifecycle.
- [ ] Add an outbox/delivery model only if external delivery is authorized.
- [ ] Test rule evaluation, deduplication, scope, audit, and any approved delivery behavior.

## Work Package H - Analytics, reports, and exports

- [ ] Obtain layout, map privacy, suppression, format, retention, and snapshot decisions.
- [ ] Implement saved layouts/trends/maps under approved privacy rules.
- [ ] Implement report generation, history, survey aggregates, and real exports.
- [ ] Use provider Storage only with separate managed authorization.
- [ ] Test aggregates, suppression, artifact integrity, authorization, and frontend flows.

## Work Package I - Publication and public tracker

- [ ] Obtain publication actor, redaction, version, withdrawal, and asset-retention decisions.
- [ ] Design/review immutable public projection if required.
- [ ] Implement review/preview/publish/withdraw and public read contracts.
- [ ] Test role separation, private-field exclusion, versioning, withdrawal, and public routes.

## Work Package J - Administration and operations

- [ ] Split account provisioning, profile self-service, audit browse, labels, and backup/restore into separately authorized subpackages.
- [ ] Obtain provider identity/profile, audit visibility, label scope, and backup RPO/RTO decisions.
- [ ] Keep backup/restore outside normal application runtime grants.
- [ ] Test provider boundaries, least privilege, immutable audit, and recovery evidence.

## Permanent boundaries

- Do not redesign or rearrange the merged Frontend-UI/UX.
- Preserve login, redirects, retained OTP/MFA UI, Beneficiary PIN `2468`, and role ceilings.
- Do not use runtime fabricated domain data or fake mutation success.
- Do not broaden permissions to make a page render.
- Do not perform managed Database/Auth/Storage operations without exact explicit authorization.
- Do not touch or resume P07-W10 from this workstream.
- Do not begin a later work package without explicit authorization.
