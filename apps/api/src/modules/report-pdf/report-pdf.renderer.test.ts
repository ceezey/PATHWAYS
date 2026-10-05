import { Logger } from '@nestjs/common'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { type PrintSnapshot, ReportPdfRenderer } from './report-pdf.renderer'

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
  return {
    connected: true,
    newPage: vi.fn().mockResolvedValue(page),
    close: vi.fn().mockResolvedValue(undefined),
  }
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
    expect(page.waitForSelector).toHaveBeenCalledWith(
      '[data-report-ready="true"]',
      expect.anything(),
    )
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
