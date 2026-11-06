---
name: run-pathways
description: Use when asked to run, start, launch or bring up PATHWAYS locally, or when /run is invoked in the PATHWAYS repo, including to check a UI change in the running app.
---

# Run PATHWAYS locally

## Overview

Running PATHWAYS means starting the local stack and handing it to the developer. The developer checks the app by hand; you record what they report. Your job ends when both servers answer.

## Steps

1. **Docker.** `docker info`. If it fails, start `C:\Program Files\Docker\Docker\Docker Desktop.exe` and poll `docker info` until it answers.
2. **Supabase.** If `docker ps --filter name=supabase_db_pathways -q` is empty, run `pnpm db:local:start`. It restores the existing database.
3. **Already up?** If `http://127.0.0.1:4000/api/health` and `http://127.0.0.1:3000/staff/login` both return 200, skip to step 5.
4. **Apps.** Run `pnpm dev:local` from the repo root in the background, then poll both URLs until they return 200.
5. **Hand over.** Tell the developer:
   - Web: `http://127.0.0.1:3000/staff/login`; credentials are in `.tmp/local-seed/` (do not open or quote them)
   - Mailpit: `http://127.0.0.1:54324`; Studio: `http://127.0.0.1:54323`
   - What to look at, in one or two lines, from the current diff
   - Stop with `pnpm db:local:stop`
6. **Record.** When the developer reports results, add them to the vault `01_Projects/PATHWAYS/Logs/activity-log.md`, naming what they checked.

## Never

| Action | Why |
|---|---|
| Playwright, browser drivers, screenshots, signing in | The developer checks by hand |
| Importing `apps/web/e2e/fixtures/real-sign-in.ts` or running e2e specs | `loadActors` replaces the seed account's password and deletes its authenticator |
| Changing any auth user, password or MFA factor | Locks the developer out of a seed account |
| `pnpm db:local:reset`, `db:local:seed`, `db:local:demo` | Discards local data; only when the developer asks or no containers exist |
| `pnpm dev` | Reads hosted values in `apps/api/.env`; sign-in fails |
| Printing `supabase status` output, keys or connection URLs | Secrets |

## Red flags: stop and hand over instead

- "I'll just screenshot it to confirm the change"
- "I need to sign in to reach the page"
- "The e2e fixture already handles TOTP"
- "A quick reset gives clean data"

If a step fails, report the error and stop.
