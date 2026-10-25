import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common'
import { hasAtomicPermission, rolePermissions } from '@pathways/shared'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { PrismaService } from '@app/prisma/prisma.service'
import type { ApplicationIdentity } from '../../common/authz/application-identity'
import { BeneficiaryRegistrationService } from '../beneficiaries/beneficiary-registration.service'
import { GuardianApprovalService } from './guardian-approval.service'

type Json = Record<string, unknown>

const organizationId = '10000000-0000-4000-8000-000000000001'
const actorId = '20000000-0000-4000-8000-000000000002'
const projectId = '30000000-0000-4000-8000-000000000003'
const otherProjectId = '30000000-0000-4000-8000-0000000000ff'
const formId = '40000000-0000-4000-8000-000000000004'
const batchId = '50000000-0000-4000-8000-000000000005'
const rowIds = [1, 2, 3].map((n) => `60000000-0000-4000-8000-00000000000${n}`)
const createdAt = new Date('2026-10-03T00:00:00.000Z')
// 12:00 on 2026-10-26 in Manila.
const now = new Date('2026-10-26T04:00:00.000Z')

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
const mneOfficer = identity(
  'MONITORING_AND_EVALUATION_OFFICER',
  rolePermissions.MONITORING_AND_EVALUATION_OFFICER,
)

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
  rule: null,
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

// A held minor: born 2014-03-04, so 11 at enrollment and still under 18 today.
const heldValues = (n: number, patch: Json = {}) => ({
  registration_operation: 'CREATE',
  beneficiary_code: `PART-${n}`,
  subject_type: 'INDIVIDUAL',
  display_name: `Synthetic Child ${n}`,
  first_name: 'Synthetic',
  middle_name: null,
  last_name: `Child${n}`,
  sex: 'NOT_SPECIFIED',
  birth_date: '2014-03-04',
  age_at_registration: 11,
  disability_status: 'NOT_SPECIFIED',
  location_barangay: null,
  location_city_municipality: null,
  location_province: null,
  consent_recorded: true,
  data_processing_consent_recorded: true,
  is_minor: true,
  guardian_consent_recorded: null,
  enrollment_date: '2026-01-10',
  external_identifier_type: 'STUDENT_ID',
  external_identifier_value: `S-${n}`,
  profile_update_fields: null,
  ...patch,
})
// Born 2008-08-17: 17 at enrollment, 18 today.
const turned18 = { birth_date: '2008-08-17', age_at_registration: 17, is_minor: true }

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
  processingErrorCode: 'GUARDIAN_CONSENT_REQUIRED' as string | null,
  registrationOutcome: null as string | null,
  processedAt: null as Date | null,
  normalizedData: heldValues(rowNumber) as Json,
  resolutionData: null as Json | null,
  resolvedById: null as string | null,
  resolvedAt: null as Date | null,
  ...patch,
})

interface Store {
  batch: Json
  rows: ReturnType<typeof makeRow>[]
  identifierMapped: boolean
}
let store: Store
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
    reviewedById: actorId,
    sourceHeaders: [],
    createdAt,
    updatedAt: createdAt,
    form: { code: 'registration', name: 'Registration', formType: 'BENEFICIARY_REGISTRATION' },
  },
  rows: rowIds.map((id, index) => makeRow(id, index + 1)),
  identifierMapped: true,
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
      apply(store.batch, args.data)
      return structuredClone(store.batch)
    }),
  },
  dataImportRow: {
    findMany: vi.fn(async (args: { where: { id: { in: string[] }; importBatchId: string } }) =>
      store.rows
        .filter(
          (row) =>
            args.where.id.in.includes(row.id) && row.importBatchId === args.where.importBatchId,
        )
        .map((row) => structuredClone(row)),
    ),
    updateMany: vi.fn(async (args: { where: Json; data: Json }) => {
      const where = args.where as { id: string; status: { in: string[] }; resolvedAt: null }
      const row = rowById(where.id)
      if (!row || !where.status.in.includes(row.status) || row.resolvedAt !== null) {
        return { count: 0 }
      }
      apply(row as unknown as Json, args.data)
      return { count: 1 }
    }),
    update: vi.fn(async (args: { where: { id: string }; data: Json }) => {
      const row = rowById(args.where.id)
      if (!row) throw new Error('missing row')
      apply(row as unknown as Json, args.data)
      return row
    }),
    groupBy: vi.fn(async () => {
      const counts = new Map<string, number>()
      for (const row of store.rows) counts.set(row.status, (counts.get(row.status) ?? 0) + 1)
      return [...counts].map(([status, count]) => ({ status, _count: { _all: count } }))
    }),
  },
  metadataMapping: {
    findFirst: vi.fn(async () => (store.identifierMapped ? { id: 'mapping' } : null)),
  },
  beneficiary: {
    findUnique: vi.fn(async () => null),
    findFirst: vi.fn(async () => null),
    createMany: vi.fn(async (_args: { data: Json }) => ({ count: 1 })),
    updateMany: vi.fn(async () => ({ count: 1 })),
  },
  importValueRejection: { findMany: vi.fn(async () => []) },
  beneficiaryIdentifier: { findUnique: vi.fn(async () => null), create: vi.fn() },
  beneficiaryProjectEnrollment: {
    findUnique: vi.fn(async () => null),
    findFirst: vi.fn(async () => null),
    create: vi.fn(async () => ({ id: 'enrollment' })),
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
  new GuardianApprovalService({} as PrismaService, new BeneficiaryRegistrationService())

const approve = (body: Json = {}, project = projectId) =>
  service().approve(projectOfficer, project, batchId, { rowIds, ...body } as never)

const writes = () => [
  fakeTx.dataImportRow.updateMany,
  fakeTx.dataImportRow.update,
  fakeTx.dataImportBatch.update,
  fakeTx.beneficiary.createMany,
  fakeTx.beneficiaryConsentRecord.createMany,
  fakeTx.auditLog.create,
]
const expectNoWrites = () => {
  for (const write of writes()) expect(write).not.toHaveBeenCalled()
}
const consentRecords = () =>
  fakeTx.beneficiaryConsentRecord.createMany.mock.calls.flatMap((call) => call[0].data)
const guardianRecords = () => consentRecords().filter((record) => record.kind === 'GUARDIAN')

describe('guardian approval', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers({ now, toFake: ['Date'] })
    store = createStore()
    state.actor = projectOfficer
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('select-all approves every held minor', async () => {
    await expect(approve()).resolves.toEqual({ approved: 3 })
    for (const row of store.rows) {
      expect(row).toMatchObject({
        status: 'PROCESSED',
        registrationOutcome: 'CREATED',
        resolutionData: { guardianApproval: true },
        resolvedById: actorId,
        processingClaimId: null,
      })
      expect(row.resolvedAt).toBeInstanceOf(Date)
    }
    const created = fakeTx.beneficiary.createMany.mock.calls.map((call) => call[0].data)
    expect(created).toHaveLength(3)
    for (const data of created) {
      expect(data).toMatchObject({ isMinor: true, guardianConsentRecorded: true })
    }
    expect(guardianRecords()).toHaveLength(3)
    // One batch claim and one reconcile for the whole request.
    expect(fakeTx.dataImportBatch.update).toHaveBeenCalledTimes(2)
    expect(store.batch).toMatchObject({ status: 'PROCESSED', processingClaimId: null })
  })

  it('records the approval in the audit with counts only', async () => {
    await approve()
    const approved = fakeTx.auditLog.create.mock.calls
      .map((call) => call[0].data)
      .filter((entry) => entry.action === 'GUARDIAN_CONSENT_APPROVED')
    expect(approved).toHaveLength(1)
    expect(approved[0]).toMatchObject({
      actorUserId: actorId,
      projectId,
      entityType: 'DataImportBatch',
      entityId: batchId,
      changes: { count: 3, withDetails: false },
    })
  })

  it('details stored only when given', async () => {
    await approve({ rowIds: [rowIds[0]] })
    expect(guardianRecords()).toHaveLength(1)
    const bare = guardianRecords()[0] as Json
    for (const key of ['guardianName', 'guardianConsentDate', 'guardianNote']) {
      expect(bare[key] ?? null).toBeNull()
    }

    fakeTx.beneficiaryConsentRecord.createMany.mockClear()
    fakeTx.auditLog.create.mockClear()
    await approve({ rowIds: [rowIds[1]], guardianName: 'Parent Name' })
    const named = guardianRecords()[0] as Json
    expect(named.guardianName).toBe('Parent Name')
    for (const key of ['guardianConsentDate', 'guardianNote']) {
      expect(named[key] ?? null).toBeNull()
    }

    fakeTx.beneficiaryConsentRecord.createMany.mockClear()
    fakeTx.auditLog.create.mockClear()
    await approve({
      rowIds: [rowIds[2]],
      guardianName: 'Parent Name',
      consentDate: '2026-10-20',
      note: 'Signed form on file',
    })
    expect(guardianRecords()[0]).toMatchObject({
      guardianName: 'Parent Name',
      guardianConsentDate: new Date('2026-10-20T00:00:00.000Z'),
      guardianNote: 'Signed form on file',
    })
    const entry = fakeTx.auditLog.create.mock.calls
      .map((call) => call[0].data)
      .find((item) => item.action === 'GUARDIAN_CONSENT_APPROVED')
    expect(entry?.changes).toEqual({ count: 1, withDetails: true })
  })

  it('writes no detail values into the audit', async () => {
    await approve({ guardianName: 'Parent Name', note: 'Signed form on file' })
    expect(JSON.stringify(fakeTx.auditLog.create.mock.calls)).not.toMatch(
      /Parent Name|Signed form|S-1|Child1/,
    )
  })

  it('M&E officer is 403', async () => {
    state.actor = mneOfficer
    await expect(
      service().approve(mneOfficer, projectId, batchId, { rowIds } as never),
    ).rejects.toMatchObject({ status: 403 })
    expectNoWrites()
    expect(fakeTx.dataImportRow.findMany).not.toHaveBeenCalled()
    expect(store.rows.every((row) => row.status === 'UNPROCESSED')).toBe(true)
  })

  describe.each([
    ['a data conflict', { processingErrorCode: 'PROFILE_CHANGED' }],
    ['a processed row', { status: 'PROCESSED', processingErrorCode: null }],
    ['an invalid row', { status: 'INVALID', processingErrorCode: null }],
    ['a resolved row', { resolvedAt: createdAt }],
  ])('a non-guardian row in the list rejects the request (%s)', (_name, patch) => {
    it('is 409 and writes nothing', async () => {
      store.rows[1] = { ...store.rows[1], ...patch } as never
      const before = structuredClone(store.rows)
      await expect(approve()).rejects.toBeInstanceOf(ConflictException)
      expectNoWrites()
      expect(store.rows).toEqual(before)
    })
  })

  it('a non-guardian row in the list rejects the request (a row of another batch)', async () => {
    store.rows[2] = { ...store.rows[2], importBatchId: '50000000-0000-4000-8000-0000000000ee' }
    await expect(approve()).rejects.toBeInstanceOf(ConflictException)
    expectNoWrites()
  })

  it('refuses while another worker holds a live processing claim', async () => {
    store.batch.processingClaimId = '70000000-0000-4000-8000-000000000007'
    store.batch.processingClaimedAt = new Date()
    await expect(approve()).rejects.toBeInstanceOf(ConflictException)
    expectNoWrites()
  })

  it('rejects a mixed-case duplicate id before any write', async () => {
    const id = 'abcdefab-0000-4000-8000-00000000000a'
    await expect(approve({ rowIds: [id, id.toUpperCase()] })).rejects.toBeInstanceOf(
      BadRequestException,
    )
    expectNoWrites()
  })

  describe('cross-project batch 404', () => {
    it('is 404 before any row is read', async () => {
      await expect(approve({}, otherProjectId)).rejects.toBeInstanceOf(NotFoundException)
      expect(fakeTx.dataImportRow.findMany).not.toHaveBeenCalled()
      expectNoWrites()
    })

    it('is 404 for a project the officer is not assigned to', async () => {
      state.actor = { ...projectOfficer, assignedProjectIds: [otherProjectId] }
      await expect(approve()).rejects.toBeInstanceOf(NotFoundException)
      expect(fakeTx.dataImportRow.findMany).not.toHaveBeenCalled()
      expectNoWrites()
    })
  })

  it('participant who turned 18 processes without guardian consent', async () => {
    store.rows[0].normalizedData = heldValues(1, turned18)
    await expect(
      approve({ rowIds: [rowIds[0]], guardianName: 'Parent Name', consentDate: '2026-10-20' }),
    ).resolves.toEqual({ approved: 1 })
    expect(fakeTx.beneficiary.createMany).toHaveBeenCalledWith({
      data: expect.objectContaining({ isMinor: false, guardianConsentRecorded: false }),
    })
    expect(guardianRecords()).toHaveLength(0)
    expect(consentRecords().map((record) => record.kind)).toEqual([
      'PARTICIPATION',
      'DATA_PROCESSING',
    ])
    expect(store.rows[0]).toMatchObject({ status: 'PROCESSED', registrationOutcome: 'CREATED' })
  })

  it('refuses a consent date after the business date before any write', async () => {
    // The business date is 2026-10-26 in Manila.
    await expect(approve({ consentDate: '2026-10-27' })).rejects.toBeInstanceOf(BadRequestException)
    expectNoWrites()
    expect(fakeTx.dataImportRow.findMany).not.toHaveBeenCalled()
    await expect(approve({ rowIds: [rowIds[0]], consentDate: '2026-10-26' })).resolves.toEqual({
      approved: 1,
    })
  })

  it('processes without guardian consent when the 18th birthday is the approval date', async () => {
    store.rows[0].normalizedData = heldValues(1, { ...turned18, birth_date: '2008-10-26' })
    // One day younger: still a minor on the approval date.
    store.rows[1].normalizedData = heldValues(2, { ...turned18, birth_date: '2008-10-27' })
    await expect(approve({ rowIds: [rowIds[0], rowIds[1]] })).resolves.toEqual({ approved: 2 })
    const created = fakeTx.beneficiary.createMany.mock.calls.map((call) => call[0].data)
    expect(created[0]).toMatchObject({ isMinor: false, guardianConsentRecorded: false })
    expect(created[1]).toMatchObject({ isMinor: true, guardianConsentRecorded: true })
    expect(guardianRecords()).toHaveLength(1)
  })

  it('processes a batch whose identifier is not mapped by the row code', async () => {
    store.identifierMapped = false
    await expect(approve()).resolves.toEqual({ approved: 3 })
    expect(guardianRecords()).toHaveLength(3)
  })

  it('holds a row that no longer matches as the same participant', async () => {
    // The Student ID now belongs to a participant whose name differs from the file.
    fakeTx.beneficiaryIdentifier.findUnique.mockResolvedValueOnce({
      beneficiaryId: 'person',
    } as never)
    fakeTx.beneficiaryProjectEnrollment.findUnique.mockResolvedValueOnce(null)
    fakeTx.beneficiary.findFirst.mockResolvedValueOnce({
      firstName: 'Other',
      lastName: 'Person',
      birthDate: new Date('1990-01-01T00:00:00.000Z'),
    } as never)
    await expect(approve({ rowIds: [rowIds[0]] })).rejects.toThrow(
      'This row can no longer be approved here.',
    )
    expectNoWrites()
  })
})
