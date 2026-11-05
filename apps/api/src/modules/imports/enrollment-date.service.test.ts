import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common'
import { hasAtomicPermission, rolePermissions } from '@pathways/shared'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { PrismaService } from '@app/prisma/prisma.service'
import type { ApplicationIdentity } from '../../common/authz/application-identity'
import { BeneficiaryRegistrationService } from '../beneficiaries/beneficiary-registration.service'
import { fakeRowCounts, isRowCountsQuery } from './batch-row-counts.harness'
import { EnrollmentDateService } from './enrollment-date.service'
import { GuardianApprovalService } from './guardian-approval.service'

type Json = Record<string, unknown>

const organizationId = '10000000-0000-4000-8000-000000000001'
const actorId = '20000000-0000-4000-8000-000000000002'
const projectId = '30000000-0000-4000-8000-000000000003'
const otherProjectId = '30000000-0000-4000-8000-0000000000ff'
const formId = '40000000-0000-4000-8000-000000000004'
const batchId = '50000000-0000-4000-8000-000000000005'
const rowIds = [1, 2, 3].map((n) => `60000000-0000-4000-8000-00000000000${n}`)
// Uploaded at 08:00 on 2026-10-03 in Manila.
const createdAt = new Date('2026-10-03T00:00:00.000Z')
// 12:00 on 2026-10-26 in Manila.
const now = new Date('2026-10-26T04:00:00.000Z')
const timeKey = 'column_0001'

const identity = (role: string, permissions: readonly string[]): ApplicationIdentity => ({
  id: '90000000-0000-4000-8000-000000000009',
  aal: 'aal2',
  userId: actorId,
  organizationId,
  fullName: 'Synthetic actor',
  roles: [role],
  permissions: [...permissions] as never,
  assignedProjectIds: [projectId],
})
const projectOfficer = identity('PROJECT_OFFICER', rolePermissions.PROJECT_OFFICER)
const programManager = identity('PROGRAM_MANAGER', rolePermissions.PROGRAM_MANAGER)

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
  rule: null as Json | null,
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
  {
    ...field('age_at_registration', 'INTEGER'),
    rule: { kind: 'AGE_AT_DATE', birthField: 'birth_date', atField: 'enrollment_date' },
  },
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

// A held adult born 1990-02-01 with no enrollment date and so no age yet.
const heldValues = (n: number, patch: Json = {}) => ({
  registration_operation: 'CREATE',
  beneficiary_code: `PART-${n}`,
  subject_type: 'INDIVIDUAL',
  display_name: `Synthetic Person ${n}`,
  first_name: 'Synthetic',
  middle_name: null,
  last_name: `Person${n}`,
  sex: 'NOT_SPECIFIED',
  birth_date: '1990-02-01',
  age_at_registration: null,
  disability_status: 'NOT_SPECIFIED',
  location_barangay: null,
  location_city_municipality: null,
  location_province: null,
  consent_recorded: true,
  data_processing_consent_recorded: true,
  is_minor: false,
  guardian_consent_recorded: null,
  enrollment_date: null,
  external_identifier_type: 'STUDENT_ID',
  external_identifier_value: `S-${n}`,
  profile_update_fields: null,
  ...patch,
})
// Born 2014-03-04: 11 at a 2026-01-15 enrollment and still under 18 today.
const minor = { birth_date: '2014-03-04', is_minor: true }
// Kobo times in UTC: 2026-01-15 and 2026-03-01 in Manila, either side of a Manila midnight.
const submissionTimes = ['2026-01-14T16:30:00Z', '2026-03-01T15:59:59Z', '2026-05-10T02:00:00Z']

const makeRow = (id: string, rowNumber: number, patch: Json = {}) => ({
  id,
  organizationId,
  projectId,
  importBatchId: batchId,
  rowNumber,
  status: 'UNPROCESSED',
  mappingRevision: 1,
  validationRevision: 1,
  processingClaimId: null as string | null,
  processingClaimedAt: null as Date | null,
  processingAttempts: 1,
  processingErrorCode: 'ENROLLMENT_DATE_REQUIRED' as string | null,
  registrationOutcome: null as string | null,
  processedAt: null as Date | null,
  normalizedData: heldValues(rowNumber) as Json | null,
  rawData: { [timeKey]: submissionTimes[rowNumber - 1] } as Json,
  validationErrors: [] as unknown[],
  matchedBeneficiaryId: null as string | null,
  resolutionData: null as Json | null,
  resolvedById: null as string | null,
  resolvedAt: null as Date | null,
  ...patch,
})

interface Store {
  batch: Json
  rows: ReturnType<typeof makeRow>[]
  identifierMapped: boolean
  timeDateOrder: string | null
}
let store: Store
const sourceHeaders = (header: string) => [
  { key: timeKey, header, columnIndex: 1 },
  { key: 'column_0002', header: 'Name', columnIndex: 2 },
]
const createStore = (): Store => ({
  batch: {
    id: batchId,
    organizationId,
    projectId,
    formId,
    formVersion: 1,
    status: 'PARTIALLY_PROCESSED',
    mappingRevision: 1,
    validationRevision: 1,
    validatedMappingRevision: 1,
    processingRevision: 1,
    processingClaimId: null,
    processingClaimedAt: null,
    processedAt: createdAt,
    reviewedById: actorId,
    sourceHeaders: sourceHeaders('_submission_time'),
    createdAt,
    updatedAt: createdAt,
    form: { code: 'registration', name: 'Registration', formType: 'BENEFICIARY_REGISTRATION' },
  },
  rows: rowIds.map((id, index) => makeRow(id, index + 1)),
  identifierMapped: true,
  timeDateOrder: null,
})

const state = vi.hoisted(() => ({ actor: undefined as unknown }))
vi.mock('../../common/authz/authorized-operation', async () => {
  const { ForbiddenException } = await import('@nestjs/common')
  return {
    withAuthorizedOperation: vi.fn(
      async (_prisma, _identity, permission, work: (tx: unknown, who: unknown) => unknown) => {
        const who = state.actor as ApplicationIdentity
        if (!hasAtomicPermission(who.roles[0], who.permissions, permission)) {
          throw new ForbiddenException('Required application permission is missing.')
        }
        return work(fakeTx, who)
      },
    ),
  }
})

const rowById = (id: string) => store.rows.find((row) => row.id === id)
const apply = (target: Json, data: Json) => {
  for (const [key, value] of Object.entries(data)) {
    target[key] =
      value && typeof value === 'object' && 'increment' in value
        ? (target[key] as number) + (value as { increment: number }).increment
        : value
  }
}

const fakeTx = {
  $queryRaw: vi.fn(async (query: { values?: unknown[] }) =>
    // A tagged template is the database clock; the batch lock is a Prisma.Sql with values.
    Array.isArray(query)
      ? [{ transactionTime: now }]
      : isRowCountsQuery(query)
        ? fakeRowCounts(store.rows)
        : query.values?.includes(projectId) && query.values?.includes(organizationId)
          ? [{ id: batchId }]
          : [],
  ),
  project: {
    findFirst: vi.fn(async (args: { where: { AND: [Json, { id: string }] } }) => {
      const [scope, wanted] = args.where.AND
      const allowed = (scope.id as { in: string[] } | undefined)?.in ?? [wanted.id]
      return wanted.id === projectId && allowed.includes(wanted.id) ? { id: wanted.id } : null
    }),
  },
  digitalForm: {
    findFirst: vi.fn(async () => ({
      id: formId,
      projectId,
      version: 1,
      status: 'PUBLISHED',
      formField_form: fields,
    })),
  },
  dataImportBatch: {
    findFirst: vi.fn(async (args: { where: Json }) =>
      args.where.projectId === projectId ? structuredClone(store.batch) : null,
    ),
    findUnique: vi.fn(async () => structuredClone(store.batch)),
    update: vi.fn(async (args: { data: Json }) => {
      const next = { ...store.batch, ...args.data }
      if (next.status === 'PROCESSING' && next.processedAt !== null) {
        throw new Error('import_batches_state: PROCESSING requires processedAt null')
      }
      apply(store.batch, args.data)
      return structuredClone(store.batch)
    }),
  },
  dataImportRow: {
    // With no id list this is the whole batch, read for the time column's date order.
    findMany: vi.fn(async (args: { where: { id?: { in: string[] }; importBatchId: string } }) =>
      store.rows
        .filter(
          (row) =>
            (!args.where.id || args.where.id.in.includes(row.id)) &&
            row.importBatchId === args.where.importBatchId,
        )
        .map((row) => structuredClone(row)),
    ),
    updateMany: vi.fn(async (args: { where: Json; data: Json }) => {
      const where = args.where as {
        id: string
        status: string | { in: string[] }
        resolvedAt: null | { not: null }
        processingErrorCode?: string
      }
      const row = rowById(where.id)
      const statusOk =
        typeof where.status === 'string'
          ? row?.status === where.status
          : row && where.status.in.includes(row.status)
      const resolvedOk =
        where.resolvedAt === null ? row?.resolvedAt === null : row?.resolvedAt !== null
      const codeOk =
        where.processingErrorCode === undefined ||
        row?.processingErrorCode === where.processingErrorCode
      if (!row || !statusOk || !resolvedOk || !codeOk) return { count: 0 }
      apply(row as unknown as Json, args.data)
      return { count: 1 }
    }),
    findFirst: vi.fn(async (args: { where: { id: string } }) => {
      const row = rowById(args.where.id)
      return row ? structuredClone(row) : null
    }),
    update: vi.fn(async (args: { where: { id: string }; data: Json }) => {
      const row = rowById(args.where.id)
      if (!row) throw new Error('missing row')
      apply(row as unknown as Json, args.data)
      return row
    }),
  },
  metadataMapping: {
    // The time column's mapping when asked by source column, else the client identifier's.
    findFirst: vi.fn(async (args: { where: Json }) =>
      args.where.sourceFieldName
        ? store.timeDateOrder
          ? { dateOrder: store.timeDateOrder }
          : null
        : store.identifierMapped
          ? { id: 'mapping' }
          : null,
    ),
    findMany: vi.fn(async () => []),
  },
  formField: { findMany: vi.fn(async () => fields) },
  beneficiary: {
    findUnique: vi.fn(async () => null),
    findFirst: vi.fn(async () => null),
    createMany: vi.fn(async (_args: { data: Json }) => ({ count: 1 })),
    updateMany: vi.fn(async () => ({ count: 1 })),
  },
  importValueRejection: { findMany: vi.fn(async () => []), createMany: vi.fn() },
  beneficiaryIdentifier: { findUnique: vi.fn(async () => null), create: vi.fn() },
  beneficiaryProjectEnrollment: {
    findUnique: vi.fn(async () => null),
    findFirst: vi.fn(async () => null),
    create: vi.fn(async (_args: { data: Json }) => ({ id: 'enrollment' })),
  },
  formSubmission: {
    findFirst: vi.fn(async () => null),
    create: vi.fn(async () => ({ id: 'submission' })),
    update: vi.fn(),
  },
  formResponseValue: { createMany: vi.fn() },
  beneficiaryConsentRecord: {
    createMany: vi.fn(async (_args: { data: Json[] }) => ({ count: 1 })),
  },
  auditLog: { create: vi.fn(async (_args: { data: Json }) => ({ id: 'audit' })) },
}

const service = () =>
  new EnrollmentDateService({} as PrismaService, new BeneficiaryRegistrationService())
const confirm = (body: Json = {}, project = projectId) =>
  service().confirm(state.actor as ApplicationIdentity, project, batchId, {
    rowIds: rowIds.slice(0, 2),
    ...body,
  } as never)

const writes = () => [
  fakeTx.dataImportRow.updateMany,
  fakeTx.dataImportRow.update,
  fakeTx.dataImportBatch.update,
  fakeTx.beneficiary.createMany,
  fakeTx.beneficiaryProjectEnrollment.create,
  fakeTx.auditLog.create,
]
const expectNoWrites = () => {
  for (const write of writes()) expect(write).not.toHaveBeenCalled()
}
const confirmedAudits = () =>
  fakeTx.auditLog.create.mock.calls
    .map((call) => call[0].data)
    .filter((entry) => entry.action === 'IMPORT_ENROLLMENT_DATE_CONFIRMED')
const enrollmentDates = () =>
  fakeTx.beneficiaryProjectEnrollment.create.mock.calls.map((call) => call[0].data.enrollmentDate)
const createdAges = () =>
  fakeTx.beneficiary.createMany.mock.calls.map((call) => call[0].data.ageAtRegistration)
const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`)
const datePattern = /\d{4}-\d{2}-\d{2}/

describe('enrollment date confirmation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers({ now, toFake: ['Date'] })
    store = createStore()
    state.actor = projectOfficer
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('uses the proposed Manila dates and recomputes the age', async () => {
    await expect(confirm()).resolves.toEqual({ confirmed: 2, waiting: 0 })
    expect(enrollmentDates()).toEqual([day('2026-01-15'), day('2026-03-01')])
    // Born 1990-02-01: 35 before the birthday in 2026, 36 after it.
    expect(createdAges()).toEqual([35, 36])
    for (const [index, row] of store.rows.slice(0, 2).entries()) {
      expect(row).toMatchObject({
        status: 'PROCESSED',
        registrationOutcome: 'CREATED',
        resolvedById: actorId,
        processingClaimId: null,
        resolutionData: {
          kind: 'ENROLLMENT_DATE',
          source: 'SUBMISSION_TIME',
          values: {
            enrollment_date: ['2026-01-15', '2026-03-01'][index],
            age_at_registration: [35, 36][index],
            last_name: `Person${index + 1}`,
          },
        },
      })
    }
    expect(store.rows[2].status).toBe('UNPROCESSED')
    expect(store.batch).toMatchObject({ processingClaimId: null })
  })

  it('writes one audit per row with the row number and source only', async () => {
    await confirm()
    const audits = confirmedAudits()
    expect(audits).toHaveLength(2)
    expect(audits.map((entry) => [entry.entityType, entry.entityId, entry.changes])).toEqual([
      ['DataImportRow', rowIds[0], { rowNumber: 1, source: 'SUBMISSION_TIME' }],
      ['DataImportRow', rowIds[1], { rowNumber: 2, source: 'SUBMISSION_TIME' }],
    ])
    expect(JSON.stringify(audits)).not.toMatch(datePattern)
    expect(JSON.stringify(audits)).not.toMatch(/S-1|Person1/)
  })

  it('gives every row a typed date', async () => {
    await expect(confirm({ rowIds, date: '2026-06-30' })).resolves.toEqual({
      confirmed: 3,
      waiting: 0,
    })
    expect(enrollmentDates()).toEqual([day('2026-06-30'), day('2026-06-30'), day('2026-06-30')])
    expect(createdAges()).toEqual([36, 36, 36])
    expect(confirmedAudits().map((entry) => entry.changes)).toEqual([
      { rowNumber: 1, source: 'TYPED' },
      { rowNumber: 2, source: 'TYPED' },
      { rowNumber: 3, source: 'TYPED' },
    ])
    for (const row of store.rows) {
      expect(row.resolutionData).toMatchObject({ kind: 'ENROLLMENT_DATE', source: 'TYPED' })
    }
  })

  it('refuses the whole request when one row has no submission time, naming it', async () => {
    store.rows[1].rawData = { [timeKey]: '' }
    const before = structuredClone(store.rows)
    await expect(confirm()).rejects.toThrow(
      new BadRequestException('Row 2 has no submission time. Set one date for it.'),
    )
    expectNoWrites()
    expect(store.rows).toEqual(before)
  })

  it('refuses a file with no submission time column when no date is sent', async () => {
    store.batch.sourceHeaders = sourceHeaders('Started')
    await expect(confirm()).rejects.toThrow('Rows 1, 2 have no submission time.')
    expectNoWrites()
  })

  it('refuses a date after the upload date, typed or proposed, naming the rows', async () => {
    // The upload date is 2026-10-03 in Manila.
    for (const date of ['2026-10-04', '2026-10-26']) {
      await expect(confirm({ rowIds, date })).rejects.toThrow(
        new BadRequestException('Rows 1, 2, 3: the enrollment date is after the upload date.'),
      )
    }
    store.rows[1].rawData = { [timeKey]: '2026-10-03T16:00:00Z' }
    await expect(confirm()).rejects.toThrow('Row 2: the enrollment date is after the upload date.')
    expectNoWrites()
    await expect(confirm({ rowIds: [rowIds[0]], date: '2026-10-03' })).resolves.toEqual({
      confirmed: 1,
      waiting: 0,
    })
  })

  it('refuses a date before the birth date, naming the rows', async () => {
    store.rows[1].normalizedData = heldValues(2, { birth_date: '2026-02-01' })
    await expect(confirm({ date: '2026-01-20' })).rejects.toThrow(
      new BadRequestException('Row 2: the enrollment date is before the birth date.'),
    )
    expectNoWrites()
  })

  describe.each([
    ['a guardian hold', { processingErrorCode: 'GUARDIAN_CONSENT_REQUIRED' }],
    ['a data conflict', { processingErrorCode: 'PROFILE_CHANGED' }],
    ['a processed row', { status: 'PROCESSED', processingErrorCode: null }],
    ['an invalid row', { status: 'INVALID', processingErrorCode: null }],
  ])('a row not held for its enrollment date (%s)', (_name, patch) => {
    it('is 409 naming the row and writes nothing', async () => {
      store.rows[1] = { ...store.rows[1], ...patch } as never
      const before = structuredClone(store.rows)
      await expect(confirm()).rejects.toBeInstanceOf(ConflictException)
      await expect(confirm()).rejects.toThrow('Row 2 is not waiting for an enrollment date.')
      expectNoWrites()
      expect(store.rows).toEqual(before)
    })
  })

  it('a row of another batch is 409', async () => {
    store.rows[1] = { ...store.rows[1], importBatchId: '50000000-0000-4000-8000-0000000000ee' }
    await expect(confirm()).rejects.toBeInstanceOf(ConflictException)
    expectNoWrites()
  })

  it('rejects a mixed-case duplicate id before any write', async () => {
    await expect(confirm({ rowIds: [rowIds[0], rowIds[0].toUpperCase()] })).rejects.toBeInstanceOf(
      BadRequestException,
    )
    expect(fakeTx.dataImportRow.findMany).not.toHaveBeenCalled()
    expectNoWrites()
  })

  it('a caller without imports.process is 403', async () => {
    state.actor = programManager
    await expect(confirm()).rejects.toMatchObject({ status: 403 })
    expect(fakeTx.dataImportRow.findMany).not.toHaveBeenCalled()
    expectNoWrites()
  })

  it('a project the caller is not assigned to is 404', async () => {
    state.actor = { ...projectOfficer, assignedProjectIds: [otherProjectId] }
    await expect(confirm()).rejects.toBeInstanceOf(NotFoundException)
    expect(fakeTx.dataImportRow.findMany).not.toHaveBeenCalled()
    expectNoWrites()
  })

  it('reads a Google Forms Timestamp with the one date order the batch fits', async () => {
    store.batch.sourceHeaders = sourceHeaders('Timestamp')
    // Only month-day-year reads 1/14/2026, so 3/1/2026 is the first of March.
    store.rows[0].rawData = { [timeKey]: '1/14/2026 23:30:00' }
    store.rows[1].rawData = { [timeKey]: '3/1/2026 9:00:00' }
    await expect(confirm()).resolves.toEqual({ confirmed: 2, waiting: 0 })
    expect(enrollmentDates()).toEqual([day('2026-01-14'), day('2026-03-01')])
  })

  it('reads a Google Forms Timestamp with the stored date order of its mapping', async () => {
    store.batch.sourceHeaders = sourceHeaders('Timestamp')
    store.rows[0].rawData = { [timeKey]: '03/01/2026 09:00:00' }
    store.rows[1].rawData = { [timeKey]: '04/02/2026 09:00:00' }
    store.rows[2].rawData = { [timeKey]: '05/03/2026 09:00:00' }
    await expect(confirm()).rejects.toThrow('Rows 1, 2 have no submission time.')
    store.timeDateOrder = 'DMY'
    await expect(confirm()).resolves.toEqual({ confirmed: 2, waiting: 0 })
    expect(enrollmentDates()).toEqual([day('2026-01-03'), day('2026-02-04')])
  })

  it('refuses a code-matched row whose code is already taken, with no write', async () => {
    store.identifierMapped = false
    fakeTx.beneficiary.findUnique.mockImplementation((async (args: {
      where: { organizationId_code: { code: string } }
    }) => (args.where.organizationId_code.code === 'PART-1' ? { id: 'taken' } : null)) as never)
    try {
      await expect(confirm()).rejects.toThrow(
        'Row 1 looks like a participant already in PATHWAYS. A Monitoring and Evaluation Officer must review it first.',
      )
      expectNoWrites()
    } finally {
      fakeTx.beneficiary.findUnique.mockImplementation((async () => null) as never)
    }
  })

  it('refuses a Project Officer a row that would link a participant already in PATHWAYS, with no write', async () => {
    // The Student ID belongs to a participant enrolled elsewhere whose identity agrees: a link.
    fakeTx.beneficiaryIdentifier.findUnique.mockResolvedValueOnce({
      beneficiaryId: 'person',
    } as never)
    const profile = {
      firstName: 'Synthetic',
      lastName: 'Person1',
      birthDate: new Date('1990-02-01T00:00:00.000Z'),
    }
    fakeTx.beneficiary.findFirst
      .mockResolvedValueOnce(profile as never)
      .mockResolvedValueOnce(profile as never)
      .mockResolvedValueOnce({ code: 'PW0000000001' } as never)
    const before = structuredClone(store.rows)
    const refused = confirm()
    await expect(refused).rejects.toBeInstanceOf(ConflictException)
    await expect(refused).rejects.toThrow('Row 1 belongs to a participant already in PATHWAYS.')
    expectNoWrites()
    expect(store.rows).toEqual(before)
  })

  describe('a minor', () => {
    beforeEach(() => {
      store.rows[0].normalizedData = heldValues(1, minor)
    })

    it('parks for guardian consent with its resolution kept', async () => {
      await expect(confirm()).resolves.toEqual({ confirmed: 2, waiting: 1 })
      expect(store.rows[0]).toMatchObject({
        status: 'UNPROCESSED',
        processingErrorCode: 'GUARDIAN_CONSENT_REQUIRED',
        processingClaimId: null,
        resolvedById: actorId,
        resolutionData: {
          kind: 'ENROLLMENT_DATE',
          source: 'SUBMISSION_TIME',
          values: { enrollment_date: '2026-01-15', age_at_registration: 11 },
        },
      })
      expect(store.rows[0].resolvedAt).toBeInstanceOf(Date)
      expect(store.rows[1]).toMatchObject({ status: 'PROCESSED', registrationOutcome: 'CREATED' })
      expect(createdAges()).toEqual([36])
    })

    it('is registered by guardian approval with the confirmed date and its other values', async () => {
      await confirm({ rowIds: [rowIds[0]] })
      vi.clearAllMocks()
      const guardians = new GuardianApprovalService(
        {} as PrismaService,
        new BeneficiaryRegistrationService(),
      )
      await expect(
        guardians.approve(projectOfficer, projectId, batchId, { rowIds: [rowIds[0]] }),
      ).resolves.toEqual({ approved: 1 })
      expect(enrollmentDates()).toEqual([day('2026-01-15')])
      expect(fakeTx.beneficiary.createMany).toHaveBeenCalledWith({
        data: expect.objectContaining({
          lastName: 'Person1',
          birthDate: day('2014-03-04'),
          ageAtRegistration: 11,
          isMinor: true,
          guardianConsentRecorded: true,
        }),
      })
      expect(store.rows[0]).toMatchObject({
        status: 'PROCESSED',
        registrationOutcome: 'CREATED',
        resolutionData: { kind: 'ENROLLMENT_DATE', source: 'SUBMISSION_TIME' },
      })
    })
  })
})
