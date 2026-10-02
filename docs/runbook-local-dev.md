# Runbook: Local Development

## Principles

- use repository package manager/scripts;
- copy environment templates rather than committing secrets;
- never point destructive commands at production;
- use local/disposable DBs for migration experiments;
- use synthetic test identities/data.

## Session Start

1. Read `docs/index.md`.
2. Read `AGENTS.md`.
3. Read the relevant registered PRD/SDD/RFC/DSD/QAD documents for the task.
4. Load the developer-supplied disposable task/phase context.
5. Inspect current branch/status.
6. Confirm environment target.
7. Run repository-defined install/build/test/validate commands.

Exact commands must be filled from the current repo; do not invent them here.

## Environment Safety

Never print full secret-bearing URLs.

Separate:
- runtime DB credentials;
- migration credentials;
- local shadow DB;
- restore-test DB.

## Local Supabase Stack

Use this for synthetic manual testing. It never touches PATHWAYS-dev or production. Docker must be running.

1. `pnpm db:local:start` starts the local Supabase containers (`supabase/config.toml`).
2. `pnpm db:local:reset` recreates the local database, replays the Prisma ledger (baseline as administrator, later migrations as `prisma`, reusing the phase 6 preprovision SQL) and runs the synthetic seed. It acts only on the fixed local container `supabase_db_pathways`, which must publish port 54322, and connects only through 127.0.0.1. Supabase publishes that port on all interfaces with well-known local passwords, so keep only synthetic data in it and leave the host firewall enabled.
3. `pnpm dev:local` builds and runs the API and web against the local stack. Local values are passed only to the child processes, so ignored `.env` files are neither used nor changed. Stop any other server on ports 3000 and 4000 first. `--api-only` with `PATHWAYS_LOCAL_API_PORT` runs only the API on another port.
4. Sign in at `http://127.0.0.1:3000/staff/login` in a private window. New passwords are written only to the ignored `.tmp/local-seed/`. Each account enrolls TOTP on first sign-in. Local email appears in Mailpit at `http://127.0.0.1:54324`.
5. `pnpm db:local:stop` stops the containers.

The reset seed writes one organization, program and project and one account per role (plus a second Project Officer), and no Beneficiary, activity or indicator data. The API accepts plain HTTP Supabase only on a loopback host outside production.

### Presentation workspace

`pnpm db:local:demo` fills the reset database with a fictional Plan International Pilipinas style workspace for demonstrations. Run it after `pnpm db:local:reset` and before `pnpm dev:local`. It is idempotent, refuses any target that is not the loopback local stack (loopback hosts, the fixed local database port, never production), and writes through the application services and the runtime database role, so validation, row level security and audit recording apply. Programs, milestones and assessment results have no application write path yet and are written on the owner connection. For the length of the run only, the two dedicated rule-machine roles get a random login password held in the script process (never printed or stored), so the same worker the API uses can evaluate the seeded rules into alerts; both roles return to no-login afterwards.

It creates six projects across Eastern Samar, Northern Samar and Masbate (ongoing, past its end date, near completion, completed, a small pilot cohort), their activities in every lifecycle and review state, indicators with several readings, 155 registered participants aged 5 to 70 with journey history, forms and submissions, import history, budgets and expenses with receipts, rules with evaluated alerts and recorded decisions, published public tracker entries, generated reports and F9 survey and timeline data. Content lives in `apps/api/prisma/local-demo-data.ts`; the stages are the `local-demo-stage-*.ts` files beside it.

Live import files for the presentation are in `apps/api/prisma/demo-fixtures/`:

| File | Use |
|---|---|
| `beneficiary-registration-borongan.csv` and `.xlsx` | Collection, Import, project "Safe Schools for Girls", open the published registration form, upload; every column maps automatically (25 valid rows) |
| `household-profile-followup.csv` | Same project, open the published "Household Profile Update" form, upload; every column maps automatically (12 valid rows) |
| `livelihood-followup-structure.csv` | Collection, Import then extend, upload; the columns become fields of a new draft form to extend in the builder |

Passwords for the seeded accounts are written only to the ignored `.tmp/local-seed/`.

## Fast Runtime SQL Runs

For development speed only. Save the replayed cluster once per migration change with `./infra/supabase/phase6/Replay-Local.ps1 -MigrationBaseline -SaveTemplate` (writes `.tmp/pathways-replay-template/` with a migrations hash). Then run any runtime SQL file with `./infra/supabase/phase6/Invoke-RuntimeSql.ps1 -File apps/api/prisma/tests/<file>.sql`. Each run copies the template to a disposable loopback cluster on a free port and deletes it afterwards. The runner refuses a stale template after any migration change. The template drops the replay recovery clone databases so it stays small; `finance-expense-runtime.sql` measured 3.6 s end to end. `project-indicator-dashboard-runtime.sql` is replay-only: it fails at line 46 ("Source proof unavailable") under the runner and also reads the replay-set psql variable `PHASE4_INDICATOR_POLICY`. The full `Replay-Local.ps1 -MigrationBaseline` stays the merge gate.

## End of Session

- tests;
- diff review;
- update durable registered docs only when an approved contract or verified repository fact changes;
- keep disposable task status outside the repository;
- chat phase report;
- hard stop.

## End-to-end tests

1. Stop anything on ports 3000 and 4000, then run `pnpm db:local:start`, `pnpm db:local:reset` and `pnpm db:local:demo`.
2. Start the apps with `pnpm dev:local`, never `pnpm dev`: `pnpm dev` reads the hosted values in `apps/api/.env`, so real sign-in fails with 401 or 503 and the sign-in page never reaches `/auth/mfa`.
3. Run `npx playwright test --config playwright.config.ts` (66 tests, serial, about 6 minutes) and `npx playwright test --config playwright.auth-navigation.config.ts` (27 tests).
4. The real sign-in specs reset the `@pathways.example` seed passwords and TOTP factors on every run, and their rows accumulate until the next `pnpm db:local:reset`.
