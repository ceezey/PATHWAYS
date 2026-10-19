import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { describe, expect, it } from 'vitest'

import { corsOptions } from './cors-origins'
import { markAuthDuration, serverTimingMetrics, serverTimingMiddleware } from './server-timing'

describe('serverTimingMetrics', () => {
  it('formats auth and total, rounding and clamping', () => {
    expect(serverTimingMetrics(12.4, 40.6)).toBe('auth;dur=12, total;dur=41')
    expect(serverTimingMetrics(undefined, -3)).toBe('total;dur=0')
  })
})

describe('serverTimingMiddleware', () => {
  async function get(preset?: string) {
    let tick = 0
    const middleware = serverTimingMiddleware(() => {
      tick += 25
      return tick
    })
    const server = createServer((request, response) => {
      middleware(request, response, () => {
        if (preset) response.setHeader('Server-Timing', preset)
        markAuthDuration(request, 10)
        response.end('ok')
      })
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    try {
      const { port } = server.address() as AddressInfo
      return (await fetch(`http://127.0.0.1:${port}/x?secret=1`)).headers.get('server-timing')
    } finally {
      server.close()
    }
  }

  it('adds auth and total without leaking request details', async () => {
    expect(await get()).toBe('auth;dur=10, total;dur=25')
  })

  it('keeps an existing Server-Timing value', async () => {
    expect(await get('dev;dur=1')).toBe('dev;dur=1, auth;dur=10, total;dur=25')
  })
})

describe('corsOptions', () => {
  it('exposes Server-Timing to the web origin', () => {
    expect(corsOptions('').exposedHeaders).toContain('Server-Timing')
  })
})
