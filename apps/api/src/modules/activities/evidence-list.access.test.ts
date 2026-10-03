import 'reflect-metadata'

import { ForbiddenException, NotFoundException } from '@nestjs/common'
import type { Prisma } from '@prisma/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { PERMISSION_KEY } from '@app/common/decorators/permission.decorator'
import { hasAtomicPermission } from '@app/modules/auth/authorization-policy'
import type { ApplicationIdentity } from '@app/modules/auth/developer-access'
import type { StorageService } from '@app/modules/storage/storage.service'
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

import { EvidenceController } from './activities.controller'
import { ActivitiesService } from './activities.service'

const organizationId = '10000000-0000-4000-8000-000000000001'
const projectId = '20000000-0000-4000-8000-000000000002'
const otherProjectId = '20000000-0000-4000-8000-0000000000ff'
const activityId = '30000000-0000-4000-8000-000000000003'
const updateId = '40000000-0000-4000-8000-000000000004'
const evidenceId = '50000000-0000-4000-8000-000000000005'

function identity(role: string, permissions: string[]): ApplicationIdentity {
  return {
    id: '60000000-0000-4000-8000-000000000006',
    aal: 'aal2',
    userId: '70000000-0000-4000-8000-000000000007',
    organizationId,
    fullName: 'Synthetic actor',
    roles: [role],
    permissions,
    assignedProjectIds: [projectId],
  }
}

const detailRow = {
  id: activityId,
  projectId,
  title: 'Synthetic activity',
  activityUpdate_activity: [
    {
      id: updateId,
      note: 'Synthetic note',
      updatedAt: new Date('2026-09-20T00:00:00.000Z'),
      submittedBy: { fullName: 'Synthetic officer' },
      evidenceMedia_update: [
        {
          id: evidenceId,
          fileName: 'synthetic-proof.pdf',
          status: 'PENDING',
          submittedAt: new Date('2026-09-19T00:00:00.000Z'),
          contentType: 'application/pdf',
          byteSize: 2048n,
          isIdentifying: true,
        },
      ],
    },
  ],
}

const aggregateRow = {
  id: activityId,
  title: 'Synthetic activity',
}

const groups = (pending: number, approved: number, rejected: number, verified: number) => [
  { activityId, status: 'PENDING', _count: { _all: pending } },
  { activityId, status: 'APPROVED', _count: { _all: approved } },
  { activityId, status: 'REJECTED', _count: { _all: rejected } },
  { activityId, status: 'VERIFIED', _count: { _all: verified } },
]

const tx = { project: { findFirst: vi.fn() }, evidenceMedia: { groupBy: vi.fn() } }
const service = new ActivitiesService({} as PrismaService, {} as StorageService)

function collectKeys(value: unknown, keys = new Set<string>()) {
  if (Array.isArray(value)) for (const item of value) collectKeys(item, keys)
  else if (value && typeof value === 'object')
    for (const [key, item] of Object.entries(value)) {
      keys.add(key)
      collectKeys(item, keys)
    }
  return keys
}

describe('A-01 evidence list under evidence.read', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    state.tx = tx as unknown as Prisma.TransactionClient
  })

  it('declares evidence.read on the list route', () => {
    expect(Reflect.getMetadata(PERMISSION_KEY, EvidenceController.prototype.list)).toBe(
      'evidence.read',
    )
  })

  it('returns the scoped evidence list to a project role, scoping before retrieval', async () => {
    state.actor = identity('MONITORING_AND_EVALUATION_OFFICER', ['evidence.read'])
    tx.project.findFirst.mockResolvedValue({ projectActivity_project: [detailRow] })
    await expect(service.listEvidence(state.actor, projectId)).resolves.toEqual({
      scope: 'detail',
      records: [
        {
          id: evidenceId,
          projectId,
          activityId,
          updateId,
          updateUpdatedAt: '2026-09-20T00:00:00.000Z',
          fileName: 'synthetic-proof.pdf',
          reportTitle: 'Synthetic activity',
          status: 'Submitted',
          submitter: 'Synthetic officer',
          submittedDate: '2026-09-19T00:00:00.000Z',
          previewSummary: 'Synthetic note',
          contentType: 'application/pdf',
          byteSize: 2048,
          isIdentifying: true,
          reviewedDate: null,
          reviewer: null,
        },
      ],
    })
    const request = tx.project.findFirst.mock.calls[0][0]
    expect(request.where.AND[0]).toMatchObject({ organizationId, id: { in: [projectId] } })
    expect(request.where.AND[1]).toEqual({ id: projectId })
    expect(request.select.projectActivity_project.where).toEqual({
      organizationId,
      archivedAt: null,
    })
  })

  it.each(['PROGRAM_MANAGER', 'GRANT_MANAGER'])(
    'returns per-activity aggregate counts to %s',
    async (role) => {
      state.actor = identity(role, ['evidence.read'])
      tx.project.findFirst.mockResolvedValue({ projectActivity_project: [aggregateRow] })
      tx.evidenceMedia.groupBy.mockResolvedValue(groups(1, 1, 1, 1))
      await expect(service.listEvidence(state.actor, projectId)).resolves.toEqual({
        scope: 'aggregate',
        activities: [
          {
            activityId,
            activityTitle: 'Synthetic activity',
            total: 4,
            submitted: 1,
            approved: 2,
            returned: 1,
          },
        ],
      })
    },
  )

  it('aggregates with one scoped count query', async () => {
    state.actor = identity('PROGRAM_MANAGER', ['evidence.read'])
    tx.project.findFirst.mockResolvedValue({ projectActivity_project: [aggregateRow] })
    tx.evidenceMedia.groupBy.mockResolvedValue(groups(1, 1, 1, 1))
    await service.listEvidence(state.actor, projectId)
    expect(tx.evidenceMedia.groupBy).toHaveBeenCalledWith({
      by: ['activityId', 'status'],
      where: {
        organizationId,
        projectId,
        activityId: { in: [activityId] },
        activityUpdateId: { not: null },
        storageReady: true,
      },
      _count: { _all: true },
    })
  })

  it('reports exact counts above the former 10-per-update and 100-update caps', async () => {
    state.actor = identity('PROGRAM_MANAGER', ['evidence.read'])
    tx.project.findFirst.mockResolvedValue({ projectActivity_project: [aggregateRow] })
    tx.evidenceMedia.groupBy.mockResolvedValue(groups(640, 900, 25, 100))
    const result = await service.listEvidence(state.actor, projectId)
    expect(result).toEqual({
      scope: 'aggregate',
      activities: [
        {
          activityId,
          activityTitle: 'Synthetic activity',
          total: 1665,
          submitted: 640,
          approved: 1000,
          returned: 25,
        },
      ],
    })
    const select = tx.project.findFirst.mock.calls[0][0].select.projectActivity_project.select
    expect(select).toEqual({ id: true, title: true })
  })

  it('skips the count query when the project has no activities', async () => {
    state.actor = identity('GRANT_MANAGER', ['evidence.read'])
    tx.project.findFirst.mockResolvedValue({ projectActivity_project: [] })
    await expect(service.listEvidence(state.actor, projectId)).resolves.toEqual({
      scope: 'aggregate',
      activities: [],
    })
    expect(tx.evidenceMedia.groupBy).not.toHaveBeenCalled()
  })

  it('denies an actor without evidence.read before any query', async () => {
    state.actor = identity('PROJECT_OFFICER', ['activities.read'])
    await expect(service.listEvidence(state.actor, projectId)).rejects.toBeInstanceOf(
      ForbiddenException,
    )
    expect(tx.project.findFirst).not.toHaveBeenCalled()
    expect(tx.evidenceMedia.groupBy).not.toHaveBeenCalled()
  })

  it('returns not found for a cross-organization or unassigned project', async () => {
    state.actor = identity('MONITORING_AND_EVALUATION_OFFICER', ['evidence.read'])
    tx.project.findFirst.mockResolvedValue(null)
    await expect(service.listEvidence(state.actor, otherProjectId)).rejects.toBeInstanceOf(
      NotFoundException,
    )
    expect(tx.evidenceMedia.groupBy).not.toHaveBeenCalled()
    const request = tx.project.findFirst.mock.calls[0][0]
    expect(request.where.AND[0].organizationId).toBe(organizationId)
    await expect(service.listEvidence(state.actor, 'not-a-uuid')).rejects.toBeInstanceOf(
      NotFoundException,
    )
  })

  it.each(['PROGRAM_MANAGER', 'GRANT_MANAGER'])(
    'never selects or returns detail fields for %s',
    async (role) => {
      state.actor = identity(role, ['evidence.read'])
      // Even if the store returned extra columns, only counts leave the service.
      tx.project.findFirst.mockResolvedValue({
        projectActivity_project: [
          {
            ...aggregateRow,
            activityUpdate_activity: detailRow.activityUpdate_activity.map((update) => ({
              ...update,
              evidenceMedia_update: update.evidenceMedia_update.map((proof) => ({
                ...proof,
                objectKey: 'organizations/x/proof.pdf',
              })),
            })),
          },
        ],
      })
      const result = await service.listEvidence(state.actor, projectId)
      const returned = collectKeys(result)
      for (const key of [
        'fileName',
        'submitter',
        'submittedBy',
        'previewSummary',
        'note',
        'objectKey',
        'url',
        'updateId',
        'beneficiaryId',
      ])
        expect(returned.has(key)).toBe(false)
      const selected = collectKeys(tx.project.findFirst.mock.calls[0][0].select)
      for (const key of ['fileName', 'submittedBy', 'note', 'objectKey', 'submittedAt'])
        expect(selected.has(key)).toBe(false)
    },
  )
})
