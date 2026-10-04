# Change Record: Indicator Form and Type

**ID:** `cr-pathways-indicator-form-and-type`  
**Date:** 2026-10-04  
**Status:** Approved by the product owner (2026-10-04)

## 1. Trigger

The product owner asked for a simpler Add project indicator form and for indicators to carry a type such as Output, Outcome, Budget or Survey score.

## 2. Current Contract

The form exposed every definition field: code, unit label, authority, numeric domain, direction, decimal places, period, baseline and target. `project_indicators.indicator_type` existed but was always OUTPUT, because the INDICATOR_CREATE source operation hard-coded it.

## 3. Change

- The form shows Name, Type, Target, Recipe, a recipe card and Source description.
- The indicator code is generated from the name: initials plus the first free two-digit number, for example HR-01.
- Hidden defaults:
  - authority DERIVED;
  - direction Higher is better;
  - numeric domain and unit from the recipe;
  - 2 decimal places, or 0 for counts;
  - baseline 0;
  - period from the project dates, capped at 365 days.
- The target stays editable for every recipe; Activity completion % pre-fills 100.
- Only Activity completion % is offered, because the database computes no value for the other recipes yet.
- Recipe-specific inputs, such as a form recipe's unit label, sit in the recipe card.
- Type is optional in the API contract and defaults to OUTPUT.
- Migration 0056 lets `canonical_source_request` accept `indicatorType` and has `f10_begin_source_operation` use it in the expected row.
- Existing manual indicators and library entries keep the manual measurement path (UC-F7-2).

## 4. Impact

### Product
New indicators are derived Activity completion % indicators with a type label. Manual indicators are still created from Manual library entries.

### Data / Migration
Migration `0056_indicator_type`: replaces two functions owned by `rules_enqueue_owner`. There is no table, column or grant change. The DBA prerequisite is the same role chain as 0041, run through `hosted-indicator-type-preprovision.sql` and `hosted-indicator-type-cleanup.sql`.

### Tests
- `apps/api/src/modules/indicators/indicators.service.test.ts`
- `apps/api/prisma/tests/indicator-type-runtime.sql`
- `apps/web/src/features/projects/project-indicators-workspace.test.tsx`

QAD-T112 and QAD-T113.

## 5. Documents Updated

- `docs/prd-pathways.md`: PRD-F7 bounds, G-F7-1 evidence and UC-F7-1.
- `docs/qad-pathways.md`: QAD-T112 and QAD-T113.
- `docs/deferred-features.md`: the other recipes.
