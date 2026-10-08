# Change Record: activity-overdue-explanation

**ID:** `cr-pathways-activity-overdue-explanation`
**Date:** 2026-09-29
**Status:** Approved; backend implemented (migration 0043; verified 2026-10-08); web phase deferred

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
scope.

**Correction (2026-09-29, same day, before release):** the first implementation reused
`requireActiveAssignment`, the *personal activity* assignment check `activities.progress.update` and
`activities.proof.submit` use (`ProjectActivityAssignment`, i.e. a specific officer assigned to this
one activity). M&E officers are normally assigned to the *project* as a whole
(`ProjectAssignment`/`assignedProjectIds`), not to individual activities, so that check would have
locked out most M&E officers. The endpoint and `canExplainOverdue` now rely on the project-scope rule
`requireActivity` already applies (`projectScope(actor)` inside `requireProject`), which is the exact
rule migration `0043`'s RLS INSERT policy already encoded via
`pathways.p05_has_project_permission('monitoring.review', project_id)`
(`apps/api/prisma/migrations/0000_pathways_baseline_through_0026/migration.sql`): `SYSTEM_ADMINISTRATOR`
is org-wide; `PROGRAM_MANAGER` also qualifies via a managed program; every other role holding
`monitoring.review` (`GRANT_MANAGER`, `MONITORING_AND_EVALUATION_OFFICER`, `PROJECT_MANAGER`) needs an
active project assignment. No migration change was needed: the database layer was already correct: only
the application-layer service method and the `canExplainOverdue` capability reused the wrong helper.

## 3. Proposed Change

1. `POST /projects/:projectId/activities/:activityId/overdue-explanations`, guarded by
   `RequirePermission('monitoring.review')`, scoped to the actor's active *project* assignment (the
   same `projectScope(actor)` rule `requireActivity` already applies for every project-scoped M&E
   read; see the Correction note in section 2), not a personal per-activity assignment. Body:
   `category` (`WEATHER | SECURITY | FUNDING | COMMUNITY | LOGISTICS | OTHER`), `explanation` (10-2000
   trimmed characters), `clientMutationId` (UUID).
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
4. Capabilities gain `canExplainOverdue` (holds `monitoring.review`; project scope is already
   guaranteed because every row reaching `activityCapabilities` was read through
   `projectScope(actor)`), following the existing `canRecordProgress`/`canSubmitProof` pattern but
   without their extra personal-assignment condition (see the Correction note in section 2).
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
New use of the existing `monitoring.review` permission, gated by the actor's project scope
(`projectScope(actor)`, the same rule `requireActivity` already applies and migration 0043's RLS
INSERT policy already encodes via `p05_has_project_permission`), not a personal per-activity
assignment. No Beneficiary data is touched. Cross-project and cross-organization requests are denied
before any row is read, following the existing `requireProjectActivity` convention (uniform 404, the
same as every other project-scoped read/write in this module).

### API
See section 3 item 1. `overdueExplanations` and `overdueExplanationNeeded` are added to the existing
activity-detail response (`mapActivity`); `canExplainOverdue` is added to `activityCapabilities`.

### UI
Added in this same change (activity detail panel and activities list,
`apps/web/src/features/projects/activity-detail-panel.tsx`,
`apps/web/src/features/projects/project-activities-workspace.tsx`,
`apps/web/src/features/projects/activity-explain-delay-dialog.tsx`): an "Overdue: explanation needed"
badge in both the list and the detail; an "Explain delay" button (gated by
`capabilities.canExplainOverdue` and the activity's overdue status) opening a dialog with a category
select (friendly labels), a 10-2000 character explanation textarea with a live count, Enter-does-not-
submit, a reused `clientMutationId` across a retry, and 409/403 messages shown as text; an "Overdue
explanations" history section (newest first, "None yet" only once the activity has been overdue with
no entries); strict web-client parsers for the new fields (`apps/web/src/lib/services/pathways-client.ts`).

### Tests
API (`apps/api/src/modules/activities/activity-overdue-explanation.test.ts`,
`activity-capabilities.test.ts`): happy path; `409` when the activity is not overdue; invalid category;
invalid explanation length (`<10` or `>2000`); idempotent replay (same id, same body, same row); `409`
on a conflicting replay; `403` without `monitoring.review`; a project-assigned M&E officer with no
personal activity assignment succeeds; an unassigned M&E officer gets the uniform project-scope 404
(not 403 - see the Correction note in section 2); `SYSTEM_ADMINISTRATOR`/`PROGRAM_MANAGER`/
`GRANT_MANAGER` scope matches the RBAC policy; cross-project and cross-organization denial (existing
convention); and `overdueExplanationNeeded` true before, false immediately after recording.
`apps/api/prisma/tests/activity-overdue-explanation-runtime.sql`: scope isolation, append-only (no
`UPDATE`/`DELETE` grant), the category/length `CHECK` constraints, and idempotency at the database
layer. Web (`activity-detail-panel.test.tsx`, `project-activities-workspace.test.tsx`,
`activity-explain-delay-dialog.test.tsx`, `pathways-client.project-data.test.ts`): badge show/hide;
button capability gating; dialog validation (too short, too long, missing category); Enter does not
submit; retry reuses the `clientMutationId`, a definitive rejection draws a fresh one; history
renders newest first; the parser rejects a malformed `overdueExplanations` entry.

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

Applied on `feature/activity-overdue-explanation`: backend, the project-assignment correction, the web
UI phase, and this Change Record. Migration `0043` creates the table locally; hosted application
follows the standard release sequence and is not claimed here.
