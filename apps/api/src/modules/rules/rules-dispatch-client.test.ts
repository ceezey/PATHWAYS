import { createServer } from 'node:http'
import { describe, expect, it, vi } from 'vitest'
import { readRulesDispatcherEnv } from '../../../../../packages/config/src/rules-dispatcher'
import { dispatchRulesOnce, runRulesDispatcher } from './rules-dispatch-client'

const options = {
  RULES_DISPATCH_API_BASE_URL: 'http://127.0.0.1:4000/api',
  RULES_DRAIN_TOKEN: 'a'.repeat(64),
  RULES_SWEEP_TOKEN: 'b'.repeat(64),
}
describe('fixed-purpose rules dispatch', () => {
  it('rejects unsafe credentials/URLs before constructing a dispatcher', () => {
    for (const values of [
      { RULES_SWEEP_TOKEN: options.RULES_DRAIN_TOKEN },
      { RULES_DRAIN_TOKEN: 'bad' },
      { RULES_DISPATCH_API_BASE_URL: 'http://remote.example/api' },
      { RULES_DISPATCH_API_BASE_URL: 'https://user:pass@remote.example/api' },
      { RULES_DISPATCH_API_BASE_URL: 'https://remote.example/api?token=value' },
      { RULES_DISPATCH_API_BASE_URL: 'https://remote.example/api#drain' },
      { RULES_DISPATCH_API_BASE_URL: 'https://remote.example/api/../wrong' },
      { RULES_DISPATCH_API_BASE_URL: 'https://remote.example/%61pi' },
    ])
      expect(() => readRulesDispatcherEnv({ ...options, ...values })).toThrow()
    expect(readRulesDispatcherEnv(options)).toEqual(options)
  })
  it('uses exact bodyless routes, separate purpose tokens and disables redirect forwarding', async () => {
    const fetcher = vi.fn().mockImplementation(async () => new Response('{"state":"ACKNOWLEDGED"}'))
    await dispatchRulesOnce(options, 'DRAIN', undefined, fetcher)
    await dispatchRulesOnce(options, 'SWEEP', undefined, fetcher)
    expect(fetcher.mock.calls.map((call) => [call[0], call[1].headers])).toEqual([
      [
        'http://127.0.0.1:4000/api/internal/rules/drain',
        { Authorization: `Bearer ${options.RULES_DRAIN_TOKEN}` },
      ],
      [
        'http://127.0.0.1:4000/api/internal/rules/sweep',
        { Authorization: `Bearer ${options.RULES_SWEEP_TOKEN}` },
      ],
    ])
    for (const [, init] of fetcher.mock.calls) {
      expect(init).toMatchObject({ method: 'POST', redirect: 'error' })
      expect(init.body).toBeUndefined()
      expect(init.signal).toBeInstanceOf(AbortSignal)
    }
  })
  it('rejects private/oversized/invalid responses with one safe error', async () => {
    for (const value of [
      '{"state":"ACKNOWLEDGED","jobId":"private"}',
      '{"state":"DONE"}',
      'secret',
      'x'.repeat(1025),
    ]) {
      await expect(
        dispatchRulesOnce(
          options,
          'DRAIN',
          undefined,
          vi.fn().mockResolvedValue(new Response(value)),
        ),
      ).rejects.toThrow('Rules dispatch is temporarily unavailable.')
    }
    await expect(
      dispatchRulesOnce(
        options,
        'DRAIN',
        undefined,
        vi.fn().mockResolvedValue(new Response('private failure', { status: 403 })),
      ),
    ).rejects.toThrow('Rules dispatch is temporarily unavailable.')
  })
  it('keeps failed drains periodic, sweeps hourly, and never overlaps work or catches up in a storm', async () => {
    const shutdown = new AbortController()
    const purposes: string[] = []
    const sleeps: number[] = []
    let clock = 0
    let running = false
    let failures = 0
    await runRulesDispatcher(options, shutdown.signal, {
      now: () => clock,
      sleep: async (ms) => {
        sleeps.push(ms)
        clock += ms
        if (clock >= 3_900_000) shutdown.abort()
      },
      dispatch: async (_values, purpose) => {
        expect(running).toBe(false)
        running = true
        purposes.push(purpose)
        await Promise.resolve()
        running = false
        if (purpose === 'DRAIN' && purposes.length === 1)
          throw new Error('Private provider failure')
      },
      failed: () => {
        failures++
      },
    })
    expect(failures).toBe(1)
    expect(purposes.filter((value) => value === 'SWEEP')).toHaveLength(2)
    expect(sleeps.every((ms) => ms === 300_000)).toBe(true)
    expect(purposes.filter((value) => value === 'DRAIN')).toHaveLength(13)
  })
  it('dispatches over real local HTTP and physically cancels an unfinished response on shutdown', async () => {
    const requests: Array<{ path: string; auth?: string; body: string }> = []
    let closed: () => void = () => {}
    let received: () => void = () => {}
    const sweepReceived = new Promise<void>((resolve) => {
      received = resolve
    })
    const physicallyClosed = new Promise<void>((resolve) => {
      closed = resolve
    })
    const server = createServer((req, res) => {
      let body = ''
      req.on('data', (bytes) => {
        body += bytes
      })
      req.on('end', () => {
        requests.push({ path: req.url ?? '', auth: req.headers.authorization, body })
        if (req.url?.endsWith('/sweep')) {
          res.writeHead(200)
          res.write('{"state":')
          res.on('close', closed)
          received()
        } else {
          res.writeHead(200)
          res.end('{"state":"ACKNOWLEDGED"}')
        }
      })
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const address = server.address()
    if (!address || typeof address === 'string') throw Error('Missing owned listener')
    const current = readRulesDispatcherEnv({
      ...options,
      RULES_DISPATCH_API_BASE_URL: `http://127.0.0.1:${address.port}/api`,
    })
    try {
      await dispatchRulesOnce(current, 'DRAIN')
      const shutdown = new AbortController()
      const response = dispatchRulesOnce(current, 'SWEEP', shutdown.signal)
      await sweepReceived
      shutdown.abort()
      await expect(response).rejects.toThrow('Rules dispatch is temporarily unavailable.')
      await physicallyClosed
      expect(requests).toEqual([
        {
          path: '/api/internal/rules/drain',
          auth: `Bearer ${options.RULES_DRAIN_TOKEN}`,
          body: '',
        },
        {
          path: '/api/internal/rules/sweep',
          auth: `Bearer ${options.RULES_SWEEP_TOKEN}`,
          body: '',
        },
      ])
    } finally {
      server.closeAllConnections()
      await new Promise<void>((resolve) => server.close(() => resolve()))
    }
  }, 5000)
})
