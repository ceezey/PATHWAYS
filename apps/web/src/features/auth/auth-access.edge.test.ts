import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const requireWeb = createRequire(import.meta.url)
const { EdgeRuntime } = requireWeb('next/dist/compiled/edge-runtime')
const { buildSync } = createRequire(requireWeb.resolve('tsx'))('esbuild')
const bundle = buildSync({
  entryPoints: [fileURLToPath(new URL('./auth-access.ts', import.meta.url))],
  bundle: true,
  write: false,
  platform: 'browser',
  format: 'iife',
  globalName: 'AuthAccess',
}).outputFiles[0].text

describe('auth access in the installed Next middleware runtime', () => {
  it('accepts a verified API response when AbortSignal.any is unavailable', async () => {
    const runtime = new EdgeRuntime()
    runtime.evaluate('AbortSignal.any = undefined')
    runtime.evaluate(bundle)
    const result = await runtime.evaluate(`
      AuthAccess.requestAuthJson('http://127.0.0.1:4000/api', '/auth/me',
        'synthetic-token', new AbortController().signal, undefined,
        async (_url, options) => {
          if (options.signal.aborted) throw new Error('Unexpected cancellation');
          return Response.json({ fixture: 'accepted' });
        })
    `)
    expect(result).toEqual({ fixture: 'accepted' })
  })

  it('still forwards cancellation instead of accepting a cancelled check', async () => {
    const runtime = new EdgeRuntime()
    runtime.evaluate(bundle)
    const result = await runtime.evaluate(`
      (async () => {
        const controller = new AbortController();
        controller.abort();
        try {
          await AuthAccess.requestAuthJson('http://127.0.0.1:4000/api', '/auth/me',
            'synthetic-token', controller.signal, undefined, async (_url, options) => {
              globalThis.fixtureWasCancelled = options.signal.aborted;
              throw new Error('Synthetic private diagnostic');
            });
        } catch (error) { return { message: error.message, cancelled: globalThis.fixtureWasCancelled }; }
      })()
    `)
    expect(result.cancelled).toBe(true)
    expect(result.message).toContain('No protected access was granted.')
    expect(result.message).not.toContain('Synthetic private diagnostic')
  })
})
