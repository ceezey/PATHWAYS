# Change Record: Metric-Aware Rule Severity Guidance

**ID:** `cr-pathways-rule-severity-guidance`  
**Date:** 2026-10-16  
**Status:** Applied locally 2026-10-16  
**Partly superseded by:** [cr-pathways-severity-classification](cr-pathways-severity-classification.md) (2026-10-19): alerts take a severity suggested from actual figures, and the Step 3 Low/Medium/High aid is replaced by a preview of possible levels and a manual Critical mark.

## 1. Trigger

The developer reported that the condition-only severity aid remained Medium across metric families. The prior guided-rule policy only recognized positive overdue conditions and target attainment, then used Medium as a fallback. On 2026-10-16, the developer approved a conservative metric-family policy that makes uncertainty explicit instead of treating it as Medium.

## 2. Current Contract

PRD-F10 and PRD-F11 require typed, deterministic rules, stored alert severity, predefined recommendation text, and human review. The rule builder keeps metric, operator and threshold as typed configuration; it does not fetch live metric values to author a rule. The guided-rule Change Record permits a condition-only editable suggestion, reserves Critical for manual selection, and preserves saved/manual severity values.

The implemented suggestion currently recognizes only certain overdue and completion comparisons, otherwise suggesting Medium. It does not distinguish incomplete, invalid, broad, or context-dependent conditions from a supported Medium suggestion.

## 3. Approved Change

Replace only the earlier narrow condition-only suggestion paragraph in `cr-pathways-guided-rule-setup` with this authoring policy:

- Scope means metric family: Project, Indicator, Activity, Budget, Beneficiary Group, or Assessment.
- The suggestion derives only from the configured family, metric, typed operator, and threshold or threshold range. It makes no live metric-data request and is not a measured project-risk rating.
- A typed result distinguishes a supported Low, Medium, or High suggestion from **Needs your judgment**, with an accessible, condition-specific reason. Critical is never suggested.
- Evaluate the entire matching interval after intersecting it with the metric's validated domain. Invalid, empty, malformed, reversed, impossible, mixed-interpretation, incomplete, or context-dependent comparisons yield Needs your judgment rather than a default severity.
- Supported metric interpretations are: positive overdue Project/Activity conditions High and zero-only conditions Low; passed Project remaining days High and a finite creator-defined nonnegative remaining-days window Medium; indicator progress at least 100% Low and under 100% Medium; activity completion at 100% Low and under 100% Medium; budget above 100% High; positive Beneficiary follow-up Medium and zero-only Low; negative Assessment change Medium and positive-only change Low. Timeline elapsed percentage and raw indicator values need judgment. The exact endpoint and range semantics are implemented and tested using the shared exact-decimal and rule-domain validation.
- Multiple supported constituent conditions select the highest priority High, Medium, then Low for All and Any groups. Any unavailable constituent makes the rule-level result Needs your judgment. Nested stored trees are examined without flattening or altering them.
- Changing family, metric, operator, threshold, range, or grouping recomputes the displayed suggestion only. **Use suggestion** is disabled when unavailable and adopts only a displayed supported severity. Manual selections, including Critical and existing saved values, remain selected until the user deliberately changes them.

This change does not alter persisted severity enums, stored conditions, API payloads, authorization, metric runtime calculations, rule evaluation, suppression, recommendations, or the required human decision.

## 4. Impact

### Product

Administrators receive a conservative, explainable authoring aid that exposes missing context instead of presenting an unsupported Medium priority.

### Data / Migration

No schema, migration, seed, or persisted-record rewrite.

### Authorization / Privacy

No new reads or writes. Suggestions use only already configured values; Beneficiary guidance remains aggregate-only and never infers person-level seriousness.

### API

No request, response, or runtime evaluation change. The existing selected severity enum remains the only submitted severity value.

### UI

The four existing severity choices remain. The suggestion panel presents a supported level and reason, or Needs your judgment with its visible reason and a disabled explained action.

### Tests

Add semantic-boundary coverage for all admitted metrics and typed operators; exact decimal, domain, grouping, nested-tree, manual-selection, saved-rule, and unavailable-accessibility behavior; retain relevant F10/F11/QAD coverage.

### Documentation

Reconcile the canonical DSD rule-configuration paragraph and rule-creation runbook after verified implementation, regenerate materialized references, and register this record in the index.

## 5. Alternatives Considered

- Keep Medium as the generic fallback: rejected because it incorrectly implies supported urgency when configuration is incomplete or lacks delivery context.
- Query current project data or calculate live risk: rejected because authoring guidance must not create unapproved reads, forecasts, or a risk-scoring system.
- Add a general scoring framework or numeric urgency bands: rejected as unnecessary, unsupported by the approved policy, and inconsistent with human-reviewed deterministic rules.

## 6. Migration / Rollback

No migration is needed. Reverting the local authoring helper and presentation restores the former UI without changing existing rules, severity values, conditions, recommendations, APIs, or metric calculations.

## 7. Verification

1. Run SAD pre-review before application implementation, including design QA and an explicit rule-engine determinism review.
2. Run focused rules-board and shared rule-contract tests, web typecheck and production build, formatting checks, `pnpm docs:materialize`, and `pnpm docs:check`.
3. Exercise relevant PRD-F10/F11 QAD-T09, QAD-T10, QAD-T24, QAD-T67, and QAD-A08 regression coverage without claiming that UI-only tests replace runtime/database acceptance.
4. Re-run digest-bound SAD review and `pnpm sad:signoff` against final content before changing this record to Applied.

## 8. Approval

Developer-approved handoff, 2026-10-16. Approval covers this local implementation only: no commit, push, deploy, migration, hosted-data change, or release phase.

## 9. Disposition

Applied locally 2026-10-16. The condition-only authoring aid now distinguishes supported Low, Medium and High guidance from Needs your judgment; it preserves manual and saved severities, never suggests Critical, and makes no live data request or API/runtime change. Focused model and drawer tests, shared rules tests, web typecheck and production build, edited-path formatting/lint, materialization, docs validation, final design QA, explicit rule-engine determinism review and SAD sign-off passed. Final digest-bound evidence is retained under `.tmp/sad/20261016-rule-severity-guidance/`. No commit, push, deployment, migration, hosted-data change or release was performed.
