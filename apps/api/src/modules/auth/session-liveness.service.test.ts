import { Logger, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { PrismaService } from '../../prisma/prisma.service'
import { SessionLivenessService } from './session-liveness.service'

const subject = '10000000-0000-4000-8000-000000000001'
const sessionId = '20000000-0000-4000-8000-000000000002'
const transaction = { $executeRaw: vi.fn(), $queryRaw: vi.fn() }
const prisma = { $transaction: vi.fn() }
const service = new SessionLivenessService(prisma as unknown as PrismaService)

beforeEach(() => {
  vi.resetAllMocks()
  vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined)
  transaction.$executeRaw.mockResolvedValue(0)
  transaction.$queryRaw.mockImplementation(async (query: TemplateStringsArray) =>
    query.join('').includes('runtime_auth_session_live') ? [{ live: true }] : [],
  )
  prisma.$transaction.mockImplementation(async (work) => work(transaction))
})

afterEach(() => vi.restoreAllMocks())

describe('SessionLivenessService database boundary', () => {
  it('uses a fresh bounded read-only transaction and parameterized verified identifiers', async () => {
    await service.assertLive(subject, sessionId)
    expect(transaction.$executeRaw.mock.calls[0][0].join('')).toBe('SET TRANSACTION READ ONLY')
    const [settings, ...settingsValues] = transaction.$queryRaw.mock.calls[0]
    expect(settings.join('')).toContain("set_config('request.jwt.claims', '', true)")
    expect(settingsValues).toEqual([subject])
    const [query, ...values] = transaction.$queryRaw.mock.calls[1]
    expect(query.join('')).not.toContain(subject)
    expect(query.join('')).not.toContain(sessionId)
    expect(values).toEqual([subject, sessionId])
    expect(prisma.$transaction.mock.calls[0][1]).toEqual({
      isolationLevel: 'ReadCommitted',
      maxWait: 5_000,
      timeout: 10_000,
    })
  })

  it('does not cache a previously live session across requests', async () => {
    await service.assertLive(subject, sessionId)
    transaction.$queryRaw.mockResolvedValue([{ live: false }])
    await expect(service.assertLive(subject, sessionId)).rejects.toThrow(UnauthorizedException)
    expect(prisma.$transaction).toHaveBeenCalledTimes(2)
    expect(Logger.prototype.warn).not.toHaveBeenCalled()
  })

  it.each([
    { rows: [] },
    { rows: [{ live: null }] },
    { rows: [{ live: 'true' }] },
    { rows: [{ live: true }, { live: true }] },
  ])('fails closed on malformed database result %#', async ({ rows }) => {
    transaction.$queryRaw.mockResolvedValue(rows)
    await expect(service.assertLive(subject, sessionId)).rejects.toThrow(
      ServiceUnavailableException,
    )
  })

  it.each(['missing function', 'permission denied', 'timeout', 'connection failed'])(
    'sanitizes %s without identifiers, causes or raw diagnostics',
    async (category) => {
      prisma.$transaction.mockRejectedValue(
        new Error(`${category}: private-canary ${subject} ${sessionId}`),
      )
      const failure = await service.assertLive(subject, sessionId).catch((error) => error)
      expect(failure).toBeInstanceOf(ServiceUnavailableException)
      expect(failure.getResponse()).toEqual({
        statusCode: 503,
        error: 'Service Unavailable',
        message: 'Session verification is temporarily unavailable.',
      })
      expect(failure.cause).toBeUndefined()
      expect(failure.stack).not.toMatch(/private-canary|10000000|20000000/)
    },
  )

  it.each([
    ['bad', sessionId],
    [subject, 'bad'],
    ['', ''],
  ])('rejects malformed identifiers before SQL %#', async (user, session) => {
    await expect(service.assertLive(user, session)).rejects.toThrow(UnauthorizedException)
    expect(prisma.$transaction).not.toHaveBeenCalled()
    expect(Logger.prototype.warn).not.toHaveBeenCalled()
  })

  it.each(['P1001', 'P1002', 'P1008', 'P1017', 'P2024', 'P2028', 'P2010'])(
    'retains only allowlisted %s and the fixed failure stage',
    async (code) => {
      const privateCanary = `do-not-log ${subject} ${sessionId}`
      prisma.$transaction.mockRejectedValue({
        code,
        message: privateCanary,
        meta: { query: privateCanary },
        cause: new Error(privateCanary),
      })
      const failure = await service.assertLive(subject, sessionId).catch((error) => error)
      expect(failure.getResponse()).toEqual({
        statusCode: 503,
        error: 'Service Unavailable',
        message: 'Session verification is temporarily unavailable.',
      })
      expect(Logger.prototype.warn).toHaveBeenCalledExactlyOnceWith({
        event: 'PATHWAYS_SESSION_LIVENESS_UNAVAILABLE',
        stage: 'TRANSACTION_START',
        reason: code,
        ...(code === 'P2028' ? { transactionFailure: 'UNCLASSIFIED' } : {}),
      })
      expect(JSON.stringify(vi.mocked(Logger.prototype.warn).mock.calls)).not.toContain(
        privateCanary,
      )
    },
  )

  it.each([
    ['READ_ONLY_SETUP', 0],
    ['CONTEXT_SETUP', 1],
    ['SESSION_READ', 2],
    ['TRANSACTION_COMPLETION', 3],
  ])('identifies %s without changing the public outage response', async (stage, index) => {
    const failure = { code: 'P2028', message: 'sensitive provider detail' }
    if (index === 0) transaction.$executeRaw.mockRejectedValue(failure)
    if (index === 1) transaction.$queryRaw.mockRejectedValueOnce(failure)
    if (index === 2) {
      transaction.$queryRaw.mockResolvedValueOnce([]).mockRejectedValueOnce(failure)
    }
    if (index === 3)
      prisma.$transaction.mockImplementation(async (work) => {
        await work(transaction)
        throw failure
      })
    await expect(service.assertLive(subject, sessionId)).rejects.toThrow(
      ServiceUnavailableException,
    )
    expect(Logger.prototype.warn).toHaveBeenCalledExactlyOnceWith({
      event: 'PATHWAYS_SESSION_LIVENESS_UNAVAILABLE',
      stage,
      reason: 'P2028',
      transactionFailure: 'UNCLASSIFIED',
    })
  })

  it.each([undefined, null, 'sensitive provider detail', { code: 'P9999' }, { code: subject }])(
    'replaces unknown error shapes with a fixed category %#',
    async (failure) => {
      prisma.$transaction.mockRejectedValue(failure)
      await expect(service.assertLive(subject, sessionId)).rejects.toThrow(
        ServiceUnavailableException,
      )
      expect(Logger.prototype.warn).toHaveBeenCalledExactlyOnceWith({
        event: 'PATHWAYS_SESSION_LIVENESS_UNAVAILABLE',
        stage: 'TRANSACTION_START',
        reason: 'DATABASE_CHECK_FAILED',
      })
    },
  )

  it('records no malformed result contents', async () => {
    transaction.$queryRaw.mockResolvedValue([{ live: subject, private: sessionId }])
    await expect(service.assertLive(subject, sessionId)).rejects.toThrow(
      ServiceUnavailableException,
    )
    expect(Logger.prototype.warn).toHaveBeenCalledExactlyOnceWith({
      event: 'PATHWAYS_SESSION_LIVENESS_UNAVAILABLE',
      stage: 'RESULT_VALIDATION',
      reason: 'INVALID_RESULT',
    })
  })

  it.each([
    ['Unable to start a transaction in the given time.', 'ACQUISITION_TIMEOUT'],
    [
      'Transaction already closed: A query cannot be executed on an expired transaction.',
      'EXECUTION_EXPIRED',
    ],
  ])(
    'adds a bounded transaction subtype without changing the response %#',
    async (detail, kind) => {
      prisma.$transaction.mockRejectedValue({
        code: 'P2028',
        meta: { error: detail },
        message: 'SYNTHETIC_SECRET',
      })
      await expect(service.assertLive(subject, sessionId)).rejects.toMatchObject({
        status: 503,
        message: 'Session verification is temporarily unavailable.',
      })
      expect(Logger.prototype.warn).toHaveBeenCalledExactlyOnceWith({
        event: 'PATHWAYS_SESSION_LIVENESS_UNAVAILABLE',
        stage: 'TRANSACTION_START',
        reason: 'P2028',
        transactionFailure: kind,
      })
    },
  )

  it('retains the fixed 503 when the diagnostic sink fails', async () => {
    prisma.$transaction.mockRejectedValue({ code: 'P2028' })
    vi.mocked(Logger.prototype.warn).mockImplementation(() => {
      throw new Error('SYNTHETIC_SECRET')
    })
    await expect(service.assertLive(subject, sessionId)).rejects.toMatchObject({
      status: 503,
      message: 'Session verification is temporarily unavailable.',
    })
  })
})
