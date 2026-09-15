import { ConflictException, ForbiddenException } from '@nestjs/common'
import type { Prisma } from '@prisma/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { ApplicationIdentity } from '@app/modules/auth/developer-access'
import type { PrismaService } from '@app/prisma/prisma.service'
import { ParticipantsService } from './participants.service'

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
  beneficiaryJourneyEvent: { findFirst: vi.fn(), create: vi.fn() },
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

    const submissionUpdate =
      tx.formSubmission.update.mock.calls[0]?.[0]

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
