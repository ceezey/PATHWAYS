# Test Script: Rule Creation

**Status:** Working
**Last reconciled:** 2026-10-20
**Covers:** `/alerts/repository` Create rule tab, `RuleDrawer` builder, `F10` rule contract

Manual script and field reference for creating an alert or recommendation rule. Values below are taken from the shipped contract (`packages/shared/src/rules/rule-contract.ts`, `apps/web/src/features/rules/rules.utils.ts`), not from the UI text, so they stay accurate when copy changes. Pair with the happy, sad and abuse path requirement in [QAD](qad-pathways.md) section 1.

## 1. Preconditions

| Need | Why |
|---|---|
| `rules.create` | The Create rule tab only renders with it |
| `projects.read` | Populates the Rule scope list |
| `rules.activate` | Activating a draft; otherwise the rule stays DRAFT |
| `indicators.read` | Binding an indicator metric to a record |
| `activities.read` or `activities.context.read` | Binding an activity metric to a record |
| Local stack | `pnpm db:local:start`, `pnpm db:local:seed`, `pnpm dev` |

Use synthetic seed data only. No real Beneficiary data in any environment.

## 2. Metric cheatsheet

The Applies To checkboxes filter this list; the Metric dropdown shows only metrics whose scope is checked. Record-bound metrics are hidden entirely while Rule scope is Organization template.

| Metric | Scope | Unit | Monitoring | Threshold domain | Binds a record |
|---|---|---|---|---|---|
| Current indicator value | Indicator | measurement unit | latest selected indicator value | any exact decimal | indicator |
| Progress toward indicator target | Indicator | percentage | baseline-to-target progress using direction | any exact decimal, not capped at 100 | indicator |
| Project timeline elapsed | Project | percentage | scheduled duration passed, not work completed | >= 0, not capped at 100 | no |
| Days until project end | Project | calendar days | scheduled end date; negative means passed | whole numbers, may be negative | no |
| Days past project end | Project | calendar days | days beyond scheduled end, otherwise zero | >= 0, whole numbers | no |
| Activities completed | Activity | percentage | eligible activities marked completed | 0 to 100 | no |
| Number of overdue activities | Activity | count | unfinished activities past planned end | >= 0, whole numbers | no |
| Days activity is overdue | Activity | calendar days | selected unfinished activity past planned end | >= 0, whole numbers | activity |
| Budget used | Budget | percentage | approved expenses over planned budget; counted spending is approved expenses | >= 0, not capped at 100 | no |
| Beneficiaries needing follow-up | Beneficiary Group | percentage | active enrollments whose latest participation needs follow-up, not completion | 0 to 100 | no |
| Average assessment score change | Assessment | percentage points | average post-test minus pre-test after 0–100 conversion; negative means decline | -100 to 100 | no |

Every threshold is an exact decimal: at most 14 integer and 4 fractional digits, 20 characters.

The builder shows a definition, monitoring level and clearly labelled worked example for the selected metric. Examples explain only; they never populate, default or save a threshold. For Assessment, confirm the worked example says that 60% to 75% changes by 15 percentage points. The stored metric key remains `SURVEY_MEAN_IMPROVEMENT_POINTS` and is not shown as a user-facing Survey metric.

## 3. Field cheatsheet

| Field | Rule |
|---|---|
| Rule Name | 1 to 160 characters, required |
| Rule Code | `^[A-Z][A-Z0-9_-]{1,79}$`, auto-suggested from the name until typed in, locked after the rule exists |
| Rule Category | Read-only, derived from the first condition's metric |
| Rule scope | Organization template, or one project; locked when editing |
| Applies To | Six scopes; Organization templates disable Indicator and expose `Indicator metrics require a project record.` on hover and keyboard focus, with an assistive-technology description; aggregate Activity remains available but its record-bound metric is absent |
| Match | All conditions (AND) or Any condition (OR); appears only from the second condition |
| Condition | below, at most, equal to, at least, above, between |
| Upper threshold | Only with between, and must be at or above the lower threshold |
| Severity | No Low/Medium/High picker: the system suggests the level from actual figures when an alert fires ([cr-pathways-severity-classification](cr-pathways-severity-classification.md)). Step 3 shows a preview of possible levels and a **Mark as Critical (manual judgment)** checkbox; saved severity is null, or CRITICAL when ticked. |
| Expected score improvement | Optional, shown only with Average assessment score change; decimal 0 to 100 points |
| Manageable follow-up level | Optional, shown only with Beneficiaries needing follow-up; decimal 0 to 100 percent |
| Recommendations | 1 to 10, each needs a title and a suggested response; a new rule starts with family-specific editable copy unless the administrator has edited or reused a recommendation |
| Conditions per rule | 32 |

## 4. Happy path

1. Open `/alerts/repository`. The Rule repository tab is selected.
2. Set the scope filter to the project you want the rule to belong to. The builder inherits it.
3. Open the **Create rule** tab, or press any **Create Rule** button. Expect: the tab activates, the builder renders in the page, no side panel opens.
4. Leave **Rule output** on Alert rule.
5. Step 1: enter Rule Name `Overdue activity watch`. Expect: Rule Code fills with `OVERDUE_ACTIVITY_WATCH`.
6. Confirm Rule scope shows your project.
7. Tick **Activity** under Applies To.
8. Step 2: set Metric to `Number of overdue activities`, Condition to `At least`, Threshold to `2`. Expect: Unit reads `Count`, the guidance says it counts unfinished activities past planned end dates, and Rule Category in step 1 reads `Delivery`.
9. Step 3: expect `Possible levels: Low, Medium, or High. Critical is set manually.` and a line that the level depends on planned dates and totals known only when the alert fires. Change the condition to Budget used above 110; expect `Possible levels: High. Critical is set manually.` Change it to Beneficiaries needing follow-up above 30 with Manageable follow-up level `10`; expect `Possible levels: High. Critical is set manually.` Add a second condition on the same metric, below 20, in the same All group; expect `These conditions cannot happen together.` Remove it, restore the overdue condition, and leave **Mark as Critical (manual judgment)** unticked.
10. Step 4: expect title `Review activity progress` and response `Check the activity status and recorded evidence with assigned staff, then agree on a follow-up.` Replace both with your own text.
11. Check the preview column: the sentence reads `Raise an alert when Number of overdue activities is at least 2. Human review required.` and the tile shows `Severity from actual figures`. Tick Mark as Critical; expect `Raise a Critical alert when ...` and the tile `Critical`. Untick it again.
12. Press **Save Rule**. Expect: the Rule repository tab returns, `Rule changes saved.` appears, and the rule is listed as **Draft**.
13. Open **Manage Rules**, find the rule, press **Test**, enter test values that match and press **Run condition test**. Expect: **Triggered** and a **Sample result** card with the suggested level and its reason (for an assessment rule with Expected score improvement 10, five pairs and mean 2: `Suggested severity: Medium.` and `Expected +10 points, actual +2, 8 points below. (Severity Guide v0.2, 5.11)`). Then **Activate**. Expect: status becomes **Active**.

## 5. Sad paths

Each row is run from a valid draft, changing only the named field.

| Action | Expected message |
|---|---|
| Save with an empty Rule Name | `Enter a rule name.` |
| Save with Rule Code `9BAD` or `x` | `Enter a rule code using capital letters, numbers, underscores, or hyphens.` |
| Save with Threshold `abc`, empty, or outside the metric domain | `Invalid typed rule conditions.` |
| Save with between and an upper threshold below the lower | `Invalid typed rule conditions.` |
| Clear a recommendation title or response, then save | `Add at least one recommendation, each with a title and suggested response.` |
| Pick an indicator metric and save without choosing a record | `Invalid typed rule conditions.` |
| Change Rule scope after binding a record | Incompatible metric rows and record bindings clear; a visible message names what cleared. Rebind an available metric before saving. |
| Remove the final Applies To family | `Select at least one Applies To family.` and the family remains selected |
| Deactivate without a note | `Enter a note to deactivate this rule.` |
| Save while the server rejects the write | `The rule could not be saved. Verify your access, project records, and current version before retrying.` |
| Save when no response is confirmed | `A response was not confirmed. Retry the same operation.` Do not edit the form before retrying; the same operation id is replayed |

## 6. Authorization and abuse paths

| Check | Expected |
|---|---|
| Sign in without `rules.create` | No Create rule tab and no Create Rule buttons; the repository still reads |
| Sign in without `rules.activate` | No Activate action on a draft |
| Lose scope permission between opening and saving | `Current permission for the selected scope is required.` |
| Organization template scope | Record-bound metrics are absent from the Metric dropdown |
| Organization template scope | Indicator is disabled; hover and keyboard focus expose `Indicator metrics require a project record.`, and its assistive-technology description remains available. Activity and its aggregate metrics remain available while Activity overdue days is absent |
| Organization template saved | No Activate action; a template must be copied into a project first |
| Without `indicators.read` or activity read | The record dropdown offers no choices, so the rule cannot be saved |
| Rule edited elsewhere while open | Save is refused on the version check; reopen the rule and redo the change |

## 7. Known limits

- Saving always produces a **DRAFT**. Activation is a separate, audited step and is unavailable for organization templates.
- Notification recipients are not configurable per rule. Delivery follows project assignment plus alert access, and notifications are written when a decision is recorded, not when a rule fires.
- Recorded evidence names the metric, operator, threshold and observed value. It does not name which activity or indicator rows produced the value.
- Severity has no positive or negative polarity in storage. The builder frames Low as progress or milestone insight through wording only.
- A rule whose conditions nest deeper than one group cannot be edited in the builder; it opens the advanced editor instead.
- Changing metric families refreshes the initial recommendation only while neither field has been edited. A copied saved recommendation and every stored recommendation remain unchanged.
