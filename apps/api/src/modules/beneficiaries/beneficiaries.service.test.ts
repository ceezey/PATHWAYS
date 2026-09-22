import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { PrismaService } from '@app/prisma/prisma.service'
import type { ApplicationIdentity } from '../auth/developer-access'
import { BeneficiariesService } from './beneficiaries.service'

const organizationId = '10000000-0000-4000-8000-000000000001'
const actorId = '20000000-0000-4000-8000-000000000002'
const projectId = '30000000-0000-4000-8000-000000000003'
const otherProjectId = '30000000-0000-4000-8000-000000000004'
const formId = '40000000-0000-4000-8000-000000000004'
const beneficiaryId = '50000000-0000-4000-8000-000000000005'
const enrollmentId = '60000000-0000-4000-8000-000000000006'
const submissionId = '70000000-0000-4000-8000-000000000007'
const registrationId = '80000000-0000-4000-8000-000000000008'

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

const field = (code: string, dataType: string, required = false, allowedValues?: string[]) => ({
  id: `${code}-field`,
  code,
  label: code,
  dataType,
  isRequired: required,
  allowedValues: allowedValues ?? null,
  minimumValue: null,
  maximumValue: null,
  minimumDate: null,
  maximumDate: null,
  minimumLength: null,
  maximumLength: null,
  sequenceNo: 1,
})

const fields = [
  field('registration_operation', 'SELECT', true, ['CREATE', 'LINK', 'UPDATE']),
  field('beneficiary_code', 'TEXT', true),
  field('subject_type', 'SELECT', true, ['INDIVIDUAL', 'GROUP', 'COMMUNITY']),
  field('display_name', 'TEXT'),
  field('first_name', 'TEXT'),
  field('middle_name', 'TEXT'),
  field('last_name', 'TEXT'),
  field('sex', 'SELECT', false, ['MALE', 'FEMALE', 'OTHER', 'PREFER_NOT_TO_SAY', 'NOT_SPECIFIED']),
  field('birth_date', 'DATE'),
  field('age_at_registration', 'INTEGER'),
  field('disability_status', 'SELECT', false, [
    'WITH_DISABILITY',
    'WITHOUT_DISABILITY',
    'NOT_SPECIFIED',
  ]),
  field('location_barangay', 'TEXT'),
  field('location_city_municipality', 'TEXT'),
  field('location_province', 'TEXT'),
  field('consent_recorded', 'BOOLEAN', true),
  field('data_processing_consent_recorded', 'BOOLEAN', true),
  field('is_minor', 'BOOLEAN'),
  field('guardian_consent_recorded', 'BOOLEAN'),
  field('enrollment_date', 'DATE', true),
  field('external_identifier_type', 'TEXT'),
  field('external_identifier_value', 'TEXT'),
  field('profile_update_fields', 'MULTIPLE_SELECT', false, [
    'display_name',
    'first_name',
    'middle_name',
    'last_name',
    'sex',
    'birth_date',
    'age_at_registration',
    'disability_status',
    'location_barangay',
    'location_city_municipality',
    'location_province',
  ]),
]

const values = (patch: Record<string, unknown> = {}) => ({
  registration_operation: 'CREATE',
  beneficiary_code: 'BEN-001',
  subject_type: 'INDIVIDUAL',
  display_name: 'Synthetic Person',
  first_name: 'Synthetic',
  middle_name: null,
  last_name: 'Person',
  sex: 'NOT_SPECIFIED',
  birth_date: '2000-01-01',
  age_at_registration: 26,
  disability_status: 'NOT_SPECIFIED',
  location_barangay: 'Test',
  location_city_municipality: 'Test City',
  location_province: 'Test Province',
  consent_recorded: true,
  data_processing_consent_recorded: true,
  is_minor: false,
  guardian_consent_recorded: false,
  enrollment_date: '2026-01-01',
  external_identifier_type: null,
  external_identifier_value: null,
  profile_update_fields: null,
  ...patch,
})

describe('P04 beneficiary registration service', () => {
  const tx = {
    $queryRaw: vi.fn(),
    digitalForm: { findFirst: vi.fn() },
    formSubmission: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
    formResponseValue: { createMany: vi.fn() },
    beneficiary: { findUnique: vi.fn(), findFirst: vi.fn(), create: vi.fn(), updateMany: vi.fn() },
    beneficiaryIdentifier: { findUnique: vi.fn(), create: vi.fn() },
    beneficiaryProjectEnrollment: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
    },
    beneficiaryConsentRecord: { createMany: vi.fn() },
    auditLog: { create: vi.fn() },
  }
  let service: BeneficiariesService

  beforeEach(() => {
    vi.clearAllMocks()
    service = new BeneficiariesService({} as PrismaService)
    tx.digitalForm.findFirst.mockResolvedValue({
      id: formId,
      version: 1,
      status: 'PUBLISHED',
      formField_form: fields,
    })
    tx.$queryRaw.mockResolvedValue([{ transactionTime: new Date('2026-01-01T00:00:00.000Z') }])
    tx.formSubmission.findFirst.mockResolvedValue(null)
    tx.beneficiary.findUnique.mockResolvedValue(null)
    tx.beneficiary.findFirst.mockResolvedValue(null)
    tx.beneficiaryIdentifier.findUnique.mockResolvedValue(null)
    tx.beneficiary.create.mockResolvedValue({ id: beneficiaryId })
    tx.beneficiaryProjectEnrollment.findUnique.mockResolvedValue(null)
    tx.beneficiaryProjectEnrollment.findMany.mockResolvedValue([])
    tx.beneficiaryProjectEnrollment.findFirst.mockResolvedValue(null)
    tx.beneficiaryProjectEnrollment.create.mockResolvedValue({ id: enrollmentId })
    tx.formSubmission.create.mockResolvedValue({ id: submissionId })
    tx.formSubmission.update.mockResolvedValue({ id: submissionId })
    tx.formResponseValue.createMany.mockResolvedValue({ count: fields.length })
    tx.beneficiaryConsentRecord.createMany.mockResolvedValue({ count: 2 })
    tx.auditLog.create.mockResolvedValue({ id: 'audit' })
  })

  const promote = (
    input = values(),
    source: 'DIRECT_ENTRY' | 'IMPORTED_DATASET' = 'DIRECT_ENTRY',
  ) =>
    service.promoteRegistration(tx as never, actor, {
      projectId,
      formId,
      clientRegistrationId: registrationId,
      values: input,
      source,
      validatedById: actorId,
      ...(source === 'IMPORTED_DATASET'
        ? { importBatchId: 'a0000000-0000-4000-8000-000000000001', importRowId: registrationId }
        : {}),
    })

  it('atomically creates an individual, enrollment, versioned submission, consent provenance and audit', async () => {
    await expect(promote()).resolves.toEqual({
      kind: 'PROCESSED',
      beneficiaryId,
      enrollmentId,
      submissionId,
    })
    expect(tx.beneficiary.create).toHaveBeenCalledOnce()
    expect(tx.formSubmission.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ enrollmentId, formVersion: 1 }) }),
    )
    expect(tx.beneficiaryConsentRecord.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.arrayContaining([
          expect.objectContaining({
            kind: 'PARTICIPATION',
            recordedAt: new Date('2026-01-01T00:00:00.000Z'),
          }),
          expect.objectContaining({
            kind: 'DATA_PROCESSING',
            recordedAt: new Date('2026-01-01T00:00:00.000Z'),
          }),
        ]),
      }),
    )
    expect(tx.formSubmission.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          submittedAt: new Date('2026-01-01T00:00:00.000Z'),
          validatedAt: new Date('2026-01-01T00:00:00.000Z'),
        }),
      }),
    )
    expect(tx.auditLog.create).toHaveBeenCalledOnce()
  })

  it('rejects an incompatible published registration definition before validating values', async () => {
    tx.digitalForm.findFirst.mockResolvedValue({
      id: formId,
      version: 1,
      status: 'PUBLISHED',
      formField_form: fields.map((item) =>
        item.code === 'enrollment_date' ? { ...item, dataType: 'DECIMAL' } : item,
      ),
    })

    await expect(promote()).rejects.toMatchObject({
      response: expect.objectContaining({
        message: 'Registration form does not implement the required domain field contract.',
        errors: expect.arrayContaining([
          expect.objectContaining({ fieldCode: 'enrollment_date', code: 'invalid_definition' }),
        ]),
      }),
    })
    expect(tx.beneficiary.create).not.toHaveBeenCalled()
    expect(tx.formSubmission.create).not.toHaveBeenCalled()
  })

  it('supports group/community subjects without fabricating person fields', async () => {
    await promote(
      values({
        subject_type: 'GROUP',
        display_name: 'Synthetic Group',
        first_name: null,
        last_name: null,
        birth_date: null,
        age_at_registration: null,
      }),
    )
    expect(tx.beneficiary.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ subjectType: 'GROUP', firstName: null, birthDate: null }),
      }),
    )
  })

  it.each([
    { consent_recorded: false },
    { birth_date: '2026-02-30' },
    { birth_date: '2020-01-01', age_at_registration: 6, is_minor: false },
    { external_identifier_type: 'EMAIL', external_identifier_value: 'synthetic@example.invalid' },
  ])('rejects invalid or inferred registration facts: %s', async (patch) => {
    await expect(promote(values(patch))).rejects.toBeInstanceOf(BadRequestException)
    expect(tx.beneficiary.create).not.toHaveBeenCalled()
  })

  it('returns review without disclosing a record for ambiguous exact identifiers', async () => {
    tx.beneficiary.findUnique.mockResolvedValue({ id: beneficiaryId })
    tx.beneficiaryIdentifier.findUnique.mockResolvedValue({
      beneficiaryId: '50000000-0000-4000-8000-000000000099',
    })
    await expect(
      promote(values({ external_identifier_type: 'PARTNER_ID', external_identifier_value: 'A-1' })),
    ).resolves.toEqual({ kind: 'REVIEW', code: 'AMBIGUOUS_IDENTITY' })
    expect(tx.beneficiary.create).not.toHaveBeenCalled()
  })

  it('does not merge unknown LINK input using names, dates or email', async () => {
    await expect(promote(values({ registration_operation: 'LINK' }))).resolves.toEqual({
      kind: 'REVIEW',
      code: 'UNKNOWN_IDENTITY',
    })
    expect(tx.beneficiary.create).not.toHaveBeenCalled()
  })

  it('denies exact LINK and UPDATE resolution before lookup without identity-review permission', async () => {
    const restrictedActor = {
      ...actor,
      permissions: actor.permissions.filter(
        (permission) => permission !== 'beneficiaries.identities.review',
      ),
    }
    for (const operation of ['LINK', 'UPDATE'] as const) {
      await expect(
        service.promoteRegistration(tx as never, restrictedActor, {
          projectId,
          formId,
          clientRegistrationId: registrationId,
          values: values({
            registration_operation: operation,
            profile_update_fields: operation === 'UPDATE' ? ['display_name'] : null,
          }),
          source: 'DIRECT_ENTRY',
          validatedById: actorId,
        }),
      ).rejects.toBeInstanceOf(ForbiddenException)
    }
    expect(tx.beneficiary.findUnique).not.toHaveBeenCalled()
    expect(tx.beneficiaryIdentifier.findUnique).not.toHaveBeenCalled()
  })

  it('does not disclose a hidden duplicate identity to a registrar without review permission', async () => {
    const restrictedActor = {
      ...actor,
      permissions: actor.permissions.filter(
        (permission) => permission !== 'beneficiaries.identities.review',
      ),
    }
    tx.beneficiary.findUnique.mockResolvedValue({ id: beneficiaryId })

    await expect(
      service.promoteRegistration(tx as never, restrictedActor, {
        projectId,
        formId,
        clientRegistrationId: registrationId,
        values: values(),
        source: 'DIRECT_ENTRY',
        validatedById: actorId,
      }),
    ).resolves.toEqual({ kind: 'REVIEW', code: 'IDENTITY_REVIEW_REQUIRED' })
    expect(tx.beneficiary.findFirst).not.toHaveBeenCalled()
  })

  it('requires explicit allowlisted fields for an import profile update', async () => {
    tx.beneficiary.findUnique.mockResolvedValue({ id: beneficiaryId })
    await expect(promote(values({ registration_operation: 'UPDATE' }))).rejects.toBeInstanceOf(
      BadRequestException,
    )
  })

  it('holds an inaccessible shared-profile update for authorized review', async () => {
    tx.beneficiary.findUnique.mockResolvedValue({ id: beneficiaryId })
    tx.beneficiary.findFirst.mockResolvedValue({ code: 'BEN-001', subjectType: 'INDIVIDUAL' })
    tx.beneficiaryProjectEnrollment.findFirst.mockResolvedValue({ id: 'inaccessible-enrollment' })
    const updateFields = ['display_name']
    await expect(
      promote(values({ registration_operation: 'UPDATE', profile_update_fields: updateFields })),
    ).resolves.toEqual({ kind: 'REVIEW', code: 'SHARED_PROFILE_UPDATE_REVIEW_REQUIRED' })
    expect(tx.beneficiary.updateMany).not.toHaveBeenCalled()
  })

  it('treats an identical retry as the same canonical registration', async () => {
    tx.formSubmission.findFirst.mockResolvedValue({
      id: submissionId,
      projectId,
      formId,
      formVersion: 1,
      source: 'DIRECT_ENCODING',
      enrollment: { id: enrollmentId, beneficiaryId },
      formResponseValue_submission: fields.map((entry) => ({
        field: { code: entry.code },
        value: values()[entry.code as keyof ReturnType<typeof values>],
      })),
    })
    await expect(promote()).resolves.toEqual({
      kind: 'PROCESSED',
      beneficiaryId,
      enrollmentId,
      submissionId,
    })
    expect(tx.beneficiary.create).not.toHaveBeenCalled()
  })

  it('rejects reuse of a registration key with conflicting values', async () => {
    tx.formSubmission.findFirst.mockResolvedValue({
      id: submissionId,
      projectId,
      formId,
      formVersion: 1,
      source: 'DIRECT_ENCODING',
      enrollment: { id: enrollmentId, beneficiaryId },
      formResponseValue_submission: [],
    })
    await expect(promote()).rejects.toBeInstanceOf(ConflictException)
  })

  it('uses the same domain writes for direct and imported registration sources', async () => {
    await promote(values(), 'DIRECT_ENTRY')
    const directCreate = tx.beneficiary.create.mock.calls[0]?.[0]
    vi.clearAllMocks()
    tx.digitalForm.findFirst.mockResolvedValue({
      id: formId,
      version: 1,
      status: 'PUBLISHED',
      formField_form: fields,
    })
    tx.beneficiary.create.mockResolvedValue({ id: beneficiaryId })
    tx.beneficiaryProjectEnrollment.create.mockResolvedValue({ id: enrollmentId })
    tx.formSubmission.create.mockResolvedValue({ id: submissionId })
    await promote(values(), 'IMPORTED_DATASET')
    expect(tx.beneficiary.create.mock.calls[0]?.[0]).toEqual(directCreate)
    expect(tx.formSubmission.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ source: 'IMPORTED_DATASET', importRowId: registrationId }),
      }),
    )
  })

  it('does not write when validation or a transactional dependency fails', async () => {
    tx.beneficiaryProjectEnrollment.create.mockRejectedValue(
      new Error('synthetic transaction rollback'),
    )
    await expect(promote()).rejects.toThrow('synthetic transaction rollback')
    expect(tx.formSubmission.create).not.toHaveBeenCalled()
    expect(tx.auditLog.create).not.toHaveBeenCalled()
  })
})
