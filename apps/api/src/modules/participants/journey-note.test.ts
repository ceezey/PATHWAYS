import 'reflect-metadata'

import type { Prisma } from '@prisma/client'
import { plainToInstance } from 'class-transformer'
import { validate } from 'class-validator'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { ApplicationIdentity } from '@app/modules/auth/developer-access'
import type { PrismaService } from '@app/prisma/prisma.service'

const state = vi.hoisted(() => ({
  actor: undefined as ApplicationIdentity | undefined,
  tx: undefined as Prisma.TransactionClient | undefined,
}))

vi.mock('@app/modules/auth/authorized-operation', () => ({
  withAuthorizedOperation: vi.fn(async (_prisma, _identity, _permission: string, work) =>
    work(state.tx, state.actor),
  ),
}))

import { CorrectJourneyEventDto, EnrollmentJourneyEventDto } from './participants.dto'
import { ParticipantsService } from './participants.service'

const organizationId = '10000000-0000-4000-8000-000000000001'
const projectId = '20000000-0000-4000-8000-000000000002'
const beneficiaryId = '30000000-0000-4000-8000-000000000003'
const enrollmentId = '60000000-0000-4000-8000-000000000006'
const eventId = '70000000-0000-4000-8000-000000000007'
const secret = 'SENSITIVE-NOTE-CONTENT'

const actor: ApplicationIdentity = {
  id: '70000000-0000-4000-8000-000000000008',
  aal: 'aal2',
  userId: '80000000-0000-4000-8000-000000000008',
  organizationId,
  fullName: 'Synthetic project officer',
  roles: ['PROJECT_OFFICER'],
  permissions: ['beneficiaries.enrollments.manage', 'participation.record'],
  assignedProjectIds: [projectId],
}

const tx = {
  project: { findFirst: vi.fn() },
  beneficiaryProjectEnrollment: { findFirst: vi.fn(), update: vi.fn() },
  beneficiaryJourneyEvent: { findFirst: vi.fn(), create: vi.fn() },
  auditLog: { create: vi.fn() },
}

const base = { eventType: 'FOLLOW_UP', eventDate: '2026-06-15', description: 'Followed up.' }
const correction = { eventDate: '2026-06-15', description: 'Fixed.', reason: 'Wrong date.' }
const check = async (cls: new () => object, body: Record<string, unknown>) =>
  validate(plainToInstance(cls, body))

describe('G-F4-6 journey note', () => {
  const service = new ParticipantsService({} as PrismaService)

  beforeEach(() => {
    vi.clearAllMocks()
    state.actor = actor
    state.tx = tx as unknown as Prisma.TransactionClient
    tx.project.findFirst.mockResolvedValue({ id: projectId })
    tx.beneficiaryProjectEnrollment.findFirst.mockResolvedValue({
      id: enrollmentId,
      beneficiaryId,
    })
    tx.beneficiaryJourneyEvent.findFirst.mockResolvedValue({
      id: eventId,
      enrollmentId,
      eventType: 'FOLLOW_UP',
      activityId: null,
      eventDate: new Date('2026-06-01T00:00:00.000Z'),
    })
    tx.beneficiaryJourneyEvent.create.mockResolvedValue({ id: 'new-event' })
  })

  it('persists a trimmed note on a recorded event and audits only its presence', async () => {
    const dto = plainToInstance(EnrollmentJourneyEventDto, { ...base, note: `  ${secret}  ` })
    expect(await validate(dto)).toEqual([])
    await service.transitionEnrollment(actor, projectId, beneficiaryId, dto)
    expect(tx.beneficiaryJourneyEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ note: secret }),
    })
    const audit = JSON.stringify(tx.auditLog.create.mock.calls)
    expect(audit).toContain('"noteAttached":true')
    expect(audit).not.toContain(secret)
  })

  it('persists the note on a correction without logging its content', async () => {
    await service.correctEvent(actor, projectId, beneficiaryId, eventId, {
      ...correction,
      note: secret,
    })
    expect(tx.beneficiaryJourneyEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ note: secret }) }),
    )
    expect(JSON.stringify(tx.auditLog.create.mock.calls)).not.toContain(secret)
  })

  it('stores null when no note is given and the note is optional', async () => {
    expect(await check(EnrollmentJourneyEventDto, base)).toEqual([])
    await service.transitionEnrollment(actor, projectId, beneficiaryId, base as never)
    expect(tx.beneficiaryJourneyEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ note: null }),
    })
  })

  it('rejects an overlong note on both inputs', async () => {
    const note = 'x'.repeat(1001)
    expect(await check(EnrollmentJourneyEventDto, { ...base, note })).toHaveLength(1)
    expect(await check(CorrectJourneyEventDto, { ...correction, note })).toHaveLength(1)
    expect(await check(EnrollmentJourneyEventDto, { ...base, note: 'x'.repeat(1000) })).toEqual([])
  })

  it('rejects a whitespace-only or non-string note', async () => {
    for (const note of ['   ', '\n\t', 42, { a: 1 }]) {
      expect(await check(EnrollmentJourneyEventDto, { ...base, note })).toHaveLength(1)
      expect(await check(CorrectJourneyEventDto, { ...correction, note })).toHaveLength(1)
    }
  })
})
