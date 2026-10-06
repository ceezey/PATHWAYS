# Change Record: Evaluation auto scoring

**ID:** `cr-pathways-evaluation-auto-scoring`
**Date:** 2026-10-06
**Status:** Proposed (migration 0069 and code on branch `feature/evaluation-auto-scoring`; not applied to any database)

## 1. Trigger

Developer request (2026-10-06): "Make the evaluation automatically compute and we don't want the user to manually set it up. Ensure the data is accurate depending on the project and record picked by the M&E." The "record" is the evaluation round (a `ProjectEvaluation`) the Monitoring and Evaluation Officer starts for the selected project.

This change **supersedes section 5 of [cr-pathways-evaluation-write-path](cr-pathways-evaluation-write-path.md)**, which rejected computing criterion type Other because it would read as an autonomous judgment. Developer decision, 2026-10-06: every criterion is scored from project data proxies, and the proxies are labeled as such in the evidence shown beside each score.

## 2. Current Contract

- The M&E Officer typed a rubric, adjusted weights, published criteria and entered a manual score and note for Other criteria and for computed criteria that were not computable (`evaluation-metrics.ts`, `evaluations.service.ts`).
- `criterion_type` held KPI, TIMELINE_COMPLIANCE, BUDGET_EFFICIENCY, BENEFICIARY_REACH and OTHER. Budget efficiency was never computable for the M&E role (no `budgets.read`).
- Database guards are unchanged: criteria begin DRAFT and a published row is immutable except PUBLISHED to ARCHIVED (`p3_guard_criterion`); scores need a published criterion and a DRAFT evaluation (`p3_guard_score`); submission needs snapshot weights totaling 100 (`p3_guard_evaluation`).

## 3. Proposed Change

Criteria are a fixed default OECD-DAC set, provisioned and published automatically by the first round start, and every score is computed server-side. No new table or grant.

| Criterion | Weight | Type | Score |
|---|---|---|---|
| Relevance | 15 | BENEFICIARY_REACH | Enrolled (active or completed) by period end over the project target, capped at 100 |
| Coherence | 10 | INDICATOR_LINKAGE | Non-archived, non-cancelled activities linked to a live indicator over all such activities |
| Effectiveness | 25 | KPI | Mean indicator achievement, capped at 100 |
| Efficiency | 20 | TIMELINE_COMPLIANCE | Completed over due non-cancelled activities (planned end on or before period end) |
| Impact | 15 | ASSESSMENT_GAIN | Paired pre/post assessments that improved over all pairs, latest of each per enrollment dated inside the period |
| Sustainability | 15 | KPI | Same as Effectiveness |

- A criterion without data (no target, no due activity, no activities, no indicators, no pairs, or a count of 1-4) scores 0 with the stored commentary `No data: <reason>`. Weights stay fixed at 100 and the round stays submittable. Other rows store a short evidence string such as `Reach 82% of target`. The API returns `source` (`computed`, `no_data`, `manual`), `evidence`, `reason` and `note` per score; the report gains a Source column.
- Impact does not use `p10_f9_survey_aggregate`: it only answers for an exact defined indicator period, so it cannot be scoped to an evaluation period. The same latest-pair rule is counted in SQL under RLS (the M&E role holds `assessments.detail.read`); only counts leave the database and 1-4 is suppressed.
- Scores are computed when a round starts, on Recompute (draft only) and again on submit. Request fields for manual score and note are removed. Retired OTHER and BUDGET_EFFICIENCY rows that remain in an open round score 0 as `No data: criterion is no longer scored automatically`.
- Routes `criteria/initialize`, `criteria`, `criteria/publish` and `weights` are removed; the narrative, submit, return and sign-off stay human.

## 4. Impact

### Data / Migration

`0069_evaluation_auto_scoring` adds `INDICATOR_LINKAGE` and `ASSESSMENT_GAIN` to `pathways.criterion_type` (no use in the same transaction; precedent 0036, 0058). Provisioning runs in the API under a per-project advisory lock and is idempotent across actors. When the round start finds no open round and a live set that differs from the template, each live row is archived (a DRAFT row is published then archived, the only guarded path) and the template is inserted DRAFT then PUBLISHED at the next version per code. Closed rounds keep their `criterion_snapshot`. A project with an open round keeps its old set until the round closes. The runtime role has no DELETE on criteria, which is why rows are archived.

### Authorization / Privacy

The M&E Officer holds `evaluations.weights.configure` (criteria INSERT and UPDATE policies), `evaluations.submit`, `monitoring.read`, `activities.read`, `assessments.detail.read` and `indicators.read`; no grant is added. Read-only roles see "Evaluation not started" until a round exists.

### Tests

Unit tests for each metric (including no-data paths), provisioning, the service, the client and the workspace; the runtime suite `evaluations.local.test.ts` is updated and needs a replay stack.

## 5. Alternatives Considered

- **Keep manual scoring for Other**: rejected by the developer decision above.
- **Reuse the survey aggregate for Impact**: rejected, it cannot take an arbitrary period.
- **Keep Budget efficiency**: dropped; the M&E role cannot read budgets.

## 6. Migration / Rollback

Forward only. PostgreSQL has no DROP VALUE, so rollback leaves the two values unused; reverting the code restores the manual flow (archived rows stay archived).

## 7. Verification

API and web `tsc`, Biome, full API and web vitest, `scripts/db` node tests, and a ROLLBACK-only dry run of 0069 as role `prisma` on the local database. Runtime suite and replay pending.

## 8. Approval

Developer decision 2026-10-06 (supersedes section 5 of the write-path change record). SAD review and apply: controller.

## 9. Disposition

Open.
