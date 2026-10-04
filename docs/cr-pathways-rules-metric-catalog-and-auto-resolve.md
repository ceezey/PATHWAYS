# Change Record: Rules Metric Catalog and Recommendation Auto-resolve

**ID:** `cr-pathways-rules-metric-catalog-and-auto-resolve`

**Date:** 2026-10-04

**Status:** Applied on PATHWAYS-devV2 2026-10-04 (0058-0060, after production ran the widened contract)

**Approval:** Developer reply on 2026-10-04 choosing to implement G-F10-6, G-F10-7 and G-F11-5 ("Implement all three") for the defense sprint, overriding the CRISIS_PLAN zero-migration rule for this feature only.

## 1. Decision and Scope

This record closes G-F10-6 (Budget, Beneficiary and survey rule metrics) and G-F11-5 (recommendation Auto-resolved). It amends the PRD-F10 and PRD-F11 bounds that listed Budget, Beneficiary and survey metrics as out, and it widens §3 of [cr-pathways-f10-f11-runtime-authority](cr-pathways-f10-f11-runtime-authority.md) from "no broad Beneficiary/financial reads" to lease-scoped, family-bound aggregate reads.

The human permission matrix is unchanged. Rule administration stays System Administrator only, and no new permission key is added.

## 2. Metric catalog additions

The rule contract stays `f10.v1`; the change is additive and earlier databases reject unknown metric keys with 22023. All three metrics are project-level aggregates with no indicator or activity binding.

| Metric | Calculation | Unit | Unavailable |
|---|---|---|---|
| `BUDGET_UTILIZATION_PERCENT` | Approved expense amount over planned budget of non-archived budget records | % (0 or more) | `EMPTY_POPULATION`, `ZERO_DENOMINATOR`, `UNSUPPORTED_SOURCE` (more than one currency), `PROGRESS_OUT_OF_RANGE` |
| `BENEFICIARY_FOLLOW_UP_PERCENT` | Share of active enrollments whose latest participation needs follow-up | % (0 to 100) | `SUPPRESSED` below 5 or when the count or its complement is 1 to 4; `EMPTY_POPULATION` |
| `SURVEY_MEAN_IMPROVEMENT_POINTS` | Mean of post-test minus pre-test percentage over valid latest pairs | points (-100 to 100) | `SUPPRESSED` below 5 pairs; `EMPTY_POPULATION` |

All three are `NOT_APPLICABLE` for archived projects or projects not PLANNED or ONGOING. Suppression follows the PRD-F8 small-cell rule. Only aggregates are read; no Beneficiary row or amount reaches evidence beyond the computed value.

Evaluation uses the existing hourly sweep, not new source operations. A qualifying change raises its alert within about one hour plus one drain interval.

## 3. Audience restriction

An alert or recommendation whose rule binds a Budget, Beneficiary or survey metric is readable only by users who also hold the source read: `budgets.read` and `expenses.read`, `beneficiaries.records.read`, or `assessments.detail.read` respectively. Beneficiary follow-up needs the record read (Project Officer, Monitoring and Evaluation Officer, Project Manager), not the aggregate read, because successive live values could otherwise be differenced to reveal one person's follow-up status. A restrictive database policy hides the alert, its recommendations, notifications and history from everyone else, and their actions return 403. Rule authoring and dry-run use definitions or typed-in values only, so the System Administrator can still configure these rules.

## 4. Recommendation Auto-resolved

`DecisionStatus` gains `AUTO_RESOLVED`. When the background commit auto-resolves an alert, each linked recommendation still NEW or REVIEWED with no recorded outcome becomes Auto-resolved, with SYSTEM attribution and an audit entry. A recommendation with a recorded outcome is never changed. Auto-resolved is terminal: review and outcome are rejected.

The PRD-F11 state machine gains `New --> AutoResolved` and `Reviewed --> AutoResolved` on "linked alert clears, no outcome recorded".

## 5. Terminal alerts and recommendation states

Developer decision on 2026-10-04: the code follows UC-F10-2. A direct alert outcome (Accept, Partially accept, Decline, Escalate) on a Resolved, Dismissed or Auto-resolved alert is rejected, and Record outcome is hidden for those alerts. Migration 0059 enforces this in `assert_runtime_mutation`, `outcome_preview_operation` and `outcome_confirm_operation`. The 0059 header comment omits `outcome_confirm_operation`; it is left as is because committed migration bytes are preserved. A recommendation outcome is unchanged: it records the decision and may still reserve the linked alert revision.

The PRD-F11 diagram now matches the runtime: an outcome records a decision and leaves the recommendation status unchanged; only review and Auto-resolved change it.

## 6. Rollout order

The API and web contracts accept `AUTO_RESOLVED` and the new metric keys in a migration-free commit first. Migrations that emit them are applied to a hosted database only after every API deployment reading that database runs the widened contract. Recovery is a code redeploy or `RULES_WORKER_ENABLED=false`; applied migrations are never reverted.

## 7. Verification

The PostgreSQL suite `apps/api/prisma/tests/f10-f11-rules-runtime.sql` must print `F10_F11_RULES_RUNTIME=PASS` on a full local replay. Unit tests cover metric builders, suppression boundaries and contract parsing. SAD review requires migration-integrity-guardian, organization-isolation-checker, beneficiary-privacy-guardian and rule-engine-determinism-checker.
