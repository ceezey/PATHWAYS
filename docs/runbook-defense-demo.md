# Runbook: Defense Demo Reseed (PATHWAYS-devV2)

**Status:** Working
**Date:** 2026-10-04
**Owner:** PATHWAYS capstone team

Rebuilds the devV2 domain data for the 2026-10-06 tool defense while keeping every auth user, `system_users` row and TOTP factor. Agents never run the hosted steps or handle hosted secrets; the developer runs them.

## 1. What it produces

- Six projects dated relative to the Manila run day: EHK closed (ended 45 days ago), SSG, CRL, ALS and WSH ongoing, ECD planned (starts in 21 days).
- Activities in every state: completed on time, completed late with an overdue explanation, for review (M&E queue), returned with a reason (officer queue), overdue (one explained), not started, cancelled. No open activity ends within two days of the run.
- Journey stages mapped to activities (SSG, ALS, CRL, WSH, EHK; SSG and ALS branch after a webinar into entrepreneurship or technology tracks), attendance recorded through each activity's published form for every enrollment according to its status (active, completed, dropped), pre and post tests tied to attendance, follow-up flags and journey notes. Seeded proof photos are AI-generated, non-identifiable illustrative photos (C2PA-labelled, no real people) and the attendance sheets list the attendees.
- Budget utilization from 0% (ECD) to 105% (WSH), and expenses in every review state with live queues for verify, approve and sign-off.
- Every indicator type, library entries, a derived Activity completion % indicator, correction chains, a closed WSH survey period, two training surveys (one suppressed under 5), a signed-off EHK evaluation on the six OECD-DAC criteria (overall 87.55).
- Rules with HIGH, MEDIUM and CRITICAL alerts, decisions (accept, partially accept, decline, resolve, escalate), one auto-resolved alert, public tracker publications and reports.

Service audit timestamps (submitted, reviewed, approved) are immutable by design and read as the run day; run the reseed late on 2026-10-05 so they read as yesterday.

## 2. Files

| File | Purpose |
|---|---|
| `infra/supabase/phase6/hosted-defense-demo-wipe-dry-run.sql` | Row counts per table, then ROLLBACK |
| `infra/supabase/phase6/hosted-defense-demo-wipe.sql` | One-transaction TRUNCATE of domain data; keeps org, roles, permissions, users, step-up PINs, lockouts and rules catalogs |
| `scripts/db/defense-demo.mjs` | Launcher for `apps/api/prisma/defense-demo-seed.ts` |
| `apps/api/prisma/defense-demo-verify.ts` | Read-only checks run by `--verify` |
| `scripts/db/defense-snapshot.mjs` | Snapshot mirror, dump, restore and storage copy (section 8) |

## 3. Env file (hosted)

Create `.tmp/defense-seed.env` (never commit; the launcher refuses files inside the repo outside `.tmp/`):

- `SUPABASE_URL=https://klbtoqdalmcsfjqophty.supabase.co`
- `SUPABASE_SERVICE_ROLE_KEY`
- `DATABASE_URL` as `pathways_runtime` and `DIRECT_URL` as `prisma` (direct host or session pooler user `<role>.klbtoqdalmcsfjqophty`)
- For the snapshot restore only (section 8): `HOSTED_ADMIN_URL` as `postgres`. Use the session pooler URL for it (user `postgres.klbtoqdalmcsfjqophty`, host `*.pooler.supabase.com:5432`) and for `DIRECT_URL`: the tool connects from the Docker container, and the direct db host is IPv6-only, which Docker often cannot route
- Optional `RULES_WORKER_DATABASE_URL` and `RULES_SWEEPER_DATABASE_URL` to drain rules in-process; without them the seed waits for the hosted scheduler
- Optional `DEMO_STAFF_<KEY>_EMAIL` overrides (`ADMIN`, `PROGRAM_MANAGER`, `GRANT_MANAGER`, `PROJECT_MANAGER`, `ME`, `LIZA`, `EMMANUEL`); by default staff resolve by the known devV2 emails, then by role

## 4. Hosted run (late 2026-10-05, Manila)

Preview and Production share devV2, so the wipe affects both.

1. Set GitHub variable `RULES_DISPATCH_ENABLED=false`. Optionally take a `pg_dump` backup.
2. SQL editor as `postgres`: run the dry-run file and check the KEEP counts (7 system users, 312 role permissions).
3. SQL editor: run the wipe file. The editor shows only the last statement, so re-run the dry-run to confirm WIPE rows are 0.
4. Set `RULES_DISPATCH_ENABLED=true` if the scheduler is active (section 5).
5. `node scripts/db/defense-demo.mjs --env-file .tmp/defense-seed.env`. When it pauses for a drain, run `gh workflow run rules-dispatch.yml -f purpose=drain`, wait for success, press Enter. It pauses twice (alerts, then auto-resolve). On any failed stage, rerun the same command; stages skip finished rows and retry transient 503s.
6. `node scripts/db/defense-demo.mjs --env-file .tmp/defense-seed.env --verify` must show no failures.
7. Sign in once per role with TOTP. Do not open the Program Manager survey or SADDD views before step 6 passes: the first read freezes those releases.

## 5. Rules scheduler activation (once)

Follow `docs/ops-pathways.md` section "Rules scheduler activation": run `infra/supabase/phase6/hosted-rules-machine-login.sql` with psql, store the drain and sweep tokens in GitHub environment `rules-hosted` and Vercel `pathways-api`, confirm 403 while disabled, enable and confirm `{"state":"ACKNOWLEDGED"}`. This costs two `pathways-api` redeploys and records G-F10-7 evidence (QAD-T68).

## 6. Local rehearsal

1. `pnpm db:local:reset`
2. `docker exec -i supabase_db_pathways psql -v ON_ERROR_STOP=1 -q -U postgres -d postgres < infra/supabase/phase6/hosted-defense-demo-wipe.sql`
3. `pnpm db:defense:local`, then `node scripts/db/defense-demo.mjs --test-local --verify`

## 7. Known limits

- The analytics coverage map stays empty (projects store no coordinates).
- Rules metric BUDGET_UTILIZATION_PERCENT still divides by every budget row; the budget alert sits on CRL, an envelope-only project, so every screen agrees there (`docs/deferred-features.md`).
- Report CSV generation may fail on hosted (bucket allows only text/csv); demo PDF preview and generation.
- The hourly sweep may reopen a resolved alert on demo day; this is expected rule behaviour.

## 8. Snapshot restore (fast path)

Seeds locally through the real services once, then restores that data onto devV2 in one transaction with triggers skipped (`cr-pathways-defense-seed-snapshot`). It replaces steps 2 to 5 of section 4; step 7 still applies. Needs Docker with the local stack at the same migration as devV2.

1. `pnpm db:local:reset`
2. `node scripts/db/defense-snapshot.mjs mirror --env-file .tmp/defense-seed.env`: copies the devV2 organization, staff rows and auth user ids into the local stack and writes `.tmp/defense-identities.json`. Local sign-in for these accounts stays off until the next reset.
3. `pnpm db:defense:local`, then `node scripts/db/defense-demo.mjs --test-local --verify` with no failures.
4. `node scripts/db/defense-snapshot.mjs dump`: writes `.tmp/defense-snapshot/data.sql` and `manifest.json`.
5. Run the hosted wipe dry-run (section 4 step 2) and check its KEEP counts. Set GitHub variable `RULES_DISPATCH_ENABLED=false` and keep it false during the restore. No backup is needed: recovery is section 4 (rerun the wipe and the seed).
6. `node scripts/db/defense-snapshot.mjs restore --env-file .tmp/defense-seed.env --dry-run` first: same SQL, ends in ROLLBACK, skips storage, prints "Dry run rolled back; devV2 unchanged." The tool prints a summary (seed and restore day, delta, migration, tables and rows, storage objects, identities) and refuses a nonzero delta or any warning unless `--allow-shift` is passed.
7. `node scripts/db/defense-snapshot.mjs restore --env-file .tmp/defense-seed.env`: storage preconditions are checked first (service role key present, local storage API reachable, source differs from target; `--skip-storage` skips them), then the storage copy runs before any hosted database connection (new seed paths, so an early upload cannot break current data), then wipe, migration and identity checks, load with triggers skipped, date shift by (Manila restore day minus seed day), row-count check and commit. Any database error rolls everything back (the tool prints "Restore rolled back; devV2 unchanged."). If the storage copy fails, nothing in the database changed: run the printed rerun command, which is the same command with `storage` instead of `restore`, then restore again.
8. `node scripts/db/defense-demo.mjs --env-file .tmp/defense-seed.env --verify` with no failures, then set GitHub variable `RULES_DISPATCH_ENABLED=true` if the scheduler is active (section 4 step 4), then section 4 step 7.
9. `pnpm db:local:reset` to get the normal local accounts back.

Restore later in the clock day than the dump, or shifted timestamps from the last seed hours land after now (the tool warns). Seed and restore in the same month, since the import backdate is month-relative.

Known limits of the snapshot:

- Dates inside jsonb are not shifted (`form_response_values.value`, `project_publications.snapshot`, rules snapshot `canonical_payload` and digest), while rules `as_of` and `reporting_date` columns do shift.
- The identity check does not compare role codes.
- Release rows frozen by the local `--verify` are carried into the snapshot.
- Old hosted storage objects are left in place.
- A date delta above 0 is untested end to end with `--verify`; the supported defense path is a same-Manila-day mirror, seed, dump and restore.
- Alerts restore as captured; the hourly sweep may re-evaluate them.

Local rehearsal without hosted access: build an identities fixture with new ids from the local stack, then `mirror --identities <fixture>`, seed, `dump --identities <fixture>`, run the wipe and `restore --test-local --identities <fixture>`; `--today` (local only) simulates a later restore day.
