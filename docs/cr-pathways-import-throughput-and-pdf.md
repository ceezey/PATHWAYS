# Change Record: Import Throughput and PDF Support

**ID:** `cr-pathways-import-throughput-and-pdf`

**Date:** 2026-09-28

**Status:** Approved; implementation pending

## 1. Trigger

The 2026-09-28 backend/frontend alignment audit on `dev` (`002d3ac`) recorded two findings for PRD-F5/F6 ingestion.

**Finding B: import speed.**

- `imports.service.ts:825-871` (`process`) promotes each claimed row in its own `withAuthorizedOperation` transaction. The generic path (`promoteGenericRow`, `:1453-1582`) re-reads the batch with headers, the row, any existing submission and every form field for each row, then writes the submission, values, submission status, row status and audit. That is at least nine sequential statements per row, plus the authorized-operation context set-up. Registration and participation rows follow the same shape with 20-second timeouts (`:53-54`).
- `claimRows` claims at most 100 rows per request (`:1142`, `take: 100`).
- The reviewed workspace advances one checkpoint per click ("Process next checkpoint", `import-workspace.tsx:654-668`). The one-shot collection flow calls `processImport` once and reports the totals (`collection-workspace.tsx:1186-1193`), so a batch larger than one claim stops part-way.
- A file is parsed two or three times. The client preview parses it (`collection-workspace.tsx:868-879`), and `parseWorkbook` calls `sheet_to_json` twice (`packages/imports/src/parser/xlsx.ts:16-23`). The server parses it again in the sandbox worker (`imports.service.ts:447`) and a third time on the recovery path (`:514`).
- The default verified transaction timeout is 10 seconds (`apps/api/src/prisma/prisma.service.ts:39`), bounded to 1-30 seconds (`:40-41`). `finalizeUpload` inserts every staged row (up to 5,000) in one `createMany` inside that default timeout (`imports.service.ts:966-1006`).

**Finding C: formats.**

- Import accepts only `.csv`, `.xlsx` and `.xls` (`imports.service.ts:56-66`; `SupportedImportFileType` in `packages/imports/src/limits.ts`). The database enum `import_file_type` holds CSV, XLSX, XLS, JSON and OTHER (`schema.prisma:406-411`). No PDF parser exists.
- Form-definition export is browser-only and CSV-only. `form-definition-export.ts:55-57` throws for any other format, and the format menu labels XLSX, XLS and PDF as "(unavailable)" (`collection-workspace.tsx:1334`).
- `apps/api/src/modules/reports/report-artifact.ts:8-17` already renders CSV, XLSX, XLS and PDF with formula-safe cells and a 10 MiB cap, using the installed `pdfkit` and `@pathways/imports` workbook writer.
- `forms.export` is granted to System Administrator and M&E Officer (`authorization-policy.ts:165,280`), but no API route checks it. The only export runs in the browser (`collection-workspace.tsx:1214`).

The developer decided on 2026-09-28: imports finish without repeated clicks; import accepts CSV, XLSX, XLS and text-based PDF, and a scanned PDF returns a clear error; form export offers CSV, XLSX, XLS and PDF.

## 2. Current Contract

- **Ingestion RFC (Working), File Safety.** Bounded size, rows and columns; "approved file types"; no macro or formula execution; sanitized parser errors; private storage; the object path never grants authorization; idempotent, recoverable processing. The RFC does not list the approved types. The repository approves CSV, XLSX and XLS.
- **Ingestion RFC, Server-derived mapping support.** No external parsing inside long database transactions.
- **[Core P1 supporting operations](cr-pathways-core-p1-supporting-operations.md).** Stored uploads are bounded to 1-500 columns, 1-5,000 rows and 250,000 cells.
- **Repository limits.** `IMPORT_ENGINEERING_LIMITS` (`packages/imports/src/limits.ts`): 5 MiB, 5,000 rows, 500 columns, 250,000 cells, `parseTimeoutMilliseconds` 5,000, `processingClaimMilliseconds` 60,000, `processingCheckpointRows` 25, `maxProcessingAttempts` 3.
- **Auth RFC (Locked), section 4.** Admin and M&E create, edit and export forms. Section 5 keeps blank-form export handlers deferred wherever absent.
- **PRD-F5/F6.** Admin/M&E create, edit, export and import/extend structures; PO imports collected data.
- **PRD section 8 and QAD section 8.** No runtime AI or OCR feature is approved.

## 3. Proposed Change

### 3.1 Chunked promotion

1. Per claim, load the project, batch, stored headers and pinned form fields once, and pass them to promotion as read-only context.
2. Promote claimed rows in chunk transactions of at most 25 rows (`processingCheckpointRows`). Each chunk is one `withAuthorizedOperation` call, so identity, account, organization, role, permission and assignment are re-verified once per chunk.
3. Inside a chunk, every row keeps its current checks: stale claim and revision guards, the idempotent `importRowId` submission lookup, per-row audit and the existing domain checks. Values continue to use `createMany`.
4. If a chunk transaction fails, rerun that chunk row by row on the existing single-row path. A row that fails there is released through `releaseFailedRow` as today. A `ForbiddenException` still aborts the whole claim. Claim, retry, attempt counting and idempotency behaviour are unchanged.
5. Registration rows pass a `preloaded` context into `promoteRegistration`. Only the batch and form reads are shared. Every per-row Beneficiary, enrollment, consent and identity check still runs per row.
6. Chunk transactions set an explicit timeout of at most 30 seconds (the verified-transaction maximum), fixed from measured chunk time.

### 3.2 Automatic continuation

The web client calls `process` repeatedly until the batch is complete, a call fails, or the user presses Stop. It shows processed and total counts from each server response. Each call is a separate authorized request, and the server never trusts client progress. This replaces the manual checkpoint click in `import-workspace.tsx` and the single call in `collection-workspace.tsx`. After a failure the button reads "Resume processing".

### 3.3 Parse once

- The client preview calls `sheet_to_json` once, as a grid, and derives headers and rows from it. The preview parse runs in a Web Worker so the page stays responsive. The preview remains advisory.
- The server sandbox parse stays authoritative. The recovery parse path stays, because recovery has no other source.
- `finalizeUpload` inserts staged rows in chunks of 1,000 with an explicit timeout of at most 30 seconds.

### 3.4 Text-layer PDF import

1. Approved import file types become CSV, XLSX, XLS and text-layer PDF (`.pdf`, `application/pdf`, leading bytes `%PDF-`).
2. Extraction runs only inside the existing sandbox worker (`packages/imports/src/parser/secure.ts`), under the same byte, time, row, column, cell and cell-length bounds, plus a page bound (proposed 50 pages).
3. The parser reads positioned text items only. Rows come from shared baselines and columns from the header line's x positions. The result is the same stable `column_0001` source envelope that spreadsheets produce, so mapping, validation and normalization are unchanged.
4. Embedded scripts, attachments, forms, annotations and links are never executed or followed.
5. Stable error codes, sanitized as other parser errors:
   - `PDF_NO_TEXT_LAYER`: "This PDF has no text layer. Scanned PDFs are not supported; export the data as CSV or XLSX."
   - `PDF_ENCRYPTED`: password-protected PDFs are rejected.
   - `PDF_TABLE_UNRECOGNIZED`: no header line or no consistent columns.
6. No OCR. PRD section 8 and QAD section 8 stay unchanged.
7. **New dependency `unpdf`**, pinned to an exact version like the repository's other dependencies and loaded with dynamic `import()` inside the worker only. Restraint ladder:
   1. Needed: yes, by developer decision.
   2. Repository pattern: none for reading PDF. `pdfkit` only writes.
   3. Native capability: Node has no PDF reader.
   4. Installed dependency: `xlsx`, `papaparse` and `pdfkit` cannot read PDF text.
   5. Small explicit implementation: no. Reading PDF text needs cross-reference tables, compressed streams and font encodings. A hand-written parser would be a new attack surface.
   6. `unpdf` packages a serverless build of Mozilla pdf.js with no runtime dependencies, and it loads only when a PDF is parsed.

   License and API bundle size are confirmed at pre-implementation review.
8. **Migration `0036_import_pdf_file_type`:** `ALTER TYPE pathways.import_file_type ADD VALUE IF NOT EXISTS 'PDF'`. The migration does not use the new value in the same transaction. `schema.prisma` adds `PDF` to `ImportFileType`. The existing batch guard derives the object extension from `lower(file_type)` (`0000_pathways_baseline_through_0026/migration.sql:655-659`), so PDF objects use a `.pdf` key with no guard change.

### 3.5 Form-definition export

1. Add `GET metadata/projects/:projectId/forms/:formId/export?format=CSV|XLSX|XLS|PDF`, gated by `forms.export` through the complete protected request path, including project scope, before any query. The final route shape is fixed at pre-implementation review.
2. It exports the blank definition only: the 24 columns produced today by `form-definition-export.ts`. It returns no responses, submissions or Beneficiary data.
3. It renders through `createReportArtifact`, which reuses formula neutralization, the MIME map and the 10 MiB cap. A definition that exceeds the artifact bounds (1,000 rows, 30 columns, 2,000 characters per cell, for example a very long option list) fails with a clear error and is never truncated.
4. Each export writes one `FORM_DEFINITION_EXPORTED` audit row with the form ID, version and format. The audit row holds no field content.
5. The response is an attachment with `no-store` and `nosniff`.
6. The web client calls this endpoint for all four formats, removes the "(unavailable)" labels and deletes the browser-only CSV builder, so export has one server path.

## 4. Impact

### Product
A 5,000-row import finishes without clicks. Text-based PDFs import. Form definitions export in four formats.

### Data / Migration
Migration 0036 adds one enum value. No table, column, policy or staged-row shape changes. The value cannot be removed later, because PostgreSQL has no `DROP VALUE`.

### Authorization / Privacy
- No permission, role ceiling or grant changes.
- Re-verification moves from once per row to once per chunk of at most 25 rows. A revocation during processing takes effect at the next chunk, not the next row. The developer must accept this explicitly.
- `forms.export` gains its first API handler. It is used within its existing grants, Admin and M&E only, and serves blank definitions only.
- PDF bytes stay in private storage under the same server-derived object key.

### API
- `process` keeps its request and response shape.
- Upload accepts PDF and adds three stable error codes.
- A new export endpoint is added.

### UI
- Import progress bar with Stop and Resume.
- The file picker accepts `.pdf`.
- All four export formats are enabled.

### Tests
- Chunk success; chunk failure falling back to row-by-row.
- Revocation between chunks; idempotent retry after partial chunks.
- Registration and participation chunks; a 5,000-row XLSX processed end to end without clicks.
- Worker preview parse; chunked `finalizeUpload`.
- PDF: text PDF, scanned PDF, encrypted PDF, page and size overflow, and a PDF carrying JavaScript or attachments (not executed).
- Export in each format: formula-leading cells neutralized, audit row written.
- Export denials: PO, PM, Program and Grant denied; cross-project and cross-organization denied.
- SQL test for 0036.

### Documentation
- Ingestion RFC: File Safety lists the approved types; Pipeline records chunked promotion and parse-once; add the PDF rules.
- Auth RFC section 5: remove blank-form export from the deferred list.
- SDD import section.
- New QAD happy, sad and abuse rows.
- Index Change Log.

## 5. Alternatives Considered

- **Restraint: automatic continuation only.** Keep per-row transactions and only loop in the client. This is the smallest change, but it keeps about a dozen round trips per row, so 5,000 rows stay slow.
- **One transaction per 100-row claim.** Rejected. It risks the 30-second ceiling and widens the rollback on one bad row.
- **Background queue or worker.** Adds infrastructure and scheduling that the current release boundary excludes. Deferred.
- **OCR for scanned PDFs.** Rejected. PRD section 8 approves no runtime AI or OCR.
- **`pdf-parse` or direct `pdfjs-dist`.** `pdf-parse` is unmaintained. Direct `pdfjs-dist` needs its own worker and font set-up. `unpdf` wraps the same engine for server use.
- **Extend the browser-only export.** Rejected. It would ship workbook and PDF writers to every browser, bypass `forms.export` on the server and leave exports unaudited.

## 6. Migration / Rollback

- 0036 follows the forward-only pattern of 0030: it requires the migration identity and a finished 0035 ledger row, and it is additive. Migration numbers follow merge order and may be renamed before integration.
- Rollback reverts the API and web code. The `PDF` value stays unused, and any PDF batches already stored remain private and readable.
- Chunking and automatic continuation revert with code only. No data changes.
- Hosted application needs separate developer authorization. Confirm the Vercel `pathways-api` `maxDuration` for `process` before release.

## 7. Verification

- Section 4 tests pass: `pnpm -r typecheck`, `pnpm test`, `pnpm --filter @pathways/api test`, and the SQL runtime suites in `apps/api/prisma/tests/*.sql` against a reset local database.
- `pnpm docs:check`, `pnpm sad:check`, and a digest-bound `pnpm sad:signoff` with reviews from:
  - metadata-import-validator;
  - organization-isolation-checker;
  - migration-integrity-guardian;
  - restraint-guardian;
  - beneficiary-privacy-guardian;
  - design-qa-agent.
- Local app checks:
  - a 5,000-row XLSX completes without clicks;
  - a text PDF imports, and a scanned PDF shows the clear error;
  - each export format downloads and writes an audit row.
- **Dependency.** The approved `cr-pathways-performance-scaling` (branch `feature/perf-optimizations`, merged in Wave A) proposes a 30-second client cache. Batch status reads used for import progress must stay uncached. This record's branch lands in the same wave, after that record's decision.

## 8. Approval

Developer reply on 2026-09-28: "Approve all CRs, Evidence: change constraint, Signed links: no".

## 9. Disposition

Implemented on `integration/audit-wave-a` (Wave A release, 2026-09-28). Per-branch SAD sign-off complete; merged-release review and requirements QA in progress. Hosted migration application and the production release are pending developer authorization.
