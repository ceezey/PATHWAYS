# Change Record: activity-overdue-explanation

**ID:** `cr-pathways-activity-overdue-explanation`
**Date:** 2026-09-29
**Status:** Approved

## 1. Trigger

An activity is presented as "Overdue" (`activityPresentationStatus` in
`apps/api/src/modules/activities/activities.service.ts`) whenever it has a `plannedEndDate` earlier
than the business date and its status is neither `COMPLETED` nor `CANCELLED`, but nothing today
records why. The developer decided on 2026-09-29 that the Monitoring and Evaluation officer (or any
role holding `monitoring.review`) should be able to record a reason category plus a written
explanation once an activity is overdue. This is a prompt, not a block: the activity remains fully
usable whether or not an explanation has been recorded. The history is append-only, with the actor
and time.

## 2. Current Contract

**Canonical overdue definition.** Two independent implementations already agree, checked by
inspection:

- `activityPresentationStatus(status, plannedEndDate, businessDate)`
  (`apps/api/src/modules/activities/activities.service.ts:219`): `overdue` is true when
  `plannedEndDate` is set, `calendarDate(plannedEndDate) < businessDate`, and `status` is not
  `COMPLETED` or `CANCELLED`. This is the single function already used by both the activity list
  (`mapActivityListItem`) and the activity detail (`mapActivity`), so list and detail can never
  diverge from each other.
- `activityObservation` in `apps/api/src/modules/rules/rule-metrics.ts` (`ACTIVITY_OVERDUE_COUNT`/
  `ACTIVITY_OVERDUE_DAYS`): the population excludes archived and `CANCELLED` activities; for a
  `COMPLETED` activity the delay is forced to `0`; otherwise the delay is
  `max(0, calendarDays(plannedEndDate, reportingDate))`, and "overdue" is `delay > 0`. This is the
  same predicate (excludes `COMPLETED`/`CANCELLED`, compares `plannedEndDate` against the current
  business/reporting date) expressed against a bulk population rather than one row's stored
  `Date`/`string` values.

Both implementations already encode the identical business rule (same exclusions, same date
comparison direction) and are verified equivalent for every reachable status value. This change does
not merge them into one function: `rule-metrics.ts` operates over a plain-object population supplied
by the rule engine's evaluation snapshot (see `docs/rfc-pathways-rules-engine.md`) and has no access
to a live Prisma row or business-date service, while `activityPresentationStatus` is the
row-and-request-scoped helper already reused everywhere else in the activities module. Restraint
(section 6 of the build guide): introducing a shared cross-module helper here would mean threading a
new dependency through the rule engine's already-narrow, tested input contract for no behavior
change, so the new endpoint below reuses `activityPresentationStatus` (the existing helper) rather
than writing a third implementation, and this CR records the verified equivalence so the two never
silently drift apart.

**Permission.** `monitoring.review` (`apps/api/src/modules/auth/rbac-contract.json` row 97, "Assess
KPI / Budget / Timeline") is held by `SYSTEM_ADMINISTRATOR`, `MONITORING_AND_EVALUATION_OFFICER`,
`PROJECT_MANAGER`, `PROGRAM_MANAGER` and `GRANT_MANAGER`
(`apps/api/src/modules/auth/authorization-policy.ts`). No `activities.review` permission exists.
`monitoring.review` is declared in the contract but not yet enforced by any controller; this CR is
its first concrete use. Its disposition note ("Scoped action grant; detail and supporting operations
remain separately authorized") means the endpoint below must still enforce its own project/activity
scope, exactly as `activities.progress.update` does via `requireActiveAssignment` in
`activities.service.ts`.

## 3. Proposed Change

1. `POST /projects/:projectId/activities/:activityId/overdue-explanations`, guarded by
   `RequirePermission('monitoring.review')`, additionally requiring an active personal
   `ProjectActivityAssignment` on the activity (mirroring `recordProgress`'s
   `requireActiveAssignment` check). Body: `category` (`WEATHER | SECURITY | FUNDING | COMMUNITY |
   LOGISTICS | OTHER`), `explanation` (10-2000 trimmed characters), `clientMutationId` (UUID).
   Returns `409` if the activity is not currently overdue (`activityPresentationStatus(...).overdue`
   is false). An idempotent replay (same `clientMutationId`) returns the same row; a replay with a
   different category/explanation for the same id is a `409` conflict, matching the
   `recordProgress`/`reserveProof` idempotency convention.
2. New append-only table `pathways.activity_overdue_explanations`
   (migration `0043_activity_overdue_explanation`), scoped like the sibling `activity_updates`
   table, with `SELECT`/`INSERT` RLS policies only (no `UPDATE`/`DELETE` grant).
3. Activity detail gains `overdueExplanations` (newest first, with `actorName` and `recordedAt`) and
   `overdueExplanationNeeded: true` when the activity is currently overdue and no explanation has
   been recorded on or after the date it became overdue (i.e. after its `plannedEndDate`).
4. Capabilities gain `canExplainOverdue` (holds `monitoring.review` and has an active personal
   activity assignment), following the existing `canRecordProgress`/`canSubmitProof` pattern.
5. An `ACTIVITY_OVERDUE_EXPLANATION_RECORDED` audit row, following the existing
   `ACTIVITY_PROGRESS_RECORDED` pattern.

## 4. Impact

### Product
M&E (or a Project Manager/Program Manager/Grant Manager) records a reason category and a written
explanation once an activity is overdue. It is advisory: the activity is not blocked from any other
transition, and nothing about `activityPresentationStatus`'s overdue computation changes.

### Data / Migration
Migration `0043_activity_overdue_explanation` creates `pathways.activity_overdue_explanations` with
`id, organization_id, project_id, activity_id, category, explanation, recorded_by_id, recorded_at,
client_mutation_id`; a `CHECK` on `category`; a `CHECK` on `char_length(btrim(explanation)) BETWEEN
10 AND 2000`; `UNIQUE (organization_id, client_mutation_id)`; composite FKs
`(organization_id, project_id, activity_id) -> project_activities(organization_id, project_id, id)`,
`(organization_id, project_id) -> projects(organization_id, id)`, `(organization_id) ->
organizations(id)`, and `(organization_id, recorded_by_id) -> system_users(organization_id, id)`,
mirroring `activity_updates`. RLS is enabled and forced; the `SELECT`/`INSERT` policies mirror
`activity_updates`' scoping but read `current_setting('app.organization_id'/'app.user_id')` and call
only the prisma-owned `pathways.p05_has_project_permission`, never the postgres-owned
`runtime_context_organization`/`runtime_context_user` wrappers the baseline `activity_updates`
policies use. Only `SELECT, INSERT` are granted to `pathways_runtime`; no `UPDATE`/`DELETE` grant is
issued, so the history is append-only at the database layer, not only by convention. Postconditions
assert ownership, constraints, RLS enabled+forced, exactly two policies, the exact grant set, and
`has_function_privilege` for `p05_has_project_permission` on both `prisma` and `pathways_runtime`.

### Authorization / Privacy
New use of the existing `monitoring.review` permission, additionally gated by an active personal
activity assignment (mirroring `activities.progress.update`). No Beneficiary data is touched. Cross-
project and cross-organization requests are denied before any row is read, following the existing
`requireProjectActivity` convention.

### API
See section 3 item 1. `overdueExplanations` and `overdueExplanationNeeded` are added to the existing
activity-detail response (`mapActivity`); `canExplainOverdue` is added to `activityCapabilities`.

### UI
Deferred to a later phase; not touched by this change (backend/CR phase only).

### Tests
Happy path; `409` when the activity is not overdue; invalid category; invalid explanation length
(`<10` or `>2000`); idempotent replay (same id, same body, same row); `409` on a conflicting replay;
`403` without `monitoring.review`; `403` when the caller holds `monitoring.review` but has no active
assignment on the activity; cross-project and cross-organization denial (existing convention); and
`overdueExplanationNeeded` true before, false immediately after recording.
`apps/api/prisma/tests/activity-overdue-explanation-runtime.sql`: scope isolation, append-only (no
`UPDATE`/`DELETE` grant), the category/length `CHECK` constraints, and idempotency at the database
layer.

### Documentation
This CR, its `docs/index.md` entry, an SDD note, QAD rows, and the Auth RFC endpoint list.

## 5. Alternatives Considered

Reusing `activities.progress.update` instead of `monitoring.review` was rejected: recording an
overdue explanation is an oversight/review action, not progress reporting, and `monitoring.review`
already exists for exactly this kind of "Assess KPI / Budget / Timeline" action per the RBAC
contract's row 97. Adding a new `activities.review` permission was rejected per the brief: no such
permission exists, and `monitoring.review` already semantically fits without RBAC-contract
surgery (restraint ladder step 2/3). Merging the two overdue-date computations into one shared
TypeScript helper across the activities and rules modules was rejected (see section 2): they operate
on different input shapes for different subsystems, are already verified equivalent, and forcing a
shared abstraction across module boundaries for no behavior change would be complexity for its own
sake.

## 6. Migration / Rollback

Forward-only, additive: `CREATE TABLE ... CHECK (...)`, following the `0036`-`0042`
migration-identity, advisory-lock and postcondition conventions. Rollback is a later forward
migration dropping the table; no existing data or function is altered by `0043`.

## 7. Verification

- `pnpm -r typecheck`, `pnpm exec biome check apps packages`, `pnpm --filter @pathways/api test`,
  `pnpm docs:check`, `pnpm sad:check --base 947841f --head HEAD`.
- The listed new test cases pass locally against the updated schema (no hosted database is touched
  by this change).

## 8. Approval

Developer decision, 2026-09-29: when an activity is overdue, the M&E officer records a reason
category plus a written explanation (`WEATHER`, `SECURITY`, `FUNDING`, `COMMUNITY`, `LOGISTICS` or
`OTHER`, explanation 10-2000 characters). It is a prompt, not a block. The history is append-only,
with the actor and time.

## 9. Disposition

Applied on `feature/activity-overdue-explanation` (backend and Change Record phase only). Migration
`0043` creates the table locally; hosted application follows the standard release sequence and is
not claimed here. The web UI phase is explicitly deferred to a later, separate phase.
