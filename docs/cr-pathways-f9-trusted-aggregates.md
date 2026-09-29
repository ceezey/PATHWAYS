# Change Record: F9 Trusted Survey and Timeline Aggregates

**ID:** `cr-pathways-f9-trusted-aggregates`
**Date:** 2026-09-29
**Status:** Approved (implementation pending; amended 2026-09-29, see section 9)

## 1. Decision and Authority

The developer decided on 2026-09-29 that Program Manager and Grant Manager receive real F9 survey improvement and timeline adherence aggregates, not a restricted state. The developer approved this record as written on 2026-09-29. Migration `0045` needs separate authorization before it is applied to any hosted database.

## 2. Problem

The F9 survey and timeline views read `assessment_results` and `project_activities` through Prisma under row-level security. Program Manager and Grant Manager hold `analytics.descriptive.read` and `monitoring.read` but not `assessments.detail.read` or `activities.read`. Their queries return zero rows, so the views show "No paired pre/post assessments yet" or "No activities recorded yet". QAD-T12 forbids presenting a permission restriction as empty data. The R1 release review blocked the F9 branch on this finding.

Granting either detail permission is rejected. It would expose Beneficiary-level assessment rows and activity detail to aggregate-only roles, which breaks the build guide's Beneficiary privacy rule.

## 3. Proposed Contract

Migration `0045_f9_descriptive_aggregates` adds two SQL functions that follow the `p06_saddd` pattern in `0028_revised_aggregate_permission_guards`:

- `pathways.p10_f9_survey_aggregate(wanted_org uuid, wanted_project uuid, start_on date, end_on date) RETURNS jsonb`
- `pathways.p10_f9_timeline_aggregate(wanted_org uuid, wanted_project uuid, reporting_on date) RETURNS jsonb`

Both functions:

- are `SECURITY DEFINER` with `SET search_path TO ''` and schema-qualified references, owned by `prisma`, with `REVOKE ALL FROM PUBLIC` and `GRANT EXECUTE TO pathways_runtime`;
- raise `42501` unless `wanted_org` equals `app.organization_id` and both `pathways.p06_can('analytics.descriptive.read', wanted_project)` and `pathways.p06_can('monitoring.read', wanted_project)` pass;
- read only the requested organization and project;
- return group aggregates only, never a row, enrollment, Beneficiary, or assessment identifier.

**Survey output.** The function pairs each enrollment's latest valid `PRE_TEST` with its latest valid `POST_TEST` in the period. Latest means assessment date descending, then row id descending. A valid score has a finite score and a maximum score above zero. Scores are normalized to `score / maximum_score * 100`. The output holds one group per activity plus one no-activity group. Each group carries pair count, sum of normalized pre scores, sum of normalized post scores, and improved, same, and declined counts. The output also carries the excluded record count.

**Timeline output.** The function returns counts that match the rule-engine activity observation for non-archived activities: eligible (not cancelled), completed, overdue count, and maximum overdue days at `reporting_on`. It also returns the milestone counts behind the milestone on-time metric: completed milestones that have a target date, and how many of those finished on or before it.

**Suppression stays in the API.** The functions return unsuppressed aggregates to the API process only. The API passes them through the existing, reviewed shared calculators. Those calculators apply the threshold of 5, complementary suppression, and cross-group withholding of the per-activity breakdown before anything reaches a client or CSV. Keeping one suppression implementation avoids SQL/TypeScript suppression drift. This differs from `p06_saddd`, which suppresses in SQL. The difference is intended because no aggregate leaves the API unsuppressed.

## 4. API and Web Changes

- **One path for every role.** `computeSurvey` and `computeTimeline` call the two functions for every role instead of `findMany`, so there is one code path. Rounding, means, and suppression stay in the shared calculators, which are refactored to accept group aggregates. Their outputs and contract versions do not change.
- **Row caps.** The survey and activity row caps and `POPULATION_LIMIT_EXCEEDED` are no longer reachable, because aggregation happens in the database. A `statement_timeout` guard follows the `DashboardsService` pattern, and a timeout maps to the existing 503 fault path.
- **Unchanged.** The monitoring permission guard, project scope check, `ANALYTICS_DESCRIPTIVE_VIEWED` and `ANALYTICS_DESCRIPTIVE_EXPORTED` audit rows, CSV export, and Project Officer denial stay as they are.

## 5. Migration Registration

Add `0045` everywhere `0044` is enumerated:

- `scripts/db/hosted-plan.mjs` and its tests
- `scripts/db/hosted-build.mjs` and its tests
- `apps/api/prisma/legacy-retirement.test.ts`
- `.gitattributes`
- `infra/supabase/phase6/Verify-Forward.ps1` (f9a clone, replay and checks)
- the runtime SQL suites in `apps/api/prisma/tests/`

`schema.prisma` does not change, because the migration adds functions only. The migration history of `0000` through `0044` stays byte-for-byte unchanged.

## 6. Verification

A new runtime SQL suite, `apps/api/prisma/tests/f9-descriptive-aggregates-runtime.sql`, runs on a disposable local database. It covers:

- **Access:** Program Manager and Grant Manager succeed. Project Officer, cross-organization, and out-of-scope projects raise `42501`.
- **Survey parity:** pairing, same-date tie-break, invalid scores, and the no-activity group.
- **Timeline parity:** activity and milestone counts, including cancelled, archived, and boundary dates.
- **Privacy:** the output contains no identifiers.

API tests add Program Manager and Grant Manager cases for both views on read and export. A parity test compares the SQL aggregates with the TypeScript calculators on the same synthetic fixtures. The full typecheck, tests, builds, `sad:check`, `docs:check`, and SAD review run as usual.

## 7. Release Impact

This release now contains a migration. Release stage R6 stops for human authorization. Applying `0045` to `PATHWAYS-role-staging` or any hosted database needs separate developer authorization and follows the hosted build tooling. The `dev` to `master` question for migrations `0042` and `0043` is still undecided.

## 8. Disposition

When this record is approved and verified, update the F9 section of `docs/sdd-pathways.md`, the QAD rows, and `docs/index.md`, then mark this record Applied.

## 9. Approved amendment 2026-09-29: defined-period rule

**Approved by the developer on 2026-09-29.** The R1 privacy review found that survey results for arbitrary custom periods let an aggregate-only role (Program Manager, Grant Manager) request two adjacent or nested ranges and subtract the results. With small groups near the suppression threshold, the difference can isolate one person's pre and post scores. Threshold and complementary suppression protect a single response, but they cannot protect against two separately releasable responses that differ by one person.

**Rule.** Survey results (JSON and CSV export) are released only for exactly one of the project's defined reporting periods, for every role, on one path. A defined reporting period is a distinct `(period_start, period_end)` pair of the project's non-archived, reviewed (`measurement_mode` set) Indicator definitions that overlaps the project dates. This is the same set the dashboard period picker offers (`deriveAnalyticsReportingPeriods`). A request whose start and end do not match one defined period exactly is refused with a typed 400. A matched period that overlaps another defined period of the same project is also refused, because two overlapping releasable periods can be differenced. The timeline view takes no period and is unaffected.

**Enforcement.** The authority is `pathways.p10_f9_survey_aggregate` in migration `0045`: it raises `22023` unless the range matches one defined period of `wanted_project` in `wanted_org` and no other defined period overlaps it. It reads `project_indicators` under the definer, so roles holding `monitoring.read` without `indicators.read` are judged by the same rule. The API maps `22023` from the survey function to `BadRequestException` (400) on read and export. A 400 rolls back the request transaction, so no `ANALYTICS_DESCRIPTIVE_VIEWED` or export audit row is written, which matches every other validation failure on these routes. The web period picker already offers only defined periods; adjacent defined periods that do not overlap remain individually releasable.

**Migration.** `0045` is not applied to any database, so the function body is amended in place. The advisory lock key is also corrected to `(505005,1)` to match the migration convention.

**Verification.** `f9-descriptive-aggregates-runtime.sql` asserts a refused custom range, refused adjacent-day ranges (start and end), refused overlapping defined periods, a refused missing period, a refused custom range for Program Manager, and accepted exact defined periods including two adjacent non-overlapping ones. API tests cover the 400 for Program Manager and Grant Manager on read and export with no audit row. QAD-T33 and QAD-A20 record the rows.

## Renumbering 2026-09-30

`dev` gained `0044_activity_progress_review` while this record was open. This migration was never applied to any database, so it was renumbered from `0044_f9_descriptive_aggregates` to `0045_f9_descriptive_aggregates`. Its prerequisite check now requires `0044_activity_progress_review` finished. No function body changed. It uses advisory lock key `(505005,1)`, the same key `0044_activity_progress_review` takes; the locks are transaction-scoped and the migrations run serially, so they do not conflict.
