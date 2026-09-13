import { ConflictException, ForbiddenException } from '@nestjs/common'
import { describe, expect, it, vi } from 'vitest'

import type { PrismaService } from '@app/prisma/prisma.service'
import { withAuthorizedOperation } from './authorized-operation'
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
})
