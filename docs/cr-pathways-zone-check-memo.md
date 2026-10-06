# Change Record: Zone check memo

**ID:** `cr-pathways-zone-check-memo`
**Date:** 2026-10-06
**Status:** Applied (2026-10-06; 0065 on PATHWAYS-devV2 with 0064, 40-row ledger; master via PR #44)

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
- Residual: a session that forges `pathways_zone.valid` to a specific non-empty zone name skips the
  list check for exactly that name. The empty string (which a used placeholder returns in later
  transactions of a pooled session) is rejected explicitly.
- Tests: `apps/api/prisma/tests/zone-check-memo-runtime.sql`, wired into `Replay-Local.ps1`;
  0065 is registered in `Verify-Forward.ps1`, `hosted-plan.mjs` and its tests.

## 3. Rollback

`CREATE OR REPLACE` the two functions with the `pg_timezone_names` predicate: the `p06_assert_scope` body is the 0028 one and the
`p06_home_dashboard` body is the 0000 baseline one,
then `DROP FUNCTION pathways.p06_zone_is_valid(text)`. No data changes.

## 4. Apply

On devV2, together with 0064:
`node scripts/db/hosted-build.mjs --env-file .tmp/role-staging-build.env --resume`

## 5. Disposition

- SAD: organization-isolation-checker and design-qa-agent PASS; migration-integrity-guardian BLOCKED in round 1 (an empty zone was accepted on a reused session through the placeholder setting), fixed by rejecting `''`, then PASS at digest ed04c525.
- Replay: `Replay-Local.ps1 -MigrationBaseline` exit 0 with `ZONE_CHECK_MEMO_RUNTIME=PASS`.
- Applied to devV2 on 2026-10-06 at about 11:30 Manila with 0064 (ledger 40 rows 0000-0065, postconditions PASS). Measured before the fix: 0.43 s per `pg_timezone_names` call. Merged to master in PR #44.
