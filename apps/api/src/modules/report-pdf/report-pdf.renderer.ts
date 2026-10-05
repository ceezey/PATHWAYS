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
    const pending = this.launching ?? this.launch()
    this.launching = pending
    try {
      const browser = await pending
      if (browser.connected) return browser
    } catch (error) {
      if (this.launching === pending) this.launching = null
      throw error
    }
    if (this.launching === pending) this.launching = null
    if (!this.launching) this.launching = this.launch()
    return this.launching
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
