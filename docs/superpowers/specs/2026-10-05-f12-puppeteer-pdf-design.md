# PRD-F12 Puppeteer PDF Renderer Design

Date: 2026-10-05. Branch: `feature/f12-pdf-renderer`. Feature: PRD-F12 (UC-F12-1 Generate report).

## Goal

PDF reports generated through `POST /projects/:projectId/reports` render from a DSD-styled, print-optimized Next.js route with ECharts charts through headless Chromium, replacing the plain pdfkit row list. pdfkit stays as an automatic fallback so G-F12-1 to G-F12-5 remain Met if Chromium is unavailable.

## Decisions (developer, 2026-10-05)

- PDF generation inside `generate()` uses the renderer; pdfkit is the fallback (not a separate action, not local-only).
- Snapshot injection, not cookie forwarding: the API injects the snapshot it already authorized and fingerprinted; no user token reaches the browser and the PDF always matches the stored fingerprint.
- Print route is `/print/reports/[id]`, outside `(dashboard)` and outside the auth middleware matcher.

## Architecture

### API: `apps/api/src/modules/report-pdf/` (new, isolated)

- `report-pdf.module.ts` exports `ReportPdfRenderer`; `ReportsModule` imports it.
- `ReportPdfRenderer.render(reportId: string, snapshot: PrintSnapshot): Promise<Buffer>`.
- `PrintSnapshot`: `{ title, kind, columns: string[], rows: string[][], generatedAt, unavailableReasons: string[] }`, validated with `validatedReportRows` before render.
- Browser lifecycle: lazy single shared browser launched on first render (not `onModuleInit`, so API cold starts never pay Chromium launch), relaunched if `browser.connected` is false, closed in `onModuleDestroy`. Concurrent first calls share one launch promise.
- Executable: `PDF_CHROME_PATH` env when set (local Windows Chrome or Edge); otherwise on Linux `@sparticuz/chromium` (`executablePath()`, `args`); otherwise throw `Error('PDF renderer unavailable.')`.
- Render steps:
  1. `browser.newPage()`.
  2. `page.evaluateOnNewDocument` sets `window.__PATHWAYS_REPORT__` to the snapshot.
  3. `page.setRequestInterception(true)`: continue only requests whose origin equals `WEB_ORIGIN` (plus `data:` and `blob:`); abort everything else.
  4. When `WEB_PROTECTION_BYPASS` is set, `page.setExtraHTTPHeaders({ 'x-vercel-protection-bypass': value })`. Interception keeps it from leaving `WEB_ORIGIN`.
  5. `page.goto(`${WEB_ORIGIN}/print/reports/${reportId}`, { waitUntil: 'networkidle0', timeout: 20000 })`; `reportId` is a validated UUID.
  6. `page.waitForSelector('[data-report-ready="true"]', { timeout: 15000 })` (async hydration and chart completion).
  7. `page.pdf({ format: 'A4', printBackground: true, margin: { top: '20mm', bottom: '20mm', left: '15mm', right: '15mm' }, displayHeaderFooter: true, headerTemplate: '<span></span>', footerTemplate: page x of y })`.
  8. Reject when the buffer is empty or above `REPORT_MAX_BYTES`.
  9. `page.close()` in `finally`, errors swallowed.
- Logging: Nest `Logger` (routed through nestjs-pino); log report id and error name only, never report content.
- `WEB_ORIGIN` is read from the existing API env (`readApiEnv`); render throws when it is unset, which triggers the fallback.

### `reports.service.ts` (minimal touch)

- Inject `ReportPdfRenderer`.
- In `generate()`, when `body.format === 'PDF'`: try `renderer.render(prepare.id, { title: body.name, kind: body.kind, columns, rows, generatedAt, unavailableReasons })`; on any error log a warning and fall through to the existing `createReportArtifact` pdfkit path.
- Storage, fingerprint, idempotency, audit, export and CSV/XLS/XLSX paths are unchanged.

### Web: `apps/web/src/app/print/reports/[id]/page.tsx` (new)

- Client page, no app chrome, `robots: noindex` via a sibling `layout.tsx` with metadata.
- Reads `window.__PATHWAYS_REPORT__`; absent payload shows "No report data". `?sample=1` loads a fixture only when `process.env.NODE_ENV !== 'production'`.
- Layout (DSD tokens, Tailwind):
  - Header block: PATHWAYS wordmark, report name, report-type label, generated timestamp.
  - Callout listing `unavailableReasons` when present.
  - Summary bar chart when a `Value` column has two or more numeric rows; label from the first non-`Value` column; suppressed or unavailable cells excluded and counted in a caption.
  - Full table: `thead` as `table-header-group` (repeats per page), rows `break-inside: avoid`.
- ECharts: `animation: false`, `renderer: 'svg'`, colors from `chartPalette`; `data-report-ready="true"` set after the chart `finished` event, or immediately when no chart renders.
- Feature code lives in `apps/web/src/features/reports/print/` (view, chart option builder, payload parser).
- `globals.css` `@media print`: `@page { size: A4 }`, `print-color-adjust: exact`, `.print-break-before { break-before: page }`, `.print-avoid { break-inside: avoid }`.

### Existing UI

- Generate form unchanged; PDF stays default. Help text under the format select: "PDF includes charts and DSD styling."

## Dependencies

- API: `puppeteer-core` and `@sparticuz/chromium`, pinned to a matching Chromium major. No full `puppeteer` (bundled Chrome exceeds the Vercel function size).

## Hosted settings (developer)

- `pathways-api`: `WEB_ORIGIN` (exists); `WEB_PROTECTION_BYPASS` (pathways-web Protection Bypass for Automation secret) only for a protected preview URL; Settings > Functions duration of at least 60 s and memory of at least 1024 MB.
- Optional local: `PDF_CHROME_PATH` in `apps/api/.env`.

## Error handling

- Any renderer failure (no executable, launch failure, timeout, oversize, navigation blocked) falls back to pdfkit; correctable pdfkit input errors keep the existing 422 behavior.
- G-F12-2 holds: renderer runs before upload and touches no source data.

## Testing

- `report-pdf.renderer.test.ts` (mocked puppeteer-core): `page.close` runs on success and failure; off-origin request aborted; bypass header only set when configured; oversize rejected; missing executable throws.
- `reports.service.test.ts`: PDF uses the renderer bytes; renderer failure falls back to pdfkit; non-PDF formats never call the renderer.
- Web `print-report-view.test.tsx`: renders header, table and unavailable callout; sets ready flag; no payload shows the empty state; chart option has `animation: false`.
- Local QA: `pnpm --filter api build`, `pnpm --filter web build`, affected tests, and one real PDF generated against local web with `PDF_CHROME_PATH`.

## Docs

- `docs/cr-pathways-report-pdf-renderer.md`, QAD rows for renderer and fallback, DSD "Printed report" section, `docs/activity-log.md`, `docs/deferred-features.md` (hosted Chromium verification pending).

## Out of scope

- Multi-chart layouts per kind, scheduled or emailed reports, cookie-based print auth, changes to export or non-PDF formats.
