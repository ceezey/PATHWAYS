// These existing domain tests isolate receipt transport; dedicated source tests cover its boundary.
vi.mock('../rules/rules-source-operation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../rules/rules-source-operation')>()),
  beginRuleSourceOperation: async (
    _tx: unknown,
    operation: string,
    projectId: string,
    sourceId: string | null,
    _key: unknown,
    body: Record<string, unknown>,
  ) => ({
    kind: 'NEW',
    operationHandle: 'f0000000-0000-4000-8000-000000000001',
    reservedRecordId: ['ACTIVITY_CREATE', 'INDICATOR_CREATE', 'INDICATOR_MEASUREMENT'].includes(
      operation,
    )
      ? 'f0000000-0000-4000-8000-000000000002'
      : null,
    generatedValues: {
      timestamp: '2026-09-27T00:00:00.001Z',
      businessDate: '2026-09-27',
      normalizedValue: operation === 'INDICATOR_MEASUREMENT' ? body.value : null,
      requestHash:
        operation === 'INDICATOR_MEASUREMENT'
          ? (await import('node:crypto'))
              .createHash('sha256')
              .update(
                JSON.stringify({
                  projectId,
                  indicatorId: sourceId,
                  periodStart: body.periodStart,
                  periodEnd: body.periodEnd,
                  value: body.value,
                  source: body.source,
                  note: body.note ?? null,
                  correctsMeasurementId: body.correctsMeasurementId ?? null,
                  correctionReason: body.correctionReason ?? null,
                }),
              )
              .digest('hex')
          : null,
    },
  }),
  finishRuleSourceOperation: async (_tx: unknown, _handle: string, requestId: string) => ({
    requestId,
    committed: true,
    replayed: false,
  }),
  readRuleSourceAcknowledgement: async () => null,
  bootstrapRuleSourceProject: async () => undefined,
}))
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PrismaService } from '../../prisma/prisma.service'
import type { ApplicationIdentity } from '../auth/developer-access'
import type { StorageService } from '../storage/storage.service'
const state = vi.hoisted(() => ({
  actor: null as unknown as ApplicationIdentity,
  tx: null as unknown as Record<string, unknown>,
}))
vi.mock('../auth/authorized-operation', () => ({
  withAuthorizedOperation: vi.fn(async (_prisma, _identity, _permission, work) =>
    work(state.tx, state.actor),
  ),
}))
vi.mock('../auth/application-profile.service', () => ({
  readApplicationProfile: vi.fn(async () => state.actor),
}))
import { ActivitiesService } from './activities.service'
const projectId = '20000000-0000-4000-8000-000000000002'
const activityId = '30000000-0000-4000-8000-000000000003'
const updateId = '40000000-0000-4000-8000-000000000004'
const actor: ApplicationIdentity = {
  id: '50000000-0000-4000-8000-000000000005',
  userId: '60000000-0000-4000-8000-000000000006',
  organizationId: '10000000-0000-4000-8000-000000000001',
  aal: 'aal2',
  fullName: 'Synthetic reviewer',
  roles: ['MONITORING_AND_EVALUATION_OFFICER'],
  permissions: ['activities.read', 'evidence.review'],
  assignedProjectIds: [projectId],
}
const revision = '2026-09-27T00:00:00.000Z'
const activity = () => ({
  id: activityId,
  projectId,
  code: 'ACT-1',
  title: 'Synthetic activity',
  description: null,
  activityType: null,
  timelineOverrideJustification: null,
  targetBeneficiaries: 5,
  plannedStartDate: new Date('2026-01-01'),
  plannedEndDate: new Date('2099-12-31'),
  actualStartDate: new Date('2026-01-01'),
  actualEndDate: null,
  status: 'FOR_REVIEW',
  progressPercent: 45,
  reviewedById: null,
  reviewedAt: null,
  cancelledAt: null,
  cancellationReason: null,
  updatedAt: new Date(revision),
  projectActivityAssignment_activity: [],
  activityUpdate_activity: [],
  activityJourneyStageMapping_activity: [],
  activityIndicatorLink_activity: [],
  activityOverdueExplanation_activity: [],
})
const update = () => ({
  id: updateId,
  status: 'PENDING',
  submittedById: '70000000-0000-4000-8000-000000000007',
  updatedAt: new Date(revision),
  progressPercent: 45,
  evidenceMedia_update: [
    { id: '80000000-0000-4000-8000-000000000008', storageReady: true, status: 'PENDING' },
  ],
})
const tx = {
  $queryRaw: vi.fn(),
  project: { findFirst: vi.fn() },
  projectActivity: { findFirst: vi.fn(), update: vi.fn() },
  activityUpdate: { findFirst: vi.fn(), update: vi.fn() },
  evidenceMedia: { updateMany: vi.fn() },
  auditLog: { create: vi.fn() },
}
const service = new ActivitiesService({} as PrismaService, {} as StorageService)
const review = (decision: 'APPROVE' | 'RETURN' = 'APPROVE') =>
  service.reviewUpdate(actor, projectId, activityId, updateId, {
    clientMutationId: 'e0000000-0000-4000-8000-000000000001',
    decision,
    reason: 'Synthetic scoped review',
    expectedUpdatedAt: revision,
  })
beforeEach(() => {
  vi.resetAllMocks()
  state.actor = structuredClone(actor)
  state.tx = tx
  tx.$queryRaw.mockResolvedValue([])
  tx.project.findFirst.mockImplementation(async () =>
    state.actor.assignedProjectIds.includes(projectId)
      ? { id: projectId, startDate: null, endDate: null }
      : null,
  )
  let row = activity()
  tx.projectActivity.findFirst.mockImplementation(async () => row)
  tx.projectActivity.update.mockImplementation(async ({ data }) => {
    row = { ...row, ...data }
    return row
  })
  tx.activityUpdate.findFirst.mockResolvedValue(update())
  tx.activityUpdate.update.mockResolvedValue({})
  tx.evidenceMedia.updateMany.mockResolvedValue({ count: 1 })
  tx.auditLog.create.mockResolvedValue({})
})
describe('canonical M&E activity update approval', () => {
  it.each([0, 45, 99])(
    'preserves approved %s%% progress without completing activity',
    async (progressPercent) => {
      tx.activityUpdate.findFirst.mockResolvedValue({ ...update(), progressPercent })
      const result = await review()
      expect(result).toMatchObject({
        progress: progressPercent,
        storedStatus: 'IN_PROGRESS',
        status: 'In Progress',
        actualEndDate: null,
        reviewedById: null,
        reviewedAt: null,
      })
      expect(tx.activityUpdate.update.mock.calls[0][0].data).toMatchObject({
        status: 'APPROVED',
        reviewedById: actor.userId,
        reviewedAt: expect.any(Date),
      })
      expect(tx.evidenceMedia.updateMany.mock.calls[0][0]).toMatchObject({
        where: {
          organizationId: actor.organizationId,
          projectId,
          activityId,
          activityUpdateId: updateId,
          status: 'PENDING',
        },
        data: { status: 'VERIFIED', verifiedById: actor.userId, verifiedAt: expect.any(Date) },
      })
    },
  )
  it('completes only an approved 100% update and records business completion date', async () => {
    tx.activityUpdate.findFirst.mockResolvedValue({ ...update(), progressPercent: 100 })
    const result = await review()
    expect(result).toMatchObject({
      progress: 100,
      storedStatus: 'COMPLETED',
      status: 'Completed',
      reviewedById: actor.userId,
      reviewedAt: expect.any(String),
    })
    if (!('actualEndDate' in result)) throw new Error('Expected fresh source projection')
    expect(result.actualEndDate).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
  it('returns even a 100% submitted update without completing or fabricating completion date', async () => {
    tx.activityUpdate.findFirst.mockResolvedValue({ ...update(), progressPercent: 100 })
    const result = await review('RETURN')
    expect(result).toMatchObject({
      progress: 100,
      storedStatus: 'IN_PROGRESS',
      actualEndDate: null,
    })
    expect(tx.activityUpdate.update.mock.calls[0][0].data.status).toBe('REJECTED')
    expect(tx.evidenceMedia.updateMany.mock.calls[0][0].data.status).toBe('REJECTED')
    expect(tx.auditLog.create.mock.calls[0][0].data.action).toBe('ACTIVITY_UPDATE_RETURNED')
  })
  it.each([
    'PROJECT_OFFICER',
    'PROJECT_MANAGER',
    'SYSTEM_ADMINISTRATOR',
    'PROGRAM_MANAGER',
    'GRANT_MANAGER',
  ])('denies %s before metadata locks or writes even with an injected grant', async (role) => {
    state.actor.roles = [role]
    await expect(review()).rejects.toThrow('unavailable')
    expect(tx.$queryRaw).not.toHaveBeenCalled()
    expect(tx.activityUpdate.update).not.toHaveBeenCalled()
  })
  it.each(['grant', 'assignment', 'role'])(
    'denies final %s revocation after lock wait without writes',
    async (kind) => {
      tx.$queryRaw.mockImplementation(async () => {
        if (kind === 'grant') state.actor.permissions = ['activities.read']
        if (kind === 'assignment') state.actor.assignedProjectIds = []
        if (kind === 'role') state.actor.roles = ['PROJECT_MANAGER']
        return []
      })
      await expect(review()).rejects.toThrow()
      expect(tx.activityUpdate.update).not.toHaveBeenCalled()
      expect(tx.projectActivity.update).not.toHaveBeenCalled()
      expect(tx.auditLog.create).not.toHaveBeenCalled()
    },
  )
  it.each(['revision', 'upload', 'self', 'finalized'])(
    'denies invalid %s admission without mutations',
    async (kind) => {
      const row = update()
      if (kind === 'revision') row.updatedAt = new Date('2026-09-27T00:00:00.001Z')
      if (kind === 'upload') row.evidenceMedia_update[0].storageReady = false
      if (kind === 'self') row.submittedById = actor.userId
      if (kind === 'finalized') row.status = 'APPROVED'
      tx.activityUpdate.findFirst.mockResolvedValue(row)
      await expect(review()).rejects.toThrow()
      expect(tx.activityUpdate.update).not.toHaveBeenCalled()
    },
  )
})
describe('progress-only activity update review', () => {
  const progressNote = (progressPercent = 60) => ({
    ...update(),
    progressPercent,
    evidenceMedia_update: [],
  })
  const inProgress = () => {
    let row = { ...activity(), status: 'IN_PROGRESS' }
    tx.projectActivity.findFirst.mockImplementation(async () => row)
    tx.projectActivity.update.mockImplementation(async ({ data }) => {
      row = { ...row, ...data }
      return row
    })
  }

  it('applies approved progress without completing or touching evidence', async () => {
    inProgress()
    tx.activityUpdate.findFirst.mockResolvedValue(progressNote(60))
    const result = await review()
    expect(result).toMatchObject({ progress: 60, storedStatus: 'IN_PROGRESS' })
    expect(tx.projectActivity.update.mock.calls[0][0].data).toEqual({
      progressPercent: 60,
      updatedAt: expect.any(Date),
    })
    expect(tx.evidenceMedia.updateMany).not.toHaveBeenCalled()
    expect(tx.auditLog.create.mock.calls[0][0].data.changes).toMatchObject({ kind: 'PROGRESS' })
  })

  it('returns a progress note without changing activity progress', async () => {
    inProgress()
    tx.activityUpdate.findFirst.mockResolvedValue(progressNote(60))
    const result = await review('RETURN')
    expect(result).toMatchObject({ progress: 45, storedStatus: 'IN_PROGRESS' })
    expect(tx.activityUpdate.update.mock.calls[0][0].data.status).toBe('REJECTED')
  })

  it('cannot be approved as proof while the activity awaits proof review', async () => {
    tx.activityUpdate.findFirst.mockResolvedValue(progressNote(60))
    await expect(review()).rejects.toThrow('no longer awaiting review')
    expect(tx.activityUpdate.update).not.toHaveBeenCalled()
    expect(tx.projectActivity.update).not.toHaveBeenCalled()
  })

  it('never completes an activity from a progress note', async () => {
    inProgress()
    tx.activityUpdate.findFirst.mockResolvedValue(progressNote(100))
    await expect(review()).rejects.toThrow('no longer awaiting review')
    expect(tx.projectActivity.update).not.toHaveBeenCalled()
  })
})
