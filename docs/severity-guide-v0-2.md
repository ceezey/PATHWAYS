# PATHWAYS Severity Guide in Plain Language

**Version:** Draft 0.2, complete plain-language guide  
**Date:** 18 October 2026  
**Status:** Proposed for review by program and project managers

Markdown copy of the team's guide (PDF, Draft 0.2). The implemented subset and the decisions taken on it are in [cr-pathways-severity-classification](cr-pathways-severity-classification.md); where they differ, that record governs the application.

This guide explains how PATHWAYS could suggest **Low, Medium, High, or Critical** when a rule raises an alert. Severity tells the team how much attention a concern needs.

The aim is simple: **use the same approved criteria for similar situations, explain the result, and ask for missing information instead of guessing.**

The numbers in this guide are proposals. Managers still need to review and approve them. This revision keeps the earlier proposed severity limits and adds the recommended approach to condition counts, future maintenance, user-friendly setup, and verification. It revises the guide only; it does not implement these changes in the application.

Read Sections 1-5 for the levels and all 11 tracked numbers; Sections 6-9 for combinations, previews, Critical cases, and human decisions; and Sections 10-15 for approval, condition limits, implementation guidance, and user testing. Section 16 explains the supporting sources.

## 1. What the four levels mean

| Level | Plain meaning | What the team should do |
|---|---|---|
| Low | A small concern, or a result within the agreed allowance. | Keep watching it and make a small correction if needed. |
| Medium | A noticeable problem that needs action. | Assign someone to address it and agree when to review progress. |
| High | A serious problem or a combination showing serious delivery pressure. | Ask the project or program manager to agree a recovery action. |
| Critical | An essential commitment has failed, or a severe funding-and-delivery problem meets the specific requirements in Section 8. | Escalate immediately to the responsible manager for a decision. |

Managers must agree actual response deadlines. The labels alone do not set a 24-hour, three-day, or other fixed response requirement.

Low describes the particular alert. It does not mean that every part of the project is doing well. Several High concerns do not automatically become Critical.

## 2. Two questions the system answers

**First: does the rule match the project situation?**

Example rule: raise an alert when more than 90% of the budget has been used. If spending reaches 95%, that rule matches and can raise an alert.

**Second: how serious is that situation?**

Spending 95% might be expected near the end of a well-progressing project. It might be concerning if most of the required work is unfinished. The rule matching does not, by itself, answer the severity question.

The proposed process is:

1. Check whether the rule matches.
2. Read the actual project figures and the approved plan for the same date.
3. Compare them using the relevant criteria in this guide.
4. Check whether a specific combination or Critical requirement applies.
5. Explain the suggested level, or say exactly what information is missing.

Use the approved plan that applied when the situation was checked. Later changes to the plan should not rewrite the earlier result.

## 3. What the earlier draft meant by Cannot classify

**It means: we do not yet have enough information to choose a reliable severity level.**

A clearer message is **Additional context required**, followed by what is needed.

| Situation | Why more information is needed |
|---|---|
| Indicator progress is 50%. | We need to know how much progress was expected by that date. |
| The budget is 95% used. | We need to know whether that spending was planned and whether the related work is progressing as expected. |
| Two activities are overdue. | We need to know how many activities are included and whether an essential deadline was missed. |
| The current indicator value is 42. | We need the unit, starting point, target, and whether higher or lower is better. |

For example, 50% progress is ahead of a plan that expected 40% by today, but behind a plan that expected 80% by today.

There are two different kinds of missing information:

- **The figure is known, but its meaning is unclear.** The rule may raise an alert, while its severity still needs more context.
- **The figure itself is missing, invalid, or withheld for privacy.** A condition that needs it cannot be checked reliably. A rule relying on that condition alone is not evaluated and raises no alert.

Missing information must never be treated as zero or automatically labelled Medium. A genuine recorded zero is different from missing information.

## 4. How to judge progress against the plan

For indicator progress and activity completion, compare **what was expected by the reporting date** with **what was actually achieved**. Do not assume that using 80% of the project time means 80% of every output should already be complete.

### An example without a formula

The approved plan expected 80 units of progress by today, but the team achieved 60. The missing amount is 20 out of the 80 expected. That is one quarter, or **25% behind the plan**.

This is different from simply subtracting 60 from 80 and calling the result 20% behind. The question is how much of the expected work is missing.

| How far behind the approved expectation? | Proposed level |
|---|---|
| On or ahead of the plan, or no more than 10% behind | Low |
| More than 10% behind, up to and including 25% behind | Medium |
| More than 25% behind | High |
| Meets the separate Critical requirements in Section 8 | Critical |

For a plan expecting 80% progress by today:

- Actual progress of **72%** is exactly 10% behind: Low.
- Actual progress of **60%** is exactly 25% behind: Medium.
- Actual progress below **60%** is more than 25% behind: High.

If the approved plan explicitly expects no progress yet and none has been made, there is no delivery shortfall against that expectation. If progress has moved backwards, an agreed rule for that situation is needed. An absent plan must not be mistaken for a plan expecting zero.

## 5. The 11 numbers PATHWAYS tracks

A metric simply means a number the system tracks. The following explanations replace the technical metric descriptions in the earlier draft.

### 5.1 Current indicator value

**What it means:** The latest result for an indicator, such as households reached, people trained, or an assessment value.

**How to judge it:** Use its starting point, target, unit, and approved expectation for today to work out progress. Then use Section 4. Some indicators improve when the number rises; others improve when it falls. An indicator that only describes a situation needs its own agreed acceptable range.

**Example:** The starting value was zero households. The final target is 200 households. The plan expected 100 households reached by today; the actual result is 80. The project is missing 20 of the 100 expected, so it is 20% behind: Medium under the proposed progress criteria.

**When more information is needed:** A value such as 80 cannot be judged without its unit and approved plan. A missing starting point, unclear direction, or a starting value equal to the final target also needs clarification.

### 5.2 Progress toward an indicator target

**What it means:** How far the indicator has moved from its starting point toward its final target, expressed as a percentage. Progress can go backwards or go beyond the final target.

**How to judge it:** Compare actual progress with the approved progress expected for that date, using Section 4.

**Example:** Actual progress is 45%, while the approved plan expected 80%. The missing 35 out of the expected 80 means it is 43.75% behind: High.

**When more information is needed:** If no progress expectation exists for that date, the system should ask for one. The final target alone does not tell us what should have been achieved by today.

### 5.3 Project timeline elapsed

**What it means:** How much of the planned project time has passed. It measures time, not work completed.

**How to judge it:** Use it to help understand delivery results. There is no standalone rule saying that 80%, 90%, or 100% of time elapsed is automatically Low, Medium, High, or Critical.

**Example:** A project is 85% through its schedule. Its approved plan expected 40% indicator progress by then, and actual progress is 45%. The delivery result is ahead of that plan. The time figure alone does not make it High.

**When more information is needed:** A timeline-only alert needs information about the approved delivery plan or an essential commitment. Missing or invalid dates also prevent a reliable assessment.

### 5.4 Days until the project ends

**What it means:** Calendar days remaining before the approved project end date. A negative number means the date has passed.

**How to judge it:** Look at what remains unfinished and how long the approved recovery action would take. A positive number, such as five days left, does not have its own severity level. If the date has passed, use the delay criteria below when the project is still applicable and required work is unfinished.

**Example:** Five days remain, but the approved recovery action needs eight days to complete a commitment due at the project end. If the progress gap and other requirements in Section 6 apply, the combined situation can be High.

**When more information is needed:** The system needs the deadline, unfinished commitment, and relevant recovery information. Zero days remaining means the end date is today, not one day overdue.

### 5.5 Days past the project end date

**What it means:** How many calendar days the project is beyond its approved end date, while it remains an applicable unfinished project.

**How to judge it:** Compare the delay with the project's approved duration. Five days on a 20-day project is a larger relative delay than five days on a 200-day project.

| Delay as a share of the approved duration | Proposed level |
|---|---|
| No more than 5% of the duration | Low |
| More than 5%, up to and including 10% | Medium |
| More than 10% | High |
| Essential commitment failure meets Section 8 | Critical |

**Example:** For a project planned to last 100 days, a five-day delay is Low, a ten-day delay is Medium, and an eleven-day delay is High under this draft.

**When more information is needed:** Missing dates or an unknown planned duration. A project scheduled to start and finish on the same day needs a separate agreed delay rule. Zero delay does not prove that all work is complete.

### 5.6 Activities completed

**What it means:** The percentage of included activities marked completed. Cancelled and archived activities are excluded; each included activity counts equally.

**How to judge it:** Compare completion with the approved expected completion for today, using Section 4. Use the same activity list for the plan and the actual result.

**Example:** The plan expected eight of ten activities completed by today. Six are completed. Two of the expected eight are missing, so completion is 25% behind: Medium.

**When more information is needed:** There is no expected completion plan, the activity list is incomplete, or changes to that list have not been accounted for. This percentage does not say whether the most important activities are complete.

### 5.7 Number of overdue activities

**What it means:** How many included, unfinished activities are past their planned end dates.

**How to judge it:** Look at the overdue count as a share of the complete included activity list. Also check separately for any identified essential commitment.

| Share of activities overdue | Proposed level |
|---|---|
| No more than 5% | Low |
| More than 5%, up to and including 15% | Medium |
| More than 15% | High |
| Identified essential commitment meets Section 8 | Critical |

**Example:** Out of 100 included activities, five overdue is Low, fifteen is Medium, and sixteen is High.

**When more information is needed:** We know the overdue count but not the total activity list, or unfinished activities have missing dates. An overdue count alone cannot tell us which activity is essential.

### 5.8 Days an activity is overdue

**What it means:** How many calendar days one selected unfinished activity is beyond its approved end date.

**How to judge it:** Use the delay table for 5.5, but compare with that activity's own approved duration, not the whole project's duration.

**Example:** An activity was planned to last 20 days and is two days overdue. The delay is 10% of its duration: Medium.

**When more information is needed:** The activity, its dates, or its duration is missing. A same-day milestone needs a separate agreed rule. The current number becomes zero after completion, so it should not be used to reconstruct how late a completed activity finished.

### 5.9 Budget used

**What it means:** Approved expenses as a percentage of the planned budget. Pending, verified, and rejected expenses do not count as approved spending.

| Spending compared with the total approved plan | Proposed treatment |
|---|---|
| Within the budget, including exactly 100% used | Check planned spending and related delivery before choosing a level. It can be Low when both confirm normal progress. |
| More than 100%, up to and including 110% used | Medium |
| More than 110% used | High |
| Severe funding-and-delivery failure meets Section 8 | Critical |

**Example:** On a budget of 100,000, approved spending of 105,000 is 105% used: Medium. Spending of 111,000 is 111% used: High.

Spending 95,000 might be normal when planned purchases and delivery are on track. The same spending with substantially unfinished linked delivery may support High under Section 6, even though the budget has not been exceeded.

**When more information is needed:** There is no usable budget, the planned amount is zero, currencies are mixed, or spending within the budget lacks a delivery/spending explanation. Do not invent a conversion or forecast. A different rule for a strict contractual budget ceiling requires separate approval.

### 5.10 Beneficiaries needing follow-up

**What it means:** The percentage of active enrollments whose latest participation record says follow-up is needed. It does not measure whether follow-up has been completed, whether it is overdue, or how serious a person's situation is.

**How to judge it:** Managers first agree what level of follow-up demand is manageable for that group and period. Compare the actual percentage with that agreed level.

A percentage-point difference simply subtracts two percentages. For example, 25% needing follow-up compared with a manageable level of 10% is **15 percentage points above** that level.

| Amount above the agreed manageable level | Proposed level |
|---|---|
| Up to and including 5 percentage points | Low |
| More than 5, up to and including 15 percentage points | Medium |
| More than 15 percentage points | High |

**Example:** In a privacy-safe group of 100 people, 25% need follow-up and the manageable level is 10%. The difference is 15 points: Medium. At 26%, the difference is 16 points: High.

**When more information is needed:** No manageable level has been agreed or the groups/periods do not match. Existing privacy rules withhold the result when the population has fewer than five people, or either the follow-up group or the remaining group has one to four people. A real explanation must not reveal a withheld count. This number alone never establishes Critical.

### 5.11 Average assessment score change

**What it means:** The average change between the same people's before-and-after assessment scores, compared on a 100-point scale.

**How to judge it:** Compare the actual average improvement with the approved expected improvement for the same assessment, group, and period. Here, the difference is measured in score percentage points, rather than the share of expected work used in Section 4.

| Amount below the expected improvement | Proposed level |
|---|---|
| Up to and including 5 points | Low |
| More than 5, up to and including 10 points | Medium |
| More than 10 points | High |

**Example:** The expected improvement was ten points. An actual improvement of five points is five points below expectation: Low. No improvement is ten points below: Medium. A one-point decline is eleven points below: High.

**When more information is needed:** There is no expected improvement, assessments are not comparable, or before-and-after records are incomplete. Results from fewer than five complete pairs are withheld for privacy. Five pairs do not automatically make a conclusion statistically reliable. This number alone never establishes Critical.

## 6. How several conditions work together

A condition is one check, such as Budget used is above 90%. A rule combines one or more checks. A severity criterion explains how serious the matching situation is. Adding checks to the rule and changing severity criteria are separate decisions.

**AND means all listed conditions must be met. OR means at least one must be met.** Keep grouped conditions together when working out what caused the alert.

For an AND group, one clearly unmet condition means that group does not match. If none clearly fails but a needed figure is missing, the group cannot yet be confirmed. For an OR group, one confirmed match is enough even if another group cannot be checked; keep that missing information visible.

For the conditions that actually caused the alert, start with the highest justified level. If two matching conditions are Medium and High, the starting result is High. Repeating a condition or checking the same figure twice does not increase the level.

### When a combination can support High

**Not enough recovery time:** All of these must apply: delivery is more than 10% behind its approved expectation; the relevant commitment is due at the approved project end; the project is within its manager-approved recovery-review period; and the approved recovery action needs more days than remain before that same end date. This can raise Medium to High. A recovery estimate for an earlier activity deadline cannot be compared with days remaining to the project end.

**High spending with low linked delivery:** At least 90% of the budget is used, and the related delivery is more than 25% behind its approved expectation. The figures must concern the same project, period, and required work, with no planned advance purchase explaining the difference. This supports High. Delivery is already High in this case; the spending figure explains the combined concern rather than adding another level.

Figures known only from a group that did not match must not be used to increase severity. Approved extra information, such as the project dates or a recovery review, must be identified separately and be available to the authorized reviewer.

### Examples using the conditions in the original brief

| Rule in ordinary words | Situation | Suggested result under this draft |
|---|---|---|
| More than 80% of project time has passed AND indicator progress is below 50%. | Time elapsed is 85%; progress is 45%; the approved expectation was 80%. | High because delivery is 43.75% behind. Time helps explain the situation; it has no separate severity. |
| More than 90% of the budget is used AND fewer than 40% of activities are complete. | Budget used is 95%; completion is 35%; expected completion was 80%. The spending relates to that work and no planned advance purchase explains it. | High because completion is 56.25% behind. The linked spending supports the concern. |
| The previous timeline, budget, and indicator concerns all occur together. | Time elapsed is 85%; budget used is 95%; indicator progress is 45% against an 80% expectation, with the linked spending explained. | High. Three concerns do not automatically become Critical. |
| EITHER the timeline-and-indicator group matches OR spending exceeds the budget. | Only 50% of time has passed, indicator progress is 10%, and spending is 105%. | The timeline-and-indicator group does not match. Only the budget condition causes the alert, giving Medium. The low indicator value inside the nonmatching group does not raise it. |

If several OR groups match, consider all matching groups. If another group has missing data, keep that fact visible without treating it as a confirmed concern.

## 7. Suggestions before and after an alert

### While the user is creating a rule

Show what the rule could mean before it is saved. This preview uses the rule and available approved planning information, rather than pretending to be a current project assessment.

A broad condition may cover several levels. Suppose the plan expected 80% progress and the user sets a rule for progress below 75%:

- Actual progress of 74% would be Low.
- Actual progress of 60% would be Medium.
- Actual progress of 40% would be High.

The preview should therefore say **Possible levels: Low, Medium, or High**, not force one fixed level. When the approved expectation changes by date, the preview must explain that dependency.

If the rule says the same indicator must be below 20% AND above 80% at the same time, show **These conditions cannot happen together**. Different indicators would need to be checked separately.

### When the alert actually occurs

Use the actual figures and the approved plan for that date. Show one supported level when possible, with a short explanation such as:

**Suggested severity: High. The plan expected 80% progress by today. Actual progress is 45%, which is 43.75% behind the expectation.**

If important information is missing, say what is needed. For example: **We need the approved expected progress for this date before suggesting a level.**

Missing detail does not have to block a known result if no possible answer could change its highest level. If spending already supports High and all other possible results are at most High, the result can remain High with the missing detail disclosed. If missing information could establish Critical, keep the overall result pending and explain that High is already supported.

A rule that does not match produces no alert severity. Later checks should keep their own evidence rather than silently changing the record of an earlier check.

## 8. When Critical may be suggested

Critical requires a specific manager-approved rule and the supporting evidence below. A very low progress number, high spending, or several High results is not enough by itself.

### Case A: an essential commitment has failed

All of the following must be established:

- The alert concerns a deliverable or milestone already identified as essential.
- Its approved deadline cannot be extended and is before the reporting date.
- The required work remains incomplete or unaccepted.
- An authorized manager's recorded recovery review confirms that the commitment cannot be met within the unchanged approved limits.
- No approved extension or waiver applies.

This can concern an essential activity even before the whole project ends.

### Case B: severe spending and delivery failure

All of the following must be established:

- More than 110% of the budget has been used.
- The linked required delivery is more than 50% behind its approved expectation.
- The project has reached or passed its scheduled end.
- The alert's spending and delivery figures relate to the same required output.
- An authorized manager's recorded review confirms that remaining approved funding or reallocation cannot deliver the output within the unchanged approved limits.
- No effective approved recovery, extension, or waiver applies.

**Example:** Spending is 120% of the budget, the project end has been reached, and required progress is 35% against an expectation of 100%. The project is 65% behind. If the approved funding/recovery review also confirms the remaining requirements, this can be Critical.

Exactly 110% spending or exactly 50% behind does not meet Case B. If a necessary requirement clearly fails, that Critical case does not apply even if another detail is missing. If missing evidence could make the case apply, request it instead of assuming either Critical or High.

These cases are proposals for manager approval, not automatic capabilities already added to PATHWAYS. Follow-up demand or assessment change alone cannot establish either case.

## 9. Can a user change the suggested level?

Yes, an authorized user can choose a different level, but must record a reason. Keep both the system's suggestion and the person's final choice.

**Example:** The system suggests High. After reviewing an approved recovery decision, the manager chooses Medium. The record should show the original High suggestion, the final Medium choice, the reason, who made the decision, and when.

Also keep the figures, relevant plan, and guide version used. If the system could not make a complete suggestion, a person's chosen level must be clearly recorded as a manual judgment. A manual Critical choice does not mean that the system's Critical requirements were met.

Changing the chosen level does not change the original facts, remove privacy restrictions, or permanently change the classification rules. When the same figures and approved rules are checked again, the system's own assessment should stay consistent.

## 10. What managers still need to approve

Managers should confirm whether the proposed limits are reasonable for their projects. The exact numbers are not established universal standards.

The review should cover:

- One to three conditions in the guided setup, advanced access to more complex rules, and whether users understand the difference.
- The four level descriptions and the proposed numerical limits for each type of result.
- What progress is expected at each reporting date, including work deliberately scheduled late.
- Which essential commitments and specific Critical cases apply.
- The manageable follow-up level and expected assessment improvement.
- The recovery-review period, valid reporting information, and response deadlines.
- The combination rules, missing-information messages, and recorded reasons for changed levels.

Managers should try the examples and representative anonymized local cases, record disagreements, agree changes, and check the revised examples again. Record the agreed version, reviewer, approval date, and effective date. Any unresolved differences should remain visible. No completed manager validation is claimed for this guide.

## 11. Should a rule have two conditions or three or more?

**Recommendation: support three or more conditions, but make one to three the normal guided experience.** Start with one condition. Let users add another when it helps describe the concern. Provide an advanced editor for four or more conditions or mixed AND/OR groups.

This is a proposed usability choice to check with managers, not a scientific severity limit. A useful rule can have just one condition. Users should not have to fill in three conditions to save a simple rule.

### What counts as one condition?

A condition contains a tracked number, a comparison, and a value. For example: **Budget used - above - 90%**. The unit comes from the selected number. An indicator condition also identifies the particular indicator being watched.

The count applies to the whole rule, not to each metric. A rule may check several different metrics, or use two comparisons on the same metric. An inclusive range, such as progress between 20% and 50%, can use one Between condition. Between includes both endpoints; it must not replace strict above/below comparisons if those endpoints are meant to be excluded.

| Number of conditions | When it is useful | Recommended setup |
|---|---|---|
| One | A clear concern that can stand alone, such as a total budget overrun. | One visible condition row. |
| Two | A relationship, such as high spending AND low delivery. | Guided setup with a clear All or Any choice. |
| Three | A third relevant detail, such as high spending AND low delivery AND an approaching deadline. | Guided setup, with one sentence explaining the complete rule. |
| Four or more | A justified situation that needs more checks or alternative groups. | Advanced editor, with clear grouping and the same review/test tools. |

### When to add the third condition

Add it when it changes the situation the team wants to detect. For example, a team may want to raise a particular alert only when the project is close to its end, rather than throughout delivery.

An extra AND condition makes the rule more specific: the alert will wait until that condition is also met. An extra OR condition creates another way for the rule to match. Either change can affect which alerts appear; neither guarantees a more accurate severity.

Do not add a condition just to make a rule look stronger or to turn High into Critical. Also do not add a budget or timeline check to replace a missing approved progress expectation. The approved plan is information needed to interpret the result, whether or not it appears as a user-created condition.

### Example of a three-condition rule

The user chooses All conditions must match, then adds:

- Budget used is above 90%.
- Activities completed are below 40%.
- Days until project end are between 0 and 14, including both endpoints.

The preview reads: **Raise an alert when budget used is above 90%, activities completed are below 40%, and the project ends within the next 14 days.**

If spending is 95%, completion is 35%, and ten days remain, the rule matches. To suggest severity, the system still needs the approved activity completion expected for that date and the relevant spending explanation. If expected completion was 80% and the other approved context is satisfied, the delivery gap supports High under this draft. It is not Critical simply because three conditions matched. The fourteen-day choice is the user's trigger value, not a universal severity boundary.

### Keep the underlying rule support flexible

The current rule validator already allows up to 32 conditions and four levels of grouped conditions. Keep these as bounded technical limits unless a separately approved change revises them. They do not mean that users should normally write 32-condition rules, or that performance has already been proven for every possible workload.

In the proposed interface, adding a fourth condition opens or offers the advanced editor while preserving the existing three. A rule with mixed AND/OR groups also belongs there, even if it has only three conditions. Never shorten an existing complex rule or discard conditions to make it fit the guided view.

Do not automatically split a long AND rule into several independent rules. The original required all its checks together; separate rules could raise alerts when only some checks match. Independent concerns can have separate rules when that change in meaning is intentional.

## 12. How to keep classification scalable and maintainable

Scalable means the approach can support more rules and projects without an uncontrolled increase in work. Maintainable means a change to one approved criterion can be understood, reviewed, and checked without rewriting many unrelated cases.

### Define the meaning of each metric once

Keep one approved description and interpretation for each tracked number: its unit, valid values, source, required planning information, and severity limits. Use those same definitions in creation, testing, and alert explanations.

For example, the definition of Budget used should continue to count approved expenses only. Another screen should not quietly count pending expenses or apply a different budget percentage.

### Use one consistent classification process

Use the same approved decision process for simple rules and advanced rules:

1. Check the rule and its groups.
2. Identify the conditions that actually caused the match.
3. Interpret the matching results using the relevant metric criteria.
4. Consider approved special combinations and Critical cases.
5. Explain the highest justified level, or request the missing information.

The official calculation should be performed by the trusted application service, using approved project information. The browser displays the outcome and helps the user understand it. It should not independently invent an alternative severity calculation.

Authoring previews, sample tests, and actual alerts should share these definitions and decision rules. Their inputs differ: a preview considers possible future values; a sample test uses clearly identified examples; an actual alert uses trusted observations for its reporting date. A preview range and a single actual rating can therefore both be correct.

### Avoid a separate policy for every possible combination

Do not maintain one table for every pair, triple, and larger set of metrics. That would become difficult to review as the catalog grows.

Instead, use the individual metric criteria, the consistent All/Any group evaluation, and a small, named list of approved special combinations. Every special combination must explain what evidence it needs and which result it can produce. Unusual combinations with no reliable interpretation should ask for context rather than receive an invented score.

When a new metric is added, define its interpretation and test its effect on the existing process. Add a new special combination only when there is a justified business need. Do not assign different weights or average severity labels without a separately approved policy.

### Keep work bounded and use consistent information

Retain condition and group limits. Avoid repeatedly loading the same project figure when several conditions use the same observation. Evaluate every condition for the explanation, while reusing an identical source result when appropriate.

Use the same reporting date, approved plan, population, and source version for a given assessment. Check access before retrieving information and preserve project and privacy restrictions in previews, tests, and alerts. More conditions never grant access to more sensitive data. User-created rules remain structured choices, not free-form formulas, SQL, or executable code.

Measure performance with representative simple and advanced rules before claiming that the implementation scales. The number of projects, rules, source reads, and evaluation frequency all matter; condition count alone does not establish performance.

### Record which approved policy produced the result

Attach a version to the approved criteria and keep it with the alert evidence, rule version, actual figures, applicable plan, and explanation. A later policy revision must not silently rewrite older alerts. Applying a new criteria version to future evaluations needs an explicit approved transition.

Keep human overrides alongside the system result as described in Section 9. Rechecking the same rule, facts, plan, and criteria version should produce the same system assessment. Reordering equivalent conditions should not change severity.

## 13. How to make the rule builder user-friendly

The proposed interface should help users answer four ordinary questions: What am I watching? When should I be alerted? How serious might it be? What should the team do?

### Step one: name the rule and choose its project

Use a descriptive name, such as Low delivery near project end. Make the selected project or organization template obvious. Explain the relevant scope in everyday terms: project schedule, indicator results, activity delivery, budget spending, beneficiary follow-up, or assessment scores.

Offer a few approved examples as optional starting points. Users must still review the conditions, context, and response before activation. An example must not imply that its thresholds have already been approved for every project.

If a choice needs a specific project or record, explain that requirement beside the control. Do not leave a disabled option unexplained. Changing scope should preserve compatible input and explain any incompatible input that must change.

### Step two: define what should cause the alert

Show one condition row initially. Use readable labels such as Budget used, above, and 90, with the percentage unit shown automatically. Provide a short definition and a small example for the selected metric.

Use Above, At least, Below, At most, Equal to, and Between. Explain whether an endpoint is included when this matters. For Between, ask for the lower and upper values and explain that both endpoints count.

After another condition is added, show **All conditions must match** or **At least one condition must match**. Give a nearby example of the selected meaning. Keep Add condition and Remove condition visible and preserve input while users edit.

Use the guided view for one to three conditions in one All or Any group. Offer one clearly labelled Advanced editor entry point for additional conditions or grouped alternatives. Returning from advanced editing must preserve the complete rule; a rule that no longer fits the guided view remains advanced.

### Show grouped alternatives clearly

For example, Group A might require both high spending and low delivery. Group B might check that the project is overdue. If the user chooses At least one group must match, either complete group can raise the alert.

Show the group boundaries and their meaning. Do not mix AND and OR in one ungrouped sentence. The user should be able to explain the rule without knowing mathematical brackets.

### Step three: review meaning and suggested severity

Keep a live plain-language summary next to the conditions. Separate **When this alert happens** from **Suggested severity**, so users do not mistake a trigger threshold for a severity boundary.

| Display | Example of clear wording | User's next action |
|---|---|---|
| One supported preview level | These conditions support Medium under the selected approved plan. | Read the explanation and review the rule. |
| Several possible levels | Possible levels: Low, Medium, or High. Actual severity depends on the values when the alert occurs. | Review sample situations using Test rule. |
| Missing planning context | We need the approved activity completion expected by this date. | Select or provide the approved plan through the authorized process. |
| Missing or protected source data | This condition cannot be checked with the available data. | Review the permitted availability message; never reveal protected counts. |
| Contradictory conditions | The same indicator cannot be below 20% and above 80% at the same time. | Change the comparisons or grouping. |

Ask for each missing item specifically. Keep a usable draft while the person obtains it; do not replace missing context with Medium. Any permitted manual choice must remain a recorded human judgment. It cannot make unavailable or suppressed data usable.

A suggested value or range should change as conditions are edited, but must not silently overwrite a person's saved or manually chosen severity. If a complete new suggestion is available, Use suggestion is a deliberate action. Critical follows Section 8 and requires approved evidence; an extra condition is not a shortcut to it.

### Step four: review the response, test, and save

Let the user review predefined response text describing what the team should consider. Responses remain advisory and require a human decision. Preserve the user's edits; a recommendation does not automatically move funds, change deadlines, or resolve the concern.

Provide Test rule before activation. Clearly distinguish Try sample values from any authorized test of current project data. Sample figures must be labelled as examples. The test should show which conditions matched, which complete groups matched, the suggested severity or missing context, and the explanation. It must create no live alerts, recommendations, notifications, or management actions.

Allow a draft to be saved without activating it. Before activation, review the project, complete valid conditions, approved criteria and required planning information, severity handling, response text, and intended recipients. A valid preview range is not an error; actual-value classification remains separate. Drafting or activation must never authorize new data access.

### Keep the controls accessible

Use text labels alongside severity colors. Make every operation usable with a keyboard, show visible focus, and associate errors with the field that needs attention. Put essential explanations on the page rather than only in hover tooltips. Keep text readable at larger zoom levels and preserve input after a recoverable error.

These choices use progressive disclosure: common options appear first, and advanced controls are available when needed. It helps manage complexity, but user testing must confirm that the chosen split fits PATHWAYS work.

## 14. How to check correctness and ease of use

A correct engine and an understandable interface both matter. A person should know why a rule matched and why a level was suggested.

### Classification and rule checks

| Scenario to check | Expected behavior |
|---|---|
| One, two, three, and advanced multi-condition rules | The same approved classification process applies at every size. |
| All conditions versus at least one condition | The alert follows the selected meaning and visible group boundaries. |
| A true condition inside a group that does not match | It does not increase severity. |
| The same figure appears twice | Keep both comparisons in the explanation without counting the evidence twice for escalation. |
| Exact limits such as 10% and 25% behind plan | Use the correct inclusive boundary from Section 4; do not round into a different level. |
| Spending is high but planned, and delivery is on track | Do not infer a serious concern from spending percentage alone. |
| A required plan is absent, or a source is missing or suppressed | Give the specific permitted explanation; never invent zero or Medium. |
| A broad rule covers several possible levels | The preview shows the attainable levels; an actual alert uses actual values. |
| Several High concerns or an incomplete Critical review | No automatic Critical based on condition count or missing evidence. |
| Equivalent conditions are reordered | Same system result with the same facts and policy version. |
| Rule tests and attempts to view another project | Tests create no live effects; access restrictions remain in force. |
| A saved advanced rule is opened in the guided builder | No conditions or grouping are lost or flattened. |

Also check a known-false requirement within a Critical case. For example, spending of 95% cannot satisfy the case requiring more than 110%, even if the recovery review is unavailable. Test the effects of approved plan/criteria revisions on future checks while preserving historical explanations.

### Tasks for program and project managers

Use representative participants and realistic synthetic or anonymized scenarios. Ask them to perform the tasks without telling them which buttons to use:

- Create a straightforward one-condition rule.
- Create a two-condition rule and explain whether both conditions must match.
- Add a useful third condition and explain how it changes when the alert appears.
- Add a fourth condition or a grouped alternative through the advanced editor.
- Read the preview and distinguish a possible severity range from an actual alert rating.
- Explain a missing-plan message and identify the next action.
- Test a rule without creating a real alert.
- Review or change a suggested level and record the reason.

Observe whether the person completes the task correctly, how long it takes, where they make mistakes, and how much help they need. Ask them to explain the rule and severity in their own words. A visually attractive screen is not enough if they misunderstand All versus Any or assume three conditions mean Critical.

Fix observed problems and repeat the affected tasks. Set acceptance targets with the team before formal evaluation rather than inventing a success percentage after testing. Do not claim the interface is user-friendly until the evidence supports it.

## 15. What exists today and what this guide proposes

The repository already supports bounded multi-condition rules. The current guided builder offers plain-language metric labels and All/Any choices, with an advanced route for grouped rules. Its authoring severity aid uses configured conditions rather than live project observations, suggests supported Low/Medium/High or Needs your judgment, and reserves Critical for manual selection.

This guide proposes a broader framework for review: progress expectations for the reporting date, actual-value severity when an alert occurs, specific Critical evidence, recorded reasons for changed levels, and a guided one-to-three-condition experience with more complex rules available in advanced editing. These proposed additions must not be mistaken for completed application changes.

Before implementation, managers must validate the severity criteria and the team must approve the relevant product/technical contract changes. The implementation must define where approved planning and recovery information comes from, how criteria versions apply, and how repeated checks of an existing alert are recorded. Human decisions and earlier evidence must remain recoverable.

Then implement within that authorized scope, run the appropriate correctness, privacy, access, accessibility, and performance checks, and evaluate the interface with users. Any later deployment or database work follows its own authorized process. Editing this guide does not carry out those steps.

## 16. Where the ideas come from

The supplied severity brief establishes the intended direction. These references support the approach:

- IFRC monitoring and evaluation guide, 2011, printed pages 46-47 and 55: compare results with approved targets and communicate performance clearly. Its guidance to explain variance above 10% does not validate the severity limits proposed here.
- PMI, The earned schedule, 2012: distinguish time passed, work achieved, and spending. Ordinary spending and completion percentages do not automatically measure cost efficiency.
- MetricStream risk matrix guide: use clear criteria and review them with stakeholders. Its likelihood-and-impact method concerns future risk; this guide assesses observed project performance.
- Nielsen Norman Group, Progressive Disclosure: offer common features first and reveal advanced controls when needed. This supports the simple/advanced approach, not a universal three-condition limit.
- Nielsen Norman Group, Turn User Goals into Task Scenarios for Usability Testing: check realistic user goals through representative tasks rather than instructions that give away how to use the screen.

The numerical limits, special combinations, and proposed one-to-three-condition guided setup are PATHWAYS choices to validate. The references do not independently approve them. The limits of 32 conditions and four group levels are verified repository facts as of 18 October 2026, not usability recommendations or completed performance certification.

The original detailed draft, dated 17 October 2026, remains background for the earlier classification proposal. This revised plain-language guide includes the newer condition-count, maintenance, and usability recommendations. Neither document replaces an approved repository contract.
