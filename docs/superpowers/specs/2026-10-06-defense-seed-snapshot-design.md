# Defense Seed Snapshot Restore Design

**Date:** 2026-10-06
**Status:** Approved (developer, 2026-10-06)
**CR:** `docs/cr-pathways-defense-seed-snapshot.md` (to be written with the implementation)

## Goal

Cut the hosted devV2 reseed from a long service-driven run with manual rules drains to a few minutes, by seeding locally through the real services once and restoring that data onto devV2 with triggers skipped.

## Decisions

- Snapshot restore, not bulk inserts: the local seed still runs every service path, so the data stays something the app can produce.
- Identities are mirrored: local staff and organization rows take the devV2 IDs before seeding, so the dump restores without rewriting any column.
- Dates shift on restore by (restore day - seed day), so one snapshot is reusable on any day.
- Triggers are skipped with `SET LOCAL session_replication_role = replica`; RLS is bypassed (owner or BYPASSRLS role), never disabled with `ALTER TABLE`, so an aborted restore leaves no table unprotected.
- This reverses the handoff rule "never disable triggers" for the restore step only; the local seed itself still runs with triggers on.

## Flow

1. `node scripts/db/defense-snapshot.mjs mirror --env-file .tmp/defense-seed.env`: reads the devV2 organization, `system_users` (id, auth_user_id, email, role, status) and role IDs over `DIRECT_URL` into `.tmp/defense-identities.json`, then writes matching rows into the local stack (`auth.users` and `pathways.system_users`; local only). No passwords or TOTP secrets are read.
2. Local seed and verify as today: `pnpm db:defense:local`, then `node scripts/db/defense-demo.mjs --test-local --verify`.
3. `defense-snapshot.mjs dump`: data-only `pg_dump` via `docker exec supabase_db_pathways`, limited to the tables truncated by `infra/supabase/phase6/hosted-defense-demo-wipe.sql` (table list parsed from that file), plus a manifest recording the seed day and storage object list, written to `.tmp/defense-snapshot/`.
4. `defense-snapshot.mjs restore --env-file .tmp/defense-seed.env`: one transaction on devV2: `SET LOCAL session_replication_role = replica`, the wipe TRUNCATE, the data load, the date shift, a row-count postcondition against the manifest, COMMIT. Any error rolls back the whole restore.
5. Date shift: generated `UPDATE` per table adding the day delta to every `date`, `timestamp` and `timestamptz` column, skipping generated columns and kept tables.
6. Storage: each object in the manifest is downloaded from local storage and uploaded to the same bucket and path on devV2 with the service role key (upsert). `storage.objects` is never dumped.
7. `node scripts/db/defense-demo.mjs --env-file .tmp/defense-seed.env --verify` must pass.

## Safety

- The launcher reuses `assertSeedTarget` and env-file rules (`.tmp/` or outside the repo only); restore refuses any host other than the devV2 project ref.
- Restore aborts if the devV2 identity IDs no longer match `.tmp/defense-identities.json`.
- Kept tables (org, roles, permissions, users, step-up PINs, lockouts, rules catalogs) are never in the dump or the TRUNCATE.
- `RULES_DISPATCH_ENABLED=false` during restore, as in the current runbook.

## Known limits

- Dates inside JSON payloads (audit details, report snapshots, rule evaluation payloads) are not shifted.
- Alerts restore as captured; the hosted sweep may re-evaluate them afterwards.
- If `postgres` lacks privileges or BYPASSRLS on owner-held tables, restore switches role per owner group (prisma, report_projection_owner, rules_store_owner); the local rehearsal confirms which.

## Testing

- Unit tests for table-list parsing, date-shift SQL generation and target guards.
- Local rehearsal: dump from the local stack, restore into a second local database (or the same stack after wipe) with a non-zero day delta, then `--verify` passes.

## Docs

`docs/runbook-defense-demo.md` (new section for snapshot restore), `docs/handoff-defense-demo-seed.md` constraint update, new CR, `docs/activity-log.md`.
