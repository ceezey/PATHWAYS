import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { listenOnIpv4Loopback } from './local-listener'

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('local API listener', () => {
  it.each([
    {},
    { NODE_ENV: 'development' },
    { NODE_ENV: 'test' },
    { NODE_ENV: 'production' },
    { HOST: '0.0.0.0', HOSTNAME: '192.0.2.10' },
  ])('always supplies IPv4 loopback regardless of ambient variables (%j)', async (environment) => {
    for (const [name, value] of Object.entries(environment)) vi.stubEnv(name, value)
    const app = { listen: vi.fn().mockResolvedValue(undefined) }

    await listenOnIpv4Loopback(app, 4000)

    expect(app.listen).toHaveBeenCalledOnce()
    expect(app.listen).toHaveBeenCalledWith(4000, '127.0.0.1')
  })

  it('creates a real listener on loopback rather than a wildcard interface', async () => {
    const server = createServer()
    const app = {
      listen: (port: number, hostname: string) =>
        new Promise<void>((resolve, reject) => {
          server.once('error', reject)
          server.listen(port, hostname, resolve)
        }),
    }
    await listenOnIpv4Loopback(app, 0)

    try {
      const address = server.address() as AddressInfo
      expect(address.address).toBe('127.0.0.1')
      expect(address.family).toBe('IPv4')
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()))
      })
    }
  })
})
