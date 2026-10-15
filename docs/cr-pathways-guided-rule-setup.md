# Change Record: Guided Alert and Recommendation Rule Setup

**ID:** `cr-pathways-guided-rule-setup`
**Date:** 2026-10-15
**Status:** Applied 2026-10-15; R1-R5 verified on `dev` commit `d36cd7de`

## 1. Trigger

The developer requested a simpler rule setup for the October 18 panel revision. The four-step builder currently leaves scope compatibility partly implicit, asks the administrator to choose severity without a suggestion, and starts recommendation-rule text empty or alert-rule text with a generic response. The developer approved the choices in section 3 on 2026-10-15. Delivery is to the development preview; production release is outside this change.

## 2. Current Contract

PRD-F10 and PRD-F11 require typed deterministic rules, a stored alert severity, and predefined recommendation text retrieved from rule configuration when an alert fires. The system does not generate or execute a recommendation at runtime. The rule contract stores one severity and 1 to 10 recommendations per rule. The existing permission, project scope, source-read, and small-cell protections remain authoritative.

The current `/alerts/repository` Create rule tab renders an inline four-step builder. Existing rules open in a side panel, and nested condition trees use the advanced editor. The builder filters metrics by checked Applies To families and hides record-bound metrics for Organization templates. The locked DSD section 4 rule-configuration paragraph and [rules-board UI Change Record](cr-pathways-rules-board-ui.md) still describe creation in a drawer. This is a verified documentation drift, not an instruction to restore the old creation flow.

## 3. Approved Change

### Step 1: Name and scope

- With **Organization template** selected, gray and disable the Indicator checkbox because every Indicator metric requires a project record. Keep Activity selectable for its aggregate metrics, but exclude the activity-record metric. With a project selected, allow every family supported by the current typed metric catalog.
- Explain an unavailable checkbox with a tooltip shown on hover and keyboard focus, while retaining an assistive-technology description linked to the focusable wrapper. Require at least one selected family. A scope change preserves compatible conditions, clears incompatible metric rows and record bindings, and tells the user what was cleared. If no row remains, show an empty condition row using an available metric and require its threshold before save.

### Step 2: What are you watching?

Keep the existing checkbox-driven metric filtering and typed condition fields. An excluded metric must not remain selectable or be submitted after a Step 1 change. Record-specific choices remain scoped to the selected project. No free-text metric expression, SQL, or code is added.

### Step 3: How should this read?

- Show an editable **Suggested severity** and a short reason based only on the configured metric, operator, and threshold, never on an unobserved live value. Suggest **High** only when an overdue condition necessarily matches a value above zero; suggest **Low** only when an indicator-progress or activity-completion condition necessarily matches at least 100%; suggest **Medium** otherwise. For multiple conditions, use the highest suggestion in the order High, Medium, Low. Do not automatically suggest Critical.
- A user may choose any existing severity, including Critical. Preserve a manual choice while conditions change and offer **Use suggestion** to restore the current suggestion. Existing rules retain their stored severity on open. The saved value, not the suggestion, appears in the preview and request.

### Step 4: What should the system recommend?

Prefill a new rule with a predefined, editable title and response matched to its metric family. For mixed families, use the combined-signals response. Refresh the prefill when the metric family changes only while neither field has been edited by the user; never overwrite user text or a copied saved recommendation. Existing rules retain their stored recommendations. Keep saved-recommendation reuse and the 1 to 10 recommendation bound.

| Family | Initial title | Initial suggested response |
|---|---|---|
| Project | Review project timeline | Check the current schedule and recorded evidence with the project team, then agree on a follow-up. |
| Indicator | Review indicator result | Verify the latest indicator measurement and its target context with the project team, then agree on a response. |
| Activity | Review activity progress | Check the activity status and recorded evidence with assigned staff, then agree on a follow-up. |
| Budget | Review budget utilization | Review approved spending and remaining allocation with authorized budget staff before considering any adjustment. |
| Beneficiary Group | Review aggregate follow-up | Review the aggregate follow-up trend with authorized project staff and agree on a privacy-preserving response. |
| Assessment | Review assessment results | Check the aggregate assessment results and data quality with the project team, then agree on an improvement action. |
| Mixed families | Review combined signals | Review each condition and its recorded evidence with the project team, then agree on a response. |

These are authoring aids. At evaluation time the system retrieves the administrator's saved recommendation text and requires human review before an outcome. It never generates text or takes the recommended action.

## 4. Impact

### Product

Rule creation and editing use clearer starting choices. The authorized rule lifecycle and human decision remain unchanged.

### Data / Migration

No schema change, migration, seed, or stored template library. Existing rule records retain their exact saved severity and recommendation text.

### Authorization / Privacy

Rule administration remains under existing permissions. Project bindings and source-read restrictions stay server-authoritative. Built-in Beneficiary wording references aggregates only and contains no person-level detail.

### API

No route or request/response contract change. The existing validated rule payload carries the user's final severity and recommendation text.

### UI

The inline Create rule tab and existing edit panel receive the guided behavior. Disabled controls need text explanations and keyboard-visible focus; color alone must not communicate availability or severity.

### Tests

Add focused builder tests for scope transitions, condition clearing, aggregate Activity availability, suggestion and override behavior, prefill preservation, editing an existing rule, save payloads, and accessible disabled-state explanations. Existing rule-contract, QAD-T09/T10, and QAD-A08 behavior remains required.

### Documentation

This Change Record and its index entry are the docs-first approval. After implementation is verified, reconcile the locked DSD's drawer description with the inline creation flow and update [the rule-creation test script](runbook-rule-creation-test.md) with the shipped fields and manual scenarios. Do not mark the planned behavior as shipped before verification.

## 5. Alternatives Considered

- A fixed automatic severity was rejected because the administrator must be able to correct context the metric cannot express. Critical remains a deliberate human choice.
- A managed recommendation-template library was deferred because the current rule already stores predefined text and can copy saved recommendations. Built-in authoring examples satisfy the immediate need without new persistence.
- Disabling the whole Activity family for Organization templates was rejected because aggregate Activity metrics are valid there.

## 6. Migration / Rollback

No database migration is needed. If the guided UI must be reverted, restore the prior builder code while retaining existing rule records and the unchanged API contract. The recommendation text already saved on a rule is never rewritten by this change.

## 7. Verification

1. Review the documentation-only diff and run `pnpm docs:check` before implementation.
2. Run the relevant web tests, typecheck, build, and accessibility checks after implementation. Verify the happy, sad, and abuse scenarios in section 4 and the existing QAD rule rows.
3. Follow the SAD pre-review, final digest-bound review, and sign-off pipeline on the changed paths. Integrate through R1 to R5 and verify both development previews before reporting the October 18 target complete. Production R6 is outside this handoff.

## 8. Approval

Developer direction on 2026-10-15 selected disabled incompatible scope choices while keeping aggregate Activity available, an editable severity suggestion with Critical reserved for explicit selection, and built-in metric-specific recommendation text prefilled but editable. The developer approved documenting these decisions before a separate Terra implementation session.

The developer amended Step 1 on 2026-10-15: remove the persistent visible explanation beside an unavailable scope choice. Hovering the unavailable choice or moving keyboard focus to its wrapper opens the same explanation in a tooltip; Escape and blur dismiss it. The disabled native checkbox, typed scope compatibility, and assistive-technology description remain unchanged.

## 9. Disposition

Applied 2026-10-15 after the focused rules-board suite (39 tests), workspace typecheck, web production build, SAD final review and digest-bound sign-off verified the shipped behavior. The Locked DSD, materialized design reference and rule-creation runbook now describe the inline Create rule flow. R1 passed on `feat/guided-rule-setup`; R2 merged cleanly into `integration/guided-rule-setup`; renewed R3 SAD sign-off and R4 requirements QA passed on digest `2e1997a9b5692dc6665a88a39a1d4f1b181803d75c7cc3cdd2523d5ee2f265cf`; R5 merged and pushed `d36cd7de` to `dev`. The exact API preview was Ready and returned HTTP 200 from `/api/health`; the exact protected web preview was Ready and returned its expected Vercel SSO HTTP 302 from `/alerts/repository`. The hover/focus-hint amendment then passed R1 and renewed R3 SAD sign-off, R4 requirements QA, workspace typecheck, API and web tests, API and web builds, and `docs:check` with 0 failures and 0 warnings. R5 pushed `26d132c0` to `dev`; the exact API preview was Ready and returned HTTP 200 from `/api/health`, and the exact protected web preview was Ready and returned the expected Vercel SSO HTTP 302 from `/alerts/repository`. R6 production deployment is outside this Change Record.
