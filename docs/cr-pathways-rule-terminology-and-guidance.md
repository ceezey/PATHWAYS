# Change Record: Rule Terminology and Guidance

**ID:** `cr-pathways-rule-terminology-and-guidance`  
**Date:** 2026-10-15  
**Status:** Applied 2026-10-16

## 1. Trigger

The developer approved clearer, plain-language terminology and in-context guidance for the existing four-step rule form. The purpose is to make rule creation understandable for people who find it difficult, without changing the typed rule runtime.

## 2. Current Contract

PRD-F10 and PRD-F11 require typed deterministic rules, human review, stored thresholds, severity, and recommendation text. The guided-rule setup keeps an inline four-step Create rule flow, six selectable scopes, typed operators, All/Any grouping, project and Organization-template scope restrictions, and editable recommendation text. The existing metric catalog uses `SURVEY_MEAN_IMPROVEMENT_POINTS` internally for the Assessment aggregate.

The current UI labels the Assessment metric as “Survey mean improvement” and exposes labels, units, and condition summaries without sufficient metric-specific explanation. The runtime metric catalog and evaluator remain the source of truth for calculations, availability, suppression, source eligibility, and authorization.

## 3. Approved Change

### Terminology and calculation boundaries

Keep these six scopes: Project, Indicator, Activity, Budget, Beneficiary Group, and Assessment. Assessment means scored knowledge or skill tests; no Survey scope or survey metric is added. Replace all user-facing “Survey mean improvement” wording with **Average assessment score change**, while retaining `SURVEY_MEAN_IMPROVEMENT_POINTS` as the stored identifier.

| Scope | User-facing metric | Definition and unit |
|---|---|---|
| Project | Project timeline elapsed | Percentage of scheduled project duration that has passed; it measures time, not work completed. |
| Project | Days until project end | Calendar days until the scheduled end date; a negative value means the date has passed. |
| Project | Days past project end | Calendar days beyond the scheduled end date; otherwise zero. |
| Indicator | Current indicator value | Latest value of the selected indicator in its measurement unit. |
| Indicator | Progress toward indicator target | Percentage progress from the indicator baseline toward target, using its direction. |
| Activity | Activities completed | Percentage of eligible activities marked completed. |
| Activity | Number of overdue activities | Count of unfinished activities past their planned end dates. |
| Activity | Days activity is overdue | Calendar days that a selected unfinished activity is past its planned end date. |
| Budget | Budget used | Approved expense total as a percentage of planned budget total; the form identifies the counted spending basis. |
| Beneficiary Group | Beneficiaries needing follow-up | Percentage of active enrollments whose latest participation record indicates follow-up is needed; it is not follow-up completion. |
| Assessment | Average assessment score change | Average post-test minus pre-test score after conversion to a 0–100 scale. Unit: percentage points. Negative values indicate a decline; for example, 60% to 75% changes by 15 percentage points. |

Before implementation, verify each description against the existing calculation. A material contradiction stops this wording change for the affected metric; calculations are not changed to fit copy.

### Four-step guidance

1. **Name and scope:** explain beside each choice whether it covers project schedule, indicator results, activity delivery, budget spending, beneficiary follow-up, or assessment scores. Preserve hover/focus tooltips and assistive descriptions for unavailable scope choices.
2. **What are you watching?:** show the selected metric’s definition, unit, a clearly labelled worked example, and whether it monitors a selected record or a project aggregate. The creator must enter every threshold: examples never populate a field or become an implicit default. Preserve typed operators and All/Any behavior.
3. **How should this read?:** describe severity as alert urgency. Preserve the suggestion and deliberate selection behavior, including Critical.
4. **What should the system recommend?:** keep suggested recommendations aligned with the selected scope. Preserve user edits and saved recommendation text.

Use the same terminology in the preview and tables. For example: “Raise a Medium alert when average assessment score change is below 10 percentage points.” Keep the human-review explanation. Missing, suppressed, or privacy-protected data remains unavailable and is never displayed or treated as zero.

### Compatibility limits

This is a wording and guidance change only. Preserve calculations, metric identifiers, API payloads, saved thresholds, authorization, suppression, source eligibility, runtime availability, organization-template filtering, historical snapshots, and user-authored content. Add no schema change, migration, dependency, selectable metric, or Survey scope.

### Deferred candidates

The following are documented only, not implemented:

| Candidate | Definition | Data required |
|---|---|---|
| Participants with improved assessment scores | Percentage of valid paired assessment participants whose post-test score exceeds pre-test score after 0–100 conversion. | Linked valid pre/post score pairs, participant eligibility, suppression policy, and authorized aggregate source. |
| Remaining budget | Planned budget total less the approved expense total, in a single supported currency. | Non-archived planned budget, approved expenses, and the current multi-currency availability policy. |

## 4. Impact

### Product

The existing rule form explains what each choice means without changing rule semantics or human control.

### Data / Migration

No schema, migration, snapshot rewrite, or persisted data change.

### Authorization / Privacy

Existing server authority, source-read restrictions, aggregate-only Beneficiary treatment, availability and suppression remain unchanged.

### API

No API contract or payload change.

### UI

The rule board and advanced editor use one catalog of user-facing metric terminology. Guidance is keyboard accessible and examples are non-mutating explanatory text.

### Tests

Verify labels, definitions, units, examples, record/aggregate explanations, Assessment percentage-point wording, unsaved examples, existing create/edit and advanced-editor behavior, preserved saved values, consistent tables and preview copy, scope/template filtering, unavailable/suppressed behavior, and accessible helper descriptions.

### Documentation

The canonical DSD, materialized design reference, rule-creation runbook, and index are reconciled with the implementation.

## 5. Alternatives Considered

- A template-first experience was rejected: the developer chose to improve the existing form.
- Renaming the internal Assessment metric identifier was rejected because it would break compatibility without product value.
- Adding Survey metrics or the two deferred candidate metrics was rejected for this scope because their availability and privacy contracts need separate approval.

## 6. Migration / Rollback

No migration is required. Reverting the UI copy and guidance restores the previous presentation without changing rules, thresholds, snapshots, recommendations, API data, or evaluator behavior.

## 7. Verification

1. Verify the approved definitions against current evaluator calculations before implementation and surface a material contradiction.
2. Review the documentation diff and run `pnpm docs:check` before implementation.
3. Run focused web tests for the guidance and existing create/edit/advanced editor behavior, workspace typecheck, web build, and documentation checks.
4. Exercise applicable PRD-F10/F11 and QAD happy, sad, abuse, privacy, suppression, scope, and accessibility scenarios.
5. Run SAD pre-review, final digest-bound review, and `pnpm sad:signoff` with valid external evidence.

## 8. Approval

Developer-approved plan, 2026-10-15. The developer explicitly authorized implementation of this exact scope and no further approval is required for it.

## 9. Disposition

Applied 2026-10-16. The implementation retains every typed metric identifier, calculation, payload, threshold, authorization, suppression, source-eligibility and runtime-availability boundary. The focused catalog (12), drawer (18), and advanced-editor (24) tests, web typecheck, isolated production web build, `pnpm docs:materialize`, and `pnpm docs:check` passed. Final digest-bound SAD design and rule-engine reviews, plus sign-off, passed.
