# Change Record: Beneficiary progress read

**ID:** `cr-pathways-beneficiary-progress-read`
**Date:** 2026-10-06
**Status:** Proposed

## 1. Problem

`GET /beneficiaries/projects/:id?limit=50` returns 503 after 12-24 s on hosted for every role that holds
`journeys.read` and is not aggregate-only (M&E Officer, Project Officer), so the Beneficiaries page shows
"Beneficiary records unavailable". `loadProgress` ran one query with four LATERAL subqueries per enrollment as
`pathways_runtime`. Participations and journey events carry a RESTRICTIVE `p09_select` policy that calls
`p05_has_project_permission` twice per row (not wrapped in a SELECT), plus the permissive rules-function policies, so the
per-row permission work multiplied inside the laterals. Earlier local checks ran as `postgres`, which bypasses RLS.
Measured locally as `pathways_runtime` with RLS on, project of 150 enrollments and 1200 participations: 2.4-10.4 s.

## 2. Change

- Migration `0067_beneficiary_progress_read` adds `pathways.p05_beneficiary_progress(wanted_org uuid, wanted_project uuid,
  wanted_enrollments uuid[])`: owned by `prisma`, plpgsql, STABLE, SECURITY DEFINER, empty search_path, EXECUTE revoked from
  PUBLIC, anon, authenticated and service_role and granted only to `pathways_runtime`.
- Scope is checked once: the organization argument must equal the session organization, the actor must hold
  `journeys.read` and `beneficiaries.records.read` on the project, and more than 1000 ids are refused. Denial raises 42501.
  The activity title join keeps its old gate (`activities.read` or `participation.record`), evaluated once.
- Only enrollments of that organization and project are read, so foreign, cross-organization and unknown ids are ignored.
- It returns the columns of the old query (`enrollment_id`, `activity_id`, `activity_title`, `participation_date`,
  `stage_code`, `stage_name`, `reached`, `at_terminal`, `path_length`) with the same semantics, set-based, so
  `progressPercent` and the API response are unchanged. The `canReadProgress` gate and the aggregate-only `restricted` path are untouched.
- No table, policy, role or grant changes. The migration asserts that the source tables are prisma-owned and unforced, and
  checks owner, security-definer, search_path and ACL afterwards.
- Tests: `apps/api/prisma/tests/beneficiary-progress-read-runtime.sql` (22 assertions, including old-versus-new equality on
  every fixture row as `pathways_runtime`) wired into `Replay-Local.ps1`; `FORWARD_0067_BENEFICIARY_PROGRESS_INVENTORY` in
  `Verify-Forward.ps1`; 0067 registered in `hosted-plan.mjs` and its tests.

## 3. Rollback

`DROP FUNCTION pathways.p05_beneficiary_progress(uuid, uuid, uuid[])` and restore the previous `loadProgress` query. No data changes.

## 4. Apply

On devV2 after SAD review: `node scripts/db/hosted-build.mjs --env-file .tmp/role-staging-build.env --resume`

## 5. Disposition

- Local, as `pathways_runtime` with RLS on (150 enrollments): old query 2.4-10.4 s (varies with cache), new function 20-24 ms.
- SAD review and replay result: pending.
