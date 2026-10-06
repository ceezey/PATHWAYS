# Change Record: Defense Seed Snapshot Restore

**ID:** `cr-pathways-defense-seed-snapshot`  
**Date:** 2026-10-06  
**Status:** Approved (developer, 2026-10-06)

## 1. Trigger

The hosted devV2 reseed (`runbook-defense-demo.md` section 4) drives every service over the network for a long time and pauses twice for manual rules drains. Developer decision 2026-10-06 (`docs/superpowers/specs/2026-10-06-defense-seed-snapshot-design.md`): seed locally through the real services once and restore that data onto devV2.

## 2. Current Contract

`handoff-defense-demo-seed.md` forbids disabling triggers. The hosted reseed is the wipe file plus `defense-demo.mjs` against devV2; nothing copies data between databases.

## 3. Proposed Change

- `scripts/db/defense-snapshot.mjs` with `mirror`, `dump`, `restore` and `storage`, helpers in `scripts/db/defense-snapshot-*.mjs`, node built-ins only; `psql` and `pg_dump` run inside the local container `supabase_db_pathways`. Hosted URLs reach it by environment variable; the hosted password is passed only as `PGPASSWORD`, never on argv.
- `mirror` reads the devV2 organization and `system_users` (minus contact number and last sign-in) with role codes over `DIRECT_URL` into `.tmp/defense-identities.json`, runs the wipe locally and replaces the local organization, staff rows and auth users with those ids. No passwords or TOTP secrets are read. The generated SQL refuses to run unless it arrives over the local Unix socket.
- `dump` takes a data-only `pg_dump` of exactly the tables `hosted-defense-demo-wipe.sql` truncates, plus a manifest: seed day (Manila day of the first seeded audit row), latest migration, row counts, date and timestamp columns, and storage objects under the organization prefix.
- `restore` runs one transaction on devV2 as `postgres` (`HOSTED_ADMIN_URL`, since `prisma` cannot set `session_replication_role`). The generated SQL begins with `\set ON_ERROR_STOP on`, validates every COPY column list and refuses kept tables. Sequence: the wipe file up to its revoke, a migration check, an identity check, `SET LOCAL session_replication_role = replica`, each table copied into a temporary staging table, shifted there by (Manila restore day minus seed day) and inserted, a row-count check against the manifest, the wipe's revoke and COMMIT.
- Storage objects are upserted to the same bucket and path with the service role key, media type parameters dropped, before any hosted database connection (paths are new seed UUIDs under the organization prefix, so an early upload cannot break current data). The restore first checks that `SUPABASE_SERVICE_ROLE_KEY` is present, the local storage API is reachable and source and target differ; `--skip-storage` skips these checks and the copy. The `storage` command reruns the copy alone (uploads are upserts), and a failed copy prints a paste-ready rerun command.
- Before the irreversible run the tool prints a summary and refuses a nonzero date delta or any warning unless `--allow-shift` is passed; `--dry-run` runs the same SQL ending in ROLLBACK and skips storage. psql exit 3 prints that the restore rolled back, exit 2 prints a connection-lost hint. `mirror` fails fast when the local and devV2 latest migrations differ, and the pooler URL must use session port 5432.
- Flags with a missing value throw instead of being ignored.
- Deviation from the approved design: RLS is bypassed, never disabled. `postgres` has BYPASSRLS and, inside the wipe file's owner-membership window, INHERIT memberships giving it owner privileges on `prisma`, `report_projection_owner` and `rules_store_owner` tables. This reverses the handoff rule "never disable triggers" for the restore step only: triggers are skipped only inside this transaction, and the local seed keeps every trigger.

## 4. Impact

### Product
None at runtime; the restored rows are what the services produced locally.

### Data / Migration
No migration. Kept tables (organization, roles, permissions, role permissions, staff, step-up PINs, sign-in lockouts, rules catalogs) and `storage.objects` are never dumped or truncated. Known limits:

- Dates inside jsonb are not shifted (`form_response_values.value`, `project_publications.snapshot`, rules snapshot `canonical_payload` and digest), while rules `as_of` and `reporting_date` columns do shift.
- The identity check does not compare role codes.
- Release rows frozen by the local `--verify` are carried into the snapshot.
- Alerts restore as captured; the hourly sweep may re-evaluate them.
- Old hosted storage objects are left in place, as with the wipe.
- A date delta above 0 is untested end to end with `--verify`; the supported defense path is a same-Manila-day mirror, seed, dump and restore.

### Authorization / Privacy
The restore URL must be `postgres` on the devV2 session pooler host (`postgres.klbtoqdalmcsfjqophty`, `*.pooler.supabase.com:5432`). The identities file holds staff emails and names and stays under `.tmp/`; the tool prints counts only.

### API
None.

### UI
None.

### Tests
`scripts/db/defense-snapshot-parse.test.mjs`, `-dates`, `-target`, `-sql`, `-storage` and `-cli` suites (`node --test`), the shared parser in `defense-demo-wipe.test.mjs`. Local rehearsal passed on 2026-10-06 (fixture identities, `--test-local`): seed and `--verify` clean (23 true rows), dump of 77 tables (8323 rows) and 75 storage objects, restore at +3 days shifted all 7 baseline date rows exactly 3 days, a tampered identities file rolled back with the data unchanged, delta-0 restore and `--verify` clean; the storage copy is skipped under `--test-local` (source equals target) and stays hosted-only.

### Documentation
`runbook-defense-demo.md` section 8, `handoff-defense-demo-seed.md` constraints, `index.md`, `activity-log.md`.

## 5. Alternatives Considered

- Keep only the hosted service reseed (restraint option): correct but slow, with manual drains; it stays as the fallback (runbook section 4).
- Bulk SQL inserts: bypass the services that make the data realistic.
- Shift dates in place: three unique indexes contain dates (daily attendance, measurement periods, survey period releases), so rows can collide mid-statement, and a two-step offset breaks the `2100-12-31` period CHECK. Staging tables avoid both.
- `ALTER TABLE ... DISABLE TRIGGER` or `DISABLE ROW LEVEL SECURITY`: an aborted run could leave tables unprotected.

## 6. Migration / Rollback

Any error before COMMIT rolls back the whole database restore. After a bad commit, restore again from a good snapshot or fall back to runbook section 4. A failed storage copy is retried with the `storage` command.

## 7. Verification

- `node --test scripts/db/defense-snapshot-*.test.mjs scripts/db/defense-demo-wipe.test.mjs`
- Local rehearsal: passed (see Tests).
- Hosted (developer): `node scripts/db/defense-demo.mjs --env-file .tmp/defense-seed.env --verify` with no failures.

## 8. Approval

Developer, 2026-10-06 (spec approved).

## 9. Disposition

Implemented and merged (origin/dev cf51de1e). Local rehearsal passed. Hosted restore done 2026-10-06 on devV2 at 0063 with PR #43 numbers: dry run rolled back clean, storage copy needed one rerun after a transient 504 (75 objects), database restore committed (77 tables, 12600 rows, delta 0), and `--verify` passed 23 of 23.
