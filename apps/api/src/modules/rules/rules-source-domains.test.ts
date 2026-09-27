import { createHash } from 'node:crypto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PrismaService } from '../../prisma/prisma.service'
import type { ApplicationIdentity } from '../auth/developer-access'
import type { StorageService } from '../storage/storage.service'

const boundary = vi.hoisted(() => ({
  tx: {} as Record<string, unknown>,
  actor: {} as ApplicationIdentity,
  begin: vi.fn(),
  ack: vi.fn(),
  finish: vi.fn(),
}))
vi.mock('../auth/authorized-operation', () => ({
  withAuthorizedOperation: async (
    _prisma: unknown,
    _identity: unknown,
    _permission: unknown,
    work: (tx: unknown, actor: ApplicationIdentity) => Promise<unknown>,
  ) => work(boundary.tx, boundary.actor),
}))
vi.mock('./rules-source-operation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./rules-source-operation')>()),
  beginRuleSourceOperation: boundary.begin,
  readRuleSourceAcknowledgement: boundary.ack,
  finishRuleSourceOperation: boundary.finish,
}))
vi.mock('@pathways/config', () => ({
  readApiEnv: () => ({ BUSINESS_TIME_ZONE: 'Asia/Manila', EVIDENCE_BUCKET: 'private-evidence' }),
}))
import { ActivitiesService } from '../activities/activities.service'
import { IndicatorsService } from '../indicators/indicators.service'
import { ProjectsService } from '../projects/projects.service'
const project = '10000000-0000-4000-8000-000000000001'
const source = '20000000-0000-4000-8000-000000000002'
const request = '30000000-0000-4000-8000-000000000003'
const revision = '2026-09-27T00:00:00.000Z'
const acknowledgement = { requestId: request, committed: true as const, replayed: true }
const projects = new ProjectsService({} as PrismaService)
const activities = new ActivitiesService({} as PrismaService, {} as StorageService)
const indicators = new IndicatorsService({} as PrismaService)
const activityBody = {
  clientMutationId: request,
  title: 'Synthetic activity',
  plannedStartDate: '2026-01-01',
  plannedEndDate: '2026-12-31',
  assignedUserIds: [],
}
const indicatorBody = {
  clientMutationId: request,
  code: 'SYNTHETIC',
  name: 'Synthetic metric',
  unitLabel: 'count',
  dataSource: 'Synthetic',
  mode: 'MANUAL',
  numericKind: 'COUNT',
  direction: 'HIGHER_IS_BETTER',
  displayPrecision: 0,
  periodStart: '2026-01-01',
  periodEnd: '2026-12-31',
  baseline: null,
  target: null,
}
const operations = [
  [
    'PROJECT_UPDATE',
    () =>
      projects.update(boundary.actor, project, {
        clientMutationId: request,
        title: 'Synthetic project',
        status: 'ONGOING',
        expectedUpdatedAt: revision,
      }),
  ],
  ['ACTIVITY_CREATE', () => activities.create(boundary.actor, project, activityBody)],
  [
    'ACTIVITY_UPDATE',
    () =>
      activities.update(boundary.actor, project, source, {
        ...activityBody,
        expectedUpdatedAt: revision,
      }),
  ],
  [
    'ACTIVITY_START',
    () =>
      activities.transition(boundary.actor, project, source, {
        clientMutationId: request,
        status: 'IN_PROGRESS',
        expectedUpdatedAt: revision,
      }),
  ],
  [
    'ACTIVITY_CANCEL',
    () =>
      activities.transition(boundary.actor, project, source, {
        clientMutationId: request,
        status: 'CANCELLED',
        reason: 'Synthetic cancellation',
        expectedUpdatedAt: revision,
      }),
  ],
  [
    'ACTIVITY_REVIEW',
    () =>
      activities.reviewUpdate(boundary.actor, project, source, source, {
        clientMutationId: request,
        decision: 'APPROVE',
        reason: 'Synthetic review',
        expectedUpdatedAt: revision,
      }),
  ],
  ['INDICATOR_CREATE', () => indicators.create(boundary.actor, project, indicatorBody)],
  [
    'INDICATOR_UPDATE',
    () =>
      indicators.update(boundary.actor, project, source, {
        clientMutationId: request,
        name: 'Synthetic metric',
        expectedRevision: 1,
      }),
  ],
  [
    'INDICATOR_ARCHIVE',
    () =>
      indicators.archive(boundary.actor, project, source, {
        clientMutationId: request,
        expectedRevision: 1,
      }),
  ],
] as const
beforeEach(() => {
  vi.resetAllMocks()
  boundary.tx = {
    $queryRaw: vi.fn(),
    project: { findFirst: vi.fn() },
    projectActivity: { findFirst: vi.fn() },
  }
  boundary.actor = {
    roles: ['MONITORING_AND_EVALUATION_OFFICER'],
    permissions: ['evidence.review'],
  } as ApplicationIdentity
  boundary.begin.mockResolvedValue({ kind: 'REPLAY', acknowledgement })
  boundary.ack.mockResolvedValue(acknowledgement)
})
describe('current source handler immutable receipts precede mutable state and source locks', () => {
  it('NEW project applies server timestamp, then refuses success projection when final companion verification fails', async () => {
    boundary.begin.mockResolvedValueOnce({
      kind: 'NEW',
      operationHandle: source,
      reservedRecordId: null,
      generatedValues: {
        timestamp: '2026-09-27T00:00:00.001Z',
        businessDate: '2026-09-27',
        normalizedValue: null,
        requestHash: null,
      },
    })
    const updateMany = vi.fn(async () => ({ count: 1 }))
    const audit = vi.fn()
    const projection = vi.fn()
    boundary.tx = {
      project: {
        findFirst: vi.fn(async () => ({
          id: project,
          code: 'SYNTHETIC',
          updatedAt: new Date(revision),
        })),
        updateMany,
        findUniqueOrThrow: projection,
      },
      auditLog: { create: audit },
    }
    boundary.finish.mockRejectedValueOnce(new Error('Companion proof failed'))
    await expect(
      projects.update(boundary.actor, project, {
        clientMutationId: request,
        title: 'Synthetic project',
        status: 'ONGOING',
        expectedUpdatedAt: revision,
      }),
    ).rejects.toThrow('Companion proof failed')
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ updatedAt: new Date('2026-09-27T00:00:00.001Z') }),
      }),
    )
    expect(boundary.finish).toHaveBeenCalledWith(boundary.tx, source, request)
    expect(projection).not.toHaveBeenCalled()
  })
  it.each(operations)(
    '%s returns only immutable ACK on retry without loading stale mutable records',
    async (operation, invoke) => {
      expect(await invoke()).toEqual(acknowledgement)
      expect(boundary.begin).toHaveBeenCalledWith(
        boundary.tx,
        operation,
        project,
        operation.endsWith('_CREATE') ? null : operation === 'PROJECT_UPDATE' ? project : source,
        { kind: 'CLIENT_MUTATION', id: request },
        expect.not.objectContaining({ clientMutationId: request }),
      )
      expect(boundary.tx.$queryRaw).not.toHaveBeenCalled()
      expect(boundary.finish).not.toHaveBeenCalled()
      expect(
        (boundary.tx.project as { findFirst: ReturnType<typeof vi.fn> }).findFirst,
      ).not.toHaveBeenCalled()
      expect(
        (boundary.tx.projectActivity as { findFirst: ReturnType<typeof vi.fn> }).findFirst,
      ).not.toHaveBeenCalled()
    },
  )
  it.each(operations)(
    '%s failed begin cannot perform source locks, reads or writes',
    async (_operation, invoke) => {
      boundary.begin.mockRejectedValueOnce(new Error('Current authorization unavailable'))
      await expect(invoke()).rejects.toThrow('Current authorization unavailable')
      expect(boundary.tx.$queryRaw).not.toHaveBeenCalled()
      expect(boundary.finish).not.toHaveBeenCalled()
    },
  )
  it('recovers committed measurement before definition archive, bootstrap or correction changes', async () => {
    expect(
      await indicators.measure(boundary.actor, project, source, {
        clientMeasurementId: request,
        periodStart: '2026-01-01',
        periodEnd: '2026-12-31',
        value: '1',
        source: 'Synthetic',
      }),
    ).toEqual(acknowledgement)
    expect(boundary.ack).toHaveBeenCalled()
    expect(boundary.begin).not.toHaveBeenCalled()
    expect(boundary.tx.$queryRaw).not.toHaveBeenCalled()
  })
  it('recovers finalized proof before external storage even after activity became terminal', async () => {
    const file = {
      buffer: Buffer.from('synthetic-proof'),
      originalname: 'synthetic.png',
      mimetype: 'image/png',
      size: 15,
    }
    const hash = createHash('sha256').update(file.buffer).digest('hex')
    const storage = { uploadPrivateFile: vi.fn(), downloadPrivateFile: vi.fn() }
    const service = new ActivitiesService({} as PrismaService, storage as unknown as StorageService)
    boundary.tx = {
      project: { findFirst: vi.fn(async () => ({ id: project, startDate: null, endDate: null })) },
      projectActivity: {
        findFirst: vi.fn(async () => ({ id: source, projectId: project, status: 'COMPLETED' })),
      },
      projectActivityAssignment: { findFirst: vi.fn(async () => ({ id: source })) },
      activityUpdate: {
        findFirst: vi.fn(async () => ({
          id: request,
          projectId: project,
          activityId: source,
          progressPercent: 100,
          note: 'Synthetic proof',
          evidenceMedia_update: [
            {
              id: source,
              fileName: 'synthetic.png',
              sha256: hash,
              contentType: 'image/png',
              byteSize: 15n,
              bucket: 'private',
              objectKey: 'private-key',
              storageReady: true,
            },
          ],
        })),
      },
    }
    expect(
      await service.submitUpdate(
        boundary.actor,
        project,
        source,
        { clientUpdateId: request, progressPercent: 100, note: 'Synthetic proof' },
        [file],
      ),
    ).toEqual(acknowledgement)
    expect(boundary.ack).toHaveBeenCalled()
    expect(boundary.begin).not.toHaveBeenCalled()
    expect(storage.uploadPrivateFile).not.toHaveBeenCalled()
    expect(storage.downloadPrivateFile).not.toHaveBeenCalled()
  })
  it('uploads retry bytes to their immutable metadata-matched objects despite changed database row order', async () => {
    const reservation = '40000000-0000-4000-8000-000000000004'
    const files = ['a', 'b'].map((name) => ({
      buffer: Buffer.from(name),
      originalname: `${name}.png`,
      mimetype: 'image/png',
      size: 1,
    }))
    const evidence = files
      .map((file) => ({
        id: source,
        fileName: file.originalname,
        sha256: createHash('sha256').update(file.buffer).digest('hex'),
        contentType: file.mimetype,
        byteSize: 1n,
        bucket: 'private',
        objectKey: `private/${file.originalname}`,
        storageReady: false,
      }))
      .reverse()
    const storage = { uploadPrivateFile: vi.fn(), downloadPrivateFile: vi.fn() }
    const service = new ActivitiesService({} as PrismaService, storage as unknown as StorageService)
    boundary.ack.mockResolvedValueOnce(null)
    boundary.begin.mockResolvedValueOnce({
      kind: 'REPLAY',
      acknowledgement: { ...acknowledgement, requestId: reservation },
    })
    boundary.tx = {
      project: { findFirst: vi.fn(async () => ({ id: project, startDate: null, endDate: null })) },
      projectActivity: {
        findFirst: vi.fn(async () => ({ id: source, projectId: project, status: 'FOR_REVIEW' })),
      },
      projectActivityAssignment: { findFirst: vi.fn(async () => ({ id: source })) },
      activityUpdate: {
        findFirst: vi.fn(async () => ({
          id: reservation,
          projectId: project,
          activityId: source,
          progressPercent: 50,
          note: 'Synthetic proof',
          evidenceMedia_update: evidence,
        })),
      },
    }
    expect(
      await service.submitUpdate(
        boundary.actor,
        project,
        source,
        { clientUpdateId: request, progressPercent: 50, note: 'Synthetic proof' },
        files,
      ),
    ).toEqual(acknowledgement)
    expect(storage.uploadPrivateFile.mock.calls).toEqual([
      ['private', 'private/b.png', Buffer.from('b'), 'image/png'],
      ['private', 'private/a.png', Buffer.from('a'), 'image/png'],
    ])
    expect(boundary.begin.mock.calls[0]?.[4]).toEqual({
      kind: 'PROOF_FINALIZE',
      id: reservation,
      phase: 'FINALIZE',
    })
  })
  it('rejects altered retry proof MIME/size before any receipt lookup or external storage', async () => {
    const file = {
      buffer: Buffer.from('synthetic-proof'),
      originalname: 'synthetic.png',
      mimetype: 'image/png',
      size: 15,
    }
    const hash = createHash('sha256').update(file.buffer).digest('hex')
    const storage = { uploadPrivateFile: vi.fn(), downloadPrivateFile: vi.fn() }
    const service = new ActivitiesService({} as PrismaService, storage as unknown as StorageService)
    boundary.tx = {
      project: { findFirst: vi.fn(async () => ({ id: project, startDate: null, endDate: null })) },
      projectActivity: {
        findFirst: vi.fn(async () => ({ id: source, projectId: project, status: 'FOR_REVIEW' })),
      },
      projectActivityAssignment: { findFirst: vi.fn(async () => ({ id: source })) },
      activityUpdate: {
        findFirst: vi.fn(async () => ({
          id: request,
          projectId: project,
          activityId: source,
          progressPercent: 50,
          note: 'Synthetic proof',
          evidenceMedia_update: [
            {
              id: source,
              fileName: 'synthetic.png',
              sha256: hash,
              contentType: 'image/webp',
              byteSize: 15n,
              bucket: 'private',
              objectKey: 'private-key',
              storageReady: false,
            },
          ],
        })),
      },
    }
    await expect(
      service.submitUpdate(
        boundary.actor,
        project,
        source,
        { clientUpdateId: request, progressPercent: 50, note: 'Synthetic proof' },
        [file],
      ),
    ).rejects.toThrow('different input')
    expect(boundary.ack).not.toHaveBeenCalled()
    expect(storage.uploadPrivateFile).not.toHaveBeenCalled()
  })
})
