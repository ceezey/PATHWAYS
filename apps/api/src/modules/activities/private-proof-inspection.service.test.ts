import { ForbiddenException } from '@nestjs/common'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { bindInspectionIdentity } from '../../common/network/inspection-request-budget'
import type { PrismaService } from '../../prisma/prisma.service'
import type { ApplicationIdentity } from '../auth/developer-access'

const state = vi.hoisted(() => ({
  actor: null as unknown as ApplicationIdentity,
  tx: null as unknown as Record<string, unknown>,
  read: vi.fn(),
}))
vi.mock('../auth/application-profile.service', () => ({
  readApplicationProfile: vi.fn(async () => state.actor),
}))
vi.mock('../auth/authorized-operation', () => ({
  withAuthorizedOperation: vi.fn(async (_prisma, _identity, _permission, work) =>
    work(state.tx, state.actor),
  ),
}))
vi.mock('../storage/private-inspection-reader', () => ({
  createPrivateInspectionReader: () => state.read,
}))
vi.mock('@pathways/config', () => ({
  readApiEnv: () => ({
    SUPABASE_URL: 'https://synthetic.invalid',
    SUPABASE_SERVICE_ROLE_KEY: 'synthetic',
    EVIDENCE_BUCKET: 'private',
  }),
}))
import {
  PrivateProofInspectionService,
  inspectionRevisions,
} from './private-proof-inspection.service'
const ids = {
  organizationId: '10000000-0000-4000-8000-000000000001',
  projectId: '20000000-0000-4000-8000-000000000002',
  activityId: '30000000-0000-4000-8000-000000000003',
  updateId: '40000000-0000-4000-8000-000000000004',
  evidenceId: '50000000-0000-4000-8000-000000000005',
  userId: '60000000-0000-4000-8000-000000000006',
  submitterId: '70000000-0000-4000-8000-000000000007',
  authId: '80000000-0000-4000-8000-000000000008',
}
const updatedAt = new Date('2026-09-27T00:00:00.000Z')
const revisions = {
  expectedActivityUpdatedAt: updatedAt.toISOString(),
  expectedUpdateUpdatedAt: updatedAt.toISOString(),
  expectedEvidenceUpdatedAt: updatedAt.toISOString(),
}
const actor: ApplicationIdentity = {
  id: ids.authId,
  aal: 'aal2',
  userId: ids.userId,
  organizationId: ids.organizationId,
  fullName: 'Synthetic reviewer',
  roles: ['MONITORING_AND_EVALUATION_OFFICER'],
  permissions: ['evidence.read', 'evidence.review'],
  assignedProjectIds: [ids.projectId],
}
const proof = () => ({
  ...ids,
  id: ids.evidenceId,
  activityUpdateId: ids.updateId,
  enrollmentId: null,
  expenseId: null,
  sourceSubmissionId: null,
  type: 'PROGRESS_PROOF',
  status: 'PENDING',
  submittedById: ids.submitterId,
  storageReady: true,
  publicVisibilityStatus: 'PRIVATE',
  updatedAt,
  bucket: 'private',
  objectKey: `organizations/${ids.organizationId}/projects/${ids.projectId}/evidence/${ids.evidenceId}/proof.pdf`,
  byteSize: 3n,
  sha256: 'a'.repeat(64),
})
const tx = {
  $queryRaw: vi.fn(),
  project: { findFirst: vi.fn() },
  projectActivity: { findFirst: vi.fn() },
  activityUpdate: { findFirst: vi.fn() },
  evidenceMedia: { findMany: vi.fn() },
  auditLog: { create: vi.fn() },
}
const service = new PrivateProofInspectionService({} as PrismaService)
const context = () => service.context(actor, ids.projectId, ids.activityId, ids.updateId)
const inspect = () =>
  service.inspect(actor, ids.projectId, ids.activityId, ids.updateId, ids.evidenceId, revisions)
beforeEach(() => {
  vi.resetAllMocks()
  tx.$queryRaw.mockResolvedValue([{ live: true }])
  state.actor = structuredClone(actor)
  state.tx = tx
  tx.project.findFirst.mockResolvedValue({ id: ids.projectId })
  tx.projectActivity.findFirst.mockResolvedValue({
    id: ids.activityId,
    status: 'FOR_REVIEW',
    updatedAt,
  })
  tx.activityUpdate.findFirst.mockResolvedValue({
    id: ids.updateId,
    status: 'PENDING',
    submittedById: ids.submitterId,
    updatedAt,
  })
  tx.evidenceMedia.findMany.mockImplementation(async () => [proof()])
  tx.auditLog.create.mockResolvedValue({})
  state.read.mockResolvedValue(Buffer.from('abc'))
  const controller = new AbortController()
  bindInspectionIdentity(actor, ids.authId, {
    signal: controller.signal,
    deadline: 1e12,
    remaining: () => 30000,
    check: () => {
      if (controller.signal.aborted) throw new Error('expired')
    },
  })
})
describe('purpose-limited activity proof inspection', () => {
  it.each([
    'SYSTEM_ADMINISTRATOR',
    'PROGRAM_MANAGER',
    'GRANT_MANAGER',
    'PROJECT_MANAGER',
    'PROJECT_OFFICER',
  ])('denies role %s before scoped retrieval', async (role) => {
    state.actor.roles = [role]
    await expect(context()).rejects.toBeInstanceOf(ForbiddenException)
    expect(tx.project.findFirst).not.toHaveBeenCalled()
    expect(state.read).not.toHaveBeenCalled()
  })
  it.each(['evidence.read', 'evidence.review'])(
    'requires grant %s independently',
    async (grant) => {
      state.actor.permissions = state.actor.permissions.filter((value) => value !== grant)
      await expect(inspect()).rejects.toThrow()
      expect(tx.project.findFirst).not.toHaveBeenCalled()
      expect(state.read).not.toHaveBeenCalled()
    },
  )
  it('returns only bounded advisory IDs and revisions, structurally scopes every query', async () => {
    const result = await context()
    expect(result).toEqual({
      activityId: ids.activityId,
      updateId: ids.updateId,
      expectedActivityUpdatedAt: revisions.expectedActivityUpdatedAt,
      expectedUpdateUpdatedAt: revisions.expectedUpdateUpdatedAt,
      proofs: [
        {
          id: ids.evidenceId,
          label: 'Activity proof',
          expectedEvidenceUpdatedAt: revisions.expectedEvidenceUpdatedAt,
        },
      ],
    })
    expect(tx.project.findFirst.mock.calls[0][0].where.AND[0]).toEqual({
      organizationId: ids.organizationId,
      archivedAt: null,
      id: { in: [ids.projectId] },
    })
    expect(tx.evidenceMedia.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          organizationId: ids.organizationId,
          projectId: ids.projectId,
          activityId: ids.activityId,
          activityUpdateId: ids.updateId,
        },
        take: 6,
        orderBy: { id: 'asc' },
      }),
    )
    expect(state.read).not.toHaveBeenCalled()
  })
  it.each([
    { enrollmentId: ids.userId },
    { expenseId: ids.userId },
    { sourceSubmissionId: ids.userId },
    { storageReady: false },
    { status: 'VERIFIED' },
    { publicVisibilityStatus: 'PUBLIC' },
    { type: 'DOCUMENT' },
    { submittedById: ids.userId },
    { submittedById: ids.authId },
    { byteSize: 0n },
    { byteSize: 10485761n },
    { sha256: '' },
  ])('denies unsupported or incomplete lineage %o without storage', async (delta) => {
    tx.evidenceMedia.findMany.mockResolvedValue([{ ...proof(), ...delta }])
    await expect(inspect()).rejects.toThrow()
    expect(state.read).not.toHaveBeenCalled()
  })
  it('rejects sixth sibling and incomplete sibling without storage', async () => {
    tx.evidenceMedia.findMany.mockResolvedValue(Array.from({ length: 6 }, proof))
    await expect(inspect()).rejects.toThrow()
    expect(state.read).not.toHaveBeenCalled()
  })
  it('checks revisions before storage and denies self review', async () => {
    tx.activityUpdate.findFirst.mockResolvedValue({
      id: ids.updateId,
      status: 'PENDING',
      submittedById: ids.userId,
      updatedAt,
    })
    await expect(inspect()).rejects.toThrow()
    tx.activityUpdate.findFirst.mockResolvedValue({
      id: ids.updateId,
      status: 'PENDING',
      submittedById: ids.submitterId,
      updatedAt: new Date('2026-09-27T00:00:00.001Z'),
    })
    await expect(inspect()).rejects.toThrow('changed')
    expect(state.read).not.toHaveBeenCalled()
  })
  it.each(['grant', 'assignment', 'pending', 'object', 'audit'])(
    'withholds bytes when %s changes during storage',
    async (change) => {
      state.read.mockImplementation(async () => {
        if (change === 'grant') state.actor.permissions = []
        if (change === 'assignment') tx.project.findFirst.mockResolvedValue(null)
        if (change === 'pending')
          tx.activityUpdate.findFirst.mockResolvedValue({
            id: ids.updateId,
            status: 'APPROVED',
            submittedById: ids.submitterId,
            updatedAt,
          })
        if (change === 'object')
          tx.evidenceMedia.findMany.mockResolvedValue([{ ...proof(), objectKey: 'changed' }])
        if (change === 'audit')
          tx.auditLog.create.mockRejectedValue(new Error('synthetic audit failure'))
        return Buffer.from('abc')
      })
      await expect(inspect()).rejects.toThrow()
      expect(state.read).toHaveBeenCalledTimes(1)
    },
  )
  it('withholds transfer when verified Auth session is revoked during storage', async () => {
    state.read.mockImplementation(async () => {
      tx.$queryRaw.mockResolvedValue([{ live: false }])
      return Buffer.from('abc')
    })
    await expect(inspect()).rejects.toThrow()
    expect(tx.auditLog.create).not.toHaveBeenCalled()
  })
  it('rechecks current grant after final row lock waits', async () => {
    tx.$queryRaw.mockImplementation(async () => {
      state.actor.permissions = []
      return [{ live: true }]
    })
    await expect(inspect()).rejects.toThrow()
    expect(tx.auditLog.create).not.toHaveBeenCalled()
  })
  it('requires final audit commit before returning verified bytes; audit omits private object metadata', async () => {
    const result = await inspect()
    expect(result).toEqual(Buffer.from('abc'))
    expect(tx.project.findFirst).toHaveBeenCalledTimes(2)
    expect(tx.auditLog.create).toHaveBeenCalledWith({
      data: {
        organizationId: ids.organizationId,
        actorUserId: ids.userId,
        projectId: ids.projectId,
        action: 'EVIDENCE_PRIVATE_INSPECTION_AUTHORIZED',
        entityType: 'EvidenceMedia',
        entityId: ids.evidenceId,
        changes: {
          purpose: 'EVIDENCE_VERIFICATION',
          activityId: ids.activityId,
          updateId: ids.updateId,
          ...revisions,
        },
      },
    })
  })
  it.each([
    {},
    { ...revisions, token: 'untrusted' },
    { ...revisions, expectedActivityUpdatedAt: ['2026-09-27T00:00:00.000Z'] },
    { ...revisions, expectedActivityUpdatedAt: '2026-02-30T00:00:00.000Z' },
    { ...revisions, expectedActivityUpdatedAt: '2026-09-27' },
  ])('rejects malformed revision query %o', (query) => {
    expect(() => inspectionRevisions(query)).toThrow()
  })
})
