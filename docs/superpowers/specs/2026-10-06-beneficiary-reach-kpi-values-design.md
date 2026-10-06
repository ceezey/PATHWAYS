# Beneficiary Reach and KPI Values Release Design

**Date:** 2026-10-06
**Status:** Approved (developer, 2026-10-06)
**CR:** `docs/cr-pathways-beneficiary-reach-kpi-values.md` (to be written with the implementation)
**Migration:** `0065_beneficiary_reach_kpi_values`

## Goal

Release beneficiary reach and counts with 1-4 shown as "fewer than 5", open participation insights to Program and Grant Manager, and give Program and Grant Manager KPI values only, without new permission grants.

## Current state

- `p06_monitoring` and `p06_home_dashboard` overwrite the four monitoring counts with `SENSITIVE_RELEASE_NOT_ENABLED_V1` for every role; `p06_compute_monitoring` already computes them with 1-4 suppression.
- Participation insights need `journeys.read` and `beneficiaries.records.read` plus `p09_select` RLS, so only M&E Officer and Project Manager see them.
- Indicator rows are behind restrictive `p09_scoped_select` needing `indicators.read`, which Program and Grant Manager lack; they already see current values in the Indicator Summary report via `p34_compute_indicator_value`.
- Activity "beneficiaries reached" sums self-reported session counts with no suppression.
- `role-dashboard.tsx` `countOrZero` shows withheld counts as "0".

## Decisions

- No grant change; the role_permissions count stays 314.
- Each release is a SECURITY DEFINER function with explicit scope checks, following the existing `p06_*` and `p34_*` patterns.
- Suppression: counts 1-4 are SUPPRESSED; related counts get complementary suppression so a hidden count cannot be derived by subtraction (same approach as 0060 rule metrics).
- One code path per surface: the API uses the definer release for every role rather than branching by role.
- Developer decisions 2026-10-06: the participation breakdown returns exact counts with no suppression; the reach release keeps 1-4 suppression and complements and also hides participationRecords when it is 1-4 below enrolled individuals or 1-4 above attending individuals; KPI values stay unchanged. The developer accepts the residual risk that a KPI value and a reach count could be differenced.

## Migration 0065

1. Replace `p06_monitoring` and `p06_home_dashboard` so the four counts come from `p06_compute_monitoring` with complementary suppression; scope stays `monitoring.read` plus project scope. Signatures unchanged, so the running API keeps working.
2. Add `p06_participation_breakdown(project_id)` returning exact counts (no suppression) by activity, month and attendance status; requires `monitoring.read`, `analytics.descriptive.read` and `beneficiaries.aggregates.read` plus project scope. Granted to `pathways_runtime` only.
3. Add `p06_indicator_values(project_id)` returning per indicator: id, name, unit, baseline, target, current value cell and achievement; reuses `p34_compute_indicator_value`; requires `monitoring.read` and `reports.indicator.read` plus project scope. Returns no definitions, bindings, field IDs or measurement IDs. Granted to `pathways_runtime` only.
4. Advisory lock and postcondition block as in prior migrations; ACLs revoked from PUBLIC.

## API

- Monitoring dashboard, home dashboard, analytics reach card and monitoring report receive released counts with no API change beyond cell handling.
- `analytics-insights.service.ts` participation reads `p06_participation_breakdown`; permission check relaxed to the function's gate.
- Overview KPI card, monitoring dashboard indicators, descriptive indicator summaries and the monitoring report use `p06_indicator_values` when the caller lacks `indicators.read`.
- `activities.service.ts` `readReached` applies `suppressSmallCount`.

## Web

- `countOrZero` replaced so MISSING and SUPPRESSED render their labels, not "0".
- KPI card and participation panel shown to holders of the function gates; "Suppressed (fewer than 5)" copy everywhere.
- Indicators tab and route stay closed to Program and Grant Manager.

## Known limit

Activity reach suppression is display consistency only: per-session update rows stay readable to `activities.read` holders. Logged in `docs/deferred-features.md`.

## Testing

- New runtime SQL suite `apps/api/prisma/tests/beneficiary-reach-kpi-values-runtime.sql`: per role, Program and Grant Manager get suppressed counts and KPI values; reach counts and KPI values with 1-4 and their complements are SUPPRESSED, while the participation breakdown is exact; no definition or measurement columns returned; Project Officer unchanged; cross-organization and unassigned projects denied.
- API unit tests for the new service paths and reach suppression; web tests for the "0" fix and gating.
- Local replay 0000-0065 and existing suites, SAD migration review, then devV2 apply per the staging auto-migrate rule.

## Docs

New CR, `docs/rfc-pathways-saddd-privacy.md`, `docs/qad-pathways.md` rows, `docs/deferred-features.md` rows 31 and 62, `docs/activity-log.md`.
