# Change Record: Rules Hosted Scheduler

**ID:** `cr-pathways-rules-hosted-scheduler`

**Date:** 2026-10-04

**Status:** Approved; code complete pending, hosted activation pending human credentials

**Approval:** Developer reply on 2026-10-04 choosing to implement G-F10-7 with the other blocked F10/F11 gates.

## 1. Decision and Scope

This record closes the scheduler exclusion in §1 of [cr-pathways-f10-f11-runtime-authority](cr-pathways-f10-f11-runtime-authority.md) for G-F10-7. A GitHub Actions workflow calls the existing machine routes on the Vercel-hosted API: drain every 5 minutes and sweep hourly. The machine boundary is unchanged: exact POST, empty body, separate 64-hex drain and sweep bearer tokens.

Vercel Cron is not used because it sends GET with one shared secret.

## 2. Components

- `.github/workflows/rules-dispatch.yml` runs only when repository variable `RULES_DISPATCH_ENABLED` is `true`, uses environment `rules-hosted`, and asserts the exact `{"state":"ACKNOWLEDGED"}` response.
- The worker and sweeper database URLs accept the Supabase session-pooler username `role.<projectref>` in addition to the bare role name.
- `infra/supabase/phase6/hosted-rules-machine-login.sql` sets worker and sweeper passwords from interactive prompts and lifts their connection limit; nothing is stored.

## 3. Human-only steps

Credentials are created and stored by a person, never by an agent. The runbook in [ops-pathways](ops-pathways.md) lists the order: apply migrations, run the login script, set GitHub secrets and Vercel variables with the worker disabled, confirm a 403, enable, confirm a 200 and record hourly progress evidence in QAD-T68.

## 4. Gate status

G-F10-7 stays Partly met until the hosted evidence is recorded. GitHub may delay scheduled runs and disables them after 60 days without repository activity.
