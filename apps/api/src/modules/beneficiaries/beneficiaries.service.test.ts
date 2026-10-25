import { ForbiddenException, NotFoundException } from '@nestjs/common'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { PrismaService } from '@app/prisma/prisma.service'
import { hasAtomicPermission } from '@pathways/shared'
import type { ApplicationIdentity } from '../../common/authz/application-identity'
import { withAuthorizedOperation } from '../../common/authz/authorized-operation'
import { BeneficiariesService } from './beneficiaries.service'
import { canReadProgress, progressPercent } from './beneficiary-progress'
import { BeneficiaryRegistrationService } from './beneficiary-registration.service'

const readState = vi.hoisted(() => ({ tx: undefined as unknown }))

// The operation boundary is replaced with the real permission policy against the synthetic actor.
vi.mock('../../common/authz/authorized-operation', () => ({
  withAuthorizedOperation: vi.fn(async (_prisma, identity, permission: string, work) => {
    if (!hasAtomicPermission(identity.roles[0], identity.permissions, permission))
      throw new ForbiddenException('Permission denied.')
    return work(readState.tx, identity)
  }),
}))

const organizationId = '10000000-0000-4000-8000-000000000001'
const actorId = '20000000-0000-4000-8000-000000000002'
const projectId = '30000000-0000-4000-8000-000000000003'
const otherProjectId = '30000000-0000-4000-8000-000000000004'
const beneficiaryId = '50000000-0000-4000-8000-000000000005'
const enrollmentId = '60000000-0000-4000-8000-000000000006'

const actor: ApplicationIdentity = {
  id: '90000000-0000-4000-8000-000000000009',
  aal: 'aal2',
  userId: actorId,
  organizationId,
  fullName: 'Synthetic M&E actor',
  roles: ['MONITORING_AND_EVALUATION_OFFICER'],
  permissions: [
    'beneficiaries.records.read',
    'beneficiaries.records.register',
    'beneficiaries.profiles.update',
    'beneficiaries.enrollments.manage',
    'beneficiaries.identities.review',
  ],
  assignedProjectIds: [projectId],
}

describe('F3 scoped read and denial gates', () => {
  const readTx = {
    project: { findFirst: vi.fn() },
    beneficiary: { findMany: vi.fn(), findFirst: vi.fn() },
  }
  const at = new Date('2026-01-01T00:00:00.000Z')
  const row = {
    id: beneficiaryId,
    code: 'BEN-001',
    subjectType: 'INDIVIDUAL',
    displayName: 'Synthetic Person',
    status: 'ACTIVE',
    birthDate: at,
    updatedAt: at,
    beneficiaryProjectEnrollment_beneficiary: [
      { id: enrollmentId, enrollmentDate: at, status: 'ACTIVE', updatedAt: at },
    ],
    beneficiaryConsentRecord_beneficiary: [],
  }
  const query = { limit: 10 } as never
  let service: BeneficiariesService

  beforeEach(() => {
    vi.clearAllMocks()
    readState.tx = readTx
    service = new BeneficiariesService({} as PrismaService, new BeneficiaryRegistrationService())
    readTx.project.findFirst.mockResolvedValue({ id: projectId, startDate: at, endDate: null })
    readTx.beneficiary.findMany.mockResolvedValue([row])
    readTx.beneficiary.findFirst.mockResolvedValue(row)
  })

  it('G-F3-1 lists and reads a profile only inside the assigned project and organization', async () => {
    const page = await service.list(actor, projectId, query)
    expect(page.items.map((item) => item.code)).toEqual(['BEN-001'])
    expect((await service.get(actor, projectId, beneficiaryId)).code).toBe('BEN-001')
    expect(JSON.stringify(readTx.project.findFirst.mock.calls[0]?.[0].where)).toContain(projectId)
    expect(readTx.beneficiary.findMany.mock.calls[0]?.[0].where).toMatchObject({
      organizationId,
      beneficiaryProjectEnrollment_beneficiary: { some: { organizationId, projectId } },
    })
    expect(readTx.beneficiary.findFirst.mock.calls[0]?.[0].where).toMatchObject({
      organizationId,
      beneficiaryProjectEnrollment_beneficiary: { some: { organizationId, projectId } },
    })
  })

  it('reports minor status from the birth date at the business date, else the stored value', async () => {
    // 12:00 on 2026-10-26 in Manila.
    vi.useFakeTimers({ now: new Date('2026-10-26T04:00:00.000Z'), toFake: ['Date'] })
    try {
      const read = async (patch: Record<string, unknown>) => {
        readTx.beneficiary.findFirst.mockResolvedValue({ ...row, ...patch })
        return (await service.get(actor, projectId, beneficiaryId)).isMinor
      }
      expect(await read({ birthDate: new Date('2008-08-17T00:00:00.000Z'), isMinor: true })).toBe(
        false,
      )
      expect(await read({ birthDate: new Date('2008-11-01T00:00:00.000Z'), isMinor: false })).toBe(
        true,
      )
      expect(await read({ birthDate: null, isMinor: true })).toBe(true)
    } finally {
      vi.useRealTimers()
    }
  })

  it.each([
    ['an unassigned project', actor],
    ['a foreign-organization project', { ...actor, organizationId: otherProjectId }],
  ])('G-F3-1 denies list and detail for %s before any beneficiary read', async (_name, who) => {
    readTx.project.findFirst.mockResolvedValue(null)
    await expect(service.list(who, otherProjectId, query)).rejects.toBeInstanceOf(NotFoundException)
    await expect(service.get(who, otherProjectId, beneficiaryId)).rejects.toBeInstanceOf(
      NotFoundException,
    )
    expect(readTx.beneficiary.findMany).not.toHaveBeenCalled()
    expect(readTx.beneficiary.findFirst).not.toHaveBeenCalled()
  })

  it('returns the latest participation and current stage in one extra query for journey readers', async () => {
    const reader = { ...actor, permissions: [...actor.permissions, 'journeys.read'] }
    const raw = vi.fn().mockResolvedValue([
      {
        enrollment_id: enrollmentId,
        activity_id: otherProjectId,
        activity_title: 'Life skills session',
        participation_date: new Date('2026-09-30T00:00:00.000Z'),
        stage_code: 'LIFESKILLS',
        stage_name: 'Life skills and leadership sessions',
        reached: 1,
        at_terminal: false,
        path_length: 4,
      },
    ])
    readState.tx = { ...readTx, $queryRaw: raw }
    const [item] = (await service.list(reader, projectId, query)).items
    expect(raw).toHaveBeenCalledTimes(1)
    expect(raw.mock.calls[0][0].join('')).toContain('pathways.p05_beneficiary_progress(')
    expect(raw.mock.calls[0].slice(1)).toEqual([organizationId, projectId, [enrollmentId]])
    expect(item.progress).toEqual({
      restricted: false,
      lastParticipation: {
        activityId: otherProjectId,
        title: 'Life skills session',
        date: '2026-09-30',
      },
      stage: {
        code: 'LIFESKILLS',
        name: 'Life skills and leadership sessions',
        progressPercent: 50,
      },
    })
  })

  it('gives the detail read the same summary as the list for a completer at the terminal stage', async () => {
    const reader = { ...actor, permissions: [...actor.permissions, 'journeys.read'] }
    const summaryRow = {
      enrollment_id: enrollmentId,
      activity_id: otherProjectId,
      activity_title: 'Kit distribution',
      participation_date: new Date('2026-07-01T00:00:00.000Z'),
      stage_code: 'COMPLETED',
      stage_name: 'Returned to school',
      reached: 2,
      at_terminal: true,
      path_length: 3,
    }
    readState.tx = { ...readTx, $queryRaw: vi.fn().mockResolvedValue([summaryRow]) }
    const listed = (await service.list(reader, projectId, query)).items[0].progress
    const detail = (await service.get(reader, projectId, beneficiaryId)).progress
    expect(detail).toEqual(listed)
    expect(detail).toMatchObject({ stage: { code: 'COMPLETED', progressPercent: 100 } })
  })

  it('reports no participation or stage when a journey reader has none recorded', async () => {
    const reader = { ...actor, permissions: [...actor.permissions, 'journeys.read'] }
    readState.tx = { ...readTx, $queryRaw: vi.fn().mockResolvedValue([]) }
    const [item] = (await service.list(reader, projectId, query)).items
    expect(item.progress).toEqual({ restricted: false, lastParticipation: null, stage: null })
  })

  it('marks progress restricted without a journey grant and never queries journey tables', async () => {
    const raw = vi.fn()
    readState.tx = { ...readTx, $queryRaw: raw }
    const [item] = (await service.list(actor, projectId, query)).items
    expect(item.progress).toEqual({ restricted: true })
    expect(raw).not.toHaveBeenCalled()
  })

  it('marks detail progress restricted without a journey grant and never queries journey tables', async () => {
    const raw = vi.fn()
    readState.tx = { ...readTx, $queryRaw: raw }
    const detail = await service.get(actor, projectId, beneficiaryId)
    expect(detail.progress).toEqual({ restricted: true })
    expect(raw).not.toHaveBeenCalled()
  })

  it('gives direct registration the same 20s transaction budget as the import path', async () => {
    const registration = new BeneficiaryRegistrationService()
    vi.spyOn(registration, 'promoteRegistration').mockResolvedValue({
      kind: 'PROCESSED',
      beneficiaryId,
      enrollmentId,
      submissionId: '70000000-0000-4000-8000-000000000007',
    } as never)
    service = new BeneficiariesService({} as PrismaService, registration)
    await service.register(actor, projectId, {
      formId: '80000000-0000-4000-8000-000000000008',
      clientRegistrationId: '80000000-0000-4000-8000-000000000009',
      values: {},
    } as never)
    expect(vi.mocked(withAuthorizedOperation).mock.calls.at(-1)?.[4]).toEqual({
      transactionTimeoutMs: 20_000,
    })
  })

  it.each(['PROGRAM_MANAGER', 'GRANT_MANAGER', 'SYSTEM_ADMINISTRATOR'])(
    'G-F3-5 denies beneficiary detail to %s even with a claimed records.read grant',
    async (role) => {
      await expect(
        service.get({ ...actor, roles: [role] }, projectId, beneficiaryId),
      ).rejects.toBeInstanceOf(ForbiddenException)
      expect(readTx.project.findFirst).not.toHaveBeenCalled()
      expect(readTx.beneficiary.findFirst).not.toHaveBeenCalled()
    },
  )
})

describe('directory progress rules', () => {
  const grant = (roles: string[]) => ({ ...actor, roles, permissions: ['journeys.read'] })

  it('refuses aggregate-only roles even with a claimed journeys.read grant', () => {
    expect(canReadProgress(grant(['PROGRAM_MANAGER']))).toBe(false)
    expect(canReadProgress(grant(['GRANT_MANAGER']))).toBe(false)
  })

  it('measures progress along the person own path and caps a terminal stage at 100', () => {
    // Path: entry, core, one branch, final = 4 steps.
    expect(progressPercent({ reached: 0, at_terminal: false, path_length: 4 })).toBe(25)
    expect(progressPercent({ reached: 1, at_terminal: false, path_length: 4 })).toBe(50)
    expect(progressPercent({ reached: 2, at_terminal: false, path_length: 4 })).toBe(75)
    expect(progressPercent({ reached: 3, at_terminal: false, path_length: 4 })).toBe(100)
    expect(progressPercent({ reached: 1, at_terminal: true, path_length: 4 })).toBe(100)
    expect(progressPercent({ reached: 9, at_terminal: false, path_length: 4 })).toBe(100)
    expect(progressPercent({ reached: 0, at_terminal: false, path_length: 0 })).toBe(0)
  })
})

describe('profile update audit', () => {
  const at = new Date('2026-01-01T00:00:00.000Z')
  const row = {
    id: beneficiaryId,
    code: 'GRP-001',
    subjectType: 'GROUP',
    displayName: 'Synthetic Group',
    status: 'ACTIVE',
    birthDate: null,
    ageAtRegistration: null,
    isMinor: false,
    updatedAt: at,
    beneficiaryProjectEnrollment_beneficiary: [
      { id: enrollmentId, enrollmentDate: at, status: 'ACTIVE', updatedAt: at },
    ],
    beneficiaryConsentRecord_beneficiary: [],
  }
  const writeTx = {
    project: { findFirst: vi.fn() },
    beneficiary: { findFirst: vi.fn(), updateMany: vi.fn() },
    beneficiaryProjectEnrollment: { findFirst: vi.fn() },
    auditLog: { create: vi.fn() },
  }

  beforeEach(() => {
    vi.clearAllMocks()
    readState.tx = writeTx
    writeTx.project.findFirst.mockResolvedValue({ id: projectId, startDate: at, endDate: null })
    writeTx.beneficiary.findFirst.mockResolvedValue(row)
    writeTx.beneficiary.updateMany.mockResolvedValue({ count: 1 })
    writeTx.beneficiaryProjectEnrollment.findFirst.mockResolvedValue(null)
  })

  describe('minor status on an edit', () => {
    // 12:00 on 2026-10-26 in Manila.
    beforeEach(() => {
      vi.useFakeTimers({ now: new Date('2026-10-26T04:00:00.000Z'), toFake: ['Date'] })
    })
    afterEach(() => {
      vi.useRealTimers()
    })
    const person = (patch: Record<string, unknown>) => ({
      ...row,
      subjectType: 'INDIVIDUAL',
      firstName: 'Synthetic',
      lastName: 'Person',
      birthDate: new Date('2008-08-17T00:00:00.000Z'),
      ageAtRegistration: 17,
      isMinor: true,
      guardianConsentRecorded: false,
      ...patch,
    })
    const edit = (birthDate: string) =>
      new BeneficiariesService({} as PrismaService, new BeneficiaryRegistrationService()).update(
        actor,
        projectId,
        beneficiaryId,
        {
          subjectType: 'INDIVIDUAL',
          firstName: 'Synthetic',
          lastName: 'Person',
          birthDate,
          sex: 'NOT_SPECIFIED',
          disabilityStatus: 'NOT_SPECIFIED',
          expectedUpdatedAt: at.toISOString(),
        },
      )

    it('writes the recomputed minor status and never touches guardian consent', async () => {
      writeTx.beneficiary.findFirst.mockResolvedValue(person({}))
      await edit('2008-08-17')
      const data = writeTx.beneficiary.updateMany.mock.calls[0][0].data
      expect(data.isMinor).toBe(false)
      expect(data).not.toHaveProperty('guardianConsentRecorded')
    })

    it('refuses a minor without guardian consent before any write', async () => {
      writeTx.beneficiary.findFirst.mockResolvedValue(person({ birthDate: new Date('2008-11-01') }))
      await expect(edit('2008-11-01')).rejects.toThrow(
        'Guardian consent is required while the participant is under 18.',
      )
      expect(writeTx.beneficiary.updateMany).not.toHaveBeenCalled()
    })
  })

  it('lists every profile field whatever the body holds, as the compiled DTO did', async () => {
    const service = new BeneficiariesService(
      {} as PrismaService,
      new BeneficiaryRegistrationService(),
    )
    await service.update(actor, projectId, beneficiaryId, {
      subjectType: 'GROUP',
      displayName: 'Synthetic Group',
      sex: 'NOT_SPECIFIED',
      disabilityStatus: 'NOT_SPECIFIED',
      expectedUpdatedAt: at.toISOString(),
    })
    expect(writeTx.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'BENEFICIARY_PROFILE_UPDATED',
        changes: {
          fields: [
            'subjectType',
            'displayName',
            'firstName',
            'middleName',
            'lastName',
            'sex',
            'birthDate',
            'ageAtRegistration',
            'disabilityStatus',
            'locationBarangay',
            'locationCityMunicipality',
            'locationProvince',
          ],
        },
      }),
    })
  })
})
