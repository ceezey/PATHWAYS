import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { ApplicationIdentity } from '../../common/authz/application-identity'
import { BeneficiaryRegistrationService } from './beneficiary-registration.service'

vi.mock('node:crypto', async (importOriginal) => ({
  ...(await importOriginal<typeof import('node:crypto')>()),
  randomUUID: () => '50000000-0000-4000-8000-000000000005',
}))

const organizationId = '10000000-0000-4000-8000-000000000001'
const actorId = '20000000-0000-4000-8000-000000000002'
const projectId = '30000000-0000-4000-8000-000000000003'
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
    beneficiary: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      createMany: vi.fn(),
      updateMany: vi.fn(),
    },
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
  let service: BeneficiaryRegistrationService

  beforeEach(() => {
    vi.clearAllMocks()
    service = new BeneficiaryRegistrationService()
    tx.digitalForm.findFirst.mockResolvedValue({
      id: formId,
      version: 1,
      status: 'PUBLISHED',
      formField_form: fields,
    })
    tx.$queryRaw.mockImplementation((query: TemplateStringsArray) =>
      Promise.resolve(
        query.join('').includes('p29_lock_registration_definition')
          ? [{ locked: true }]
          : [{ transactionTime: new Date('2026-01-01T00:00:00.000Z') }],
      ),
    )
    tx.formSubmission.findFirst.mockResolvedValue(null)
    tx.beneficiary.findUnique.mockResolvedValue(null)
    tx.beneficiary.findFirst.mockResolvedValue(null)
    tx.beneficiaryIdentifier.findUnique.mockResolvedValue(null)
    tx.beneficiary.createMany.mockResolvedValue({ count: 1 })
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

  it.each(['PROJECT_OFFICER', 'MONITORING_AND_EVALUATION_OFFICER', 'PROJECT_MANAGER'])(
    'checks the exact direct definition lock before mutation for %s',
    async (role) => {
      await service.promoteRegistration(
        tx as never,
        { ...actor, roles: [role] },
        {
          projectId,
          formId,
          clientRegistrationId: registrationId,
          values: values(),
          source: 'DIRECT_ENTRY',
          validatedById: actorId,
        },
      )
      const first = tx.$queryRaw.mock.calls[0]
      expect(first[0].join('')).toContain('p29_lock_registration_definition')
      expect(first.slice(1)).toEqual([organizationId, projectId, formId, 1])
      expect(tx.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
        tx.beneficiary.createMany.mock.invocationCallOrder[0],
      )
      expect(
        tx.$queryRaw.mock.calls.some((call) =>
          call[0].join('').includes("date_trunc('milliseconds', CURRENT_TIMESTAMP)"),
        ),
      ).toBe(true)
    },
  )
  it('inserts without returning the unreadable profile and carries its server-generated ID into enrollment', async () => {
    await promote()
    expect(tx.beneficiary.createMany).toHaveBeenCalledWith({
      data: expect.objectContaining({ id: beneficiaryId, organizationId, createdById: actorId }),
    })
    expect(tx.beneficiaryProjectEnrollment.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ beneficiaryId, projectId }) }),
    )
    expect(tx.beneficiary.createMany.mock.invocationCallOrder[0]).toBeLessThan(
      tx.beneficiaryProjectEnrollment.create.mock.invocationCallOrder[0],
    )
  })
  it('fails closed if the insert does not create exactly one profile', async () => {
    tx.beneficiary.createMany.mockResolvedValueOnce({ count: 0 })
    await expect(promote()).rejects.toThrow('Beneficiary registration was not created.')
    expect(tx.beneficiaryProjectEnrollment.create).not.toHaveBeenCalled()
    expect(tx.formSubmission.create).not.toHaveBeenCalled()
    expect(tx.auditLog.create).not.toHaveBeenCalled()
  })
  it('stops false definition authorization before any domain mutation', async () => {
    tx.$queryRaw.mockResolvedValueOnce([{ locked: false }])
    await expect(promote()).rejects.toMatchObject({
      status: 404,
      message: 'Published registration form unavailable.',
    })
    expect(tx.beneficiary.createMany).not.toHaveBeenCalled()
    expect(tx.beneficiaryProjectEnrollment.create).not.toHaveBeenCalled()
    expect(tx.formSubmission.create).not.toHaveBeenCalled()
    expect(tx.auditLog.create).not.toHaveBeenCalled()
  })
  it.each([{ reply: [] }, { reply: [{}] }, { reply: [{ locked: 'true' }] }])(
    'fails closed on malformed lock reply: %j',
    async ({ reply }) => {
      tx.$queryRaw.mockResolvedValueOnce(reply)
      await expect(promote()).rejects.toThrow('Registration definition lock is unavailable.')
      expect(tx.beneficiary.createMany).not.toHaveBeenCalled()
      expect(tx.formSubmission.create).not.toHaveBeenCalled()
    },
  )
  it('preserves imported registration without direct helper or clock rewrite', async () => {
    await promote(values(), 'IMPORTED_DATASET')
    const queries = tx.$queryRaw.mock.calls.map((call) => call[0].join(''))
    expect(queries.some((query) => query.includes('p29_lock_registration_definition'))).toBe(false)
    expect(queries.some((query) => query.includes("date_trunc('milliseconds'"))).toBe(false)
    expect(queries.some((query) => query.includes('SELECT CURRENT_TIMESTAMP'))).toBe(true)
  })
  it('uses a preloaded import form only for the same imported form and never for direct entry', async () => {
    const preloaded = {
      form: { id: formId, version: 1, status: 'PUBLISHED' as const, formField_form: fields },
    }
    const input = (source: 'DIRECT_ENTRY' | 'IMPORTED_DATASET', wantedForm = formId) => ({
      projectId,
      formId: wantedForm,
      clientRegistrationId: registrationId,
      values: values(),
      source,
      validatedById: actorId,
      ...(source === 'IMPORTED_DATASET'
        ? { importBatchId: 'a0000000-0000-4000-8000-000000000001', importRowId: registrationId }
        : {}),
    })

    await service.promoteRegistration(
      tx as never,
      actor,
      input('IMPORTED_DATASET'),
      preloaded as never,
    )
    expect(tx.digitalForm.findFirst).not.toHaveBeenCalled()
    expect(tx.beneficiary.createMany).toHaveBeenCalledOnce()

    vi.clearAllMocks()
    tx.digitalForm.findFirst.mockResolvedValue(null)
    await expect(
      service.promoteRegistration(tx as never, actor, input('DIRECT_ENTRY'), preloaded as never),
    ).rejects.toMatchObject({ status: 404 })
    await expect(
      service.promoteRegistration(
        tx as never,
        actor,
        input('IMPORTED_DATASET', 'b0000000-0000-4000-8000-000000000001'),
        preloaded as never,
      ),
    ).rejects.toMatchObject({ status: 404 })
    expect(tx.digitalForm.findFirst).toHaveBeenCalledTimes(2)
    expect(tx.beneficiary.createMany).not.toHaveBeenCalled()
  })
  it('atomically creates an individual, enrollment, versioned submission, consent provenance and audit', async () => {
    await expect(promote()).resolves.toEqual({
      kind: 'PROCESSED',
      beneficiaryId,
      enrollmentId,
      submissionId,
    })
    expect(tx.beneficiary.createMany).toHaveBeenCalledOnce()
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
    expect(tx.beneficiary.createMany).not.toHaveBeenCalled()
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
    expect(tx.beneficiary.createMany).toHaveBeenCalledWith(
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
    expect(tx.beneficiary.createMany).not.toHaveBeenCalled()
  })

  describe('enrollment date against the business date', () => {
    // 01:00 on 2026-10-07 in Manila is still 2026-10-06 in UTC.
    beforeEach(() => {
      vi.useFakeTimers({ now: new Date('2026-10-06T17:00:00.000Z'), toFake: ['Date'] })
    })
    afterEach(() => {
      vi.useRealTimers()
    })
    it('accepts enrollment on the business date before UTC reaches it', async () => {
      await expect(promote(values({ enrollment_date: '2026-10-07' }))).resolves.toMatchObject({
        kind: 'PROCESSED',
      })
    })
    it('rejects enrollment after the business date', async () => {
      await expect(promote(values({ enrollment_date: '2026-10-08' }))).rejects.toMatchObject({
        status: 400,
        message: 'enrollment_date cannot be future.',
      })
    })
  })

  describe('minimum age and future birth date (cr-pathways-default-registration-form)', () => {
    // A calendar date safely after the business date in any time zone.
    const future = new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10)
    const minor = (patch: Record<string, unknown>) =>
      values({ is_minor: true, guardian_consent_recorded: true, ...patch })

    it.each([
      [
        'birth date one day short of age 5',
        minor({ birth_date: '2021-01-02', age_at_registration: null }),
      ],
      ['supplied age 4 without a birth date', minor({ birth_date: null, age_at_registration: 4 })],
      ['supplied age 0 without a birth date', minor({ birth_date: null, age_at_registration: 0 })],
    ])('rejects %s with the exact message and no writes', async (_label, input) => {
      await expect(promote(input)).rejects.toMatchObject({
        status: 400,
        message: 'Beneficiary must be at least 5 years old.',
      })
      expect(tx.beneficiary.createMany).not.toHaveBeenCalled()
      expect(tx.formSubmission.create).not.toHaveBeenCalled()
    })

    it.each([
      [
        'birth date exactly 5 years before enrollment',
        { birth_date: '2021-01-01', age_at_registration: 5 },
      ],
      ['supplied age 5 without a birth date', { birth_date: null, age_at_registration: 5 }],
    ])('accepts %s', async (_label, patch) => {
      await expect(promote(minor(patch))).resolves.toMatchObject({ kind: 'PROCESSED' })
      expect(tx.beneficiary.createMany).toHaveBeenCalledWith({
        data: expect.objectContaining({ ageAtRegistration: 5 }),
      })
    })

    it('rejects a future birth date with the exact message before the enrollment comparison', async () => {
      await expect(
        promote(values({ birth_date: future, age_at_registration: null })),
      ).rejects.toMatchObject({ status: 400, message: 'Date of birth cannot be in the future.' })
      expect(tx.beneficiary.createMany).not.toHaveBeenCalled()
    })

    it('rejects an under-age imported row through the same parser, preloaded form included', async () => {
      const preloaded = {
        form: { id: formId, version: 1, status: 'PUBLISHED' as const, formField_form: fields },
      }
      await expect(
        service.promoteRegistration(
          tx as never,
          actor,
          {
            projectId,
            formId,
            clientRegistrationId: registrationId,
            values: minor({ birth_date: '2022-06-01', age_at_registration: null }),
            source: 'IMPORTED_DATASET',
            validatedById: actorId,
            importBatchId: 'a0000000-0000-4000-8000-000000000001',
            importRowId: registrationId,
          },
          preloaded as never,
        ),
      ).rejects.toMatchObject({ status: 400, message: 'Beneficiary must be at least 5 years old.' })
      await expect(
        promote(values({ birth_date: future, age_at_registration: null }), 'IMPORTED_DATASET'),
      ).rejects.toMatchObject({ status: 400, message: 'Date of birth cannot be in the future.' })
      expect(tx.beneficiary.createMany).not.toHaveBeenCalled()
      expect(tx.formSubmission.create).not.toHaveBeenCalled()
    })
  })

  describe('imported rows without recorded consent', () => {
    it.each(['consent_recorded', 'data_processing_consent_recorded'])(
      'holds an imported row with %s false for review without writes',
      async (code) => {
        await expect(promote(values({ [code]: false }), 'IMPORTED_DATASET')).resolves.toEqual({
          kind: 'REVIEW',
          code: 'CONSENT_REQUIRED',
        })
        expect(tx.beneficiary.createMany).not.toHaveBeenCalled()
        expect(tx.formSubmission.create).not.toHaveBeenCalled()
      },
    )

    it('checks consent before the guardian hold', async () => {
      await expect(
        promote(
          values({
            birth_date: '2014-01-01',
            age_at_registration: 12,
            is_minor: true,
            consent_recorded: false,
          }),
          'IMPORTED_DATASET',
        ),
      ).resolves.toEqual({ kind: 'REVIEW', code: 'CONSENT_REQUIRED' })
    })
  })

  describe('minors without guardian consent', () => {
    const minor = (patch: Record<string, unknown> = {}) =>
      values({
        birth_date: '2014-01-01',
        age_at_registration: 12,
        is_minor: true,
        guardian_consent_recorded: false,
        ...patch,
      })

    it.each([false, null])(
      'holds an imported minor with guardian consent %s for review without writes',
      async (guardian) => {
        await expect(
          promote(minor({ guardian_consent_recorded: guardian }), 'IMPORTED_DATASET'),
        ).resolves.toEqual({ kind: 'REVIEW', code: 'GUARDIAN_CONSENT_REQUIRED' })
        expect(tx.beneficiary.createMany).not.toHaveBeenCalled()
        expect(tx.formSubmission.create).not.toHaveBeenCalled()
      },
    )

    it('promotes an imported minor once guardian consent is recorded', async () => {
      await expect(
        promote(minor({ guardian_consent_recorded: true }), 'IMPORTED_DATASET'),
      ).resolves.toMatchObject({ kind: 'PROCESSED' })
    })

    it('keeps the direct entry rejection for a minor without guardian consent', async () => {
      await expect(promote(minor())).rejects.toMatchObject({
        status: 400,
        message: 'Guardian consent is required while the participant is under 18.',
      })
    })
  })

  describe('minor status follows the current age', () => {
    // 12:00 on 2026-10-26 in Manila.
    beforeEach(() => {
      vi.useFakeTimers({ now: new Date('2026-10-26T04:00:00.000Z'), toFake: ['Date'] })
    })
    afterEach(() => {
      vi.useRealTimers()
    })
    const enrolled = { enrollment_date: '2026-01-10' }
    // Born 2008-08-17: 17 at enrollment, 18 today.
    const adultToday = { birth_date: '2008-08-17', age_at_registration: 17, ...enrolled }
    // Born 2008-11-01: 17 at enrollment, still 17 today.
    const minorToday = { birth_date: '2008-11-01', age_at_registration: 17, ...enrolled }
    const consentKinds = () =>
      tx.beneficiaryConsentRecord.createMany.mock.calls[0][0].data.map(
        (record: { kind: string }) => record.kind,
      )

    it('promotes a person who is 18 today without guardian consent, though a minor at enrollment', async () => {
      await expect(promote(values(adultToday))).resolves.toMatchObject({ kind: 'PROCESSED' })
      expect(tx.beneficiary.createMany).toHaveBeenCalledWith({
        data: expect.objectContaining({ isMinor: false, guardianConsentRecorded: false }),
      })
      expect(consentKinds()).toEqual(['PARTICIPATION', 'DATA_PROCESSING'])
    })

    it('judges an imported row by the birth date, not by its is_minor value', async () => {
      await expect(
        promote(values({ ...adultToday, is_minor: true }), 'IMPORTED_DATASET'),
      ).resolves.toMatchObject({ kind: 'PROCESSED' })
      await expect(
        promote(values({ ...minorToday, is_minor: false }), 'IMPORTED_DATASET'),
      ).resolves.toEqual({ kind: 'REVIEW', code: 'GUARDIAN_CONSENT_REQUIRED' })
    })

    it('rejects a direct entry for a person under 18 today without guardian consent', async () => {
      await expect(promote(values(minorToday))).rejects.toMatchObject({
        status: 400,
        message: 'Guardian consent is required while the participant is under 18.',
      })
      expect(tx.beneficiary.createMany).not.toHaveBeenCalled()
    })

    it('stores a minor with guardian consent and records the guardian consent', async () => {
      await promote(values({ ...minorToday, guardian_consent_recorded: true }))
      expect(tx.beneficiary.createMany).toHaveBeenCalledWith({
        data: expect.objectContaining({ isMinor: true, guardianConsentRecorded: true }),
      })
      expect(consentKinds()).toEqual(['PARTICIPATION', 'DATA_PROCESSING', 'GUARDIAN'])
    })

    it('lets an adult carry guardian consent without a guardian consent record', async () => {
      await promote(values({ ...adultToday, guardian_consent_recorded: true }))
      expect(tx.beneficiary.createMany).toHaveBeenCalledWith({
        data: expect.objectContaining({ isMinor: false, guardianConsentRecorded: true }),
      })
      expect(consentKinds()).toEqual(['PARTICIPATION', 'DATA_PROCESSING'])
    })

    describe('an existing profile', () => {
      // A person stored as a minor who turned 18 after registering.
      const stored = (patch: Record<string, unknown> = {}) => ({
        code: 'BEN-001',
        subjectType: 'INDIVIDUAL',
        birthDate: new Date('2008-08-17T00:00:00.000Z'),
        ageAtRegistration: 17,
        isMinor: true,
        guardianConsentRecorded: true,
        ...patch,
      })
      const link = (patch: Record<string, unknown> = {}) =>
        values({ registration_operation: 'LINK', ...adultToday, ...patch })

      beforeEach(() => {
        tx.beneficiary.findUnique.mockResolvedValue({ id: beneficiaryId })
        tx.beneficiary.updateMany.mockResolvedValue({ count: 1 })
        tx.beneficiary.findFirst.mockResolvedValue(stored())
      })

      it('refreshes a stale minor status before the consent insert on a LINK', async () => {
        await expect(promote(link())).resolves.toMatchObject({ kind: 'PROCESSED' })
        expect(tx.beneficiary.updateMany).toHaveBeenCalledWith({
          where: { id: beneficiaryId, organizationId, archivedAt: null },
          data: { isMinor: false },
        })
        expect(tx.beneficiary.updateMany.mock.invocationCallOrder[0]).toBeLessThan(
          tx.beneficiaryConsentRecord.createMany.mock.invocationCallOrder[0],
        )
        expect(consentKinds()).toEqual(['PARTICIPATION', 'DATA_PROCESSING'])
      })

      it('writes nothing to the profile when the stored minor status is current', async () => {
        tx.beneficiary.findFirst.mockResolvedValue(
          stored({ birthDate: new Date('2008-11-01T00:00:00.000Z'), isMinor: true }),
        )
        await promote(link({ birth_date: '2008-11-01', guardian_consent_recorded: true }))
        expect(tx.beneficiary.updateMany).not.toHaveBeenCalled()
        expect(consentKinds()).toEqual(['PARTICIPATION', 'DATA_PROCESSING', 'GUARDIAN'])
      })

      it('needs the profile update permission to refresh a stale status on a LINK', async () => {
        const linker = {
          ...actor,
          permissions: actor.permissions.filter((code) => code !== 'beneficiaries.profiles.update'),
        }
        await expect(
          service.promoteRegistration(tx as never, linker, {
            projectId,
            formId,
            clientRegistrationId: registrationId,
            values: link(),
            source: 'DIRECT_ENTRY',
            validatedById: actorId,
          }),
        ).rejects.toBeInstanceOf(ForbiddenException)
        expect(tx.beneficiaryConsentRecord.createMany).not.toHaveBeenCalled()
      })

      it('holds an imported UPDATE that makes the person a minor without guardian consent', async () => {
        tx.beneficiary.findFirst.mockResolvedValue(
          stored({
            birthDate: new Date('1990-01-01T00:00:00.000Z'),
            isMinor: false,
            guardianConsentRecorded: false,
          }),
        )
        const update = {
          registration_operation: 'UPDATE',
          profile_update_fields: ['birth_date', 'age_at_registration'],
          birth_date: '2008-11-01',
          guardian_consent_recorded: true,
        }
        await expect(promote(link(update), 'IMPORTED_DATASET')).resolves.toEqual({
          kind: 'REVIEW',
          code: 'GUARDIAN_CONSENT_REQUIRED',
        })
        await expect(promote(link(update))).rejects.toMatchObject({
          status: 400,
          message: 'Guardian consent is required while the participant is under 18.',
        })
        expect(tx.beneficiary.updateMany).not.toHaveBeenCalled()
        expect(tx.beneficiaryConsentRecord.createMany).not.toHaveBeenCalled()
      })

      it('writes the recomputed minor status with an UPDATE of the birth date', async () => {
        await promote(
          link({
            registration_operation: 'UPDATE',
            profile_update_fields: ['birth_date', 'age_at_registration'],
          }),
        )
        expect(tx.beneficiary.updateMany).toHaveBeenCalledWith({
          where: { id: beneficiaryId, organizationId, archivedAt: null },
          data: {
            birthDate: new Date('2008-08-17T00:00:00.000Z'),
            ageAtRegistration: 17,
            isMinor: false,
          },
        })
      })

      describe('an imported link', () => {
        const promoteImported = (input: Record<string, unknown>, extra = {}) =>
          service.promoteRegistration(tx as never, actor, {
            projectId,
            formId,
            clientRegistrationId: registrationId,
            values: input,
            source: 'IMPORTED_DATASET',
            validatedById: actorId,
            importBatchId: 'a0000000-0000-4000-8000-000000000001',
            importRowId: registrationId,
            ...extra,
          })
        const minorRow = link({ ...minorToday, guardian_consent_recorded: false })
        const minorProfile = (guardianConsentRecorded: boolean) =>
          stored({
            birthDate: new Date('2008-11-01T00:00:00.000Z'),
            ageAtRegistration: 17,
            guardianConsentRecorded,
          })

        it('is not held for a minor whose profile already carries guardian consent', async () => {
          tx.beneficiary.findFirst.mockResolvedValue(minorProfile(true))
          await expect(promoteImported(minorRow)).resolves.toMatchObject({ kind: 'PROCESSED' })
          expect(consentKinds()).toEqual(['PARTICIPATION', 'DATA_PROCESSING', 'GUARDIAN'])
        })

        it('is held for a minor whose profile has no guardian consent, whatever the row says', async () => {
          tx.beneficiary.findFirst.mockResolvedValue(minorProfile(false))
          for (const guardian of [false, true]) {
            await expect(
              promoteImported({ ...minorRow, guardian_consent_recorded: guardian }),
            ).resolves.toEqual({ kind: 'REVIEW', code: 'GUARDIAN_CONSENT_REQUIRED' })
          }
          expect(tx.beneficiaryProjectEnrollment.create).not.toHaveBeenCalled()
        })

        it('is not held for a known adult whose row says no guardian consent', async () => {
          tx.beneficiary.findFirst.mockResolvedValue(
            stored({ isMinor: false, guardianConsentRecorded: false }),
          )
          await expect(
            promoteImported(link({ guardian_consent_recorded: false })),
          ).resolves.toMatchObject({ kind: 'PROCESSED' })
          expect(consentKinds()).toEqual(['PARTICIPATION', 'DATA_PROCESSING'])
        })

        it('finds the profile by the identifier only when told to, so the code cannot conflict', async () => {
          tx.beneficiary.findFirst.mockResolvedValue(stored({ code: 'PW0000000001' }))
          tx.beneficiaryIdentifier.findUnique.mockResolvedValue({ beneficiaryId })
          const row = link({
            external_identifier_type: 'STUDENT_ID',
            external_identifier_value: 'S-1',
          })
          await expect(promoteImported(row, { matchByIdentifier: true })).resolves.toMatchObject({
            kind: 'PROCESSED',
            beneficiaryId,
          })
          expect(tx.beneficiary.findUnique).not.toHaveBeenCalled()
          await expect(promoteImported(row)).resolves.toEqual({
            kind: 'REVIEW',
            code: 'IDENTIFIER_CODE_CONFLICT',
          })
        })
      })
    })

    it('uses the supplied age when there is no birth date', async () => {
      const noBirth = { birth_date: null, age_at_registration: 12, ...enrolled }
      await expect(promote(values(noBirth))).rejects.toMatchObject({
        status: 400,
        message: 'Guardian consent is required while the participant is under 18.',
      })
      await promote(values({ ...noBirth, guardian_consent_recorded: true }))
      expect(tx.beneficiary.createMany).toHaveBeenCalledWith({
        data: expect.objectContaining({ isMinor: true, guardianConsentRecorded: true }),
      })
    })
  })

  it('returns an ambiguous-identity review to the reviewer without disclosing a record', async () => {
    tx.beneficiary.findUnique.mockResolvedValue({ id: beneficiaryId })
    tx.beneficiaryIdentifier.findUnique.mockResolvedValue({
      beneficiaryId: '50000000-0000-4000-8000-000000000099',
    })
    await expect(
      promote(values({ external_identifier_type: 'PARTNER_ID', external_identifier_value: 'A-1' })),
    ).resolves.toEqual({ kind: 'REVIEW', code: 'AMBIGUOUS_IDENTITY' })
    expect(tx.beneficiary.createMany).not.toHaveBeenCalled()
  })

  it('does not merge unknown LINK input using names, dates or email', async () => {
    await expect(promote(values({ registration_operation: 'LINK' }))).resolves.toEqual({
      kind: 'REVIEW',
      code: 'UNKNOWN_IDENTITY',
    })
    expect(tx.beneficiary.createMany).not.toHaveBeenCalled()
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
    expect(tx.beneficiary.createMany).not.toHaveBeenCalled()
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
    const directCreate = tx.beneficiary.createMany.mock.calls[0]?.[0]
    vi.clearAllMocks()
    tx.digitalForm.findFirst.mockResolvedValue({
      id: formId,
      version: 1,
      status: 'PUBLISHED',
      formField_form: fields,
    })
    tx.beneficiary.createMany.mockResolvedValue({ count: 1 })
    tx.beneficiaryProjectEnrollment.create.mockResolvedValue({ id: enrollmentId })
    tx.formSubmission.create.mockResolvedValue({ id: submissionId })
    await promote(values(), 'IMPORTED_DATASET')
    expect(tx.beneficiary.createMany.mock.calls[0]?.[0]).toEqual(directCreate)
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
