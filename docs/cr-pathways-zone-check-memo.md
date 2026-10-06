# Change Record: Zone check memo

**ID:** `cr-pathways-zone-check-memo`
**Date:** 2026-10-06
**Status:** Approved (developer, 2026-10-06: remember per request, migration 0065)

## 1. Problem

The analytics, indicator and dashboard reads set `statement_timeout` to 3000 ms and fail with
57014 on devV2. The time goes into the timezone check
`NOT EXISTS (SELECT FROM pg_catalog.pg_timezone_names WHERE name = zone)`: `pg_timezone_names`
reads the whole zone directory on every call, measured at 0.43 s per call on devV2. The indicator
list calls `p06_indicator_value` once per indicator, and each call reaches `p06_assert_scope`
(sometimes more than once), so five indicators already exceed 3 s.

## 2. Change

- Migration `0065_zone_check_memo` adds `pathways.p06_zone_is_valid(text)`: false for NULL or more
  than 100 characters; true when the transaction-local setting `pathways_zone.valid` equals the
  zone; otherwise the existing list check, and a zone that passes is stored in the setting. An
  invalid zone is never cached. The helper is owned by `prisma`, plpgsql, STABLE, invoker, empty
  search_path, with EXECUTE revoked from PUBLIC and no grant to the runtime or Data API roles (the
  callers are SECURITY DEFINER).
- `p06_assert_scope` and `p06_home_dashboard` are recreated from their replayed 0064 definitions
  with only the predicate changed to `OR NOT pathways.p06_zone_is_valid(zone)`. Owner, SECURITY
  DEFINER, search_path and ACL are unchanged, asserted in the migration against the saved ACLs.
- Residual: a session that forges `pathways_zone.valid` can only skip the list check for a zone
  that `AT TIME ZONE` must still accept, so a forged invalid zone still fails with 22023 later.
- Tests: `apps/api/prisma/tests/zone-check-memo-runtime.sql`, wired into `Replay-Local.ps1`;
  0065 is registered in `Verify-Forward.ps1`, `hosted-plan.mjs` and its tests.

## 3. Rollback

`CREATE OR REPLACE` the two functions with the 0028 bodies (the `pg_timezone_names` predicate),
then `DROP FUNCTION pathways.p06_zone_is_valid(text)`. No data changes.

## 4. Apply

On devV2, together with 0064:
`node scripts/db/hosted-build.mjs --env-file .tmp/role-staging-build.env --resume`
