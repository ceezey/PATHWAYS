import 'reflect-metadata'

import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common'
import type { Prisma } from '@prisma/client'
import { plainToInstance } from 'class-transformer'
import { validate } from 'class-validator'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { hasAtomicPermission, rolePermissions } from '@app/modules/auth/authorization-policy'
import { withAuthorizedOperation } from '@app/modules/auth/authorized-operation'
import type { ApplicationIdentity } from '@app/modules/auth/developer-access'
import type { PrismaService } from '@app/prisma/prisma.service'
import { CorrectJourneyEventDto } from './participants.dto'
import { ParticipantsService } from './participants.service'

const state = vi.hoisted(() => ({ actor: undefined as ApplicationIdentity | undefined }))
const txOps = vi.hoisted(() => ({
  project: { findFirst: vi.fn() },
  beneficiaryProjectEnrollment: { findFirst: vi.fn(), update: vi.fn() },
  beneficiaryJourneyEvent: { findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn() },
  journeyStage: { findFirst: vi.fn() },
  auditLog: { create: vi.fn() },
}))

// The operation boundary is replaced with a permission check against the synthetic actor.
vi.mock('@app/modules/auth/authorized-operation', () => ({
  withAuthorizedOperation: vi.fn(async (_prisma, _identity, permission: string, work) => {
    if (!state.actor?.permissions.includes(permission))
      throw new ForbiddenException('Permission denied.')
    return work(txOps, state.actor)
  }),
}))

const organizationId = '10000000-0000-4000-8000-000000000001'
const projectId = '20000000-0000-4000-8000-000000000002'
const activityId = '30000000-0000-4000-8000-000000000003'
const stageId = '40000000-0000-4000-8000-000000000004'
const submissionId = '50000000-0000-4000-8000-000000000005'
const enrollmentId = '60000000-0000-4000-8000-000000000006'

const actor: ApplicationIdentity = {
  id: '70000000-0000-4000-8000-000000000007',
  aal: 'aal2',
  userId: '80000000-0000-4000-8000-000000000008',
  organizationId,
  fullName: 'Synthetic project officer',
  roles: ['PROJECT_OFFICER'],
  permissions: ['participation.record'],
  assignedProjectIds: [projectId],
}

const input = {
  projectId,
  form: {
    id: '90000000-0000-4000-8000-000000000009',
    version: 1,
    activityId,
    journeyStageId: stageId,
  },
  submissionId,
  validatedById: actor.userId,
  values: {
    beneficiary_code: 'BEN-001',
    participation_date: '2026-06-15',
    attendance_status: 'PRESENT',
    progress_status: 'IN_PROGRESS',
    progress_notes: 'Attended the session.',
  },
}

const tx = {
  beneficiaryActivityParticipation: {
    findUnique: vi.fn(),
    create: vi.fn(),
  },
  beneficiaryProjectEnrollment: { findFirst: vi.fn() },
  projectActivity: { findFirst: vi.fn() },
  activityJourneyStageMapping: { findFirst: vi.fn() },
  beneficiaryJourneyEvent: { findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn() },
  formSubmission: { update: vi.fn() },
  auditLog: { create: vi.fn() },
}

describe('P05 participation promotion contract', () => {
  const service = new ParticipantsService({} as PrismaService)

  beforeEach(() => {
    vi.clearAllMocks()
    tx.beneficiaryActivityParticipation.findUnique.mockResolvedValue(null)
    tx.beneficiaryProjectEnrollment.findFirst.mockResolvedValue({ id: enrollmentId })
    tx.projectActivity.findFirst.mockResolvedValue({ id: activityId })
    tx.activityJourneyStageMapping.findFirst.mockResolvedValue({ id: 'mapping' })
    tx.beneficiaryJourneyEvent.findFirst.mockResolvedValue(null)
    tx.beneficiaryActivityParticipation.create.mockResolvedValue({ id: 'participation' })
  })

  it('fails closed without the domain permission', async () => {
    await expect(
      service.promoteParticipation(
        tx as unknown as Prisma.TransactionClient,
        {
          ...actor,
          permissions: [],
        },
        input,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException)
    expect(tx.beneficiaryActivityParticipation.findUnique).not.toHaveBeenCalled()
  })

  it('requires activity-monitoring forms to pin one journey stage', async () => {
    await expect(
      service.promoteParticipation(tx as unknown as Prisma.TransactionClient, actor, {
        ...input,
        form: { ...input.form, journeyStageId: null },
      }),
    ).rejects.toThrow('bound to one journey stage')
    expect(tx.beneficiaryActivityParticipation.create).not.toHaveBeenCalled()
  })

  it('requires an active exact-code enrollment and a same-project activity-stage mapping', async () => {
    tx.beneficiaryProjectEnrollment.findFirst.mockResolvedValueOnce(null)
    await expect(
      service.promoteParticipation(tx as unknown as Prisma.TransactionClient, actor, input),
    ).rejects.toBeInstanceOf(ConflictException)

    tx.activityJourneyStageMapping.findFirst.mockResolvedValueOnce(null)
    await expect(
      service.promoteParticipation(tx as unknown as Prisma.TransactionClient, actor, input),
    ).rejects.toThrow('not mapped')
    expect(tx.beneficiaryActivityParticipation.create).not.toHaveBeenCalled()
  })

  it('rejects chronology regressions before creating an operational record', async () => {
    tx.beneficiaryJourneyEvent.findFirst.mockResolvedValueOnce({
      eventDate: new Date('2026-06-16T00:00:00.000Z'),
    })
    await expect(
      service.promoteParticipation(tx as unknown as Prisma.TransactionClient, actor, input),
    ).rejects.toThrow('cannot precede')
    expect(tx.beneficiaryActivityParticipation.create).not.toHaveBeenCalled()
  })

  it('creates participation, journey, submission finalization, and audit once', async () => {
    await expect(
      service.promoteParticipation(tx as unknown as Prisma.TransactionClient, actor, input),
    ).resolves.toEqual({ participationId: 'participation', enrollmentId })
    expect(tx.beneficiaryActivityParticipation.create).toHaveBeenCalledOnce()
    expect(tx.beneficiaryJourneyEvent.create).toHaveBeenCalledOnce()
    expect(tx.formSubmission.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: submissionId },
        data: expect.objectContaining({ enrollmentId, status: 'VALIDATED' }),
      }),
    )

    const submissionUpdate = tx.formSubmission.update.mock.calls[0]?.[0]

    expect(submissionUpdate?.data).not.toHaveProperty('processedAt')

    expect(tx.auditLog.create).toHaveBeenCalledOnce()
  })

  it('returns the committed effect on an identical retry without repeating writes', async () => {
    tx.beneficiaryActivityParticipation.findUnique.mockResolvedValueOnce({
      id: 'participation',
      enrollmentId,
    })
    await expect(
      service.promoteParticipation(tx as unknown as Prisma.TransactionClient, actor, input),
    ).resolves.toEqual({ participationId: 'participation', enrollmentId })
    expect(tx.beneficiaryActivityParticipation.create).not.toHaveBeenCalled()
    expect(tx.beneficiaryJourneyEvent.create).not.toHaveBeenCalled()
  })
})

describe('F4 journey stage, enrollment closure and correction gates', () => {
  const service = new ParticipantsService({} as PrismaService)
  const caller = {} as ApplicationIdentity
  const beneficiaryId = 'a1000000-0000-4000-8000-0000000000a1'
  const eventId = 'b1000000-0000-4000-8000-0000000000b1'
  const manager: ApplicationIdentity = {
    ...actor,
    roles: ['PROJECT_MANAGER'],
    permissions: ['beneficiaries.enrollments.manage', 'participation.record'],
  }
  const canManageStages = (role: keyof typeof rolePermissions) =>
    hasAtomicPermission(role, rolePermissions[role], 'journeys.manage')

  beforeEach(() => {
    vi.clearAllMocks()
    state.actor = manager
    txOps.project.findFirst.mockResolvedValue({ id: projectId })
    txOps.beneficiaryProjectEnrollment.findFirst.mockResolvedValue({
      id: enrollmentId,
      beneficiaryId,
    })
    txOps.beneficiaryJourneyEvent.findFirst.mockResolvedValue(null)
  })

  it('G-F4-1 grants stage save to System Administrator, M&E Officer and Project Manager only', () => {
    for (const role of [
      'SYSTEM_ADMINISTRATOR',
      'MONITORING_AND_EVALUATION_OFFICER',
      'PROJECT_MANAGER',
    ] as const)
      expect(canManageStages(role)).toBe(true)
    for (const role of ['PROJECT_OFFICER', 'PROGRAM_MANAGER', 'GRANT_MANAGER'] as const)
      expect(canManageStages(role)).toBe(false)
  })

  it('gives stage saves a 20s transaction budget for per-stage writes', async () => {
    state.actor = { ...manager, roles: ['PROJECT_OFFICER'], permissions: [] }
    await expect(service.saveStages(caller, projectId, { stages: [] })).rejects.toBeInstanceOf(
      ForbiddenException,
    )
    expect(vi.mocked(withAuthorizedOperation).mock.calls[0]?.[4]).toEqual({
      transactionTimeoutMs: 20_000,
    })
  })
  it('G-F4-1 denies stage save before any scoped read without the manage permission', async () => {
    state.actor = { ...manager, roles: ['PROJECT_OFFICER'], permissions: ['journeys.read'] }
    await expect(service.saveStages(caller, projectId, { stages: [] })).rejects.toBeInstanceOf(
      ForbiddenException,
    )
    expect(txOps.project.findFirst).not.toHaveBeenCalled()
  })

  it.each([
    ['COMPLETION', 'COMPLETED'],
    ['DROPOUT', 'DROPPED'],
  ] as const)(
    'G-F4-3 %s closes the enrollment with end date and reason',
    async (eventType, status) => {
      await service.transitionEnrollment(caller, projectId, beneficiaryId, {
        eventType,
        eventDate: '2026-06-20',
        description: ' Left the programme ',
      })
      expect(txOps.beneficiaryJourneyEvent.create.mock.calls[0]?.[0].data).toMatchObject({
        eventType,
        description: 'Left the programme',
      })
      expect(txOps.beneficiaryProjectEnrollment.update).toHaveBeenCalledWith({
        where: { id: enrollmentId },
        data: {
          status,
          endedDate: new Date('2026-06-20T00:00:00.000Z'),
          endReason: 'Left the programme',
        },
      })
    },
  )

  it('G-F4-3 TRANSFER closes the enrollment once an active destination enrollment exists', async () => {
    txOps.beneficiaryProjectEnrollment.findFirst
      .mockResolvedValueOnce({ id: enrollmentId, beneficiaryId })
      .mockResolvedValueOnce({ id: 'destination-enrollment' })
    await service.transitionEnrollment(caller, projectId, beneficiaryId, {
      eventType: 'TRANSFER',
      eventDate: '2026-06-20',
      description: 'Moved to the partner project',
      destinationProjectId: '20000000-0000-4000-8000-0000000000d2',
    })
    expect(txOps.beneficiaryProjectEnrollment.update.mock.calls[0]?.[0].data).toMatchObject({
      status: 'TRANSFERRED',
      endReason: 'Moved to the partner project',
    })
  })

  it('G-F4-3 a follow-up event leaves the enrollment open', async () => {
    await service.transitionEnrollment(caller, projectId, beneficiaryId, {
      eventType: 'FOLLOW_UP',
      eventDate: '2026-06-20',
      description: 'Check-in',
    })
    expect(txOps.beneficiaryProjectEnrollment.update).not.toHaveBeenCalled()
  })

  it('G-F4-4 a correction is a new event linked to the original with the reason', async () => {
    txOps.beneficiaryJourneyEvent.findFirst.mockResolvedValue({
      id: eventId,
      enrollmentId,
      eventType: 'PARTICIPATION',
      activityId,
    })
    txOps.beneficiaryJourneyEvent.create.mockResolvedValue({ id: 'correction' })
    await expect(
      service.correctEvent(caller, projectId, beneficiaryId, eventId, {
        eventDate: '2026-06-16',
        description: 'Wrong date',
        reason: ' Date typo ',
      }),
    ).resolves.toEqual({ id: 'correction' })
    expect(txOps.beneficiaryJourneyEvent.create.mock.calls[0]?.[0].data).toMatchObject({
      correctsEventId: eventId,
      correctionReason: 'Date typo',
      enrollmentId,
    })
    expect(txOps.auditLog.create.mock.calls[0]?.[0].data.action).toBe('JOURNEY_EVENT_CORRECTED')
    expect(txOps.beneficiaryJourneyEvent).not.toHaveProperty('update')
  })

  it('G-F4-4 rejects correcting a correction because only uncorrected originals match', async () => {
    txOps.beneficiaryJourneyEvent.findFirst.mockResolvedValue(null)
    await expect(
      service.correctEvent(caller, projectId, beneficiaryId, eventId, {
        eventDate: '2026-06-16',
        description: 'Again',
        reason: 'Second fix',
      }),
    ).rejects.toBeInstanceOf(NotFoundException)
    expect(txOps.beneficiaryJourneyEvent.findFirst.mock.calls[0]?.[0].where).toMatchObject({
      correctsEventId: null,
    })
    expect(txOps.beneficiaryJourneyEvent.create).not.toHaveBeenCalled()
  })

  it('G-F4-4 requires a non-empty reason at the request boundary', async () => {
    const dto = plainToInstance(CorrectJourneyEventDto, {
      eventDate: '2026-06-16',
      description: 'Fix',
      reason: '',
    })
    expect((await validate(dto)).map((error) => error.property)).toContain('reason')
  })
})

describe('F4 journey history reads', () => {
  const service = new ParticipantsService({} as PrismaService)
  const caller = {} as ApplicationIdentity
  const beneficiaryId = 'a1000000-0000-4000-8000-0000000000a1'
  const reader: ApplicationIdentity = {
    ...actor,
    roles: ['MONITORING_AND_EVALUATION_OFFICER'],
    permissions: ['journeys.read'],
  }
  const event = (id: string, eventDate: string, recordedAt: string) => ({
    id,
    eventDate: new Date(eventDate),
    recordedAt: new Date(recordedAt),
    recordedBy: { fullName: 'Synthetic recorder' },
  })

  beforeEach(() => {
    vi.clearAllMocks()
    state.actor = reader
    txOps.project.findFirst.mockResolvedValue({ id: projectId })
    txOps.beneficiaryProjectEnrollment.findFirst.mockResolvedValue({
      id: enrollmentId,
      status: 'ACTIVE',
    })
  })

  it('G-F4-2 queries events in chronological order and returns them as stored', async () => {
    txOps.beneficiaryJourneyEvent.findMany.mockResolvedValue([
      event('e1', '2026-06-01', '2026-06-01T08:00:00Z'),
      event('e2', '2026-06-15', '2026-06-15T08:00:00Z'),
    ])
    const result = await service.history(caller, projectId, beneficiaryId)
    const query = txOps.beneficiaryJourneyEvent.findMany.mock.calls[0]?.[0]
    expect(query.orderBy).toEqual([{ eventDate: 'asc' }, { recordedAt: 'asc' }, { id: 'asc' }])
    expect(query.where).toMatchObject({ organizationId, projectId, enrollmentId })
    expect(result.events.map((item) => item.id)).toEqual(['e1', 'e2'])
    expect(result.events[0]?.eventDate).toBe('2026-06-01')
  })

  it.each([
    ['an unassigned project', { ...reader, assignedProjectIds: [] }],
    [
      'a foreign organization',
      { ...reader, organizationId: 'c1000000-0000-4000-8000-0000000000c1' },
    ],
  ])('G-F4-5 denies history for %s before any event read', async (_label, scoped) => {
    state.actor = scoped
    txOps.project.findFirst.mockResolvedValue(null)
    await expect(service.history(caller, projectId, beneficiaryId)).rejects.toBeInstanceOf(
      NotFoundException,
    )
    expect(JSON.stringify(txOps.project.findFirst.mock.calls[0]?.[0].where)).toContain(
      scoped.organizationId,
    )
    expect(txOps.beneficiaryProjectEnrollment.findFirst).not.toHaveBeenCalled()
    expect(txOps.beneficiaryJourneyEvent.findMany).not.toHaveBeenCalled()
  })
})
