# Change Record: Beneficiary reach, KPI values and SADDD for ongoing projects

**ID:** `cr-pathways-beneficiary-reach-kpi-values`
**Date:** 2026-10-06
**Status:** Applied (2026-10-06; 0066 on PATHWAYS-devV2, 41-row ledger; fast slice on origin/dev, PR #45)

## 1. Change

Migration `0066_beneficiary_reach_kpi_values` (first written as 0065, renumbered after `0065_zone_check_memo`):

- `p06_release_reach` releases reach counts in `p06_monitoring` and `p06_home_dashboard`. Counts of 1-4 show as "fewer than 5". Records are complement-suppressed against people, decided only from public reasons and released cells.
- New `p06_participation_breakdown`, which returns exact counts by developer decision.
- New `p06_indicator_values`, which returns values only (no measurement ids, sources, descriptions or bindings).
- `p06_saddd` releases started ongoing projects to date (period end is the earlier of the project end and business today), keeps the whole-table 1-4 suppression, and writes nothing to `sensitive_aggregate_releases`. Projects that have not started are still refused, and closed projects are unchanged.
- `p06_home_dashboard` checks the zone through `p06_zone_is_valid` from 0065.

API and web fast slice:
- SADDD gates accept started ongoing projects.
- Reach cards show suppression labels.
- The SADDD notice reads "counts to date" for ongoing projects.

## 2. Developer decisions

- Breakdowns are unsuppressed.
- KPI-versus-reach and cross-query differencing are accepted residual risks.
- SADDD is open for ongoing projects.
- Program and Grant Managers get KPI values only.

## 3. Verification

- SAD at 7b39cc94 (digest 2155f108): migration-integrity-guardian, organization-isolation-checker, beneficiary-privacy-guardian and design-qa-agent all PASS.
- Replay after the rebase: exit 0, 166 PASS lines, `BENEFICIARY_REACH_KPI_VALUES_RUNTIME` 41 assertions, evaluations 9 of 9. The first post-rebase failure came from a stale generated Prisma client, not from the migration.
- Applied to devV2 on 2026-10-06 at 14:39 Manila: ledger exactly 41 rows 0000-0066, postconditions PASS. `defense-demo --verify` returned 23 of 23.

## 4. Rollback

`CREATE OR REPLACE` `p06_monitoring` and `p06_home_dashboard` from 0065, and `p06_saddd` from 0028. Then drop `p06_release_reach`, `p06_complement_cell`, `p06_participation_breakdown` and `p06_indicator_values`. No data changes.

## 5. Deferred

These are tracked in the reach plan ledger under `.superpowers/sdd/2026-10-06-beneficiary-reach-kpi-values/`:
- the KPI-values route and the Program and Grant Manager analytics access fix; Program and Grant Managers now see released values (including person-derived calculated KPIs, as the Indicator Summary report already does), and evaluation metrics keep the definitions read
- participation insights reading the exact breakdown
- the rest of the API and web tasks, and the full docs
