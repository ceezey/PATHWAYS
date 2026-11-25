import { afterEach, describe, expect, it, vi } from 'vitest'

import type { PrismaService } from '../../prisma/prisma.service'
import { HealthService, READINESS_TIMEOUT_MS } from './health.service'

const service = (query: () => Promise<unknown>) =>
  new HealthService({ $queryRaw: query } as unknown as PrismaService)

afterEach(() => vi.useRealTimers())

describe('HealthService.isReady', () => {
  it('is ready when the database answers', async () => {
    await expect(service(() => Promise.resolve([{ ok: 1 }])).isReady()).resolves.toBe(true)
  })

  it('is not ready when the query rejects', async () => {
    await expect(service(() => Promise.reject(new Error('refused'))).isReady()).resolves.toBe(false)
  })

  it('is not ready when the database hangs past the limit', async () => {
    vi.useFakeTimers()
    const ready = service(() => new Promise(() => {})).isReady()
    await vi.advanceTimersByTimeAsync(READINESS_TIMEOUT_MS)
    await expect(ready).resolves.toBe(false)
  })

  it('shares one query between callers that arrive during a check, then checks again', async () => {
    let release: (rows: unknown[]) => void = () => {}
    const query = vi.fn(
      () =>
        new Promise<unknown[]>((resolve) => {
          release = resolve
        }),
    )
    const health = service(query)
    const both = Promise.all([health.isReady(), health.isReady()])
    release([])
    await expect(both).resolves.toEqual([true, true])
    expect(query).toHaveBeenCalledTimes(1)
    const again = health.isReady()
    release([])
    await again
    expect(query).toHaveBeenCalledTimes(2)
  })

  it('leaves no timer running after the database answers', async () => {
    vi.useFakeTimers()
    await service(() => Promise.resolve([])).isReady()
    expect(vi.getTimerCount()).toBe(0)
  })
})
