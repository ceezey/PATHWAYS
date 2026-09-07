import { afterEach, describe, expect, it, vi } from 'vitest'

import { PrismaService } from './prisma.service'

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})

describe('PrismaService', () => {
  it('fails clearly when DATABASE_URL is missing', async () => {
    vi.stubEnv('DATABASE_URL', '')
    const prisma = new PrismaService()

    await expect(prisma.onModuleInit()).rejects.toThrow(
      'DATABASE_URL is required to initialize Prisma.',
    )
  })

  it('does not expose connection error details', async () => {
    vi.stubEnv('DATABASE_URL', 'postgresql://example.invalid/database')
    const prisma = new PrismaService()
    vi.spyOn(prisma, '$connect').mockRejectedValue(new Error('Sensitive provider detail'))

    await expect(prisma.onModuleInit()).rejects.toThrow(
      'Prisma runtime initialization failed. Verify the dedicated runtime credential, database availability, and least-privilege role checks.',
    )
  })

  it('rejects a reachable but privileged runtime identity and disconnects', async () => {
    vi.stubEnv('DATABASE_URL', 'postgresql://example.invalid/database')
    const prisma = new PrismaService()
    vi.spyOn(prisma, '$connect').mockResolvedValue()
    vi.spyOn(prisma, '$queryRaw').mockResolvedValue([{ safe: false }])
    const disconnect = vi.spyOn(prisma, '$disconnect').mockResolvedValue()
    await expect(prisma.onModuleInit()).rejects.toThrow('runtime initialization failed')
    expect(disconnect).toHaveBeenCalledOnce()
  })

  it('accepts only a verified least-privilege runtime identity', async () => {
    vi.stubEnv('DATABASE_URL', 'postgresql://example.invalid/database')
    const prisma = new PrismaService()
    vi.spyOn(prisma, '$connect').mockResolvedValue()
    vi.spyOn(prisma, '$queryRaw').mockResolvedValue([{ safe: true }])
    await expect(prisma.onModuleInit()).resolves.toBeUndefined()
  })

  it('rejects malformed context before opening a transaction', async () => {
    const prisma = new PrismaService()
    const transaction = vi.spyOn(prisma, '$transaction')
    const work = vi.fn()
    await expect(
      prisma.withVerifiedContext({ authSubject: 'invalid', organizationId: '', userId: '' }, work),
    ).rejects.toThrow('three UUID identifiers')
    expect(transaction).not.toHaveBeenCalled()
    expect(work).not.toHaveBeenCalled()
  })

  it('bounds remote context transaction queue and work time explicitly', async () => {
    const prisma = new PrismaService()
    const transaction = vi.spyOn(prisma, '$transaction').mockResolvedValue('fixture')
    await expect(
      prisma.withVerifiedContext(
        {
          authSubject: 'a5000000-0000-4000-8000-000000000001',
          organizationId: 'a5000000-0000-4000-8000-000000000002',
          userId: 'a5000000-0000-4000-8000-000000000003',
        },
        vi.fn(),
      ),
    ).resolves.toBe('fixture')
    expect(transaction).toHaveBeenCalledWith(expect.any(Function), {
      maxWait: 5_000,
      timeout: 10_000,
    })
  })
})
