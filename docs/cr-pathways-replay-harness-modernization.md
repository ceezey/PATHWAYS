# Change Record: replay-harness-modernization

**ID:** `cr-pathways-replay-harness-modernization`  
**Date:** 2026-10-01  
**Status:** Approved by developer 2026-10-01

## 1. Trigger

The local replay harness `infra/supabase/phase6/Replay-Local.ps1` fixed one port, so two replays could not run in parallel, and kept three switches that replay the pre-baseline 0021-0024 upgrade path. Every hosted target is now built from `0000_pathways_baseline_through_0026`, so no database traverses that path.

## 2. Current Contract

The script accepts `-Phase4IndicatorPolicy`, `-RuleBasedAccessAlignment`, `-DashboardHomeProjectScope`, `-ProjectActivityCreationRepair`, `-CsvRbacRealignment` and `-MigrationBaseline`. `-MigrationBaseline` implies the last two other switches, so every block they guard already runs under it.

## 3. Proposed Change

- Remove `-Phase4IndicatorPolicy`, `-RuleBasedAccessAlignment` and `-DashboardHomeProjectScope`, and every branch only they reach: the migration-count postflight replacements for 22, 23 and 24, and the `PHASE4_PM_INDICATOR_RUNTIME` marker.
- Keep `-ProjectActivityCreationRepair`, `-CsvRbacRealignment` and `-MigrationBaseline`, and the archived history with its integrity check (`scripts/migrations/history.py --extract`).
- Run the Phase 4 Project Manager indicator assertions in `project-indicator-dashboard-runtime.sql` on every replay instead of only under the removed switch. They passed on the current schema, so none were deleted.

## 4. Impact

### Product
None.
### Data / Migration
No migration file changes and no hosted database is touched.
### Authorization / Privacy
None. The replay uses synthetic data on 127.0.0.1 only.
### API
None.
### UI
None.
### Tests
- The marker list printed by `-MigrationBaseline` is unchanged (139 `=PASS` lines before and after).
- Coverage the removed modes no longer run, because the vitest block is skipped whenever any of `-Phase4IndicatorPolicy`, `-RuleBasedAccessAlignment`, `-DashboardHomeProjectScope` or `-ProjectActivityCreationRepair` is set:

| Suite | Phase4IndicatorPolicy | RuleBasedAccessAlignment | DashboardHomeProjectScope | ProjectActivityCreationRepair |
|---|---|---|---|---|
| feature-read vitest | skipped | skipped | skipped | skipped |
| c8 runtime vitest | skipped | skipped | skipped | skipped |
| dashboard-home vitest | not run (runs only under `-MigrationBaseline`) | not run | not run | not run |

- The current-schema suites seed with `session_replication_role = replica`, so write-path trigger coverage is not exercised there.
### Documentation
`docs/qad-pathways.md`, `docs/runbook-migration-baseline.md`, `docs/index.md` and `docs/activity-log.md` name only the remaining switches.

## 5. Alternatives Considered

Keep the three switches: rejected, because they replay a path no target uses and duplicate what `-MigrationBaseline` covers. Delete the archived history too: rejected, because it remains the audit record.

## 6. Migration / Rollback

No migration. Rollback is `git revert` of the commit.

## 7. Verification

Run `Replay-Local.ps1 -MigrationBaseline` before and after: both exit 0 and `Compare-Object` of the sorted `=PASS` lines is empty. Flipping one assertion in `project-indicator-dashboard-runtime.sql` makes the replay exit non-zero.

## 8. Approval

Developer approved 2026-10-01.

## 9. Disposition

Applied in the commit that registers this record. No deferred items.
