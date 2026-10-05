# PRD-F12 Puppeteer PDF Renderer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** PDF reports from `POST /projects/:projectId/reports` render a DSD-styled Next.js print route with an ECharts chart through headless Chromium, with pdfkit as automatic fallback.

**Architecture:** A new isolated NestJS module `report-pdf` owns a lazily launched shared Chromium (`puppeteer-core` + `@sparticuz/chromium`, or `PDF_CHROME_PATH` locally). `ReportsService.generate()` hands it the already authorized snapshot for PDF requests; the renderer injects the snapshot into `/print/reports/[id]` via `evaluateOnNewDocument`, waits for a ready flag and prints A4. Any renderer failure falls back to the existing `createReportArtifact` pdfkit path.

**Tech Stack:** NestJS 10, puppeteer-core 25.12.0, @sparticuz/chromium 153.0.0, Next.js 15 App Router, React 19, Tailwind 3.4, ECharts 5.6 via echarts-for-react, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-05-f12-puppeteer-pdf-design.md`

**Worktree:** `C:\PATHWAYS\.claude\worktrees\f12-pdf`, branch `feature/f12-pdf-renderer`. Never edit, stash or switch branches in `C:\PATHWAYS` (the developer is running `pnpm dev` there). Never push.

## Global Constraints

- Do not refactor, delete or fix unrelated legacy code; touch `reports.service.ts` only where Task 2 says.
- No database migrations, no `prisma migrate dev`, no schema changes.
- Comments are one sentence, no emojis or special characters.
- Pin exact versions: `puppeteer-core` `25.12.0`, `@sparticuz/chromium` `153.0.0`. Do not add full `puppeteer`.
- The user's token never reaches the browser; the renderer only navigates to `WEB_ORIGIN`.
- Logs carry the report id and error name only, never report content.
- PDF options: A4, `printBackground: true`, margins top/bottom `20mm`, left/right `15mm`.
- ECharts on the print route: `animation: false`, `renderer: 'svg'`, colors from `chartPalette`.
- Markdown file names use kebab case.
- Commit after each task with a clear message ending in `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

- A `WEB_ORIGIN` that redirects (Vercel login on a protected preview) must abort navigation and fall back to pdfkit, never print the login page (Task 1 off-origin abort test).
- Two simultaneous first PDF requests must share one Chromium launch (Task 1 concurrency test).
- A snapshot whose `Value` column is mostly `Suppressed` or `Not available` must chart only numeric rows and say how many were left out (Task 3 chart data test).
- A visitor opening `/print/reports/<id>` directly must see "No report data" with no session redirect (Task 3 empty-state test and Task 4 manual check).
- CSV, XLS and XLSX generation must never launch Chromium (Task 2 test).

---

### Task 1: API renderer module

**Files:**
- Modify: `packages/config/src/env.ts` (add two optional keys to `apiEnvSchema`)
- Modify: `apps/api/package.json` (dependencies)
- Create: `apps/api/src/types/sparticuz-chromium.d.ts`
- Create: `apps/api/src/modules/report-pdf/report-pdf.renderer.ts`
- Create: `apps/api/src/modules/report-pdf/report-pdf.module.ts`
- Test: `apps/api/src/modules/report-pdf/report-pdf.renderer.test.ts`

**Interfaces:**
- Consumes: `REPORT_MAX_BYTES`, `validatedReportRows` from `apps/api/src/modules/reports/report-artifact.ts`; `readApiEnv` from `@pathways/config`.
- Produces: `export type PrintSnapshot = { title: string; kind: string; columns: string[]; rows: string[][]; generatedAt: string; unavailableReasons: string[] }`; `export class ReportPdfRenderer { render(reportId: string, snapshot: PrintSnapshot): Promise<Buffer> }`; `export class ReportPdfModule` exporting `ReportPdfRenderer`.

- [ ] **Step 1: Add env keys**

In `packages/config/src/env.ts`, inside `apiEnvSchema`, directly after `WEB_ORIGIN: optionalUrl,` add:

```ts
    // Vercel Protection Bypass for Automation secret of the web project, sent only to WEB_ORIGIN.
    WEB_PROTECTION_BYPASS: optionalString,
    // Local Chrome or Edge executable for the PDF renderer; Linux hosts use the bundled Chromium.
    PDF_CHROME_PATH: optionalString,
```

Run: `pnpm --filter @pathways/config test` (if the package has no test script, run `pnpm --filter @pathways/config exec tsc --noEmit`). Expected: PASS.

- [ ] **Step 2: Install dependencies**

Run from the worktree root:

```bash
pnpm --filter @pathways/api add puppeteer-core@25.12.0 @sparticuz/chromium@153.0.0 --save-exact
```

Expected: `apps/api/package.json` lists both with exact versions and `pnpm-lock.yaml` changes. Both packages are ESM-only; Node 22.12+ loads them through `require`, which was verified on Node 22.23.

- [ ] **Step 3: Add the ambient type for @sparticuz/chromium**

The API compiles with `moduleResolution: "Node"`, which cannot read this package's `exports`-only types. Create `apps/api/src/types/sparticuz-chromium.d.ts`:

```ts
declare module '@sparticuz/chromium' {
  const chromium: {
    readonly args: string[]
    executablePath(input?: string): Promise<string>
  }
  export default chromium
}
```

- [ ] **Step 4: Write the failing renderer tests**

Create `apps/api/src/modules/report-pdf/report-pdf.renderer.test.ts`:

```ts
import { Logger } from '@nestjs/common'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ReportPdfRenderer, type PrintSnapshot } from './report-pdf.renderer'

const state = vi.hoisted(() => ({ launch: vi.fn(), executablePath: vi.fn() }))
vi.mock('puppeteer-core', () => ({ default: { launch: state.launch } }))
vi.mock('@sparticuz/chromium', () => ({
  default: { args: ['--headless'], executablePath: state.executablePath },
}))

const reportId = 'abcdefab-0000-4000-8000-000000000003'
const snapshot: PrintSnapshot = {
  title: 'Quarterly report',
  kind: 'PROJECT_SUMMARY',
  columns: ['Code', 'Value'],
  rows: [['SYN', '4']],
  generatedAt: '2026-10-05T00:00:00.000Z',
  unavailableReasons: [],
}
type Handler = (request: { url: () => string; continue: () => void; abort: () => void }) => void

function fakePage(pdfBytes = Buffer.from('%PDF-designed')) {
  const handlers: Handler[] = []
  return {
    handlers,
    evaluateOnNewDocument: vi.fn().mockResolvedValue(undefined),
    setRequestInterception: vi.fn().mockResolvedValue(undefined),
    setExtraHTTPHeaders: vi.fn().mockResolvedValue(undefined),
    on: vi.fn((_event: string, handler: Handler) => handlers.push(handler)),
    goto: vi.fn().mockResolvedValue(undefined),
    waitForSelector: vi.fn().mockResolvedValue(undefined),
    pdf: vi.fn().mockResolvedValue(new Uint8Array(pdfBytes)),
    close: vi.fn().mockResolvedValue(undefined),
  }
}
function fakeBrowser(page: ReturnType<typeof fakePage>) {
  return { connected: true, newPage: vi.fn().mockResolvedValue(page), close: vi.fn() }
}

describe('ReportPdfRenderer', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => {})
    process.env.WEB_ORIGIN = 'https://web.example.test'
    process.env.PDF_CHROME_PATH = 'C:/chrome.exe'
    process.env.WEB_PROTECTION_BYPASS = ''
  })

  it('injects the snapshot, prints A4 with backgrounds and closes the page', async () => {
    const page = fakePage()
    state.launch.mockResolvedValue(fakeBrowser(page))
    const bytes = await new ReportPdfRenderer().render(reportId, snapshot)
    expect(bytes.toString()).toBe('%PDF-designed')
    expect(state.launch).toHaveBeenCalledWith(
      expect.objectContaining({ executablePath: 'C:/chrome.exe' }),
    )
    expect(page.evaluateOnNewDocument).toHaveBeenCalledWith(expect.any(Function), snapshot)
    expect(page.goto).toHaveBeenCalledWith(
      `https://web.example.test/print/reports/${reportId}`,
      expect.objectContaining({ waitUntil: 'networkidle0' }),
    )
    expect(page.waitForSelector).toHaveBeenCalledWith('[data-report-ready="true"]', expect.anything())
    expect(page.pdf).toHaveBeenCalledWith(
      expect.objectContaining({
        format: 'A4',
        printBackground: true,
        margin: { top: '20mm', bottom: '20mm', left: '15mm', right: '15mm' },
      }),
    )
    expect(page.close).toHaveBeenCalledOnce()
  })

  it('aborts every request outside WEB_ORIGIN, including a login redirect', async () => {
    const page = fakePage()
    state.launch.mockResolvedValue(fakeBrowser(page))
    await new ReportPdfRenderer().render(reportId, snapshot)
    const [handler] = page.handlers
    const request = (url: string) => ({ url: () => url, continue: vi.fn(), abort: vi.fn() })
    const own = request('https://web.example.test/_next/static/app.js')
    const login = request('https://vercel.com/login?next=/print')
    const inline = request('data:image/png;base64,AAAA')
    const broken = request('not a url')
    for (const item of [own, login, inline, broken]) handler?.(item)
    expect(own.continue).toHaveBeenCalled()
    expect(inline.continue).toHaveBeenCalled()
    expect(login.abort).toHaveBeenCalled()
    expect(broken.abort).toHaveBeenCalled()
  })

  it('sends the protection bypass header only when configured', async () => {
    const page = fakePage()
    state.launch.mockResolvedValue(fakeBrowser(page))
    await new ReportPdfRenderer().render(reportId, snapshot)
    expect(page.setExtraHTTPHeaders).not.toHaveBeenCalled()
    process.env.WEB_PROTECTION_BYPASS = 'bypass-secret'
    await new ReportPdfRenderer().render(reportId, snapshot)
    expect(page.setExtraHTTPHeaders).toHaveBeenCalledWith({
      'x-vercel-protection-bypass': 'bypass-secret',
    })
  })

  it('closes the page when navigation times out', async () => {
    const page = fakePage()
    page.goto.mockRejectedValue(new Error('Navigation timeout'))
    state.launch.mockResolvedValue(fakeBrowser(page))
    await expect(new ReportPdfRenderer().render(reportId, snapshot)).rejects.toThrow()
    expect(page.close).toHaveBeenCalledOnce()
  })

  it('rejects an empty PDF', async () => {
    const page = fakePage(Buffer.alloc(0))
    state.launch.mockResolvedValue(fakeBrowser(page))
    await expect(new ReportPdfRenderer().render(reportId, snapshot)).rejects.toThrow()
    expect(page.close).toHaveBeenCalledOnce()
  })

  it('refuses without WEB_ORIGIN or with a non-UUID report id before launching', async () => {
    const renderer = new ReportPdfRenderer()
    await expect(renderer.render('../../admin', snapshot)).rejects.toThrow()
    process.env.WEB_ORIGIN = ''
    await expect(renderer.render(reportId, snapshot)).rejects.toThrow('PDF renderer unavailable.')
    expect(state.launch).not.toHaveBeenCalled()
  })

  it('shares one launch between simultaneous first renders', async () => {
    const page = fakePage()
    state.launch.mockResolvedValue(fakeBrowser(page))
    const renderer = new ReportPdfRenderer()
    await Promise.all([renderer.render(reportId, snapshot), renderer.render(reportId, snapshot)])
    expect(state.launch).toHaveBeenCalledOnce()
  })

  it('relaunches after the shared browser disconnects', async () => {
    const page = fakePage()
    const first = fakeBrowser(page)
    state.launch.mockResolvedValueOnce(first).mockResolvedValueOnce(fakeBrowser(page))
    const renderer = new ReportPdfRenderer()
    await renderer.render(reportId, snapshot)
    first.connected = false
    await renderer.render(reportId, snapshot)
    expect(state.launch).toHaveBeenCalledTimes(2)
  })

  it('has no executable off Linux without PDF_CHROME_PATH', async () => {
    process.env.PDF_CHROME_PATH = ''
    const platform = Object.getOwnPropertyDescriptor(process, 'platform')
    Object.defineProperty(process, 'platform', { value: 'win32' })
    try {
      await expect(new ReportPdfRenderer().render(reportId, snapshot)).rejects.toThrow(
        'PDF renderer unavailable.',
      )
    } finally {
      if (platform) Object.defineProperty(process, 'platform', platform)
    }
  })

  it('closes the shared browser on module destroy', async () => {
    const page = fakePage()
    const browser = fakeBrowser(page)
    state.launch.mockResolvedValue(browser)
    const renderer = new ReportPdfRenderer()
    await renderer.render(reportId, snapshot)
    await renderer.onModuleDestroy()
    expect(browser.close).toHaveBeenCalledOnce()
  })
})
```

- [ ] **Step 5: Run the tests to verify they fail**

Run: `pnpm --filter @pathways/api exec vitest run src/modules/report-pdf`
Expected: FAIL, cannot resolve `./report-pdf.renderer`.

- [ ] **Step 6: Implement the renderer**

Create `apps/api/src/modules/report-pdf/report-pdf.renderer.ts`:

```ts
import { Injectable, Logger, type OnModuleDestroy } from '@nestjs/common'
import { readApiEnv } from '@pathways/config'
import type { Browser, HTTPRequest } from 'puppeteer-core'
import { REPORT_MAX_BYTES, validatedReportRows } from '../reports/report-artifact'

export type PrintSnapshot = {
  title: string
  kind: string
  columns: string[]
  rows: string[][]
  generatedAt: string
  unavailableReasons: string[]
}
const reportIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const footer =
  '<div style="width:100%;font-size:8px;color:#6F7785;text-align:center;font-family:Arial,sans-serif">PATHWAYS · Page <span class="pageNumber"></span> of <span class="totalPages"></span></div>'

// Only the web origin and inline data may load, so redirects and third-party calls abort.
function allowed(url: string, origin: string) {
  if (url.startsWith('data:') || url.startsWith('blob:')) return true
  try {
    return new URL(url).origin === origin
  } catch {
    return false
  }
}

@Injectable()
export class ReportPdfRenderer implements OnModuleDestroy {
  private readonly logger = new Logger(ReportPdfRenderer.name)
  private launching: Promise<Browser> | null = null

  async render(reportId: string, snapshot: PrintSnapshot): Promise<Buffer> {
    if (!reportIdPattern.test(reportId)) throw new Error('Invalid report id.')
    validatedReportRows([snapshot.columns, ...snapshot.rows])
    const env = readApiEnv(process.env)
    if (!env.WEB_ORIGIN) throw new Error('PDF renderer unavailable.')
    const origin = new URL(env.WEB_ORIGIN).origin
    const browser = await this.browser()
    const page = await browser.newPage()
    try {
      await page.evaluateOnNewDocument((payload) => {
        ;(globalThis as unknown as { __PATHWAYS_REPORT__: unknown }).__PATHWAYS_REPORT__ = payload
      }, snapshot)
      await page.setRequestInterception(true)
      page.on('request', (request: HTTPRequest) => {
        if (allowed(request.url(), origin)) void request.continue()
        else void request.abort()
      })
      if (env.WEB_PROTECTION_BYPASS)
        await page.setExtraHTTPHeaders({ 'x-vercel-protection-bypass': env.WEB_PROTECTION_BYPASS })
      await page.goto(`${origin}/print/reports/${reportId.toLowerCase()}`, {
        waitUntil: 'networkidle0',
        timeout: 20_000,
      })
      await page.waitForSelector('[data-report-ready="true"]', { timeout: 15_000 })
      const pdf = Buffer.from(
        await page.pdf({
          format: 'A4',
          printBackground: true,
          margin: { top: '20mm', bottom: '20mm', left: '15mm', right: '15mm' },
          displayHeaderFooter: true,
          headerTemplate: '<span></span>',
          footerTemplate: footer,
        }),
      )
      if (!pdf.length || pdf.length > REPORT_MAX_BYTES)
        throw new Error('Rendered report size unsupported.')
      return pdf
    } catch (error) {
      this.logger.warn(
        `Designed PDF failed for report ${reportId}: ${error instanceof Error ? error.name : 'Error'}`,
      )
      throw error
    } finally {
      await page.close().catch(() => undefined)
    }
  }

  async onModuleDestroy() {
    const pending = this.launching
    this.launching = null
    const browser = await pending?.catch(() => null)
    await browser?.close().catch(() => undefined)
  }

  // One shared launch serves concurrent callers and is replaced once it disconnects.
  private async browser(): Promise<Browser> {
    const pending = (this.launching ??= this.launch())
    try {
      const browser = await pending
      if (browser.connected) return browser
    } catch (error) {
      if (this.launching === pending) this.launching = null
      throw error
    }
    if (this.launching === pending) this.launching = null
    return (this.launching ??= this.launch())
  }

  private async launch(): Promise<Browser> {
    const { default: puppeteer } = await import('puppeteer-core')
    const env = readApiEnv(process.env)
    if (env.PDF_CHROME_PATH)
      return puppeteer.launch({ executablePath: env.PDF_CHROME_PATH, headless: true })
    if (process.platform !== 'linux') throw new Error('PDF renderer unavailable.')
    const { default: chromium } = await import('@sparticuz/chromium')
    return puppeteer.launch({
      executablePath: await chromium.executablePath(),
      args: chromium.args,
      headless: true,
    })
  }
}
```

Create `apps/api/src/modules/report-pdf/report-pdf.module.ts`:

```ts
import { Module } from '@nestjs/common'
import { ReportPdfRenderer } from './report-pdf.renderer'

@Module({ providers: [ReportPdfRenderer], exports: [ReportPdfRenderer] })
export class ReportPdfModule {}
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `pnpm --filter @pathways/api exec vitest run src/modules/report-pdf`
Expected: PASS, 10 tests. If the `Browser` mock type check complains in the test file only, cast with `as never` at the `mockResolvedValue` call sites rather than loosening the renderer types.

- [ ] **Step 8: Typecheck and lint**

Run: `pnpm --filter @pathways/api typecheck` then `pnpm --filter @pathways/api exec biome check src/modules/report-pdf src/types`
Expected: no errors. Fix lint formatting with `biome check --write` on these paths only.

- [ ] **Step 9: Commit**

```bash
git add packages/config/src/env.ts apps/api/package.json pnpm-lock.yaml apps/api/src/types/sparticuz-chromium.d.ts apps/api/src/modules/report-pdf
git commit -m "Add the isolated Puppeteer report PDF renderer module"
```

---

### Task 2: Use the renderer for PDF generation with pdfkit fallback

**Files:**
- Modify: `apps/api/src/modules/reports/reports.module.ts`
- Modify: `apps/api/src/modules/reports/reports.service.ts` (constructor near line 96-101; artifact creation near line 518-531)
- Test: `apps/api/src/modules/reports/reports.service.test.ts`

**Interfaces:**
- Consumes: `ReportPdfRenderer.render(reportId: string, snapshot: PrintSnapshot): Promise<Buffer>` and `ReportPdfModule` from Task 1.
- Produces: no new exports; `generate()` behavior for `format: 'PDF'`.

- [ ] **Step 1: Write the failing service tests**

In `apps/api/src/modules/reports/reports.service.test.ts`:

1. Add the import `import type { ReportPdfRenderer } from '../report-pdf/report-pdf.renderer'` beside the other type imports.
2. Directly after `const dashboards = { monitoringInTransaction: vi.fn() }` add `const renderer = { render: vi.fn() }`, and pass it as the fourth constructor argument:

```ts
const service = new ReportsService(
  {} as PrismaService,
  storage as unknown as StorageService,
  dashboards as unknown as DashboardsService,
  renderer as unknown as ReportPdfRenderer,
)
```

3. In the top-level `beforeEach` (line 131), after `state.artifact.mockResolvedValue(...)`, add the default so every existing test keeps exercising the pdfkit path:

```ts
    renderer.render.mockRejectedValue(new Error('PDF renderer unavailable.'))
```

4. After the test `'maps a renderer or integrity fault to unavailable before any upload'`, add:

```ts
  it('stores the designed PDF from the renderer without calling pdfkit', async () => {
    renderer.render.mockResolvedValue(Buffer.from('%PDF-designed'))
    await service.generate(actor, projectId, body).catch(() => undefined)
    expect(renderer.render).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ title: 'Private report', kind: 'PROJECT_SUMMARY' }),
    )
    expect(state.artifact).not.toHaveBeenCalled()
    expect(storage.uploadPrivateFile).toHaveBeenCalledWith(
      'pathways-private',
      expect.any(String),
      Buffer.from('%PDF-designed'),
      'application/pdf',
    )
  })
  it('falls back to the pdfkit artifact when the renderer fails', async () => {
    await service.generate(actor, projectId, body).catch(() => undefined)
    expect(renderer.render).toHaveBeenCalledOnce()
    expect(state.artifact).toHaveBeenCalledOnce()
    expect(storage.uploadPrivateFile).toHaveBeenCalledWith(
      'pathways-private',
      expect.any(String),
      Buffer.from('%PDF-fixture'),
      'application/pdf',
    )
  })
  it('never launches the renderer for spreadsheet formats', async () => {
    for (const format of ['CSV', 'XLS', 'XLSX'])
      await service
        .generate(actor, projectId, { ...body, format, clientRequestId: crypto.randomUUID() })
        .catch(() => undefined)
    expect(renderer.render).not.toHaveBeenCalled()
  })
```

The `.catch(() => undefined)` matters because later private-reader verification in `generate()` may reject in this mock setup; these tests only assert what happens before and at upload.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @pathways/api exec vitest run src/modules/reports/reports.service.test.ts`
Expected: the three new tests FAIL (renderer never called); existing tests still pass.

- [ ] **Step 3: Wire the module**

Replace `apps/api/src/modules/reports/reports.module.ts` with:

```ts
import { Module } from '@nestjs/common'
import { DashboardsModule } from '../dashboards/dashboards.module'
import { ReportPdfModule } from '../report-pdf/report-pdf.module'
import { ReportsController } from './reports.controller'
import { ReportsService } from './reports.service'

@Module({
  imports: [DashboardsModule, ReportPdfModule],
  controllers: [ReportsController],
  providers: [ReportsService],
})
export class ReportsModule {}
```

- [ ] **Step 4: Inject the renderer and use it for PDF**

In `apps/api/src/modules/reports/reports.service.ts`:

1. Add the import after the `DashboardsService` import:

```ts
import { ReportPdfRenderer } from '../report-pdf/report-pdf.renderer'
```

2. Add the fourth constructor parameter after the `DashboardsService` one:

```ts
    @Inject(ReportPdfRenderer) private readonly pdf: ReportPdfRenderer,
```

3. Add this private method directly above `async generate(`:

```ts
  // Designed PDF through headless Chromium; null keeps the pdfkit artifact as the fallback.
  private async designedPdf(id: string, title: string, source: Preview) {
    try {
      return await this.pdf.render(id, {
        title,
        kind: source.kind,
        columns: source.columns,
        rows: source.rows,
        generatedAt: source.generatedAt,
        unavailableReasons: source.unavailableReasons,
      })
    } catch {
      return null
    }
  }
```

4. Replace the artifact creation inside `generate()`:

```ts
      bytes = await createReportArtifact(
        body.name,
        [prepare.source.columns, ...prepare.source.rows],
        body.format,
      )
```

with:

```ts
      bytes =
        (body.format === 'PDF'
          ? await this.designedPdf(prepare.id, body.name, prepare.source)
          : null) ??
        (await createReportArtifact(
          body.name,
          [prepare.source.columns, ...prepare.source.rows],
          body.format,
        ))
```

Leave the surrounding `try/catch`, storage, fingerprint and audit code unchanged.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm --filter @pathways/api exec vitest run src/modules/reports src/modules/report-pdf`
Expected: PASS, including every pre-existing reports test.

- [ ] **Step 6: Build the API**

Run: `pnpm --filter api build`
Expected: exit 0. If the filter name does not match, use `pnpm --filter @pathways/api build`. If a stale file the feature does not import blocks the build, add `// @ts-nocheck` as its first line and record it for Task 4's docs; do not edit its logic.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/modules/reports/reports.module.ts apps/api/src/modules/reports/reports.service.ts apps/api/src/modules/reports/reports.service.test.ts
git commit -m "Render PDF reports through the designed renderer with pdfkit fallback"
```

---

### Task 3: Web print route

**Files:**
- Create: `apps/web/src/features/reports/print/print-report-payload.ts`
- Create: `apps/web/src/features/reports/print/print-report-chart.ts`
- Create: `apps/web/src/features/reports/print/print-report-view.tsx`
- Create: `apps/web/src/app/print/layout.tsx`
- Create: `apps/web/src/app/print/reports/[id]/page.tsx`
- Modify: `apps/web/src/app/globals.css` (append a print block)
- Test: `apps/web/src/features/reports/print/print-report.test.tsx`

**Interfaces:**
- Consumes: `window.__PATHWAYS_REPORT__` set by Task 1 with the `PrintSnapshot` shape `{ title, kind, columns, rows, generatedAt, unavailableReasons }`; ready contract `data-report-ready="true"`.
- Produces: `readPrintReport(input: unknown): PrintReport | null`, `sampleReport: PrintReport`, `printChartData(report: PrintReport): { points: { label: string; value: number }[]; excluded: number; total: number } | null`, `printChartOption(points: { label: string; value: number }[])`, `PrintReportView({ report }: { report: PrintReport | null })`.

- [ ] **Step 1: Write the failing tests**

Create `apps/web/src/features/reports/print/print-report.test.tsx`:

```tsx
/* @vitest-environment jsdom */
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { printChartData, printChartOption } from './print-report-chart'
import { type PrintReport, readPrintReport, sampleReport } from './print-report-payload'
import { PrintReportView } from './print-report-view'

vi.mock('echarts-for-react', () => ({
  default: ({ onEvents }: { onEvents?: { finished?: () => void } }) => {
    setTimeout(() => onEvents?.finished?.(), 0)
    return <div data-testid="chart" />
  },
}))
vi.mock('next/image', () => ({ default: () => <span data-testid="brand-mark" /> }))

const report: PrintReport = {
  title: 'Quarterly beneficiary report',
  kind: 'BENEFICIARY_SUMMARY',
  columns: ['Dimension', 'Category', 'Value', 'Metric state', 'Reason'],
  rows: [
    ['Sex', 'Female', '42', 'AVAILABLE', ''],
    ['Sex', 'Male', '1,204', 'AVAILABLE', ''],
    ['Sex', 'Intersex', 'Suppressed', 'SUPPRESSED', 'Small group'],
  ],
  generatedAt: '2026-10-05T03:00:00.000Z',
  unavailableReasons: ['Participation counts are withheld for aggregate-only roles.'],
}

afterEach(cleanup)

describe('print report payload', () => {
  it('accepts the renderer snapshot and rejects unknown keys or bad shapes', () => {
    expect(readPrintReport(report)).toEqual(report)
    expect(readPrintReport({ ...report, token: 'x' })).toBeNull()
    expect(readPrintReport({ ...report, rows: 'nope' })).toBeNull()
    expect(readPrintReport(undefined)).toBeNull()
    expect(readPrintReport(sampleReport)).toEqual(sampleReport)
  })
})

describe('print report chart', () => {
  it('charts only numeric Value cells labelled by the preceding column', () => {
    expect(printChartData(report)).toEqual({
      points: [
        { label: 'Female', value: 42 },
        { label: 'Male', value: 1204 },
      ],
      excluded: 1,
      total: 3,
    })
  })
  it('skips the chart without a Value column or with fewer than two numbers', () => {
    expect(printChartData({ ...report, columns: ['Code', 'Title'], rows: [['A', 'B']] })).toBeNull()
    expect(printChartData({ ...report, rows: [report.rows[0] as string[]] })).toBeNull()
  })
  it('caps the chart at twenty bars', () => {
    const rows = Array.from({ length: 25 }, (_, index) => ['Sex', `C${index}`, `${index}`, '', ''])
    expect(printChartData({ ...report, rows })?.points).toHaveLength(20)
  })
  it('disables animation so the headless capture is never blank', () => {
    expect(printChartOption([{ label: 'A', value: 1 }])).toMatchObject({ animation: false })
  })
})

describe('PrintReportView', () => {
  it('renders the header, reasons, chart and table, then flags ready', async () => {
    const { container } = render(<PrintReportView report={report} />)
    expect(screen.getByRole('heading', { name: 'Quarterly beneficiary report' })).toBeTruthy()
    expect(screen.getByText(/Beneficiary summary/)).toBeTruthy()
    expect(screen.getByText(/Participation counts are withheld/)).toBeTruthy()
    expect(screen.getByText('1,204')).toBeTruthy()
    expect(screen.getByText(/1 of 3 rows not charted/)).toBeTruthy()
    expect(screen.getByTestId('chart')).toBeTruthy()
    await waitFor(() =>
      expect(container.querySelector('[data-report-ready="true"]')).toBeTruthy(),
    )
  })
  it('flags ready immediately when there is nothing to chart', async () => {
    const { container } = render(
      <PrintReportView report={{ ...report, columns: ['Code'], rows: [['SYN']] }} />,
    )
    expect(screen.queryByTestId('chart')).toBeNull()
    await waitFor(() =>
      expect(container.querySelector('[data-report-ready="true"]')).toBeTruthy(),
    )
  })
  it('shows an empty state without a payload', () => {
    const { container } = render(<PrintReportView report={null} />)
    expect(screen.getByText('No report data.')).toBeTruthy()
    expect(container.querySelector('[data-report-ready="true"]')).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter web exec vitest run src/features/reports/print`
Expected: FAIL, cannot resolve `./print-report-chart`.

- [ ] **Step 3: Implement the payload parser**

Create `apps/web/src/features/reports/print/print-report-payload.ts`:

```ts
import { z } from 'zod'

const cell = z.string().max(2000)
const printReportSchema = z
  .object({
    title: z.string().min(1).max(200),
    kind: z.string().min(1).max(40),
    columns: z.array(cell).min(1).max(30),
    rows: z.array(z.array(cell).max(30)).max(1000),
    generatedAt: z.string().max(40),
    unavailableReasons: z.array(cell).max(100),
  })
  .strict()

export type PrintReport = z.infer<typeof printReportSchema>

export const readPrintReport = (input: unknown): PrintReport | null => {
  const parsed = printReportSchema.safeParse(input)
  return parsed.success ? parsed.data : null
}

// Fictional fixture for checking the print design locally with ?sample=1.
export const sampleReport: PrintReport = {
  title: 'Sample beneficiary summary',
  kind: 'BENEFICIARY_SUMMARY',
  columns: ['Dimension', 'Category', 'Value', 'Metric state', 'Reason'],
  rows: [
    ['Sex', 'Female', '128', 'AVAILABLE', ''],
    ['Sex', 'Male', '97', 'AVAILABLE', ''],
    ['Sex', 'Intersex', 'Suppressed', 'SUPPRESSED', 'Small group'],
    ['Age group', '18 to 24', '61', 'AVAILABLE', ''],
    ['Age group', '25 to 34', '84', 'AVAILABLE', ''],
  ],
  generatedAt: '2026-10-05T03:00:00.000Z',
  unavailableReasons: ['Groups below the small-group threshold are suppressed.'],
}
```

- [ ] **Step 4: Implement the chart helpers**

Create `apps/web/src/features/reports/print/print-report-chart.ts`:

```ts
import { chartGrid, chartPalette } from '@/lib/chart-palette'
import type { PrintReport } from './print-report-payload'

type Point = { label: string; value: number }
const MAX_BARS = 20

const numeric = (value: string) => {
  const text = value.trim().replaceAll(',', '')
  return /^-?\d+(\.\d+)?$/.test(text) ? Number(text) : null
}

/** Numeric Value cells labelled by the preceding column; suppressed or missing cells are counted, never charted. */
export function printChartData(report: PrintReport) {
  const valueIndex = report.columns.indexOf('Value')
  if (valueIndex < 0 || report.columns.length < 2) return null
  const labelIndex = valueIndex > 0 ? valueIndex - 1 : 1
  const points: Point[] = []
  for (const row of report.rows) {
    const value = numeric(row[valueIndex] ?? '')
    if (value !== null) points.push({ label: row[labelIndex] ?? '', value })
  }
  if (points.length < 2) return null
  return {
    points: points.slice(0, MAX_BARS),
    excluded: report.rows.length - points.length,
    total: report.rows.length,
  }
}

export function printChartOption(points: Point[]) {
  return {
    animation: false,
    aria: {
      enabled: true,
      description: `Report values. ${points.map((point) => `${point.label} ${point.value}`).join(', ')}.`,
    },
    grid: { left: 8, right: 8, top: 24, bottom: 8, containLabel: true },
    xAxis: {
      type: 'category',
      data: points.map((point) => point.label),
      axisLabel: { interval: 0, rotate: points.length > 6 ? 30 : 0, fontSize: 10 },
    },
    yAxis: { type: 'value', splitLine: { lineStyle: { color: chartGrid } } },
    series: [
      {
        type: 'bar',
        color: chartPalette[0],
        barMaxWidth: 36,
        label: { show: true, position: 'top', fontSize: 10 },
        data: points.map((point) => point.value),
      },
    ],
  }
}
```

- [ ] **Step 5: Implement the view**

Create `apps/web/src/features/reports/print/print-report-view.tsx`:

```tsx
'use client'

import ReactECharts from 'echarts-for-react'
import { useMemo, useState } from 'react'

import { BrandMark } from '@/components/pathways/brand-mark'
import { printChartData, printChartOption } from './print-report-chart'
import type { PrintReport } from './print-report-payload'

const kindLabels: Record<string, string> = {
  PROJECT_SUMMARY: 'Project summary',
  INDICATOR_SUMMARY: 'Indicator summary',
  BENEFICIARY_SUMMARY: 'Beneficiary summary',
  SURVEY_FORM_RESULTS: 'Survey results',
  MONITORING_REPORT: 'Monitoring report',
  EVALUATION_REPORT: 'Evaluation report',
}

export function PrintReportView({ report }: { report: PrintReport | null }) {
  const chart = useMemo(() => (report ? printChartData(report) : null), [report])
  // The snapshot never changes after mount, so the chart finishes at most once.
  const [chartDone, setChartDone] = useState(false)
  if (!report)
    return (
      <main data-report-ready="true" className="p-8 text-sm text-muted-foreground">
        No report data.
      </main>
    )
  const ready = !chart || chartDone
  return (
    <main
      data-report-ready={ready ? 'true' : 'false'}
      className="mx-auto max-w-[180mm] bg-workspace text-ink print:max-w-none"
    >
      <header className="print-avoid flex items-center gap-3 border-b-4 border-navy pb-4">
        <BrandMark className="h-10 w-10" priority />
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-navy">PATHWAYS</p>
          <h1 className="font-heading text-2xl text-navy">{report.title}</h1>
          <p className="text-sm text-muted-foreground">
            {kindLabels[report.kind] ?? 'Report'} · Generated{' '}
            {new Date(report.generatedAt).toLocaleString('en-PH', { timeZone: 'Asia/Manila' })}
          </p>
        </div>
      </header>
      {report.unavailableReasons.length > 0 && (
        <section className="print-avoid mt-4 rounded-md border border-warning bg-warning-subtle p-3 text-sm">
          <h2 className="font-semibold">Unavailable or withheld data</h2>
          <ul className="mt-1 list-disc pl-5">
            {report.unavailableReasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        </section>
      )}
      {chart && (
        <section className="print-avoid mt-6">
          <h2 className="text-sm font-semibold text-navy">Summary</h2>
          <ReactECharts
            option={printChartOption(chart.points)}
            opts={{ renderer: 'svg' }}
            style={{ height: 280 }}
            onEvents={{ finished: () => setChartDone(true) }}
          />
          {chart.excluded > 0 && (
            <p className="text-xs text-muted-foreground">
              {chart.excluded} of {chart.total} rows not charted because their value is suppressed or
              unavailable.
            </p>
          )}
        </section>
      )}
      <table className="mt-6 w-full border-collapse text-xs">
        <thead className="print-table-head bg-surface-subtle">
          <tr>
            {report.columns.map((column) => (
              <th key={column} className="border-b border-border px-2 py-1.5 text-left font-semibold">
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {report.rows.map((row, rowIndex) => (
            // Rows have no stable id; the snapshot order is fixed for the page lifetime.
            // biome-ignore lint/suspicious/noArrayIndexKey: immutable snapshot rows
            <tr key={rowIndex} className="print-avoid border-b border-border">
              {row.map((cell, cellIndex) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: immutable snapshot cells
                <td key={cellIndex} className="px-2 py-1.5 align-top">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  )
}
```

If biome reports the `biome-ignore` comments as unused, remove them.

- [ ] **Step 6: Implement the route and layout**

Create `apps/web/src/app/print/layout.tsx`:

```tsx
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Report', robots: { index: false, follow: false } }

export default function PrintLayout({ children }: { children: React.ReactNode }) {
  return children
}
```

Create `apps/web/src/app/print/reports/[id]/page.tsx`:

```tsx
'use client'

import { useEffect, useState } from 'react'

import {
  type PrintReport,
  readPrintReport,
  sampleReport,
} from '@/features/reports/print/print-report-payload'
import { PrintReportView } from '@/features/reports/print/print-report-view'

declare global {
  interface Window {
    __PATHWAYS_REPORT__?: unknown
  }
}

// The API injects the authorized snapshot before navigation; nothing is fetched here.
export default function PrintReportPage() {
  const [report, setReport] = useState<PrintReport | null | undefined>(undefined)
  useEffect(() => {
    const sample =
      process.env.NODE_ENV !== 'production' &&
      new URLSearchParams(window.location.search).has('sample')
    setReport(sample ? sampleReport : readPrintReport(window.__PATHWAYS_REPORT__))
  }, [])
  if (report === undefined) return null
  return <PrintReportView report={report} />
}
```

- [ ] **Step 7: Add print CSS**

Append to the end of `apps/web/src/app/globals.css`:

```css
/* Print pagination for the report route and any printed page. */
@media print {
  @page {
    size: A4;
  }
  html,
  body {
    background: #fff;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .print-break-before {
    break-before: page;
  }
  .print-avoid {
    break-inside: avoid;
  }
  .print-table-head {
    display: table-header-group;
  }
}
```

- [ ] **Step 8: Run the tests to verify they pass**

Run: `pnpm --filter web exec vitest run src/features/reports/print`
Expected: PASS, 9 tests.

- [ ] **Step 9: Lint and build**

Run: `pnpm --filter web exec biome check src/features/reports/print src/app/print src/app/globals.css` then `pnpm --filter web build`
Expected: no lint errors; build exit 0 and the route list includes `/print/reports/[id]`. Apply the `// @ts-nocheck` rule from Task 2 Step 6 only to stale files the feature does not import.

- [ ] **Step 10: Commit**

```bash
git add apps/web/src/features/reports/print apps/web/src/app/print apps/web/src/app/globals.css
git commit -m "Add the DSD print route for designed report PDFs"
```

---

### Task 4: Generate form hint, docs and end-to-end local check

**Files:**
- Modify: `apps/web/src/features/reports/live-reporting-workspace.tsx` (format `Label` near line 315)
- Create: `docs/cr-pathways-report-pdf-renderer.md`
- Modify: `docs/qad-pathways.md`, `docs/dsd-pathways.md`, `docs/activity-log.md`, `docs/deferred-features.md`, `docs/index.md`

**Interfaces:**
- Consumes: everything from Tasks 1 to 3.
- Produces: documentation only, plus one help line in the generate form.

- [ ] **Step 1: Add the format hint**

In `live-reporting-workspace.tsx`, inside the `<Label className="space-y-2">` that wraps the Format `Select`, after the closing `</Select>`, add:

```tsx
            <span className="block text-xs text-muted-foreground">
              PDF includes charts and DSD styling.
            </span>
```

Run: `pnpm --filter web exec vitest run src/features/reports`
Expected: PASS (existing workspace tests unaffected).

- [ ] **Step 2: Write the change record**

Read `docs/change-record-template.md` and `docs/cr-pathways-f8-f9-f12-gate-closure.md` for format, then create `docs/cr-pathways-report-pdf-renderer.md` following the template. Content to cover: PRD-F12 UC-F12-1; PDF artifacts rendered by headless Chromium from `/print/reports/[id]` with the authorized snapshot injected; pdfkit fallback keeps G-F12-2 and G-F12-4 Met; no migration, no schema change, no new permission; new env keys `WEB_PROTECTION_BYPASS` and `PDF_CHROME_PATH`; new dependencies `puppeteer-core` 25.12.0 and `@sparticuz/chromium` 153.0.0; hosted verification pending; developer decisions dated 2026-10-05 (renderer inside generate, snapshot injection over cookie forwarding).

- [ ] **Step 3: Add QAD rows**

In `docs/qad-pathways.md`, add two rows next to QAD-T73 in the same table format (next free ids are QAD-T119 and QAD-T120; confirm with `grep -o "QAD-T[0-9]*" docs/qad-pathways.md | sort -t T -k2 -n | uniq | tail -1`):

- `QAD-T119` | designed PDF renders the injected snapshot only from `WEB_ORIGIN`, aborts off-origin requests and always closes the page | Happy | Security | PRD-F12 | G-F12-4 | UC-F12-1 | `apps/api/src/modules/report-pdf/report-pdf.renderer.test.ts`; `apps/web/src/features/reports/print/print-report.test.tsx`
- `QAD-T120` | a renderer failure falls back to the pdfkit artifact and spreadsheet formats never launch Chromium | Sad | Reliability | PRD-F12 | G-F12-2, G-F12-4 | UC-F12-1 | `apps/api/src/modules/reports/reports.service.test.ts`

Add `QAD-T119` and `QAD-T120` to the QAD column of G-F12-4 in `docs/prd-pathways.md` (the gate table near line 1378) only if that file lists every covering row; otherwise leave the PRD unchanged.

- [ ] **Step 4: Add the DSD pattern**

In `docs/dsd-pathways.md`, directly after the `### Charts, maps, monitoring visuals` subsection, add:

```markdown
### Printed report

The PDF report route `/print/reports/[id]` is the printed form of a report.

- Header: brand mark, `PATHWAYS` overline in navy, report name in the heading font, report type and generated time in muted text, 4px navy bottom rule.
- Unavailable or withheld data: warning-subtle callout listing each reason in text.
- Chart: one bar chart of numeric `Value` cells (at most 20), `chartPalette[0]`, value labels on top, animation off, SVG renderer; suppressed or unavailable rows are counted in a caption, never charted as zero.
- Table: surface-subtle header repeated on each page, divider row rules, rows never split across pages.
- Print classes: `.print-avoid` (no split), `.print-break-before` (new page), `.print-table-head` (repeating header); A4 with 20mm top and bottom and 15mm side margins and a centered page-number footer.
```

- [ ] **Step 5: Log and register**

1. `docs/activity-log.md`: under a `## 2026-10-05` heading (add it in date order if missing), add one line: `- F12 designed PDF: Puppeteer renderer module, print route and pdfkit fallback under cr-pathways-report-pdf-renderer; hosted Chromium verification pending.` Also list any file that received `// @ts-nocheck` in Tasks 2 or 3.
2. `docs/deferred-features.md`: add a row in the existing table format: Feature `Designed PDF on hosted`, State `Pending verification`, Decided `2026-10-05`, Why `Chromium on Vercel Functions needs the pathways-api function settings and a hosted smoke test; until then failures fall back to pdfkit.`, Where `apps/api/src/modules/report-pdf`, To re-enable `Set WEB_ORIGIN (and WEB_PROTECTION_BYPASS for protected previews), function duration of at least 60 s and memory of at least 1024 MB, then generate one PDF on hosted.` Add any `// @ts-nocheck` files as rows too.
3. `docs/index.md`: register `cr-pathways-report-pdf-renderer.md`, the spec `superpowers/specs/2026-10-05-f12-puppeteer-pdf-design.md` and this plan `superpowers/plans/2026-10-05-f12-puppeteer-pdf.md` in the sections where similar CRs, specs and plans are listed.

Run: `pnpm docs:check`
Expected: no failures beyond the 6 pre-existing trace failures on dev; none mention the new files.

- [ ] **Step 6: End-to-end local PDF**

The developer is running `pnpm dev` in `C:\PATHWAYS` on ports 3000 and 4000; use port 3100 from the worktree and do not touch those processes.

1. `pnpm --filter api build` and `pnpm --filter web build` (both exit 0).
2. Start the built web app in the background from the worktree: `pnpm --filter web exec next start -p 3100`.
3. Open `http://127.0.0.1:3100/print/reports/abcdefab-0000-4000-8000-000000000003` with plain HTTP (for example `curl -s -o /dev/null -w "%{http_code}"`) and confirm 200 with no redirect to sign-in.
4. Render one real PDF through the built renderer with local Edge (Bash, from the worktree root):

```bash
WEB_ORIGIN=http://127.0.0.1:3100 PDF_CHROME_PATH="C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe" node -e "
const fs = require('node:fs')
const { ReportPdfRenderer } = require('./apps/api/dist/apps/api/src/modules/report-pdf/report-pdf.renderer.js')
const renderer = new ReportPdfRenderer()
renderer.render('abcdefab-0000-4000-8000-000000000003', {
  title: 'Local check beneficiary summary', kind: 'BENEFICIARY_SUMMARY',
  columns: ['Dimension','Category','Value','Metric state','Reason'],
  rows: [['Sex','Female','128','AVAILABLE',''],['Sex','Male','97','AVAILABLE',''],['Sex','Intersex','Suppressed','SUPPRESSED','Small group']],
  generatedAt: new Date().toISOString(), unavailableReasons: ['Groups below the small-group threshold are suppressed.'],
}).then((bytes) => { fs.writeFileSync(process.argv[1], bytes); console.log('bytes', bytes.length); return renderer.onModuleDestroy() })
 .catch((error) => { console.error(error); process.exit(1) })
" "$SCRATCH/f12-local-check.pdf"
```

Set `SCRATCH` to the session scratchpad directory given in your instructions. If the dist path differs, locate it with `find apps/api/dist -name report-pdf.renderer.js`.
Expected: `bytes` above 10000, a PDF file showing the header, warning callout, a two-bar chart, the caption "1 of 3 rows not charted" and the table.
5. Stop the `next start` process.
6. Report the PDF path in your final message so the controller can open it.

- [ ] **Step 7: Full scoped gates**

Run:

```bash
pnpm --filter @pathways/api exec vitest run src/modules/reports src/modules/report-pdf
pnpm --filter web exec vitest run src/features/reports
pnpm --filter @pathways/api exec biome check src/modules/report-pdf src/modules/reports src/types
pnpm --filter web exec biome check src/features/reports src/app/print
```

Expected: all PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/features/reports/live-reporting-workspace.tsx docs
git commit -m "Document the F12 designed PDF renderer and add the generate format hint"
```
