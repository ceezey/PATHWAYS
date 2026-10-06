import { existsSync } from 'node:fs'
import { win32 } from 'node:path'
import { Injectable, type OnModuleDestroy } from '@nestjs/common'
import { readApiEnv } from '@pathways/config'
import type { Browser, HTTPRequest } from 'puppeteer-core'
import { localWebOrigins } from '../../common/network/cors-origins'

// First standard Chrome or Edge install off Linux, so a local run needs no PDF_CHROME_PATH.
function installedBrowser() {
  const candidates =
    process.platform === 'win32'
      ? [process.env.PROGRAMFILES, process.env['PROGRAMFILES(X86)'], process.env.LOCALAPPDATA]
          .filter((base): base is string => Boolean(base))
          .flatMap((base) => [
            win32.join(base, 'Google', 'Chrome', 'Application', 'chrome.exe'),
            win32.join(base, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
          ])
      : process.platform === 'darwin'
        ? [
            '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
            '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
          ]
        : []
  return candidates.find((path) => existsSync(path))
}

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

export type PrintPdfStage =
  | 'input'
  | 'config'
  | 'launch'
  | 'navigate'
  | 'ready'
  | 'print'
  | 'size'
  | 'deadline'

/** Every render failure carries a fixed message, the failing stage and the original error name only. */
export class PrintPdfError extends Error {
  constructor(
    readonly stage: PrintPdfStage,
    readonly causeName = 'Error',
  ) {
    super(`Designed PDF failed at ${stage}.`)
    this.name = 'PrintPdfError'
  }
}

const RENDER_DEADLINE_MS = 40_000
const PROTOCOL_TIMEOUT_MS = 20_000
type Shared = { browser: Browser; pending: Promise<Browser> }

export type PrintPdfRequest = {
  /** Path on the web origin, already encoded, such as `/print/reports/<id>`. */
  path: string
  /** Global the page reads its authorized snapshot from before navigation. */
  globalName: string
  payload: unknown
  maxBytes: number
}

/** Shared headless Chromium print pipeline; each document kind supplies its own page and payload. */
@Injectable()
export class PrintPdfRenderer implements OnModuleDestroy {
  private launching: Promise<Browser> | null = null

  async render(request: PrintPdfRequest): Promise<Buffer> {
    const env = readApiEnv(process.env)
    // WEB_ORIGIN is the CORS allowlist entry and must be HTTPS, so a local run leaves it blank.
    // The renderer still needs somewhere to navigate: outside production that is the loopback web app.
    const configured =
      env.WEB_ORIGIN || (process.env.NODE_ENV === 'production' ? '' : localWebOrigins[0])
    if (!configured) throw new PrintPdfError('config')
    const origin = new URL(configured).origin
    let stage: PrintPdfStage = 'launch'
    let shared: Shared | null = null
    let timer: NodeJS.Timeout | undefined
    const work = (async () => {
      shared = await this.browser()
      stage = 'navigate'
      const page = await shared.browser.newPage()
      try {
        await page.evaluateOnNewDocument(
          (injected: { name: string; value: unknown }) => {
            ;(globalThis as unknown as Record<string, unknown>)[injected.name] = injected.value
          },
          { name: request.globalName, value: request.payload },
        )
        await page.setRequestInterception(true)
        page.on('request', (httpRequest: HTTPRequest) => {
          if (allowed(httpRequest.url(), origin)) void httpRequest.continue()
          else void httpRequest.abort()
        })
        if (env.WEB_PROTECTION_BYPASS)
          await page.setExtraHTTPHeaders({
            'x-vercel-protection-bypass': env.WEB_PROTECTION_BYPASS,
          })
        await page.goto(`${origin}${request.path}`, {
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
        if (state !== 'true') throw new Error('Page not ready.')
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
        if (!pdf.length || pdf.length > request.maxBytes) throw new Error('Size unsupported.')
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
      throw new PrintPdfError(stage, error instanceof Error ? error.name : undefined)
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
    const local = env.PDF_CHROME_PATH || installedBrowser()
    if (local)
      return puppeteer.launch({
        executablePath: local,
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
