import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  InactiveVerifiedSessionError,
  InvalidVerifiedSessionResultError,
  PrismaService,
} from './prisma.service'

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
    await expect(prisma.onModuleInit()).rejects.toThrow('stage=role-check; code=UNKNOWN')
    expect(disconnect).toHaveBeenCalledOnce()
  })

  it.each([
    [{ errorCode: 'P1001', message: 'Sensitive provider detail' }, 'P1001'],
    [{ code: 'P1000', message: 'Sensitive provider detail' }, 'P1000'],
    [{ code: 'Sensitive provider detail' }, 'UNKNOWN'],
    [{ message: 'Query Engine missing: Sensitive provider detail' }, 'ENGINE_UNAVAILABLE'],
  ])('reports only a bounded initialization diagnostic %#', async (failure, expectedCode) => {
    vi.stubEnv('DATABASE_URL', 'postgresql://example.invalid/database')
    const prisma = new PrismaService()
    vi.spyOn(prisma, '$connect').mockRejectedValue(failure)
    let message = ''
    try {
      await prisma.onModuleInit()
    } catch (error) {
      message = (error as Error).message
    }
    expect(message).toContain(`stage=connection; code=${expectedCode}`)
    expect(message).not.toContain('Sensitive provider detail')
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

  it.each([
    { rows: [] },
    { rows: [{ live: null }] },
    { rows: [{ live: 'true' }] },
    { rows: [{ live: true }, { live: true }] },
  ])('fails closed on malformed in-context session liveness result %#', async ({ rows }) => {
    const prisma = new PrismaService()
    const databaseTransaction = {
      $queryRaw: vi.fn(async (parts: TemplateStringsArray) =>
        parts.join('').includes('runtime_auth_session_live') ? rows : [],
      ),
    }
    vi.spyOn(prisma, '$transaction').mockImplementation(async (callback) =>
      callback(databaseTransaction as never),
    )
    const work = vi.fn()
    await expect(
      prisma.withVerifiedContext(
        {
          authSubject: 'a5000000-0000-4000-8000-000000000001',
          organizationId: 'a5000000-0000-4000-8000-000000000002',
          userId: 'a5000000-0000-4000-8000-000000000003',
          sessionId: 'a5000000-0000-4000-8000-000000000004',
        },
        work,
      ),
    ).rejects.toBeInstanceOf(InvalidVerifiedSessionResultError)
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

  it('checks a verified session before profile context resolution in the same transaction', async () => {
    const prisma = new PrismaService()
    const databaseTransaction = {
      $queryRaw: vi.fn(async (parts: TemplateStringsArray) => {
        const sql = parts.join('')
        if (sql.includes('runtime_auth_session_live'))
          return [
            {
              live: true,
              organizationId: 'a5000000-0000-4000-8000-000000000002',
            },
          ]
        return []
      }),
    }
    vi.spyOn(prisma, '$transaction').mockImplementation(async (callback) =>
      callback(databaseTransaction as never),
    )
    const work = vi.fn().mockResolvedValue('verified')
    const context = {
      authSubject: 'a5000000-0000-4000-8000-000000000001',
      organizationId: 'a5000000-0000-4000-8000-000000000002',
      userId: 'a5000000-0000-4000-8000-000000000003',
      sessionId: 'a5000000-0000-4000-8000-000000000004',
    }

    await expect(prisma.withVerifiedContext(context, work)).resolves.toBe('verified')
    const sql = databaseTransaction.$queryRaw.mock.calls.map(([parts]) => parts.join(''))
    expect(sql).toHaveLength(1)
    expect(sql[0]).toContain('WITH configured AS MATERIALIZED')
    expect(sql[0]).toContain('live_session AS MATERIALIZED')
    expect(sql[0]).toContain('CASE WHEN live')
    expect(sql[0].indexOf('runtime_auth_session_live')).toBeLessThan(
      sql[0].indexOf('runtime_context_organization'),
    )
    expect(work).toHaveBeenCalledOnce()
  })

  it('reports bounded acquisition, context, and work substages without changing transaction options', async () => {
    const prisma = new PrismaService()
    const databaseTransaction = {
      $queryRaw: vi
        .fn()
        .mockResolvedValue([
          { live: true, organizationId: 'a5000000-0000-4000-8000-000000000002' },
        ]),
    }
    const transaction = vi
      .spyOn(prisma, '$transaction')
      .mockImplementation(async (callback) => callback(databaseTransaction as never))
    const onTiming = vi.fn()

    await expect(
      prisma.withVerifiedContext(
        {
          authSubject: 'a5000000-0000-4000-8000-000000000001',
          organizationId: 'a5000000-0000-4000-8000-000000000002',
          userId: 'a5000000-0000-4000-8000-000000000003',
          sessionId: 'a5000000-0000-4000-8000-000000000004',
        },
        async () => 'verified',
        { onTiming },
      ),
    ).resolves.toBe('verified')
    expect(onTiming).toHaveBeenCalledExactlyOnceWith({
      acquisitionMs: expect.any(Number),
      contextMs: expect.any(Number),
      workMs: expect.any(Number),
    })
    for (const value of Object.values(onTiming.mock.calls[0][0])) {
      expect(Number.isInteger(value)).toBe(true)
      expect(value).toBeGreaterThanOrEqual(0)
      expect(value).toBeLessThanOrEqual(30_000)
    }
    expect(transaction).toHaveBeenCalledWith(expect.any(Function), {
      maxWait: 5_000,
      timeout: 10_000,
    })
    expect(databaseTransaction.$queryRaw).toHaveBeenCalledOnce()
  })

  it('ignores diagnostic observer failures without changing authorization success', async () => {
    const prisma = new PrismaService()
    const databaseTransaction = {
      $queryRaw: vi
        .fn()
        .mockResolvedValue([{ organizationId: 'a5000000-0000-4000-8000-000000000002' }]),
    }
    vi.spyOn(prisma, '$transaction').mockImplementation(async (callback) =>
      callback(databaseTransaction as never),
    )

    await expect(
      prisma.withVerifiedContext(
        {
          authSubject: 'a5000000-0000-4000-8000-000000000001',
          organizationId: 'a5000000-0000-4000-8000-000000000002',
          userId: 'a5000000-0000-4000-8000-000000000003',
        },
        async () => 'verified',
        {
          onTiming: () => {
            throw new Error('diagnostic failure')
          },
        },
      ),
    ).resolves.toBe('verified')
  })

  it('denies a removed verified session before profile work runs', async () => {
    const prisma = new PrismaService()
    const databaseTransaction = {
      $queryRaw: vi.fn(async (parts: TemplateStringsArray) =>
        parts.join('').includes('runtime_auth_session_live') ? [{ live: false }] : [],
      ),
    }
    vi.spyOn(prisma, '$transaction').mockImplementation(async (callback) =>
      callback(databaseTransaction as never),
    )
    const work = vi.fn()

    await expect(
      prisma.withVerifiedContext(
        {
          authSubject: 'a5000000-0000-4000-8000-000000000001',
          organizationId: 'a5000000-0000-4000-8000-000000000002',
          userId: 'a5000000-0000-4000-8000-000000000003',
          sessionId: 'a5000000-0000-4000-8000-000000000004',
        },
        work,
      ),
    ).rejects.toBeInstanceOf(InactiveVerifiedSessionError)
    expect(work).not.toHaveBeenCalled()
  })

  it('denies a live session whose selected organization is not the active database context', async () => {
    const prisma = new PrismaService()
    const databaseTransaction = {
      $queryRaw: vi
        .fn()
        .mockResolvedValue([
          { live: true, organizationId: 'b5000000-0000-4000-8000-000000000002' },
        ]),
    }
    vi.spyOn(prisma, '$transaction').mockImplementation(async (callback) =>
      callback(databaseTransaction as never),
    )
    const work = vi.fn()

    await expect(
      prisma.withVerifiedContext(
        {
          authSubject: 'a5000000-0000-4000-8000-000000000001',
          organizationId: 'a5000000-0000-4000-8000-000000000002',
          userId: 'a5000000-0000-4000-8000-000000000003',
          sessionId: 'a5000000-0000-4000-8000-000000000004',
        },
        work,
      ),
    ).rejects.toThrow('Database context is not linked to an active application identity.')
    expect(work).not.toHaveBeenCalled()
  })

  it('rejects a malformed optional session identifier before opening a transaction', async () => {
    const prisma = new PrismaService()
    const transaction = vi.spyOn(prisma, '$transaction')
    await expect(
      prisma.withVerifiedContext(
        {
          authSubject: 'a5000000-0000-4000-8000-000000000001',
          organizationId: 'a5000000-0000-4000-8000-000000000002',
          userId: 'a5000000-0000-4000-8000-000000000003',
          sessionId: 'invalid',
        },
        vi.fn(),
      ),
    ).rejects.toThrow('valid session UUID')
    expect(transaction).not.toHaveBeenCalled()
  })

  it.each([1_000, 20_000, 30_000])(
    'accepts a bounded verified transaction timeout of %i ms',
    async (timeoutMs) => {
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
          { timeoutMs },
        ),
      ).resolves.toBe('fixture')
      expect(transaction).toHaveBeenCalledWith(expect.any(Function), {
        maxWait: 5_000,
        timeout: timeoutMs,
      })
    },
  )

  it.each([999, 30_001, 1_000.5, Number.NaN, Number.POSITIVE_INFINITY])(
    'rejects invalid verified transaction timeout %s before opening a transaction',
    async (timeoutMs) => {
      const prisma = new PrismaService()
      const transaction = vi.spyOn(prisma, '$transaction')
      const work = vi.fn()
      await expect(
        prisma.withVerifiedContext(
          {
            authSubject: 'a5000000-0000-4000-8000-000000000001',
            organizationId: 'a5000000-0000-4000-8000-000000000002',
            userId: 'a5000000-0000-4000-8000-000000000003',
          },
          work,
          { timeoutMs },
        ),
      ).rejects.toThrow('integer from 1000 through 30000 ms')
      expect(transaction).not.toHaveBeenCalled()
      expect(work).not.toHaveBeenCalled()
    },
  )
})
