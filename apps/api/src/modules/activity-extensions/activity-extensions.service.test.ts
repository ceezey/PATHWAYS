import 'reflect-metadata'

import { rolePermissions } from '@app/modules/auth/authorization-policy'
import { withAuthorizedOperation } from '@app/modules/auth/authorized-operation'
import type { ApplicationIdentity } from '@app/modules/auth/developer-access'
import {
  beginRuleSourceOperation,
  finishRuleSourceOperation,
} from '@app/modules/rules/rules-source-operation'
import type { PrismaService } from '@app/prisma/prisma.service'
import { activityExtensionSchema } from '@pathways/shared'
import type { Prisma } from '@prisma/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ActivityExtensionsService } from './activity-extensions.service'

vi.mock('@app/modules/auth/authorized-operation', () => ({ withAuthorizedOperation: vi.fn() }))
vi.mock('@app/modules/rules/rules-source-operation', async (original) => ({
  ...(await original<typeof import('@app/modules/rules/rules-source-operation')>()),
  beginRuleSourceOperation: vi.fn(),
  finishRuleSourceOperation: vi.fn(),
}))

const org = '10000000-0000-4000-8000-00000000000a'
const project = '20000000-0000-4000-8000-00000000000a'
const activityId = '40000000-0000-4000-8000-00000000000a'
const requestId = '50000000-0000-4000-8000-00000000000a'
const mutation = '60000000-0000-4000-8000-00000000000a'
const officer = '30000000-0000-4000-8000-000000000001'
const monitor = '30000000-0000-4000-8000-000000000002'
const manager = '30000000-0000-4000-8000-000000000003'
const activityStamp = new Date('2026-09-01T00:00:00.000Z')
const requestStamp = new Date('2026-09-02T00:00:00.000Z')
const sourceStamp = '2026-10-04T08:00:00.000Z'

function actor(role: keyof typeof rolePermissions, userId: string) {
  return {
    id: userId,
    aal: 'aal2',
    userId,
    organizationId: org,
    fullName: 'Synthetic fixture',
    roles: [role],
    permissions: [...rolePermissions[role]],
    assignedProjectIds: [project],
  } as ApplicationIdentity
}

function extensionRow(overrides: Record<string, unknown> = {}) {
  return {
    id: requestId,
    projectId: project,
    activityId,
    currentEndDate: new Date('2026-11-30T00:00:00.000Z'),
    requestedEndDate: new Date('2026-12-15T00:00:00.000Z'),
    reason: 'Rains delayed the delivery partner.',
    status: 'PENDING',
    requestedById: officer,
    requestedAt: requestStamp,
    verifiedById: null,
    verifiedAt: null,
    verificationNote: null,
    decidedAt: null,
    decisionNote: null,
    clientMutationId: mutation,
    updatedAt: requestStamp,
    requestedBy: { id: officer, fullName: 'Synthetic officer' },
    verifiedBy: null,
    decidedBy: null,
    ...overrides,
  }
}

function setup(row = extensionRow(), projectEnd = '2026-12-31') {
  const tx = {
    projectActivity: {
      findFirst: vi.fn().mockResolvedValue({
        id: activityId,
        projectId: project,
        title: 'Distribute kits',
        description: null,
        activityType: null,
        timelineOverrideJustification: null,
        plannedStartDate: new Date('2026-09-01T00:00:00.000Z'),
        plannedEndDate: new Date('2026-11-30T00:00:00.000Z'),
        status: 'IN_PROGRESS',
        updatedAt: activityStamp,
        project: { endDate: new Date(`${projectEnd}T00:00:00.000Z`) },
      }),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    projectActivityAssignment: {
      findFirst: vi.fn().mockResolvedValue({ id: 'assignment' }),
      findMany: vi.fn().mockResolvedValue([{ projectAssignment: { userId: officer } }]),
    },
    activityExtensionRequest: {
      findFirst: vi.fn().mockResolvedValue(row),
      findMany: vi.fn().mockResolvedValue([row]),
      create: vi.fn().mockResolvedValue({ id: requestId }),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      findFirstOrThrow: vi.fn().mockResolvedValue(row),
    },
    auditLog: { create: vi.fn().mockResolvedValue({}) },
  }
  vi.mocked(withAuthorizedOperation).mockImplementation((async (_p, identity, _perm, fn) =>
    fn(tx as unknown as Prisma.TransactionClient, identity)) as typeof withAuthorizedOperation)
  vi.mocked(beginRuleSourceOperation).mockResolvedValue({
    kind: 'NEW',
    operationHandle: '70000000-0000-4000-8000-00000000000a',
    reservedRecordId: null,
    generatedValues: {
      timestamp: sourceStamp,
      businessDate: '2026-10-04',
      normalizedValue: null,
      requestHash: null,
    },
  })
  vi.mocked(finishRuleSourceOperation).mockResolvedValue({
    requestId: mutation,
    committed: true,
    replayed: false,
  })
  return { tx, service: new ActivityExtensionsService({} as PrismaService) }
}

const requestBody = {
  clientMutationId: mutation,
  requestedEndDate: '2026-12-15',
  reason: 'Rains delayed the delivery partner.',
}
const decideBody = {
  clientMutationId: mutation,
  decision: 'APPROVE' as const,
  note: 'Approved after review.',
  expectedUpdatedAt: requestStamp.toISOString(),
  activityExpectedUpdatedAt: activityStamp.toISOString(),
}
const verified = () =>
  extensionRow({
    status: 'VERIFIED',
    verifiedById: monitor,
    verifiedAt: requestStamp,
    verifiedBy: { id: monitor, fullName: 'Synthetic monitor' },
  })

describe('ActivityExtensionsService.request', () => {
  beforeEach(() => vi.clearAllMocks())

  it('refuses an officer without an active activity assignment', async () => {
    const { tx, service } = setup()
    tx.activityExtensionRequest.findFirst.mockResolvedValue(null)
    tx.projectActivityAssignment.findFirst.mockResolvedValue(null)
    await expect(
      service.request(actor('PROJECT_OFFICER', officer), project, activityId, requestBody),
    ).rejects.toMatchObject({ status: 403 })
    expect(tx.activityExtensionRequest.create).not.toHaveBeenCalled()
  })

  it('refuses a date that is not later than the current planned end', async () => {
    const { tx, service } = setup()
    tx.activityExtensionRequest.findFirst.mockResolvedValue(null)
    await expect(
      service.request(actor('PROJECT_OFFICER', officer), project, activityId, {
        ...requestBody,
        requestedEndDate: '2026-11-30',
      }),
    ).rejects.toMatchObject({ status: 400 })
  })

  it('returns the same row when the client mutation id is replayed', async () => {
    const { tx, service } = setup()
    const result = await service.request(
      actor('PROJECT_OFFICER', officer),
      project,
      activityId,
      requestBody,
    )
    expect(activityExtensionSchema.parse(result).id).toBe(requestId)
    expect(tx.activityExtensionRequest.create).not.toHaveBeenCalled()
  })

  it('conflicts when the activity already has an open request', async () => {
    const { tx, service } = setup()
    tx.activityExtensionRequest.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: requestId })
    await expect(
      service.request(actor('PROJECT_OFFICER', officer), project, activityId, requestBody),
    ).rejects.toMatchObject({ status: 409 })
  })

  it('creates a pending request scoped to the actor and audits it', async () => {
    const { tx, service } = setup()
    tx.activityExtensionRequest.findFirst.mockResolvedValue(null)
    await service.request(actor('PROJECT_OFFICER', officer), project, activityId, requestBody)
    expect(tx.projectActivity.findFirst.mock.calls[0][0].where).toMatchObject({
      organizationId: org,
      project: { organizationId: org, id: { in: [project] } },
    })
    expect(tx.activityExtensionRequest.create.mock.calls[0][0].data).toMatchObject({
      requestedById: officer,
      reason: requestBody.reason,
    })
    expect(tx.auditLog.create.mock.calls[0][0].data.action).toBe('ACTIVITY_EXTENSION_REQUESTED')
  })
})

describe('ActivityExtensionsService.verify', () => {
  beforeEach(() => vi.clearAllMocks())
  const body = {
    decision: 'VERIFY' as const,
    note: 'Checked against the work plan.',
    expectedUpdatedAt: requestStamp.toISOString(),
  }

  it('lets the M&E officer verify a pending request', async () => {
    const { tx, service } = setup()
    await service.verify(
      actor('MONITORING_AND_EVALUATION_OFFICER', monitor),
      project,
      activityId,
      requestId,
      body,
    )
    expect(tx.activityExtensionRequest.updateMany.mock.calls[0][0]).toMatchObject({
      where: { status: 'PENDING', updatedAt: requestStamp },
      data: { status: 'VERIFIED', verifiedById: monitor },
    })
    expect(tx.auditLog.create.mock.calls[0][0].data.action).toBe('ACTIVITY_EXTENSION_VERIFIED')
  })

  it('refuses the requester verifying their own request', async () => {
    const { service } = setup(extensionRow({ requestedById: monitor }))
    await expect(
      service.verify(
        actor('MONITORING_AND_EVALUATION_OFFICER', monitor),
        project,
        activityId,
        requestId,
        body,
      ),
    ).rejects.toMatchObject({ status: 403 })
  })

  it('refuses any role other than the M&E officer', async () => {
    const { service } = setup()
    await expect(
      service.verify(actor('PROJECT_MANAGER', manager), project, activityId, requestId, body),
    ).rejects.toMatchObject({ status: 403 })
  })
})

describe('ActivityExtensionsService.decide', () => {
  beforeEach(() => vi.clearAllMocks())

  it('approves through ACTIVITY_UPDATE changing only the planned end date', async () => {
    const { tx, service } = setup(verified())
    await service.decide(
      actor('PROJECT_MANAGER', manager),
      project,
      activityId,
      requestId,
      decideBody,
    )
    const [, operation, , source, key, body] = vi.mocked(beginRuleSourceOperation).mock.calls[0]
    expect([operation, source, key]).toEqual([
      'ACTIVITY_UPDATE',
      activityId,
      { kind: 'CLIENT_MUTATION', id: mutation },
    ])
    expect(body).toEqual({
      title: 'Distribute kits',
      description: null,
      activityType: null,
      plannedStartDate: '2026-09-01',
      plannedEndDate: '2026-12-15',
      assignedUserIds: [officer],
      expectedUpdatedAt: activityStamp.toISOString(),
    })
    expect(tx.projectActivity.updateMany.mock.calls[0][0]).toEqual({
      where: { id: activityId, organizationId: org, updatedAt: activityStamp },
      data: {
        plannedEndDate: new Date('2026-12-15T00:00:00.000Z'),
        timelineOverrideJustification: null,
        updatedAt: new Date(sourceStamp),
      },
    })
    expect(tx.activityExtensionRequest.updateMany.mock.calls[0][0].data).toMatchObject({
      status: 'APPROVED',
      decidedById: manager,
    })
    expect(finishRuleSourceOperation).toHaveBeenCalledWith(tx, expect.any(String), mutation)
    expect(tx.auditLog.create.mock.calls[0][0].data.action).toBe('ACTIVITY_EXTENSION_APPROVED')
  })

  it('conflicts on a stale activity and leaves the request unchanged', async () => {
    const { tx, service } = setup(verified())
    tx.projectActivity.updateMany.mockResolvedValue({ count: 0 })
    await expect(
      service.decide(actor('PROJECT_MANAGER', manager), project, activityId, requestId, decideBody),
    ).rejects.toMatchObject({ status: 409 })
    expect(tx.activityExtensionRequest.updateMany).not.toHaveBeenCalled()
    expect(finishRuleSourceOperation).not.toHaveBeenCalled()
  })

  it('declines without touching the activity', async () => {
    const { tx, service } = setup(verified())
    await service.decide(actor('PROJECT_MANAGER', manager), project, activityId, requestId, {
      ...decideBody,
      decision: 'DECLINE',
    })
    expect(beginRuleSourceOperation).not.toHaveBeenCalled()
    expect(tx.projectActivity.updateMany).not.toHaveBeenCalled()
    expect(tx.activityExtensionRequest.updateMany.mock.calls[0][0].data.status).toBe('DECLINED')
  })

  it('carries the reason as the justification beyond the project end date', async () => {
    const { tx, service } = setup(verified(), '2026-12-01')
    await service.decide(
      actor('PROJECT_MANAGER', manager),
      project,
      activityId,
      requestId,
      decideBody,
    )
    const body = vi.mocked(beginRuleSourceOperation).mock.calls[0][5] as Record<string, unknown>
    expect(body.timelineOverrideJustification).toBe('Rains delayed the delivery partner.')
    expect(tx.projectActivity.updateMany.mock.calls[0][0].data.timelineOverrideJustification).toBe(
      'Rains delayed the delivery partner.',
    )
  })

  it('refuses the verifier deciding the request', async () => {
    const { service } = setup(verified())
    await expect(
      service.decide(actor('PROJECT_MANAGER', monitor), project, activityId, requestId, decideBody),
    ).rejects.toMatchObject({ status: 403 })
  })
})
