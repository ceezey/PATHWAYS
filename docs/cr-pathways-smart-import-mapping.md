# Change Record: Deterministic Smart Import Mapping

**ID:** `cr-pathways-smart-import-mapping`

**Date:** 2026-09-28

**Status:** Proposed

## 1. Trigger

Audit finding A (2026-09-28, `dev` at `002d3ac`) for PRD-F6: automatic mapping matches only exact normalized codes or labels.

- `pathways.p29_auto_map_import` (`apps/api/prisma/migrations/0029_core_registration_and_import_support/migration.sql:315-579`) maps a source column only when its V1-normalized header equals a field's normalized code or label (`:449-457`) and no other column claims that field (`:464-473`). Every other column is recorded PENDING (`:488`). A header such as "Beneficiary First Name" against the label "First name" stays PENDING.
- The web preview repeats the V1 rule (`apps/web/src/features/collection/collection-import-state.ts:45-81`, `normalizeMappingNameV1` and `createDefinitionMappingRows`). A legacy path uses `createMappingRows` (`:28-43`) with a hardcoded `expectedImportHeaders` list (`collection-workspace.tsx:121,901`).
- Each PENDING column needs a manual choice under `imports.review`. A Project Officer holds `imports.upload` and `imports.process` but not `imports.review` (`authorization-policy.ts:208-209`), so a PO upload with imperfect headers stops until an M&E Officer or Admin maps it.

The developer decided on 2026-09-28: a deterministic smart match. High-confidence matches are applied automatically, low-confidence matches are suggested for one-click confirmation, and no AI is used.

## 2. Current Contract

- **Ingestion RFC (Working), "Conservative code/label matching V1".** NFKC, ASCII whitespace trim, ASCII case folding, and whitespace or hyphen runs to underscore. "Aliases are excluded until an approved representation exists." A source is suggested only with exactly one uncontested candidate.
- **Ingestion RFC, "Server-derived mapping support".** The request supplies batch identity and expected revision only. One attributable immutable revision and audit commit atomically. MAPPED status grants no review or processing authority. "No aliases."
- **[Core P1 supporting operations](cr-pathways-core-p1-supporting-operations.md), "Conservative automatic mapping".**
  - The algorithm is `AUTO_CODE_LABEL_V1` with "No aliases".
  - The request accepts only `expectedMappingRevision` 0 or 1.
  - The response has fixed receipt fields.
  - Manual choices and ignores remain `imports.review` only.
- **PRD section 8.** No runtime AI feature is approved.

## 3. Proposed Change

### 3.1 Algorithm `AUTO_SMART_V2`

1. **One shared module.** A pure deterministic matcher, `packages/imports/src/mappers/smart-match.ts`, is used by both the API and the web preview. Same inputs always give the same output. There is no randomness, clock, locale, network or model call.
2. **Inputs.**
   - Stored source headers keyed by stable `column_NNNN` identity.
   - Up to 20 sampled non-blank staged values per column. The server reads these from staged raw rows.
   - The pinned published form fields: code, label, `FieldDataType`, allowed values and required flag.
3. **Normalization.** The V1 normalizer (`p29_mapping_name_v1`) is applied first. The result is then split into tokens on underscores and ASCII punctuation. Non-ASCII text keeps its case, as in V1.
4. **Integer name score, 0-100.** The highest applicable tier wins:
   - 100: exact V1 code or label match, so V1 behaviour is the top tier;
   - 90: a hit in the versioned synonym list;
   - 85: equal token sets after removing a fixed stop-word list;
   - up to 80: token overlap, `floor(80 * shared / union)`;
   - up to 70: edit-distance similarity on the normalized string, `floor(70 * (1 - distance / longer_length))`.
5. **Synonym list.** `SMART_SYNONYMS_V2` is a reviewed constant in the module, keyed by canonical field codes (for example `birth_date`: "dob", "date of birth", "birthday"). It is not user-editable. Changing it requires a new algorithm ID. "Gender" is never an automatic synonym for `sex`, because SADDD treats them as different concepts; it can only be a suggestion.
6. **Value-compatibility gate.** At least 90 percent of sampled non-blank values must parse under the field's `FieldDataType`:
   - INTEGER and DECIMAL: number formats;
   - DATE: accepted date formats;
   - BOOLEAN: accepted boolean tokens;
   - SELECT and MULTIPLE_SELECT: allowed values after V1 normalization;
   - TEXT and LONG_TEXT: length bounds.

   A column that fails the gate, or has no non-blank samples, can at most be suggested.
7. **Decision.**
   - **MAPPED (automatic):** score of at least 90, the gate passes, the best candidate leads the next by at least 10 points, and no other column holds an equal or higher score for that field.
   - **PENDING with suggestion:** best score 60-89, or a high score that failed uniqueness, margin or the gate.
   - **PENDING without suggestion:** best score below 60.
   - Each field is auto-mapped by at most one column. Ties produce suggestions only.

   Thresholds are named constants of `AUTO_SMART_V2`. Changing one requires a new algorithm ID.

### 3.2 Server flow and SQL

1. `POST /imports/projects/:projectId/batches/:batchId/automatic-mapping` keeps its request contract: `expectedMappingRevision` 0 or 1 and nothing else. The client still cannot choose targets, ignores, algorithm or actor.
2. Inside the existing authorized transaction, the API reads the stored headers, samples and pinned fields, runs the matcher, and calls `pathways.p37_record_smart_mapping(batch, expected_revision, algorithm, decisions)`.
3. `p37_record_smart_mapping`:
   - repeats every 0029 structural check: batch lock, live `imports.upload` authority rechecked after each lock wait, uploader identity, frozen and stale states, pinned published form lock, and source, row, cell and field bounds;
   - accepts only allow-listed algorithm IDs (`AUTO_SMART_V2`);
   - validates the decisions: exactly one per stored source key; every target and suggestion belongs to the pinned form in the same scope; MAPPED targets are unique; scores are integers 0-100; reason codes come from a fixed set;
   - computes completeness from required fields itself, writes immutable revision 1 and one `IMPORT_AUTOMATIC_MAPPING_CREATED` audit row (`algorithmVersion`, `synonymVersion`, decisions with scores) atomically, and keeps the 0029 retry and conflict semantics.
4. **Trust shift, stated plainly.** In 0029 the database derives the choices itself. Under V2 the database verifies their structure and scope, but the choices come from application code running as `pathways_runtime`. This still records MAPPED choices for an uploader without `imports.review`, as 0029 already does. The safeguards are unchanged: MAPPED grants no review or processing authority, and explicit authorized reviewer confirmation and canonical server validation stay required before normalization.

### 3.3 Storage (migration `0037_import_smart_mapping`)

- Add nullable columns to `pathways.metadata_mappings`:
  - `suggested_field_id`, with a composite foreign key to `form_fields` in the same organization, project and form;
  - `match_score` (`smallint`, 0-100);
  - `match_reason` (fixed set).
- `validation_message` carries `AUTO_SMART_V2:<reason>`.
- Sampled values are never persisted in mapping rows, audit rows or logs.
- The new function follows the 0029 authority pattern: owner `prisma`, empty `search_path`, qualified names, `EXECUTE` only for `pathways_runtime`, revoked from PUBLIC, anon, authenticated and service_role, and a postcondition block that asserts all of this.
- `p29_auto_map_import` stays installed and unchanged as the rollback path. A batch mapped by V2 cannot be treated as a V1 retry, because the stored `validation_message` prefix differs and 0029 conflicts.

### 3.4 UI

- Auto-mapped columns show an "Auto-matched" badge with the reason.
- A PENDING column with a suggestion shows "Suggested: <field label>" with a Confirm button, and the card offers "Confirm all suggestions".
- Confirming writes a new manual mapping revision through the existing revision path under `imports.review`, attributed to the confirming reviewer. Users without `imports.review` see suggestions read-only.
- The web preview uses the same module on the client-parsed file. The preview stays advisory, and the server result is authoritative.
- Remove `createMappingRows`, `createDefinitionMappingRows`, `normalizeImportHeader` and `expectedImportHeaders`.

## 4. Impact

### Product
Messy headers map without manual work when the evidence is strong. Weaker matches need one click from a reviewer.

### Data / Migration
- 0037 adds three nullable columns, one function and a postcondition block.
- Existing mappings, revisions and audit rows are unchanged.

### Authorization / Privacy
- No permission, role ceiling or grant changes.
- Manual choices and confirmation stay `imports.review` only.
- Sampled values, which can include Beneficiary data in registration imports, are read inside the authorized transaction only and are never stored or returned in the receipt.

### API
The automatic-mapping request is unchanged. The receipt keeps its fields. The batch mapping read adds suggestion, score and reason per column.

### UI
Adds the badge, Confirm and "Confirm all suggestions". Removes the hardcoded header list.

### Tests
- **Golden cases:** exact, synonym, token, edit distance, tie, margin and value-gate outcomes.
- **Parity:** the same outputs from API and web.
- **SQL (0037):** rejects unknown algorithm IDs, foreign or cross-form targets, duplicate MAPPED targets, out-of-range scores and wrong source keys.
- **Denials:** stale or frozen batch conflicts; revoked `imports.upload` denied; cross-project and cross-organization denied.
- **Privacy:** no sample value appears in the database or audit.
- **Authority:** PO cannot confirm; M&E confirms with attribution.

### Documentation
- Ingestion RFC: replace "Conservative code/label matching V1" with a V2 section that keeps V1 as the top tier, and replace "No aliases" with the versioned synonym-list rule.
- Core P1 CR: note that its "No aliases" statement is superseded for `AUTO_SMART_V2` while V1 stays installed.
- QAD rows and index.

## 5. Alternatives Considered

- **Restraint: keep V1 and add client-only suggestions.** Nothing changes on the server, and PO uploads still stop at PENDING. Rejected as not meeting the decision.
- **Score in SQL (`pg_trgm` or `fuzzystrmatch`).** The database would keep deriving the choices itself. But the same algorithm would exist twice (SQL and TypeScript) with a parity burden, and it would depend on extension availability. It remains the fallback if the trust shift in section 3.2 is not accepted.
- **AI or LLM matching.** Rejected. PRD section 8 approves no runtime AI.
- **User-managed alias table.** Needs an approved representation, an administration UI and new authority. Deferred.

## 6. Migration / Rollback

- 0037 is forward-only and additive, with the 0030-style migration identity and ledger precondition. Numbers follow merge order.
- Rollback points the API back to `p29_auto_map_import`, which needs no migration. The new columns stay nullable and unused. Mappings already written under V2 remain valid immutable history.
- Hosted application needs separate developer authorization.

## 7. Verification

- Section 4 tests, SQL runtime suites against a reset local database, `pnpm -r typecheck`, `pnpm test`, `pnpm docs:check` and `pnpm sad:check`.
- Digest-bound `pnpm sad:signoff` with reviews from metadata-import-validator, organization-isolation-checker, migration-integrity-guardian, beneficiary-privacy-guardian and design-qa-agent.
- In the local app, messy headers auto-map and suggestions confirm with one click.
- **Dependencies.**
  - This record's branch follows [import throughput and PDF](cr-pathways-import-throughput-and-pdf.md), which it shares `imports.service.ts` and the parse-once source envelope with.
  - The Proposed `cr-pathways-performance-scaling` (unmerged branch `feature/perf-optimizations`) must keep batch mapping reads uncached while a batch is being mapped.

## 8. Approval

Pending developer approval.

## 9. Disposition

Not applied.
