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

The seed writes one organization, program and project and one account per role, and no Beneficiary, activity or indicator data. The API accepts plain HTTP Supabase only on a loopback host outside production.

## End of Session

- tests;
- diff review;
- update durable registered docs only when an approved contract or verified repository fact changes;
- keep disposable task status outside the repository;
- chat phase report;
- hard stop.
