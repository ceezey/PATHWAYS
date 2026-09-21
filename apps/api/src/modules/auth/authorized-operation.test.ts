import {
  ConflictException,
  ForbiddenException,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common'
import type { Prisma } from '@prisma/client'
import { describe, expect, it, vi } from 'vitest'

import type { PrismaService } from '@app/prisma/prisma.service'
import { withAuthorizedOperation } from './authorized-operation'
import { registerAuthorizedOperationTiming } from './authorized-operation-timing'
import type { ApplicationIdentity } from './developer-access'

vi.mock('./application-profile.service', () => ({
  readApplicationProfile: vi.fn(async () => identity),
}))

const identity: ApplicationIdentity = {
  id: '10000000-0000-4000-8000-000000000001',
  aal: 'aal2',
  userId: '20000000-0000-4000-8000-000000000002',
  organizationId: '30000000-0000-4000-8000-000000000003',
  fullName: 'Synthetic actor',
  roles: ['MONITORING_AND_EVALUATION_OFFICER'],
  permissions: ['beneficiaries.records.register'],
  assignedProjectIds: ['40000000-0000-4000-8000-000000000004'],
}

const prisma = (failure: unknown) =>
  ({
    withVerifiedContext: vi.fn(async () => {
      throw failure
    }),
  }) as unknown as PrismaService

describe('authorized operation concurrency errors', () => {
  it.each(['P2002', 'P2034'])('returns a safe conflict for %s', async (code) => {
    await expect(
      withAuthorizedOperation(
        prisma({ code, message: 'sensitive provider detail' }),
        identity,
        'beneficiaries.records.register',
        async () => true,
      ),
    ).rejects.toBeInstanceOf(ConflictException)
  })

  it('keeps unknown database failures fail-closed', async () => {
    await expect(
      withAuthorizedOperation(
        prisma({ code: 'P9999', message: 'sensitive provider detail' }),
        identity,
        'beneficiaries.records.register',
        async () => true,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException)
  })

  it.each([
    ['P2024', 'CONNECTION_POOL', undefined],
    ['P2028', 'VERIFIED_TRANSACTION', 'ACQUISITION_TIMEOUT'],
  ] as const)(
    'reports %s as temporary unavailability with bounded diagnostics',
    async (code, stage, transactionFailure) => {
      const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined)
      const providerDetail = 'sensitive provider detail'
      const failure = {
        code,
        message: providerDetail,
        ...(code === 'P2028'
          ? { meta: { error: 'Unable to start a transaction in the given time.' } }
          : {}),
      }
      const error: unknown = await withAuthorizedOperation(
        prisma(failure),
        identity,
        'beneficiaries.records.register',
        async () => true,
      ).catch((caught: unknown) => caught)

      expect(error).toBeInstanceOf(ServiceUnavailableException)
      expect(error).toMatchObject({
        status: 503,
        message: 'The application transaction is temporarily unavailable. Retry shortly.',
      })
      expect(warn).toHaveBeenCalledWith({
        event: 'PATHWAYS_AUTHORIZED_OPERATION_UNAVAILABLE',
        stage,
        reason: code,
        ...(transactionFailure ? { transactionFailure } : {}),
      })
      expect(JSON.stringify(error)).not.toContain(providerDetail)
      expect(JSON.stringify(warn.mock.calls)).not.toContain(providerDetail)
      warn.mockRestore()
    },
  )

  it('keeps temporary-unavailability responses stable when diagnostic logging fails', async () => {
    const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => {
      throw new Error('synthetic logger failure')
    })

    await expect(
      withAuthorizedOperation(
        prisma({ code: 'P2024', message: 'sensitive provider detail' }),
        identity,
        'beneficiaries.records.register',
        async () => true,
      ),
    ).rejects.toBeInstanceOf(ServiceUnavailableException)
    warn.mockRestore()
  })

  it('passes only a requested transaction timeout and keeps the default timeout path unchanged', async () => {
    const withVerifiedContext = vi.fn(async (_context, work, options) => {
      options?.onTiming?.({ acquisitionMs: 4, contextMs: 5, workMs: 6 })
      return work({} as Prisma.TransactionClient)
    })
    const client = { withVerifiedContext } as unknown as PrismaService

    await expect(
      withAuthorizedOperation(
        client,
        identity,
        'beneficiaries.records.register',
        async () => true,
        { transactionTimeoutMs: 20_000 },
      ),
    ).resolves.toBe(true)
    expect(withVerifiedContext).toHaveBeenLastCalledWith(
      {
        authSubject: identity.id,
        organizationId: identity.organizationId,
        userId: identity.userId,
      },
      expect.any(Function),
      { timeoutMs: 20_000, onTiming: expect.any(Function) },
    )

    await expect(
      withAuthorizedOperation(client, identity, 'beneficiaries.records.register', async () => true),
    ).resolves.toBe(true)
    expect(withVerifiedContext).toHaveBeenLastCalledWith(
      {
        authSubject: identity.id,
        organizationId: identity.organizationId,
        userId: identity.userId,
      },
      expect.any(Function),
      { onTiming: expect.any(Function) },
    )
  })

  it('reports bounded acquisition, context, profile, feature, and total timing once', async () => {
    const onTiming = vi.fn()
    registerAuthorizedOperationTiming(identity, onTiming)
    const withVerifiedContext = vi.fn(async (_context, work, options) => {
      const result = await work({} as Prisma.TransactionClient)
      options?.onTiming?.({ acquisitionMs: 7, contextMs: 8, workMs: 9 })
      return result
    })
    const client = { withVerifiedContext } as unknown as PrismaService

    await expect(
      withAuthorizedOperation(
        client,
        identity,
        'beneficiaries.records.register',
        async () => 'complete',
      ),
    ).resolves.toBe('complete')

    expect(onTiming).toHaveBeenCalledOnce()
    expect(onTiming).toHaveBeenCalledWith({
      acquisitionMs: 7,
      contextMs: 8,
      profileMs: expect.any(Number),
      featureMs: expect.any(Number),
      totalMs: expect.any(Number),
    })
    for (const duration of Object.values(onTiming.mock.calls[0]?.[0] ?? {})) {
      expect(duration).toBeGreaterThanOrEqual(0)
      expect(duration).toBeLessThanOrEqual(30_000)
    }
  })

  it('does not let an operation timing observer change a successful result', async () => {
    registerAuthorizedOperationTiming(identity, () => {
      throw new Error('synthetic observer failure')
    })
    const client = {
      withVerifiedContext: vi.fn(async (_context, work, options) => {
        const result = await work({} as Prisma.TransactionClient)
        options?.onTiming?.({ acquisitionMs: 1, contextMs: 2, workMs: 3 })
        return result
      }),
    } as unknown as PrismaService

    await expect(
      withAuthorizedOperation(
        client,
        identity,
        'beneficiaries.records.register',
        async () => 'complete',
      ),
    ).resolves.toBe('complete')
  })
})
