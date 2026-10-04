# Handoff: extensions and escalations (plan 2)

Paused 2026-10-04 23:55 (UTC+8) to move work to a cloud session.

## Where things are
- Branch: `feature/session-sprint-20261004`, plan commit `78331349`.
- Plan: `docs/superpowers/plans/2026-10-04-extensions-and-escalations.md` (Tasks 1-8).
- Status: Task 1 in progress, Tasks 2-8 not started. The WIP checkpoint commit holds all Task 1 changes.

## Task 1 state (migration 0061)
- Done: migration `0061_activity_extension_requests`, runtime SQL suite `activity-extension-requests-runtime.sql` (passed, 12 assertions), Prisma model, inventories (hosted-plan, hosted-build, legacy-retirement test, Verify-Forward, Replay-Local table count 60).
- Open: `Replay-Local.ps1 -MigrationBaseline -SaveTemplate` reported a later current-schema API suite failing after the new suite passed; root cause not found yet.
- Remove before finishing Task 1: two temporary `TMPDIAG` diagnostics in `apps/api/src/modules/indicators/indicators.service.ts` (`monitoringSqlError`) and `infra/supabase/phase6/Replay-Local.ps1` (restore the `throw "Current-schema suite $currentSuite failed."`).
- Then: schema drift accept via `Test-SchemaDrift.ps1 -Accept` after review, run the plan's verify steps, commit.

## Rulings carried from the SDD ledger
- R1: API `listEscalatedAlerts` defaults `limit` (same default as `listAlerts`) when absent, since the SQL requires 1-100.
- R2: Task 1 CHECK-violation assertions may set `app.user_id` to the acting verifier or decider so RLS passes and the CHECK is what fails; otherwise assert via the owner role in a rolled-back block.
- R3: drop the unused `rows_found` from the 0062 DECLARE.

## Constraints
- Do not push `dev` or `master`; merge to dev only after QA and the user's go-ahead.
- Hosted apply (Task 8) needs the user; no credentials in the repo or chat.
