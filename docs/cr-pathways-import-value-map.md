# Change Record: import-value-map

**ID:** `cr-pathways-import-value-map`  
**Date:** 2026-10-01  
**Status:** Implemented

## 1. Trigger

Gate G-F6-7 (choosing a data type for a field and translating values during import) was Not met and held in [deferred-features](deferred-features.md) (MA-07 of [audit-pathways-manuscript-alignment-20261001](audit-pathways-manuscript-alignment-20261001.md)). The developer approved building it on 2026-10-01.

## 2. Current Contract

- [rfc-pathways-metadata-ingestion](rfc-pathways-metadata-ingestion.md): conservative code and label matching, no aliases, immutable attributable mapping revisions, canonical server validation before normalization.
- [cr-pathways-smart-import-mapping](cr-pathways-smart-import-mapping.md): `AUTO_SMART_V2` suggests or maps columns; "Gender" is never an automatic synonym for `sex` (G-F6-3).
- Today `normalizeImportedRow` accepts only canonical source text per field type; "M" for a SELECT of Male/Female is an invalid row. UC-F6-2 states that choosing a data type or translating values is not provided.

## 3. Proposed Change

- Each MAPPED column of a mapping revision may carry `dataType` and `valueMap`.
  - `dataType`: the declared type of the column's values. It must fit the target field (`compatibleImportDataTypes`: for example INTEGER or DECIMAL for a DECIMAL field, TEXT or SELECT for a SELECT field). Declaring a narrower type adds a stricter check before the field's own coercion.
  - `valueMap`: up to 50 ordered `{from, to}` pairs, each text at most 100 characters, no control characters, no formula-like prefix (`=`, `+`, `@`, tab, CR, or `-` not followed by a digit). Matching is exact after NFKC, trim and case folding; duplicate sources are rejected.
- Translation runs first, then the declared-type check, then the existing field coercion and validation, in `packages/imports/src/normalization.ts`. Untranslated values pass through unchanged. A value that still fails stays INVALID in staging with a stable error code and reason; no row is dropped.
- Sex and gender stay suggestion-only: nothing here changes `AUTO_SMART_V2`. A reviewer may choose to translate values for a column they confirm.
- Confirming a mapping revision still requires `imports.review`. IGNORED columns cannot carry a type or map. The audit event records only the count of value-mapped columns, never values.
- Out of scope: creating new form fields during import, regex or formula translations, per-row overrides.

## 4. Impact

### Product
G-F6-7 becomes Met; MA-07 closes.

### Data / Migration
Migration `0050_import_value_map` (not applied by this change): nullable `data_type` (`field_data_type`) and `value_map` (jsonb) on `pathways.metadata_mappings`, with checks for array shape (1 to 50 entries) and MAPPED-only use. Additive; no grant or policy change.

### Authorization / Privacy
No new permission. Maps are reviewer-authored rules, not source data; audit carries counts only.

### API
`PATCH /imports/projects/:projectId/batches/:batchId/mapping` items accept optional `dataType` and `valueMap`; batch detail returns them per mapping.

### UI
`apps/web/src/features/collection/import-value-map-editor.tsx` (type select and translation rows, controls 44px high) under each mapped column in the import workspace.

### Tests
QAD-T54: happy (M and F to canonical values), sad (coercion failure stays staged with a reason), abuse (oversized map, duplicate keys, formula-like and control text, prototype-named keys).

### Documentation
PRD G-F6-7 and UC-F6-2, QAD-T54, deferred-features (row removed), audit MA-07 rows, index change log.

## 5. Alternatives Considered

- Restraint option: keep the hold. Rejected by the developer.
- Global per-form value maps: rejected; sources differ per file, and per-revision maps stay immutable and attributable.
- Aliases in `AUTO_SMART_V2`: rejected; would break the G-F6-3 rule for Gender.

## 6. Migration / Rollback

Apply `0050` after the verified 0049 state; its guard asserts 0049 in the 0046 to 0051 chain. Rollback: ignore the columns (the code treats null as no rule) or drop both columns and their two constraints.

## 7. Verification

`pnpm --filter @pathways/imports test`; `apps/api` vitest for imports (service and DTO); `apps/web` vitest for collection; `tsc --noEmit` for api and web; biome check.

## 8. Approval

Developer approved 2026-10-01 (building G-F6-7 as described in the request).

## 9. Disposition

Code and tests delivered on `feat/f6-import-value-map`. Migration 0050 not applied to any database; staging apply and release gates remain open.

Update 2026-10-02: migration 0050 is applied on PATHWAYS-devV2 (ledger 0000-0054). Status stays Approved; open condition: release gates (dev to master) remain open.

Update 2026-10-03: G-F6-7 verified Met on `feature/f5-f6-verify-dsd` with service-level evidence (`imports.f6-gates.test.ts`); status Implemented.
