import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PrintPdfRenderer } from './print-pdf.renderer'
import { type PrintSnapshot, ReportPdfError, ReportPdfRenderer } from './report-pdf.renderer'

const state = vi.hoisted(() => ({
  launch: vi.fn(),
  executablePath: vi.fn(),
  installed: new Set<string>(),
}))
vi.mock('node:fs', async (original) => ({
  ...(await original<typeof import('node:fs')>()),
  existsSync: (path: string) => state.installed.has(path),
}))
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

function fakePage(pdfBytes = Buffer.from('%PDF-designed'), ready = 'true') {
  const handlers: Handler[] = []
  return {
    handlers,
    evaluateOnNewDocument: vi.fn().mockResolvedValue(undefined),
    setRequestInterception: vi.fn().mockResolvedValue(undefined),
    setExtraHTTPHeaders: vi.fn().mockResolvedValue(undefined),
    on: vi.fn((_event: string, handler: Handler) => handlers.push(handler)),
    goto: vi.fn().mockResolvedValue(undefined),
    waitForSelector: vi.fn().mockResolvedValue({ evaluate: vi.fn().mockResolvedValue(ready) }),
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
    process.env.WEB_ORIGIN = 'https://web.example.test'
    process.env.PDF_CHROME_PATH = 'C:/chrome.exe'
    process.env.WEB_PROTECTION_BYPASS = ''
    state.installed.clear()
  })

  it('injects the snapshot, prints A4 with backgrounds and closes the page', async () => {
    const page = fakePage()
    state.launch.mockResolvedValue(fakeBrowser(page))
    const bytes = await new ReportPdfRenderer(new PrintPdfRenderer()).render(reportId, snapshot)
    expect(bytes.toString()).toBe('%PDF-designed')
    expect(state.launch).toHaveBeenCalledWith(
      expect.objectContaining({
        executablePath: 'C:/chrome.exe',
        headless: true,
        protocolTimeout: 20_000,
      }),
    )
    expect(page.evaluateOnNewDocument).toHaveBeenCalledWith(expect.any(Function), {
      name: '__PATHWAYS_REPORT__',
      value: snapshot,
    })
    expect(page.goto).toHaveBeenCalledWith(
      `https://web.example.test/print/reports/${reportId}`,
      expect.objectContaining({ waitUntil: 'networkidle0' }),
    )
    expect(page.waitForSelector).toHaveBeenCalledWith(
      '[data-report-ready]:not([data-report-ready="false"])',
      expect.anything(),
    )
    expect(page.pdf).toHaveBeenCalledWith(
      expect.objectContaining({
        format: 'A4',
        printBackground: true,
        margin: { top: '20mm', bottom: '20mm', left: '15mm', right: '15mm' },
        timeout: 20_000,
      }),
    )
    expect(page.close).toHaveBeenCalledOnce()
  })

  it('aborts every request outside WEB_ORIGIN, including a login redirect', async () => {
    const page = fakePage()
    state.launch.mockResolvedValue(fakeBrowser(page))
    await new ReportPdfRenderer(new PrintPdfRenderer()).render(reportId, snapshot)
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
    await new ReportPdfRenderer(new PrintPdfRenderer()).render(reportId, snapshot)
    expect(page.setExtraHTTPHeaders).not.toHaveBeenCalled()
    process.env.WEB_PROTECTION_BYPASS = 'bypass-secret'
    await new ReportPdfRenderer(new PrintPdfRenderer()).render(reportId, snapshot)
    expect(page.setExtraHTTPHeaders).toHaveBeenCalledWith({
      'x-vercel-protection-bypass': 'bypass-secret',
    })
  })

  it('closes the page when navigation times out', async () => {
    const page = fakePage()
    page.goto.mockRejectedValue(new Error('Navigation timeout'))
    state.launch.mockResolvedValue(fakeBrowser(page))
    await expect(
      new ReportPdfRenderer(new PrintPdfRenderer()).render(reportId, snapshot),
    ).rejects.toMatchObject({
      stage: 'navigate',
    })
    expect(page.close).toHaveBeenCalledOnce()
  })

  it('rejects an empty PDF', async () => {
    const page = fakePage(Buffer.alloc(0))
    state.launch.mockResolvedValue(fakeBrowser(page))
    await expect(
      new ReportPdfRenderer(new PrintPdfRenderer()).render(reportId, snapshot),
    ).rejects.toMatchObject({
      stage: 'size',
    })
    expect(page.close).toHaveBeenCalledOnce()
  })

  it('refuses a non-UUID report id before launching', async () => {
    const renderer = new ReportPdfRenderer(new PrintPdfRenderer())
    await expect(renderer.render('../../admin', snapshot)).rejects.toMatchObject({ stage: 'input' })
    expect(state.launch).not.toHaveBeenCalled()
  })

  it('refuses in production without WEB_ORIGIN, before launching', async () => {
    process.env.WEB_ORIGIN = ''
    const node = process.env.NODE_ENV
    process.env.NODE_ENV = 'production'
    try {
      await expect(
        new ReportPdfRenderer(new PrintPdfRenderer()).render(reportId, snapshot),
      ).rejects.toMatchObject({ stage: 'config' })
      expect(state.launch).not.toHaveBeenCalled()
    } finally {
      process.env.NODE_ENV = node
    }
  })

  // WEB_ORIGIN is the CORS allowlist entry and must be HTTPS, so a local run leaves it blank.
  it('navigates to the loopback web app outside production when WEB_ORIGIN is blank', async () => {
    process.env.WEB_ORIGIN = ''
    const page = fakePage()
    state.launch.mockResolvedValue(fakeBrowser(page))
    await new ReportPdfRenderer(new PrintPdfRenderer()).render(reportId, snapshot)
    expect(page.goto).toHaveBeenCalledWith(
      `http://127.0.0.1:3000/print/reports/${reportId}`,
      expect.objectContaining({ waitUntil: 'networkidle0' }),
    )
  })

  it('shares one launch between simultaneous first renders', async () => {
    const page = fakePage()
    state.launch.mockResolvedValue(fakeBrowser(page))
    const renderer = new ReportPdfRenderer(new PrintPdfRenderer())
    await Promise.all([renderer.render(reportId, snapshot), renderer.render(reportId, snapshot)])
    expect(state.launch).toHaveBeenCalledOnce()
  })

  it('relaunches after the shared browser disconnects', async () => {
    const page = fakePage()
    const first = fakeBrowser(page)
    state.launch.mockResolvedValueOnce(first).mockResolvedValueOnce(fakeBrowser(page))
    const renderer = new ReportPdfRenderer(new PrintPdfRenderer())
    await renderer.render(reportId, snapshot)
    first.connected = false
    await renderer.render(reportId, snapshot)
    expect(state.launch).toHaveBeenCalledTimes(2)
  })

  it('has no executable off Linux without PDF_CHROME_PATH or an installed browser', async () => {
    process.env.PDF_CHROME_PATH = ''
    const platform = Object.getOwnPropertyDescriptor(process, 'platform')
    Object.defineProperty(process, 'platform', { value: 'win32' })
    try {
      await expect(
        new ReportPdfRenderer(new PrintPdfRenderer()).render(reportId, snapshot),
      ).rejects.toMatchObject({
        stage: 'launch',
      })
    } finally {
      if (platform) Object.defineProperty(process, 'platform', platform)
    }
    expect(state.launch).not.toHaveBeenCalled()
  })

  it('launches an installed Chrome off Linux without PDF_CHROME_PATH', async () => {
    process.env.PDF_CHROME_PATH = ''
    process.env.PROGRAMFILES = 'C:\\Program Files'
    const chrome = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
    state.installed.add(chrome)
    state.launch.mockResolvedValue(fakeBrowser(fakePage()))
    const platform = Object.getOwnPropertyDescriptor(process, 'platform')
    Object.defineProperty(process, 'platform', { value: 'win32' })
    try {
      await new ReportPdfRenderer(new PrintPdfRenderer()).render(reportId, snapshot)
    } finally {
      if (platform) Object.defineProperty(process, 'platform', platform)
    }
    expect(state.launch).toHaveBeenCalledWith(
      expect.objectContaining({ executablePath: chrome, headless: true }),
    )
  })

  it('keeps an explicit PDF_CHROME_PATH ahead of an installed browser', async () => {
    process.env.PDF_CHROME_PATH = 'Z:/missing/chrome.exe'
    process.env.PROGRAMFILES = 'C:\\Program Files'
    state.installed.add('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe')
    state.launch.mockResolvedValue(fakeBrowser(fakePage()))
    await new ReportPdfRenderer(new PrintPdfRenderer()).render(reportId, snapshot)
    expect(state.launch).toHaveBeenCalledWith(
      expect.objectContaining({ executablePath: 'Z:/missing/chrome.exe' }),
    )
  })

  it('closes the shared browser on module destroy', async () => {
    const page = fakePage()
    const browser = fakeBrowser(page)
    state.launch.mockResolvedValue(browser)
    const print = new PrintPdfRenderer()
    await new ReportPdfRenderer(print).render(reportId, snapshot)
    await print.onModuleDestroy()
    expect(browser.close).toHaveBeenCalledOnce()
  })

  it('fails at the ready stage for the empty print state without printing', async () => {
    const page = fakePage(Buffer.from('%PDF'), 'empty')
    state.launch.mockResolvedValue(fakeBrowser(page))
    await expect(
      new ReportPdfRenderer(new PrintPdfRenderer()).render(reportId, snapshot),
    ).rejects.toMatchObject({
      stage: 'ready',
    })
    expect(page.pdf).not.toHaveBeenCalled()
  })

  it('rejects with a fixed-message ReportPdfError that carries no cause text', async () => {
    const page = fakePage()
    page.goto.mockRejectedValue(new TypeError('secret report content'))
    state.launch.mockResolvedValue(fakeBrowser(page))
    const failure = await new ReportPdfRenderer(new PrintPdfRenderer())
      .render(reportId, snapshot)
      .catch((e) => e)
    expect(failure).toBeInstanceOf(ReportPdfError)
    expect(failure.message).not.toContain('secret')
    expect(failure.causeName).toBe('TypeError')
  })

  it('discards the browser after a failure so the next render launches again', async () => {
    const page = fakePage()
    page.goto.mockRejectedValueOnce(new Error('Navigation timeout'))
    const first = fakeBrowser(page)
    state.launch.mockResolvedValueOnce(first).mockResolvedValueOnce(fakeBrowser(page))
    const renderer = new ReportPdfRenderer(new PrintPdfRenderer())
    await expect(renderer.render(reportId, snapshot)).rejects.toBeInstanceOf(ReportPdfError)
    expect(first.close).toHaveBeenCalledOnce()
    await renderer.render(reportId, snapshot)
    expect(state.launch).toHaveBeenCalledTimes(2)
  })

  it('rejects at the deadline stage when the browser wedges', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    try {
      const page = fakePage()
      page.goto.mockReturnValue(new Promise(() => undefined))
      const browser = fakeBrowser(page)
      state.launch.mockResolvedValue(browser)
      const outcome = expect(
        new ReportPdfRenderer(new PrintPdfRenderer()).render(reportId, snapshot),
      ).rejects.toMatchObject({ stage: 'deadline' })
      while (!page.goto.mock.calls.length) await new Promise((resolve) => setImmediate(resolve))
      await vi.advanceTimersByTimeAsync(40_000)
      await outcome
      expect(browser.close).toHaveBeenCalledOnce()
    } finally {
      vi.useRealTimers()
    }
  })

  it('launches the Linux bundle with the shell headless mode and a protocol timeout', async () => {
    process.env.PDF_CHROME_PATH = ''
    state.executablePath.mockResolvedValue('/tmp/chromium')
    state.launch.mockResolvedValue(fakeBrowser(fakePage()))
    const platform = Object.getOwnPropertyDescriptor(process, 'platform')
    Object.defineProperty(process, 'platform', { value: 'linux' })
    try {
      await new ReportPdfRenderer(new PrintPdfRenderer()).render(reportId, snapshot)
    } finally {
      if (platform) Object.defineProperty(process, 'platform', platform)
    }
    expect(state.launch).toHaveBeenCalledWith(
      expect.objectContaining({ headless: 'shell', protocolTimeout: 20_000 }),
    )
  })
})
