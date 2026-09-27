# RFC: Dynamic Rule-Based Alerts and Human-Reviewed Decision Support

## Current implementation (reconciled 2026-09-27)

`apps/api/prisma/schema.prisma` already defines the rule tables (`alert_rules`, `alert_rule_conditions`, `alert_rule_recommendations`, `rule_based_alerts`, `decision_recommendations`). Local rules, alerts and recommendations controllers now exist under the approved runtime authority CR. Migration 0031 adds the initial runtime storage and fixed operations; integrated runtime acceptance and hosted installation remain pending.

| Concept | Prisma enum / field | Values |
|---|---|---|
| Alert family | `AlertRuleType` | UNDERPERFORMING_INDICATOR, DELAYED_TIMELINE, BUDGET_CONCERN, BENEFICIARY_PROGRESS_ISSUE, SURVEY_IMPROVEMENT, MISSING_FOLLOW_UP, WEAK_OUTCOME_INDICATOR, COMBINED_CONDITION |
| Metric | `RuleMetric` | KPI_ACHIEVEMENT_PERCENT, TIMELINE_DELAY_DAYS, BUDGET_UTILIZATION_PERCENT, BENEFICIARY_PROGRESS_PERCENT, SURVEY_IMPROVEMENT_PERCENT, MISSING_FOLLOW_UP_COUNT, OUTCOME_SCORE, REMAINING_BUDGET |
| Operator | `RuleOperator` | LT, LTE, EQ, GTE, GT, BETWEEN |
| Condition group | `RuleMatchMode` | ALL, ANY |
| Rule lifecycle | `RuleStatus` | DRAFT, ACTIVE, ARCHIVED |
| Severity | `AlertSeverity` | LOW, MEDIUM, HIGH, CRITICAL |
| Recommendation status | `DecisionStatus` | NEW, REVIEWED, RESOLVED, DISMISSED |
| Management outcome | `DecisionOutcome` | ACCEPT, PARTIALLY_ACCEPT, DECLINE, ESCALATE |
| Scope/versioning | `AlertRule` | organization-scoped; `code` + `version` unique per organization; `activatedAt`/`archivedAt` |

Everything below that goes beyond this table is a **proposal, not yet in schema**: project-scoped rules and org-template copies, effective dates, cadence/cooldown, alert status/dedup identity, and the ACTIONED/AUTO_RESOLVED states. Adding them requires a migration and, once this RFC is Locked, a Change Record.

## Required Alert Families

- delayed timelines;
- underperforming indicators;
- budget concerns;
- Beneficiary-progress issues.

## Rule Model

A rule stores:

- org/project scope or org-template origin;
- name/description/category;
- version/activation/effective dates;
- severity;
- evaluation trigger/cadence where approved;
- one condition or ALL/ANY condition tree;
- links to zero/more predefined recommendation templates;
- audit/version history.

A condition stores:

- approved metric key;
- data type/unit;
- compatible operator;
- typed threshold/comparison.

No arbitrary SQL/code/unrestricted expression.

## Trusted Metrics

Implemented metric keys are the `RuleMetric` values above. The dotted keys below are proposed finer-grained candidates (not yet in schema), enabled only when source/calculation is reliable:

### Project
- `project.timeline_elapsed_pct`
- `project.remaining_days`
- `project.days_overdue`

### Indicator
- `indicator.current_value`
- `indicator.target_value`
- `indicator.achievement_pct`

Any approved indicator progress/achievement metric uses the indicator's own baseline, target and direction. The [approved project target-goal retirement](cr-pathways-retire-project-target-goal.md) withdraws project benchmark comparisons while retaining historical storage; it does not authorize a replacement metric or numeric fallback. Missing measurements and invalid denominators remain unavailable. This clarification does not establish an implemented provider.

### Activity
- `activity.completed_count`
- `activity.total_count`
- `activity.completion_pct`
- `activity.overdue_count`

### Budget
- `budget.approved_total`
- `budget.actual_spend_to_date`
- `budget.spent_pct`
- `budget.remaining_amount`
- `budget.burn_vs_time_gap_pct`

### Beneficiary
- `beneficiary.target_reach`
- `beneficiary.unique_reached`
- `beneficiary.reach_pct`

## UI Contract

Create/Edit Rule evolves from the current simple form:

- rule name;
- scope/project;
- category;
- controlled metric;
- typed operator;
- threshold(s);
- severity;
- status;
- effective dates / cadence / cooldown when approved;
- predefined recommendation;
- description;
- generated plain-language preview;
- dry run;
- later multi-condition ALL/ANY.

Upper threshold appears only for operators that require it.

## Evaluation Evidence

Preserve/reconstruct:

- project;
- rule/version;
- evaluation/reporting timestamp;
- metric values/units/source refs;
- operators/thresholds;
- group result;
- triggered result;
- severity/explanation;
- recommendation source.

## Lifecycle

Current schema: `DecisionStatus` NEW, REVIEWED, RESOLVED, DISMISSED and `DecisionOutcome` ACCEPT, PARTIALLY_ACCEPT, DECLINE, ESCALATE.

Proposed extension (not yet in schema):

```text
NEW → REVIEWED → ACTIONED → RESOLVED
```

Additional proposed state:
- AUTO_RESOLVED

Exact mapping, cooldown, dedup identity, re-trigger, auto-resolution timing, and notifications remain approval items unless a newer explicit developer decision or approved Change Record/Locked contract resolves them.

## Organization Templates (proposal, not yet in schema)

Copy/version templates into project-owned rules. Editing an org template must not silently mutate an active project rule.

## Optional EVM

Allowed only when reliable baseline/schedule/progress/cost inputs exist.

Basic budget/timeline alerts do not require EVM.

Missing inputs -> unavailable, not invented zero.

## Required Tests

Type/operator validation, ALL/ANY, boundary equality, missing metrics, idempotency, dedup, cooldown, re-trigger, auto-resolution, project/org isolation, snapshots, human outcome permissions.

## Initial local runtime scope

The [approved runtime authority CR](cr-pathways-f10-f11-runtime-authority.md) governs the local human API, source-operation acknowledgements, separate worker/sweeper entrypoints, SYSTEM attribution, private-note omission and preserved legacy history. Machine processing defaults to disabled. The admitted metric catalog covers indicator, timeline and activity observations; budget, Beneficiary and survey metrics remain unavailable. Indicator exposure requires a current non-sensitive eligibility approval; this implementation adds no eligibility administration UI or autonomous approval.

Forward SQL preserves the single Prisma ledger and existing rows. Local unit tests establish bounded typed behavior; they do not substitute for combined PostgreSQL, revocation, legacy compatibility, recovery, physical deadline and preview evidence. No hosted feature availability or complete acceptance of every alert family is claimed.
