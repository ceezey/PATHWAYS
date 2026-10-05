import { Injectable, type OnModuleDestroy } from '@nestjs/common'
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

export type ReportPdfStage =
  | 'input'
  | 'config'
  | 'launch'
  | 'navigate'
  | 'ready'
  | 'print'
  | 'size'
  | 'deadline'

/** Every render failure carries a fixed message, the failing stage and the original error name only. */
export class ReportPdfError extends Error {
  constructor(
    readonly stage: ReportPdfStage,
    readonly causeName = 'Error',
  ) {
    super(`Designed PDF failed at ${stage}.`)
    this.name = 'ReportPdfError'
  }
}

const RENDER_DEADLINE_MS = 40_000
const PROTOCOL_TIMEOUT_MS = 20_000
type Shared = { browser: Browser; pending: Promise<Browser> }

@Injectable()
export class ReportPdfRenderer implements OnModuleDestroy {
  private launching: Promise<Browser> | null = null

  async render(reportId: string, snapshot: PrintSnapshot): Promise<Buffer> {
    if (!reportIdPattern.test(reportId)) throw new ReportPdfError('input')
    try {
      validatedReportRows([snapshot.columns, ...snapshot.rows])
    } catch (error) {
      throw new ReportPdfError('input', error instanceof Error ? error.name : undefined)
    }
    const env = readApiEnv(process.env)
    if (!env.WEB_ORIGIN) throw new ReportPdfError('config')
    const origin = new URL(env.WEB_ORIGIN).origin
    let stage: ReportPdfStage = 'launch'
    let shared: Shared | null = null
    let timer: NodeJS.Timeout | undefined
    const work = (async () => {
      shared = await this.browser()
      stage = 'navigate'
      const page = await shared.browser.newPage()
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
          await page.setExtraHTTPHeaders({
            'x-vercel-protection-bypass': env.WEB_PROTECTION_BYPASS,
          })
        await page.goto(`${origin}/print/reports/${reportId.toLowerCase()}`, {
          waitUntil: 'networkidle0',
          timeout: 20_000,
        })
        stage = 'ready'
        const marker = await page.waitForSelector(
          '[data-report-ready]:not([data-report-ready="false"])',
          { timeout: 15_000 },
        )
        const state = await marker?.evaluate((element) =>
          (element as unknown as { getAttribute(name: string): string | null }).getAttribute(
            'data-report-ready',
          ),
        )
        if (state !== 'true') throw new Error('Report not ready.')
        stage = 'print'
        const pdf = Buffer.from(
          await page.pdf({
            format: 'A4',
            printBackground: true,
            margin: { top: '20mm', bottom: '20mm', left: '15mm', right: '15mm' },
            displayHeaderFooter: true,
            headerTemplate: '<span></span>',
            footerTemplate: footer,
            timeout: 20_000,
          }),
        )
        stage = 'size'
        if (!pdf.length || pdf.length > REPORT_MAX_BYTES) throw new Error('Size unsupported.')
        return pdf
      } finally {
        void page.close().catch(() => undefined)
      }
    })()
    work.catch(() => undefined)
    const deadline = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        stage = 'deadline'
        reject(new Error('Render deadline exceeded.'))
      }, RENDER_DEADLINE_MS)
    })
    try {
      return await Promise.race([work, deadline])
    } catch (error) {
      this.discard(shared)
      throw new ReportPdfError(stage, error instanceof Error ? error.name : undefined)
    } finally {
      clearTimeout(timer)
    }
  }

  async onModuleDestroy() {
    const pending = this.launching
    this.launching = null
    const browser = await pending?.catch(() => null)
    await browser?.close().catch(() => undefined)
  }

  // Drops a failed shared browser so the next render launches a fresh one.
  private discard(shared: Shared | null) {
    if (!shared) return
    if (this.launching === shared.pending) this.launching = null
    void shared.browser.close().catch(() => undefined)
  }

  // One shared launch serves concurrent callers and is replaced once it disconnects.
  private async browser(): Promise<Shared> {
    for (let attempt = 0; attempt < 2; attempt++) {
      const pending = this.launching ?? this.launch()
      this.launching = pending
      try {
        const browser = await pending
        if (browser.connected) return { browser, pending }
      } catch (error) {
        if (this.launching === pending) this.launching = null
        throw error
      }
      if (this.launching === pending) this.launching = null
    }
    throw new Error('Browser unavailable.')
  }

  private async launch(): Promise<Browser> {
    const { default: puppeteer } = await import('puppeteer-core')
    const env = readApiEnv(process.env)
    if (env.PDF_CHROME_PATH)
      return puppeteer.launch({
        executablePath: env.PDF_CHROME_PATH,
        headless: true,
        protocolTimeout: PROTOCOL_TIMEOUT_MS,
      })
    if (process.platform !== 'linux') throw new Error('PDF renderer unavailable.')
    const { default: chromium } = await import('@sparticuz/chromium')
    return puppeteer.launch({
      executablePath: await chromium.executablePath(),
      args: chromium.args,
      headless: 'shell',
      protocolTimeout: PROTOCOL_TIMEOUT_MS,
    })
  }
}
