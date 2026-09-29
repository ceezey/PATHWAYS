import 'reflect-metadata'

import { ConflictException, ForbiddenException } from '@nestjs/common'
import type { Prisma } from '@prisma/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { ApplicationIdentity } from '@app/modules/auth/developer-access'
import type { StorageService } from '@app/modules/storage/storage.service'
import type { PrismaService } from '@app/prisma/prisma.service'

const state = vi.hoisted(() => ({
  actor: undefined as ApplicationIdentity | undefined,
  tx: undefined as Prisma.TransactionClient | undefined,
  verify: vi.fn(),
  begin: vi.fn(),
  finish: vi.fn(),
  ack: vi.fn(),
}))

vi.mock('@app/modules/auth/authorized-operation', () => ({
  withAuthorizedOperation: vi.fn(async (_prisma, _identity, permission: string, work) => {
    if (!state.actor?.permissions.includes(permission))
      throw new ForbiddenException('Permission denied.')
    return work(state.tx, state.actor)
  }),
}))
vi.mock('@app/modules/auth/application-profile.service', () => ({
  readApplicationProfile: vi.fn(async () => state.actor),
}))
vi.mock('@app/modules/storage/private-inspection-reader', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@app/modules/storage/private-inspection-reader')>()),
  createPrivateUploadVerifier: () => state.verify,
}))
vi.mock('@app/modules/rules/rules-source-operation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@app/modules/rules/rules-source-operation')>()),
  beginRuleSourceOperation: state.begin,
  finishRuleSourceOperation: state.finish,
  readRuleSourceAcknowledgement: state.ack,
}))

import { ActivitiesService } from './activities.service'

// End-to-end lifecycle of one activity through the real service, against an in-memory store that
// applies each Prisma write the service makes. It covers what the developer reported: a Project
// Officer submits (reserve, upload, finalize) and progress notes, and the M&E reviewer must see the
// pending item in the activity detail and be able to approve or return it.
const organizationId = '10000000-0000-4000-8000-000000000001'
const projectId = '20000000-0000-4000-8000-000000000002'
const activityId = '30000000-0000-4000-8000-000000000003'
const sha = (seed: number) => seed.toString(16).padStart(2, '0').repeat(32)

const officer: ApplicationIdentity = {
  id: '70000000-0000-4000-8000-000000000007',
  aal: 'aal2',
  userId: '71000000-0000-4000-8000-000000000007',
  organizationId,
  fullName: 'Synthetic officer',
  roles: ['PROJECT_OFFICER'],
  permissions: [
    'activities.read',
    'activities.progress.update',
    'activities.proof.submit',
  ] as ApplicationIdentity['permissions'],
  assignedProjectIds: [projectId],
}
const reviewer: ApplicationIdentity = {
  id: '80000000-0000-4000-8000-000000000008',
  aal: 'aal2',
  userId: '81000000-0000-4000-8000-000000000008',
  organizationId,
  fullName: 'Synthetic reviewer',
  roles: ['MONITORING_AND_EVALUATION_OFFICER'],
  permissions: [
    'activities.read',
    'evidence.review',
    'monitoring.review',
  ] as ApplicationIdentity['permissions'],
  assignedProjectIds: [projectId],
}

// biome-ignore lint/suspicious/noExplicitAny: in-memory Prisma fake; rows are loosely typed by design
type Loose = any
type StoredUpdate = Record<string, Loose>
type StoredEvidence = Record<string, Loose>
let store: {
  activity: Record<string, Loose>
  updates: StoredUpdate[]
  evidence: StoredEvidence[]
}
let clock = 0
const tick = () => new Date(Date.UTC(2026, 8, 27, 0, 0, 0) + ++clock * 1000)

const names: Record<string, string> = {
  [officer.userId]: 'Synthetic officer',
  [reviewer.userId]: 'Synthetic reviewer',
}

function activityRow(actor: ApplicationIdentity) {
  const updates = store.updates.filter((update) => update.activityId === activityId)
  return {
    ...store.activity,
    projectActivityAssignment_activity: [],
    activityJourneyStageMapping_activity: [],
    activityIndicatorLink_activity: [],
    activityOverdueExplanation_activity: [],
    activityUpdate_activity: updates.map((update) => {
      const files = store.evidence.filter((row) => row.activityUpdateId === update.id)
      return {
        id: update.id,
        progressPercent: update.progressPercent,
        note: update.note,
        status: update.status,
        beneficiariesReachedThisSession: update.beneficiariesReachedThisSession ?? null,
        submittedAt: update.submittedAt,
        reviewedAt: update.reviewedAt ?? null,
        reviewReason: update.reviewReason ?? null,
        updatedAt: update.updatedAt,
        clientUpdateId: update.clientUpdateId,
        submittedById: update.submittedById,
        submittedBy: { fullName: names[update.submittedById] },
        reviewedBy: update.reviewedById ? { fullName: names[update.reviewedById] } : null,
        evidenceMedia_update: files
          .filter((row) => row.storageReady)
          .map((row) => ({
            id: row.id,
            fileName: row.fileName,
            status: row.status,
            submittedAt: row.submittedAt,
          })),
        _count: { evidenceMedia_update: files.length },
      }
    }),
    _count: { projectActivityAssignment_activity: actor.roles[0] === 'PROJECT_OFFICER' ? 1 : 0 },
  }
}

const matches = (row: Record<string, Loose>, where: Record<string, Loose> = {}) =>
  Object.entries(where).every(([key, value]) => {
    if (value === undefined || value === null || typeof value === 'object') return true
    return row[key] === value
  })

const tx = {
  $queryRaw: vi.fn(async () => []),
  project: {
    findFirst: vi.fn(async () => ({
      id: projectId,
      startDate: null,
      endDate: null,
      projectActivity_project: [activityRow(state.actor as ApplicationIdentity)],
    })),
  },
  projectActivity: {
    findFirst: vi.fn(async () => activityRow(state.actor as ApplicationIdentity)),
    update: vi.fn(async ({ data }: { data: Record<string, Loose> }) => {
      Object.assign(store.activity, data)
    }),
  },
  projectActivityAssignment: {
    findFirst: vi.fn(async () =>
      state.actor?.roles[0] === 'PROJECT_OFFICER' ? { id: 'a' } : null,
    ),
  },
  projectBudgetRecord: { findMany: vi.fn(async () => []) },
  activityUpdate: {
    findFirst: vi.fn(async ({ where }: { where: Record<string, Loose> }) => {
      const found = store.updates.find((update) => matches(update, where))
      if (!found) return null
      const files = store.evidence.filter((row) => row.activityUpdateId === found.id)
      return { ...found, evidenceMedia_update: files.map((row) => ({ ...row })) }
    }),
    create: vi.fn(async ({ data }: { data: Record<string, Loose> }) => {
      const at = tick()
      store.updates.push({
        status: 'PENDING',
        submittedAt: at,
        updatedAt: at,
        reviewedAt: null,
        reviewReason: null,
        reviewedById: null,
        ...data,
      })
    }),
    update: vi.fn(
      async ({ where, data }: { where: Record<string, Loose>; data: Record<string, Loose> }) => {
        const found = store.updates.find((update) => matches(update, where))
        if (!found) throw new Error('update not found')
        Object.assign(found, data)
      },
    ),
  },
  evidenceMedia: {
    createMany: vi.fn(async ({ data }: { data: Record<string, Loose>[] }) => {
      for (const row of data)
        store.evidence.push({ status: 'PENDING', submittedAt: tick(), ...row })
      return { count: data.length }
    }),
    findFirst: vi.fn(async ({ where }: { where: Record<string, Loose> }) => {
      const found = store.evidence.find((row) => matches(row, where))
      if (!found) return null
      const owner = store.updates.find((update) => update.id === found.activityUpdateId)
      return { ...found, activityUpdate: { status: owner?.status } }
    }),
    updateMany: vi.fn(
      async ({ where, data }: { where: Record<string, Loose>; data: Record<string, Loose> }) => {
        const rows = store.evidence.filter((row) => matches(row, where))
        for (const row of rows) Object.assign(row, data)
        return { count: rows.length }
      },
    ),
  },
  auditLog: { create: vi.fn(async () => undefined) },
}
const storage = {
  createPrivateUploadUrls: vi.fn(async (_bucket: string, keys: string[]) =>
    keys.map((path) => ({ path, uploadUrl: `https://storage.invalid/${path}?token=t` })),
  ),
  deleteFile: vi.fn(),
}
const service = new ActivitiesService({} as PrismaService, storage as unknown as StorageService)

const as = <T>(actor: ApplicationIdentity, run: () => Promise<T>) => {
  state.actor = actor
  return run()
}
const detail = () =>
  as(reviewer, () => service.get(reviewer, projectId, activityId)) as Promise<Loose>
const officerDetail = () =>
  as(officer, () => service.get(officer, projectId, activityId)) as Promise<Loose>
const files = [
  { fileName: 'site.jpg', contentType: 'image/jpeg' as const, byteSize: 1000, sha256: sha(1) },
  {
    fileName: 'report.pdf',
    contentType: 'application/pdf' as const,
    byteSize: 2000,
    sha256: sha(2),
  },
]
const reserve = (clientUpdateId: string) =>
  as(officer, () =>
    service.reserveProof(officer, projectId, activityId, {
      clientUpdateId,
      progressPercent: 60,
      note: 'Sessions held with evidence.',
      files,
    }),
  ) as Promise<Loose>
const finalize = (updateId: string, evidenceId: string) =>
  as(officer, () =>
    service.finalizeProofFile(officer, projectId, activityId, updateId, evidenceId),
  ) as Promise<Loose>
const review = (updateId: string, decision: 'APPROVE' | 'RETURN', expectedUpdatedAt: string) =>
  as(reviewer, () =>
    service.reviewUpdate(reviewer, projectId, activityId, updateId, {
      clientMutationId: 'e0000000-0000-4000-8000-0000000000e1',
      decision,
      reason: 'Synthetic scoped review',
      expectedUpdatedAt,
    }),
  ) as Promise<Loose>

beforeEach(() => {
  clock = 0
  store = {
    activity: {
      id: activityId,
      projectId,
      code: 'ACT-1',
      title: 'Synthetic activity',
      description: null,
      activityType: null,
      timelineOverrideJustification: null,
      targetBeneficiaries: 25,
      plannedStartDate: new Date('2026-01-01T00:00:00.000Z'),
      plannedEndDate: new Date('2099-12-31T00:00:00.000Z'),
      actualStartDate: new Date('2026-01-01T00:00:00.000Z'),
      actualEndDate: null,
      status: 'IN_PROGRESS',
      progressPercent: 20,
      reviewedById: null,
      reviewedAt: null,
      cancelledAt: null,
      cancellationReason: null,
      updatedAt: new Date('2026-09-13T00:00:00.000Z'),
    },
    updates: [],
    evidence: [],
  }
  state.tx = tx as unknown as Prisma.TransactionClient
  state.verify.mockResolvedValue('VERIFIED')
  state.ack.mockResolvedValue(null)
  state.begin.mockImplementation(async () => {
    const at = tick()
    return {
      kind: 'NEW',
      operationHandle: 'f0000000-0000-4000-8000-000000000001',
      reservedRecordId: null,
      generatedValues: {
        timestamp: at.toISOString(),
        businessDate: '2026-09-27',
        normalizedValue: null,
        requestHash: null,
      },
    }
  })
  state.finish.mockImplementation(async (_tx: unknown, _handle: string, requestId: string) => ({
    requestId,
    committed: true,
    replayed: false,
  }))
})

describe('proof submit, reviewer visibility and review', () => {
  it.each(['APPROVE', 'RETURN'] as const)(
    'a submitted proof reaches FOR_REVIEW, shows in the reviewer detail and can be %s by M&E',
    async (decision) => {
      const clientUpdateId = 'a0000000-0000-4000-8000-00000000000a'
      const reserved = await reserve(clientUpdateId)
      expect(reserved.status).toBe('UPLOADING')

      // Mid-upload the reviewer sees a pending proof update but no reviewable proof yet.
      let seen = await detail()
      expect(seen.storedStatus).toBe('IN_PROGRESS')
      expect(seen.updateNotes).toHaveLength(1)
      expect(seen.updateNotes[0]).toMatchObject({ kind: 'proof', status: 'Submitted' })
      expect(seen.submittedProof).toHaveLength(0)
      // The unfinished upload is flagged so the officer can resume it and M&E can be told.
      expect(seen.updateNotes[0]).toMatchObject({ proofIncomplete: true })
      // Only the submitter receives the resume id; the reviewer never does.
      expect(seen.updateNotes[0].resumeClientUpdateId).toBeNull()
      expect((await officerDetail()).updateNotes[0].resumeClientUpdateId).toBe(clientUpdateId)

      const [first, second] = reserved.files
      const partial = await finalize(reserved.updateId, first.evidenceId)
      expect(partial).toMatchObject({ status: 'UPLOADING', remaining: 1 })
      expect((await detail()).storedStatus).toBe('IN_PROGRESS')

      const done = await finalize(reserved.updateId, second.evidenceId)
      expect(done.status).toBe('COMMITTED')
      expect((await detail()).updateNotes[0]).toMatchObject({ proofIncomplete: false })
      expect((await officerDetail()).updateNotes[0].resumeClientUpdateId).toBeNull()

      // After the last file the activity is FOR_REVIEW and both files are listed as Submitted.
      seen = await detail()
      expect(seen.storedStatus).toBe('FOR_REVIEW')
      expect(seen.submittedProof.map((proof: Loose) => proof.status)).toEqual([
        'Submitted',
        'Submitted',
      ])
      expect(new Set(seen.submittedProof.map((proof: Loose) => proof.updateId))).toEqual(
        new Set([reserved.updateId]),
      )
      const revision = seen.updateNotes[0].updatedAt
      expect(seen.submittedProof[0].updateUpdatedAt).toBe(revision)

      const reviewed = await review(reserved.updateId, decision, revision)
      expect(reviewed.sourceAcknowledgement).toMatchObject({ committed: true, replayed: false })
      expect(reviewed.storedStatus).toBe('IN_PROGRESS')
      expect(reviewed.progress).toBe(60)
      expect(reviewed.updateNotes[0].status).toBe(decision === 'APPROVE' ? 'Accepted' : 'Flagged')
      expect(reviewed.submittedProof.map((proof: Loose) => proof.status)).toEqual(
        decision === 'APPROVE' ? ['Accepted', 'Accepted'] : ['Flagged', 'Flagged'],
      )
    },
  )

  it('a pending progress note blocks proof submission until M&E reviews it, then the proof goes through', async () => {
    await as(officer, () =>
      service.recordProgress(officer, projectId, activityId, {
        clientUpdateId: 'b0000000-0000-4000-8000-00000000000b',
        progressPercent: 35,
        note: 'Halfway through the sessions.',
      }),
    )
    // The Project Officer's proof is refused with the 409 the dialog explains.
    await expect(reserve('a0000000-0000-4000-8000-00000000000a')).rejects.toBeInstanceOf(
      ConflictException,
    )
    await expect(reserve('a0000000-0000-4000-8000-00000000000a')).rejects.toThrow(
      'Another activity update is already awaiting review.',
    )
    // M&E finds the note in the activity detail and approves it while the activity is IN_PROGRESS.
    const seen = await detail()
    const note = seen.updateNotes[0]
    expect(note).toMatchObject({ kind: 'progress', status: 'Submitted' })
    const reviewed = await review(note.id, 'APPROVE', note.updatedAt)
    expect(reviewed.storedStatus).toBe('IN_PROGRESS')
    expect(reviewed.progress).toBe(35)
    expect(reviewed.updateNotes[0].status).toBe('Accepted')
    // With nothing pending the same proof now reserves.
    const reserved = await reserve('a0000000-0000-4000-8000-00000000000a')
    expect(reserved.status).toBe('UPLOADING')
  })

  it('returning a progress note leaves the activity progress unchanged and unblocks proof', async () => {
    await as(officer, () =>
      service.recordProgress(officer, projectId, activityId, {
        clientUpdateId: 'b0000000-0000-4000-8000-00000000000b',
        progressPercent: 35,
        note: 'Halfway through the sessions.',
      }),
    )
    const note = (await detail()).updateNotes[0]
    const reviewed = await review(note.id, 'RETURN', note.updatedAt)
    expect(reviewed.progress).toBe(20)
    expect(reviewed.updateNotes[0].status).toBe('Flagged')
    expect((await reserve('a0000000-0000-4000-8000-00000000000a')).status).toBe('UPLOADING')
  })

  it('refuses to review a proof that is still uploading', async () => {
    const reserved = await reserve('a0000000-0000-4000-8000-00000000000a')
    const note = (await detail()).updateNotes[0]
    await expect(review(reserved.updateId, 'APPROVE', note.updatedAt)).rejects.toBeInstanceOf(
      ConflictException,
    )
  })

  it('the submitter cannot review their own update', async () => {
    const ownReviewer: ApplicationIdentity = { ...reviewer, userId: officer.userId }
    await as(officer, () =>
      service.recordProgress(officer, projectId, activityId, {
        clientUpdateId: 'b0000000-0000-4000-8000-00000000000b',
        progressPercent: 35,
        note: 'Halfway through the sessions.',
      }),
    )
    const note = (await detail()).updateNotes[0]
    state.actor = ownReviewer
    await expect(
      service.reviewUpdate(ownReviewer, projectId, activityId, note.id, {
        clientMutationId: 'e0000000-0000-4000-8000-0000000000e1',
        decision: 'APPROVE',
        reason: 'Self review',
        expectedUpdatedAt: note.updatedAt,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException)
  })
})
