# Change Record: Rules Hosted Scheduler

**ID:** `cr-pathways-rules-hosted-scheduler`

**Date:** 2026-10-04

**Status:** Applied 2026-10-15; hosted scheduler and acknowledgement progress verified

**Approval:** Developer reply on 2026-10-04 choosing to implement G-F10-7 with the other blocked F10/F11 gates.

## 1. Decision and Scope

This record closes the scheduler exclusion in §1 of [cr-pathways-f10-f11-runtime-authority](cr-pathways-f10-f11-runtime-authority.md) for G-F10-7. A GitHub Actions workflow calls the existing machine routes on the Vercel-hosted API: drain every 5 minutes and sweep hourly. The machine boundary is unchanged: exact POST, empty body, separate 64-hex drain and sweep bearer tokens.

Vercel Cron is not used because it sends GET with one shared secret.

## 2. Components

- `.github/workflows/rules-dispatch.yml` runs only when repository variable `RULES_DISPATCH_ENABLED` is `true`, uses environment `rules-hosted`, and asserts the exact `{"state":"ACKNOWLEDGED"}` response.
- The worker and sweeper database URLs accept the Supabase session-pooler username `role.<projectref>` in addition to the bare role name.
- `infra/supabase/phase6/hosted-rules-machine-login.sql` sets worker and sweeper passwords from interactive prompts and lifts their connection limit; nothing is stored.

## 3. Human-only activation and recovery steps

Credentials are created and stored by a person, never by an agent. The runbook in [ops-pathways](ops-pathways.md) lists the setup and recovery order: apply migrations, run the login script, set GitHub secrets and Vercel variables with the worker disabled, confirm a 403, enable, confirm a 200 and record hourly progress evidence in QAD-T68.

## 4. Gate status

G-F10-7 is Met. On 2026-10-15, scheduled GitHub Actions run 38697916775 acknowledged `sweep` at 07:19 UTC and run 38719842309 acknowledged `drain` at 10:22 UTC. A read-only query against the active hosted database found 20 acknowledgements in the preceding 24 hours, including hourly work acknowledgements. GitHub may delay scheduled runs and disables them after 60 days without repository activity.
