# Change Record: F8, F9 and F12 Gate Closure

**ID:** `cr-pathways-f8-f9-f12-gate-closure`  
**Date:** 2026-10-04  
**Status:** Approved

## 1. Trigger

The crisis sprint left G-F9-9, G-F9-10 and G-F12-4 Not met and kept five finished controls hidden or on hold. On 2026-10-04 the developer decided to close them: analytics participation breakdowns, indicator trends and a server budget aggregate; a closed-period survey release for aggregate-only roles; the two missing report kinds with a bare `text/csv` type; the analytics export button; the Participation view option; and Add to Dashboard with browser-stored pins.

## 2. Current Contract

- PRD-F8 bounds list "Custom dashboard widgets and Add to Dashboard" as hidden pending a storage decision.
- PRD-F9 bounds list participation breakdowns, the indicator trend chart and server budget aggregate, closed-period survey totals and the export button as out (on hold or hidden). Aggregate-only roles get a 403 restricted state for the survey ([cr-pathways-f9-trusted-aggregates](cr-pathways-f9-trusted-aggregates.md) section 10).
- PRD-F12 lists four report kinds working; CSV generation fails on the private bucket (MA-13) because the type carries a charset suffix.

## 3. Proposed Change

1. **Insights module (G-F9-9).** A new isolated API module `analytics-insights` serves `GET /analytics/insights/participation`, `/indicator-trends` and `/budget`, each behind `analytics.descriptive.read` and writing one `ANALYTICS_DESCRIPTIVE_VIEWED` row naming the view. Participation returns a total plus `byActivity`, `byMonth` and `byAttendanceStatus` with small-cell suppression (1-4 hidden; a lone hidden cell also hides the smallest other non-zero cell; a total of 1-4 hides everything). Trends return one series per indicator from `project_indicator_measurements` using the current value of each correction chain per period, the target as a dashed line, capped at 50 indicators and 120 points (newest kept). Budget returns, per currency, planned, approved, pending (PENDING and VERIFIED, shown separately) and utilization = approved / planned; planned 0 reads "No budget". Contracts live in `packages/shared/src/monitoring/analytics-insights.ts`. The browser budget computation is removed.
2. **Closed-period survey release (G-F9-10).** Migration `0057_f9_survey_period_release` (renumbered from 0056 because `0056_indicator_type` belongs to another branch) adds table `pathways.survey_period_releases` (owner `prisma`, RLS forced, no runtime grants), internal `pathways.p10_f9_survey_compute` (not executable by the runtime role), a rewritten `p10_f9_survey_aggregate` that delegates with identical checks, and `pathways.p10_f9_survey_release` (EXECUTE to `pathways_runtime`). The release requires `analytics.descriptive.read` and `monitoring.read`, an exact defined period and a `period_end` before today in Asia/Manila. The first call freezes the result; later calls return the frozen copy (`ON CONFLICT DO NOTHING` then re-select). The API `surveyAccess()` sends detail roles down the live path and every other role with `analytics.descriptive.read` down the frozen path; an open period returns 400 and writes no audit row; each view or export still writes one audit row. Managers see the survey for a closed period with the caption "Released once for this closed period; figures do not change on later views."
3. **Report kinds and MIME (G-F12-4).** CSV is stored as bare `text/csv`. `MONITORING_REPORT` is built from the trusted monitoring aggregate over the project start to end, capped at 366 days. `EVALUATION_REPORT` uses the latest `SIGNED_OFF` or `ARCHIVED` evaluation (overall and criteria rows, no free text) and returns 409 before any insert or upload when none exists. All six PRD report types export as CSV, XLS, XLSX and PDF. The web kind selector lists both.
4. **Controls turned on.** `ANALYTICS_AGGREGATE_EXPORT_UI_ENABLED` is `true`; the Participation view option is always listed; Add to Dashboard stores pins in the browser (`lib/dashboard-pins.ts`, key `pathways.dashboardPins.v1.<userId>`, references only, maximum 8, deduplicated, wrapped in try/catch). `features/dashboard/pinned-charts.tsx` renders pins on the role dashboard and re-fetches live, so current permissions always apply. The "Add a chart" placeholder is replaced.
5. **Not changed.** Participation counts for aggregate-only roles stay restricted because the database withholds them (`p06_monitoring` returns `SENSITIVE_RELEASE_NOT_ENABLED_V1`); the API returns a restricted state. A definer release function and migration are recorded as a deferred row. G-F12-1 integration evidence and G-F8-7 staging re-measure stay pending replay evidence.

## 4. Impact

### Product
Analytics gains participation breakdowns, indicator trends and a server budget summary. Program Manager and Grant Manager read survey results for closed periods. Reports offer six kinds. Users pin up to 8 charts per browser.

### Data / Migration
One migration, `0057_f9_survey_period_release`: one table, three functions. Forward-only. Developer approved this migration on 2026-10-04, overriding the sprint zero-migration rule for this one gate. Not applied to hosted.

### Authorization / Privacy
Participation needs `monitoring.read`, `journeys.read`, `beneficiaries.records.read` and `submissions.write` or `assessments.detail.read` besides `analytics.descriptive.read`, because row policies on the joined tables require them. Trends need `monitoring.read` and `indicators.read`; budget needs `monitoring.read`, `budgets.read` and `expenses.read`. Out of scope projects return 404. Aggregate-only survey access closes the differencing gap by freezing each closed period once; open periods are refused. The runtime role cannot read or write the release table directly. Pins hold references only, never data.

### API
Three new `GET /analytics/insights/*` routes, a 400 for an open period on the frozen survey path, two new report kinds and a bare CSV type. A retrieval fault returns 503.

### UI
Participation panel, indicator trend chart with dashed target line, budget summary card, export button, pinned chart cards on the role dashboard and two new report kinds in the selector.

### Tests
`apps/api/src/modules/analytics-insights/analytics-insights.test.ts`, `apps/api/src/modules/dashboards/analytics.service.test.ts`, `apps/api/src/modules/reports/reports.service.test.ts`, `apps/api/src/modules/reports/report-artifact.test.ts`, `apps/api/prisma/tests/f9-survey-period-release-runtime.sql`, web component tests under `apps/web/src/features/analytics` and `apps/web/src/features/dashboard`, and `apps/web/src/lib/dashboard-pins.test.ts`.

### Documentation
PRD-F8, PRD-F9 and PRD-F12 bounds and gates, QAD rows, the deferred register, the SDD, the DSD, [cr-pathways-f9-trusted-aggregates](cr-pathways-f9-trusted-aggregates.md) section 11 and the index.

## 5. Alternatives Considered

- **Restraint option.** Leave the gates Not met and the controls hidden. Rejected: the developer wants them closed.
- **Server pin table.** Per-user pins across devices. Rejected: it needs a migration; browser pins need none and re-authorize on every render.
- **Reuse `sensitive_aggregate_releases` for the survey freeze.** Rejected: its policy version check and SADDD stale-marking would collide with survey releases.
- **Grant `assessments.detail.read` to aggregate-only roles.** Rejected: it exposes Beneficiary-level assessment rows.
- **Snapshot pins.** Rejected: pinned data would go stale and bypass current permissions.

## 6. Migration / Rollback

Apply `0057` through the normal replay and hosted build path after local suites and SAD migration review. UI and flag changes revert by flipping `ANALYTICS_AGGREGATE_EXPORT_UI_ENABLED` and removing the pin render. The migration is forward-only: recovery is a new migration that runs `DROP FUNCTION pathways.p10_f9_survey_release`, restores the `0045` body of `p10_f9_survey_aggregate`, drops `p10_f9_survey_compute` and runs `DROP TABLE pathways.survey_period_releases`. Insights routes and report kinds revert with the code.

## 7. Verification

- API unit tests above, including 16 insights tests (suppression, chain tips, approved-only budget, 404, 503, 400).
- `f9-survey-period-release-runtime.sql`: freeze on first call, identical later copy, open period `22023`, no runtime access to the table.
- Web tests: participation, trend and budget components, pinned charts re-authorize on render, pins storage limits.
- Full typecheck, tests, builds, `sad:check` and `docs:check`.
- G-F12-1 integration evidence: `apps/api/src/modules/reports/reports-runtime.local.test.ts` runs in the replay current-schema suites (scope, permission denial, suppression, preview allowlist). G-F8-7 staging re-measure stays pending (cr-pathways-performance-scaling).

## 8. Approval

Developer decisions, 2026-10-04: approve the insights module and approved-only budget utilization; approve migration 0057 for the closed-period release (overriding the sprint zero-migration rule for this one gate); add the two report kinds and bare `text/csv`; turn on the export button, the Participation option and Add to Dashboard with browser-stored pins. This record widens the locked PRD-F8 bound "Custom dashboard widgets and Add to Dashboard" and the PRD-F9 bounds "Participation breakdowns", "Indicator trend chart and server-side budget aggregate", "Closed-period survey totals" and "Export button hidden".

## 9. Disposition

Applied to the repository on `feature/f8-f9-f12-analytics`. Hosted: not applied to hosted. Deferred: F9 participation breakdowns for aggregate-only roles (needs a definer release function and migration). Pending replay evidence: G-F12-1 and G-F8-7 staging re-measure. Mark fully Applied once `0057` is applied to hosted and the replay evidence is recorded.
