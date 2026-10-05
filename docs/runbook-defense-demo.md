# Runbook: Defense Demo Reseed (PATHWAYS-devV2)

**Status:** Working
**Date:** 2026-10-04
**Owner:** PATHWAYS capstone team

Rebuilds the devV2 domain data for the 2026-10-06 tool defense while keeping every auth user, `system_users` row and TOTP factor. Agents never run the hosted steps or handle hosted secrets; the developer runs them.

## 1. What it produces

- Six projects dated relative to the Manila run day: EHK closed (ended 45 days ago), SSG, CRL, ALS and WSH ongoing, ECD planned (starts in 21 days).
- Activities in every state: completed on time, completed late with an overdue explanation, for review (M&E queue), returned with a reason (officer queue), overdue (one explained), not started, cancelled. No open activity ends within two days of the run.
- Journey stages mapped to activities (SSG, ALS, CRL, WSH), attendance, follow-up flags and journey notes.
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

## 3. Env file (hosted)

Create `.tmp/defense-seed.env` (never commit; the launcher refuses files inside the repo outside `.tmp/`):

- `SUPABASE_URL=https://klbtoqdalmcsfjqophty.supabase.co`
- `SUPABASE_SERVICE_ROLE_KEY`
- `DATABASE_URL` as `pathways_runtime` and `DIRECT_URL` as `prisma` (direct host or session pooler user `<role>.klbtoqdalmcsfjqophty`)
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
