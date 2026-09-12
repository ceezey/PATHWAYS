import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthAccessError } from '../../features/auth/auth-access'
import { recordNavigationDenial } from './navigation-diagnostic'
import { RouteCheckError } from './route-access'

const privateContent = 'SYNTHETIC_PRIVATE_ERROR_CONTENT_MUST_NOT_APPEAR'
let output: ReturnType<typeof vi.spyOn>
beforeEach(() => {
  vi.stubEnv('NODE_ENV', 'development')
  output = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('development-only server navigation diagnostics', () => {
  it('emits the same bounded event in the installed Next Edge runtime', async () => {
    const requireWeb = createRequire(import.meta.url)
    const { EdgeRuntime } = requireWeb('next/dist/compiled/edge-runtime')
    const { buildSync } = createRequire(requireWeb.resolve('tsx'))('esbuild')
    const bundle = buildSync({
      stdin: {
        contents: `export { recordNavigationDenial } from './navigation-diagnostic';
          export { AuthAccessError } from '../../features/auth/auth-access';`,
        resolveDir: fileURLToPath(new URL('.', import.meta.url)),
        loader: 'ts',
      },
      bundle: true,
      write: false,
      platform: 'browser',
      format: 'iife',
      globalName: 'DiagnosticFixture',
      define: { 'process.env.NODE_ENV': '"development"' },
    }).outputFiles[0].text
    const runtime = new EdgeRuntime()
    runtime.evaluate('globalThis.events = []; console.warn = (...entry) => events.push(entry)')
    runtime.evaluate(bundle)
    const events = await runtime.evaluate(`
      DiagnosticFixture.recordNavigationDenial('MIDDLEWARE', 'PROFILE',
        new DiagnosticFixture.AuthAccessError(503));
      JSON.stringify(events);
    `)
    expect(JSON.parse(events)).toEqual([
      [
        'PATHWAYS_NAVIGATION_DENIED',
        { boundary: 'MIDDLEWARE', stage: 'PROFILE', reason: 'HTTP_503' },
      ],
    ])
  })
  it.each([
    [new AuthAccessError(401), 'HTTP_401'],
    [new RouteCheckError(403, 'http'), 'HTTP_403'],
    [new RouteCheckError(404, 'http'), 'HTTP_404'],
    [new AuthAccessError(429), 'HTTP_429'],
    [new AuthAccessError(503), 'HTTP_503'],
    [new RouteCheckError(500, 'http'), 'HTTP_500'],
    [new RouteCheckError(502, 'http'), 'HTTP_502'],
    [new RouteCheckError(504, 'http'), 'HTTP_504'],
    [new RouteCheckError(599, 'http'), 'HTTP_5XX'],
    [new RouteCheckError(503, 'network'), 'NETWORK'],
    [new RouteCheckError(503, 'timeout'), 'TIMEOUT'],
    [new RouteCheckError(503, 'cancelled'), 'CANCELLED'],
    [new RouteCheckError(503, 'invalid-response'), 'INVALID_RESPONSE'],
    [new RouteCheckError(503, 'configuration'), 'CONFIGURATION'],
    [new RouteCheckError(403), 'CHECK_REJECTED'],
    [new AuthAccessError('network'), 'NETWORK'],
    [new AuthAccessError('timeout'), 'TIMEOUT'],
    [new RouteCheckError(418, 'http'), 'CHECK_FAILED'],
    [new Error(privateContent), 'UNEXPECTED_FAILURE'],
    [{ status: 503, message: privateContent }, 'UNEXPECTED_FAILURE'],
    [undefined, 'CHECK_REJECTED'],
  ])('contains only fixed classification %#', (error, reason) => {
    if (error instanceof Error) {
      error.message = privateContent
      Object.assign(error, { cause: privateContent, headers: privateContent, body: privateContent })
    }
    recordNavigationDenial('SERVER_PAGE', 'ROUTE_API', error)
    expect(output).toHaveBeenCalledExactlyOnceWith('PATHWAYS_NAVIGATION_DENIED', {
      boundary: 'SERVER_PAGE',
      stage: 'ROUTE_API',
      reason,
    })
    expect(JSON.stringify(output.mock.calls)).not.toContain(privateContent)
  })

  it.each(['production', 'test'])('does not emit in %s', (mode) => {
    vi.stubEnv('NODE_ENV', mode)
    recordNavigationDenial('MIDDLEWARE', 'CLAIMS')
    expect(output).not.toHaveBeenCalled()
  })

  it('does not emit from browser code', () => {
    vi.stubGlobal('window', {})
    recordNavigationDenial('MIDDLEWARE', 'CLAIMS')
    expect(output).not.toHaveBeenCalled()
  })

  it('rejects unknown classifications and never evaluates an error status getter', () => {
    const error = new RouteCheckError(503, 'http')
    const getter = vi.fn(() => privateContent)
    Object.defineProperty(error, 'status', { get: getter })
    recordNavigationDenial(
      privateContent as Parameters<typeof recordNavigationDenial>[0],
      privateContent as Parameters<typeof recordNavigationDenial>[1],
      error,
    )
    expect(getter).not.toHaveBeenCalled()
    expect(output).toHaveBeenCalledExactlyOnceWith('PATHWAYS_NAVIGATION_DENIED', {
      boundary: 'UNKNOWN',
      stage: 'UNKNOWN',
      reason: 'CHECK_FAILED',
    })
  })

  it('cannot interfere with denial if the diagnostic sink throws', () => {
    output.mockImplementation(() => {
      throw new Error(privateContent)
    })
    expect(() => recordNavigationDenial('MIDDLEWARE', 'CONTEXT')).not.toThrow()
  })

  it('never evaluates a failure getter or exposes an unknown failure category', () => {
    const error = new RouteCheckError(503)
    const getter = vi.fn(() => privateContent)
    Object.defineProperty(error, 'failure', { configurable: true, get: getter })
    recordNavigationDenial('SERVER_PAGE', 'ROUTE_API', error)
    Object.defineProperty(error, 'failure', { value: privateContent })
    recordNavigationDenial('SERVER_PAGE', 'ROUTE_API', error)
    expect(getter).not.toHaveBeenCalled()
    expect(output).toHaveBeenCalledTimes(2)
    for (const call of output.mock.calls) {
      expect(call).toEqual([
        'PATHWAYS_NAVIGATION_DENIED',
        { boundary: 'SERVER_PAGE', stage: 'ROUTE_API', reason: 'CHECK_FAILED' },
      ])
    }
    expect(JSON.stringify(output.mock.calls)).not.toContain(privateContent)
  })
})
