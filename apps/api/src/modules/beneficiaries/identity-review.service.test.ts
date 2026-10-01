import 'reflect-metadata'

import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common'
import type { Prisma } from '@prisma/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { PERMISSION_KEY } from '@app/common/decorators/permission.decorator'
import { hasAtomicPermission } from '@app/modules/auth/authorization-policy'
import type { ApplicationIdentity } from '@app/modules/auth/developer-access'
import type { PrismaService } from '@app/prisma/prisma.service'

const state = vi.hoisted(() => ({
  actor: undefined as ApplicationIdentity | undefined,
  tx: undefined as Prisma.TransactionClient | undefined,
}))

vi.mock('@app/modules/auth/authorized-operation', () => ({
  withAuthorizedOperation: vi.fn(async (_prisma, _identity, permission, work) => {
    const actor = state.actor as ApplicationIdentity
    if (!hasAtomicPermission(actor.roles[0], actor.permissions, permission))
      throw new ForbiddenException('Permission denied.')
    return work(state.tx, actor)
  }),
}))

import { IdentityReviewController } from './identity-review.controller'
import { IdentityReviewService } from './identity-review.service'

const organizationId = '10000000-0000-4000-8000-000000000001'
const projectId = '20000000-0000-4000-8000-000000000002'
const a = '30000000-0000-4000-8000-00000000000a'
const b = '30000000-0000-4000-8000-00000000000b'
const c = '30000000-0000-4000-8000-00000000000c'

const identity = (role: string, permissions: string[]): ApplicationIdentity => ({
  id: '60000000-0000-4000-8000-000000000006',
  aal: 'aal2',
  userId: '70000000-0000-4000-8000-000000000007',
  organizationId,
  fullName: 'Synthetic actor',
  roles: [role],
  permissions,
  assignedProjectIds: [projectId],
})

const row = (id: string, code: string, first: string, birth: string) => ({
  id,
  code,
  displayName: null,
  firstName: first,
  lastName: 'Cruz',
  birthDate: new Date(birth),
  locationBarangay: 'Poblacion',
  locationCityMunicipality: 'Sample City',
  updatedAt: new Date('2026-09-01T00:00:00.000Z'),
})

const tx = {
  project: { findFirst: vi.fn() },
  beneficiary: { findMany: vi.fn(), count: vi.fn() },
  auditLog: { findMany: vi.fn(), create: vi.fn() },
}
const service = new IdentityReviewService({} as PrismaService)
const reviewer = identity('MONITORING_AND_EVALUATION_OFFICER', ['beneficiaries.identities.review'])

beforeEach(() => {
  vi.clearAllMocks()
  state.actor = reviewer
  state.tx = tx as unknown as Prisma.TransactionClient
  tx.project.findFirst.mockResolvedValue({ id: projectId })
  tx.auditLog.findMany.mockResolvedValue([])
  tx.beneficiary.count.mockResolvedValue(2)
})

describe('duplicate identity review', () => {
  it('lists unresolved same-name same-birth-date pairs for the M&E reviewer', async () => {
    tx.beneficiary.findMany.mockResolvedValue([
      row(a, 'BEN-1', 'Ana', '2010-05-01'),
      row(b, 'BEN-2', 'ANA ', '2010-05-01'),
      row(c, 'BEN-3', 'Ben', '2010-05-01'),
    ])
    const pairs = await service.candidates(reviewer, projectId)
    expect(pairs).toHaveLength(1)
    expect(pairs[0].left.id).toBe(a)
    expect(pairs[0].right.id).toBe(b)
    expect(Object.keys(pairs[0].left)).not.toContain('contact')
  })

  it('hides a pair after a reviewer resolved it in either order', async () => {
    tx.beneficiary.findMany.mockResolvedValue([
      row(a, 'BEN-1', 'Ana', '2010-05-01'),
      row(b, 'BEN-2', 'Ana', '2010-05-01'),
    ])
    tx.auditLog.findMany.mockResolvedValue([{ entityId: b, changes: { otherBeneficiaryId: a } }])
    expect(await service.candidates(reviewer, projectId)).toEqual([])
  })

  it('records an audited keep-distinct decision', async () => {
    const result = await service.resolve(reviewer, projectId, {
      leftId: a,
      rightId: b,
      decision: 'KEEP_DISTINCT',
    })
    expect(result.decision).toBe('KEEP_DISTINCT')
    expect(tx.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'BENEFICIARY_IDENTITY_KEPT_DISTINCT',
        actorUserId: reviewer.userId,
        projectId,
        entityId: a,
        changes: { otherBeneficiaryId: b, decision: 'KEEP_DISTINCT' },
      }),
    })
  })

  it('records an audited link decision', async () => {
    await service.resolve(reviewer, projectId, { leftId: a, rightId: b, decision: 'LINK' })
    expect(tx.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: 'BENEFICIARY_IDENTITY_LINKED' }),
    })
  })

  it.each([
    ['PROJECT_OFFICER', ['beneficiaries.identities.review']],
    ['SYSTEM_ADMINISTRATOR', ['beneficiaries.identities.review']],
    ['MONITORING_AND_EVALUATION_OFFICER', []],
  ])('denies %s without the review grant', async (role, permissions) => {
    state.actor = identity(role, permissions)
    await expect(service.candidates(state.actor, projectId)).rejects.toBeInstanceOf(
      ForbiddenException,
    )
    await expect(
      service.resolve(state.actor, projectId, { leftId: a, rightId: b, decision: 'LINK' }),
    ).rejects.toBeInstanceOf(ForbiddenException)
    expect(tx.auditLog.create).not.toHaveBeenCalled()
  })

  it('rejects the same profile twice, an unenrolled profile and a repeated decision', async () => {
    await expect(
      service.resolve(reviewer, projectId, { leftId: a, rightId: a, decision: 'LINK' }),
    ).rejects.toBeInstanceOf(BadRequestException)
    tx.beneficiary.count.mockResolvedValue(1)
    await expect(
      service.resolve(reviewer, projectId, { leftId: a, rightId: c, decision: 'LINK' }),
    ).rejects.toBeInstanceOf(NotFoundException)
    tx.beneficiary.count.mockResolvedValue(2)
    tx.auditLog.findMany.mockResolvedValue([{ entityId: b, changes: { otherBeneficiaryId: a } }])
    await expect(
      service.resolve(reviewer, projectId, { leftId: a, rightId: b, decision: 'LINK' }),
    ).rejects.toBeInstanceOf(BadRequestException)
    expect(tx.auditLog.create).not.toHaveBeenCalled()
  })

  it('denies an out-of-scope project before reading any profile', async () => {
    tx.project.findFirst.mockResolvedValue(null)
    await expect(service.candidates(reviewer, projectId)).rejects.toBeInstanceOf(NotFoundException)
    expect(tx.beneficiary.findMany).not.toHaveBeenCalled()
  })

  it('declares the review permission on both routes', () => {
    for (const method of ['list', 'resolve'] as const) {
      expect(Reflect.getMetadata(PERMISSION_KEY, IdentityReviewController.prototype[method])).toBe(
        'beneficiaries.identities.review',
      )
    }
  })
})
