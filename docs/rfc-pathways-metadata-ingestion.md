# RFC: Metadata, Forms, Direct Entry, and Dataset Ingestion

## Objective

Provide project-scoped structured forms and safe spreadsheet/KOBO-like processing without trusting external files as application truth.

## Metadata

Field definitions carry stable identity/code, label, type, required state, validation, ownership, mapping use, and approved monitoring/domain linkage.

## Pipeline

```text
private upload
→ import batch
→ raw rows
→ source headers
→ explicit mapping
→ validation
→ error review
→ authorized normalization
→ domain records
```

Invalid rows remain staged/error.

The [import throughput and PDF](cr-pathways-import-throughput-and-pdf.md) contract bounds processing. One process request claims at most 100 valid rows and promotes them in verified transactions of at most 25 rows, each bounded to 30 seconds. The batch, form fields and form definition are read once per claim. Identity, account, organization, role, permission and project assignment are re-verified once per chunk, so a revocation takes effect at the next chunk. Every row keeps its claim, revision, idempotent submission and domain checks and its own audit row. A failed chunk rolls back as a unit and reruns row by row on the single-row path, which keeps claim, release, retry and attempt semantics. Finalization inserts staged rows in 1,000-row batches inside one 30-second transaction.

The web client calls process repeatedly until the batch is complete, a call fails or the user stops it, and shows counts from each server response. Each call is a separate authorized request; the server never trusts client progress. The server sandbox parse is authoritative and runs once per upload; recovery re-parses the stored object because it has no other source. The client preview reads each sheet once, runs in a Web Worker and remains advisory.

## File Safety

- bound file size/rows/columns;
- approved file types: CSV, XLSX, XLS and text-layer PDF (`.pdf`, `application/pdf`, leading bytes `%PDF-`);
- no macro/formula execution;
- sanitized parser errors;
- private storage;
- object path never grants authorization;
- idempotent/recoverable processing.

### Text-layer PDF

The sandbox parser worker loads the approved `unpdf` dependency only for PDF input. It reads positioned horizontal text items under the same byte, time, row, column, cell and cell-length bounds, plus a 50-page and a 500,000-text-item bound. Rows come from shared baselines. Columns come from the x positions of the header, which is the first line with at least two separated cells; text above it is ignored and a header repeated on a later page is skipped. Text left of the first header column fails the table. Wrapped multi-line cells become separate rows and then fail or pass validation like any other row. The result is the same `column_NNNN` source envelope that spreadsheets produce, so mapping, validation and normalization are unchanged. Embedded scripts, attachments, forms, annotations and links are never executed or followed, and control characters are removed from extracted text.

Text extraction and table reconstruction both run inside the worker, so their CPU falls under the parse timeout. Reconstruction rejects a header wider than the column bound before any row is allocated, and stops at the row and cell bounds as rows are built. Every parser worker, for all file types, runs with a 512 MiB heap limit; exceeding it ends the worker, never the API, and returns `PARSE_MEMORY_LIMIT`. Worker error codes outside the known set collapse to a generic rejection.

Stable sanitized codes: `PDF_NO_TEXT_LAYER` (scanned or image-only, with the message to export CSV or XLSX), `PDF_ENCRYPTED`, `PDF_TABLE_UNRECOGNIZED`, `PDF_PAGE_LIMIT`, `PDF_TEXT_LIMIT` and `PDF_PARSE_FAILED`, plus the shared `COLUMN_LIMIT`, `ROW_LIMIT` and `CELL_LIMIT`. No OCR is performed.

## Mapping Safety

Only approved system/form fields are mapping targets.

No arbitrary DB column names, SQL, or executable expressions.

### Deterministic smart matching `AUTO_SMART_V2`

The [smart import mapping](cr-pathways-smart-import-mapping.md) contract replaces conservative code/label matching V1 for new automatic mappings. One pure module, `packages/imports/src/mappers/smart-match.ts`, serves both the server and the web preview. It uses no randomness, clock, locale, network or model call, so the same inputs always give the same decisions. Stable parser source-column keys, never display labels, are the identity.

Names are first normalized with the V1 rule: Unicode NFKC, trim only ASCII space/tab/LF/CR/form-feed/vertical-tab, fold only ASCII A-Z, then replace runs of those whitespace characters or hyphen with underscore. Other punctuation and non-ASCII case are preserved. The result is split into tokens on underscores and ASCII punctuation. Each column gets an integer score from 0 to 100 against each field of the pinned published form, and the highest tier wins:

- 100: exact V1 code or label match, so V1 stays the top tier;
- 90: a hit in the versioned synonym list `SMART_SYNONYMS_V2`, keyed by canonical field code;
- 85: equal token sets after a fixed stop-word list;
- up to 80: token overlap, `floor(80 * shared / union)`;
- up to 70: bounded edit distance on names of at most 32 code points, `floor(70 * (1 - distance / longer_length))`. Distances that would score below 60 are not computed.

The synonym list is a reviewed constant, not user-editable, and changing it requires a new algorithm ID. "Gender" and "sex" are never automatic synonyms for each other; each can only be suggested for the other (score 80), because SADDD treats them as different concepts.

A value gate reads at most 20 non-blank values per column from the first 100 staged rows. At least 90 percent must fit the field's data type: number formats for INTEGER and DECIMAL, accepted date formats for DATE, accepted boolean tokens for BOOLEAN, V1-normalized allowed values for SELECT and MULTIPLE_SELECT, and length bounds for TEXT and LONG_TEXT. Sampled values are never persisted, audited, logged or returned.

A column is MAPPED only with a score of at least 90, a passing value gate, a lead of at least 10 points over its next field and no other column scoring equal or higher for that field. A score of 60 to 89, or a high score held by a tie, margin or value gate, stays PENDING with one stored suggestion. Below 60 stays PENDING without a suggestion. Each field is mapped by at most one column and suggested to at most one other column, never both. Thresholds are named constants of the algorithm. Missing required mappings block validation and normalization. Suggestions confer no review or processing authority: confirming one is an ordinary manual revision under `imports.review`, attributed to the reviewer, and canonical server validation remains required. The web preview is advisory; the server result is authoritative.

### Registration age rule

Imported registration rows are promoted through the same registration parser as direct entry, so the [default registration form contract](cr-pathways-default-registration-form.md) age rules apply to them: a birth date after the business date or an age below 5 fails promotion on the existing row-error path, and the row is released for review. No import staging or mapping behavior changes.

## Provenance

Preserve uploader, org/project, storage object, batch, row index, mapping version, validation result, normalized references, timestamps.

## Tests

Invalid headers, missing fields, wrong types, duplicates, mixed rows, retries, cross-project access, malicious spreadsheet content, large bounded input, failed normalization recovery.

## Server-derived mapping support

The [core P1 supporting operations](cr-pathways-core-p1-supporting-operations.md) contract extends the same conservative code/label algorithm to bounded, scoped server-derived choices. The request supplies batch identity and expected revision only; it cannot choose targets, ignore columns or impersonate a reviewer. All ambiguous claims count, including claims sharing another source's sole candidate. Unresolved columns remain PENDING. One attributable immutable automatic revision and audit commit atomically; stale/frozen/changed retries conflict. A complete automatic mapping may be MAPPED, but status alone grants no review or processing authority: existing explicit authorized review confirmation, canonical validation and authorized normalization remain required. No external parsing inside long database transactions or new application capability is installed by this contract.

Under `AUTO_SMART_V2` the request contract is unchanged. Inside the authorized transaction the API locks the batch, reads the stored headers, the pinned fields and the bounded samples, runs the shared matcher and calls `pathways.p38_record_smart_mapping(batch, expected_revision, 'AUTO_SMART_V2', decisions)` (migration 0038). The function repeats every V1 structural check, accepts only allow-listed algorithm IDs, and verifies that each decision has the fixed key set, belongs to its stored source key and targets or suggests only fields of the pinned form in the same scope. It stores `suggested_field_id`, `match_score` and `match_reason` beside revision 1, with `validation_message` set to `AUTO_SMART_V2:<reason>`, and audits the algorithm, the synonym version and the decisions without values. The versioned synonym list replaces the V1 "no aliases" rule; there is still no user-managed alias table. `p29_auto_map_import` stays installed as the rollback path, and a V1 revision never counts as a V2 retry or the reverse.
