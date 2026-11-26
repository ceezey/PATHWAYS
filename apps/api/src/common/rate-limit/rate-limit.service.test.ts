import { Logger } from '@nestjs/common'
import { describe, expect, it, vi } from 'vitest'

import type { PrismaService } from '../../prisma/prisma.service'
import { RateLimitService } from './rate-limit.service'

const serviceWith = (queryRaw: (...args: unknown[]) => Promise<unknown>) =>
  new RateLimitService({ $queryRaw: queryRaw } as unknown as PrismaService)

describe('RateLimitService', () => {
  it('returns the wait the database reports', async () => {
    const queryRaw = vi.fn().mockResolvedValue([{ s: 42 }])
    await expect(serviceWith(queryRaw).hit('media:1.1.1.1', 300)).resolves.toBe(42)
    expect(queryRaw.mock.calls[0]?.slice(1)).toEqual(['media:1.1.1.1', 300, 60])
  })

  it('fails open on a database error and logs only a fixed event', async () => {
    const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined)
    const failing = serviceWith(() => Promise.reject(new Error('secret-bucket 1.2.3.4')))
    await expect(failing.hit('signin-ip:1.2.3.4', 30)).resolves.toBe(0)
    expect(warn.mock.calls).toEqual([[{ event: 'PATHWAYS_RATE_LIMIT_UNAVAILABLE' }]])
    warn.mockRestore()
  })
})
