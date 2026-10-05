# Change Record: Designed PDF Report Renderer

**ID:** `cr-pathways-report-pdf-renderer`  
**Date:** 2026-10-05  
**Status:** Applied (2026-10-05; local only, hosted verification pending)

## 1. Trigger

PRD-F12 UC-F12-1 asks for reports that read as designed documents. The pdfkit PDF artifact is plain text and a table, with no charts or DSD styling. On 2026-10-05 the developer decided to render PDF reports from a styled web page with headless Chromium.

## 2. Current Contract

- PRD-F12 UC-F12-1 produces a report artifact; G-F12-2 (failed report leaves source data intact) and G-F12-4 (every report type exports as CSV, XLS, XLSX and PDF) are Met with pdfkit.
- `ReportsService.generate()` builds the authorized snapshot, renders the bytes, uploads the artifact and writes the audit row.

## 3. Proposed Change

1. **Print route.** `/print/reports/[id]` in `apps/web` renders the report header, a warning callout for unavailable or withheld data, one bar chart of numeric `Value` cells and the table, styled by the DSD "Printed report" pattern.
2. **Renderer module.** `apps/api/src/modules/report-pdf` (`ReportPdfModule`, `ReportPdfRenderer`) launches headless Chromium, injects the already authorized snapshot into the page, prints A4 and always closes the page. Only requests to `WEB_ORIGIN` are allowed; others are aborted.
3. **Generate wiring.** `ReportsService.generate()` uses the renderer for PDF. A renderer failure logs one warning with the report id and error name and falls back to the pdfkit artifact, so G-F12-2 and G-F12-4 stay Met. Spreadsheet formats never launch Chromium.
4. **Deterministic developer scripts.** `apps/api/prisma/defense-demo-seed.ts`, `apps/api/prisma/local-demo-seed.ts` and `reports-runtime.local.test.ts` pass an always-rejecting renderer stub, so seeds and replay stay on pdfkit and never launch Chromium.
5. **Form hint.** The generate form shows "PDF includes charts and DSD styling." under the Format select.
6. **Configuration and dependencies.** New env keys `WEB_PROTECTION_BYPASS` (protected preview deployments) and `PDF_CHROME_PATH` (local browser path) in `packages/config/src/env.ts`. New pinned dependencies `puppeteer-core` 25.12.0 and `@sparticuz/chromium` 153.0.0.
7. **Not changed.** No migration, no schema change, no new permission; the report permission and scope checks run before rendering exactly as for the other formats.

## 4. Impact

### Product
PDF reports gain header branding, a chart and a repeating-header table.

### Data / Migration
None.

### Authorization / Privacy
The print page receives only the authorized, suppression-applied snapshot injected by the API; it does not fetch data itself, so no session cookie is forwarded and no new read path exists. Off-origin requests are aborted.

### API
`ReportsService.generate()` gains the renderer dependency; response shapes are unchanged.

### UI
New print route and print CSS; one help line on the generate form.

### Tests
`apps/api/src/modules/report-pdf/report-pdf.renderer.test.ts`, `apps/api/src/modules/reports/reports.service.test.ts`, `apps/web/src/features/reports/print/print-report.test.tsx`, QAD-T119 and QAD-T120.

### Documentation
QAD, DSD "Printed report" pattern, PRD-F12 gate rows, deferred register, activity log and index.

## 5. Alternatives Considered

- **Restraint option.** Keep pdfkit only. Rejected: the developer wants designed output.
- **Forward the session cookie to the print page.** Rejected: it widens the credential surface and duplicates authorization; snapshot injection keeps one authorized read.
- **Separate render worker or queue.** Rejected: more moving parts for a synchronous generate flow.

## 6. Migration / Rollback

No migration. Roll back by reverting the code; the fallback already restores pdfkit output when the renderer fails or Chromium is unavailable.

## 7. Verification

- Unit tests above, the scoped biome checks and `pnpm docs:check` (no new failures).
- Local end-to-end: built web app on port 3100, `/print/reports/[id]` returns 200 without sign-in, and the built renderer produced a real PDF with local Edge.
- Hosted verification pending: Chromium on Vercel Functions needs the pathways-api function settings and one hosted PDF smoke test (see the deferred register).

## 8. Approval

Developer decisions, 2026-10-05: run the renderer inside `generate()`; inject the authorized snapshot instead of forwarding cookies.

## 9. Disposition

Applied to the repository on `feature/f12-pdf-renderer`. Deferred: hosted Chromium verification, tracked in `docs/deferred-features.md` as "Designed PDF on hosted".
