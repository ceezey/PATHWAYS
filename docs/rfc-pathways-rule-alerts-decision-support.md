# RFC — Dynamic Rule-Based Alerts and Human-Reviewed Decision Support

**Status:** Working

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

Initial candidates, enabled only when source/calculation is reliable:

### Project
- `project.timeline_elapsed_pct`
- `project.remaining_days`
- `project.days_overdue`

### Indicator
- `indicator.current_value`
- `indicator.target_value`
- `indicator.achievement_pct`

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

Proposed:

```text
NEW → REVIEWED → ACTIONED → RESOLVED
```

Additional:
- DISMISSED
- AUTO_RESOLVED

Proposed management outcomes:
- ACCEPT
- PARTIALLY_ACCEPT
- DECLINE
- ESCALATE

Exact mapping, cooldown, dedup identity, re-trigger, auto-resolution timing, and notifications remain approval items unless a newer explicit developer decision or approved Change Record/Locked contract resolves them.

## Organization Templates

Copy/version templates into project-owned rules. Editing an org template must not silently mutate an active project rule.

## Optional EVM

Allowed only when reliable baseline/schedule/progress/cost inputs exist.

Basic budget/timeline alerts do not require EVM.

Missing inputs -> unavailable, not invented zero.

## Required Tests

Type/operator validation, ALL/ANY, boundary equality, missing metrics, idempotency, dedup, cooldown, re-trigger, auto-resolution, project/org isolation, snapshots, human outcome permissions.
