import { createServer } from 'node:net'
import type { AddressInfo } from 'node:net'

import { afterEach, describe, expect, it } from 'vitest'

import {
  DEVELOPMENT_HOST,
  DEVELOPMENT_PORT,
  assertDevelopmentPortFree,
} from '../scripts/assert-dev-port-free.mjs'

const servers: ReturnType<typeof createServer>[] = []

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((resolve, reject) => {
          server.close((error) => (error ? reject(error) : resolve()))
        }),
    ),
  )
})

describe('development port guard', () => {
  it('uses the fixed enrollment listener address', () => {
    expect(DEVELOPMENT_HOST).toBe('127.0.0.1')
    expect(DEVELOPMENT_PORT).toBe(3000)
  })

  it('refuses an occupied loopback port', async () => {
    const server = createServer()
    servers.push(server)
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject)
      server.listen(0, DEVELOPMENT_HOST, resolve)
    })
    const port = (server.address() as AddressInfo).port

    await expect(assertDevelopmentPortFree({ port })).rejects.toThrow('already in use')
  })

  it('accepts a confirmed refused connection on a free loopback port', async () => {
    const server = createServer()
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject)
      server.listen(0, DEVELOPMENT_HOST, resolve)
    })
    const port = (server.address() as AddressInfo).port
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()))
    })

    await expect(assertDevelopmentPortFree({ port })).resolves.toBeUndefined()
  })
})
