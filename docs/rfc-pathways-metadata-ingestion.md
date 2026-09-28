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

Stable sanitized codes: `PDF_NO_TEXT_LAYER` (scanned or image-only, with the message to export CSV or XLSX), `PDF_ENCRYPTED`, `PDF_TABLE_UNRECOGNIZED`, `PDF_PAGE_LIMIT`, `PDF_TEXT_LIMIT` and `PDF_PARSE_FAILED`. No OCR is performed.

## Mapping Safety

Only approved system/form fields are mapping targets.

No arbitrary DB column names, SQL, or executable expressions.

### Conservative code/label matching V1

Preview suggestions use stable parser source-column keys rather than display labels as identity. Compare each source label with the union of approved field codes and labels. Normalize names with Unicode NFKC, trim only ASCII space/tab/LF/CR/form-feed/vertical-tab, fold only ASCII A-Z, then replace runs of those whitespace characters or hyphen with underscore. Preserve other punctuation and non-ASCII case. Aliases are excluded until an approved representation exists.

A source is suggested only when it has exactly one candidate and no other source claims that candidate, including an ambiguous source whose candidate set contains it. Unknown, blank, ambiguous or competing sources remain unresolved. Missing required mappings block validation/normalization. Suggestions confer no manual review or processing authority; existing explicit reviewer confirmation and canonical server validation remain required. This matching definition does not install a server automatic-mapping endpoint or its supporting SQL.

## Provenance

Preserve uploader, org/project, storage object, batch, row index, mapping version, validation result, normalized references, timestamps.

## Tests

Invalid headers, missing fields, wrong types, duplicates, mixed rows, retries, cross-project access, malicious spreadsheet content, large bounded input, failed normalization recovery.

## Server-derived mapping support

The [core P1 supporting operations](cr-pathways-core-p1-supporting-operations.md) contract extends the same conservative code/label algorithm to bounded, scoped server-derived choices. The request supplies batch identity and expected revision only; it cannot choose targets, ignore columns or impersonate a reviewer. All ambiguous claims count, including claims sharing another source's sole candidate. Unresolved columns remain PENDING. One attributable immutable automatic revision and audit commit atomically; stale/frozen/changed retries conflict. A complete automatic mapping may be MAPPED, but status alone grants no review or processing authority: existing explicit authorized review confirmation, canonical validation and authorized normalization remain required. No aliases, external parsing inside long database transactions, or application capability is installed by this contract.
