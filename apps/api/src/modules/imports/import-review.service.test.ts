import { BadRequestException, ConflictException } from '@nestjs/common'
import { hasAtomicPermission, rolePermissions } from '@pathways/shared'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { PrismaService } from '@app/prisma/prisma.service'
import type { ApplicationIdentity } from '../../common/authz/application-identity'
import type { BeneficiaryRegistrationService } from '../beneficiaries/beneficiary-registration.service'
import { ImportReviewService } from './import-review.service'
import { valueHash } from './participant-match'

type Json = Record<string, unknown>

const organizationId = '10000000-0000-4000-8000-000000000001'
const actorId = '20000000-0000-4000-8000-000000000002'
const projectId = '30000000-0000-4000-8000-000000000003'
const formId = '40000000-0000-4000-8000-000000000004'
const batchId = '50000000-0000-4000-8000-000000000005'
const heldRowId = '60000000-0000-4000-8000-000000000001'
const dateRowId = '60000000-0000-4000-8000-000000000002'
const ageRowId = '60000000-0000-4000-8000-000000000003'
const knownRowId = '60000000-0000-4000-8000-000000000004'
const personId = '70000000-0000-4000-8000-000000000007'
const createdAt = new Date('2026-10-03T00:00:00.000Z')

const actor: ApplicationIdentity = {
  id: '90000000-0000-4000-8000-000000000009',
  aal: 'aal2',
  userId: actorId,
  organizationId,
  fullName: 'Synthetic M&E actor',
  roles: ['MONITORING_AND_EVALUATION_OFFICER'],
  permissions: [
    'imports.read',
    'imports.review',
    'imports.process',
    'beneficiaries.records.register',
    'beneficiaries.identities.review',
  ],
  assignedProjectIds: [projectId],
}

let fieldNumber = 0
const field = (code: string, patch: Json = {}) => ({
  id: `41000000-0000-4000-8000-${String(++fieldNumber).padStart(12, '0')}`,
  code,
  label: code,
  dataType: 'TEXT',
  isRequired: false,
  allowedValues: null,
  minimumValue: null,
  maximumValue: null,
  minimumDate: null,
  maximumDate: null,
  minimumLength: null,
  maximumLength: null,
  isMetadataKey: false,
  isSadddField: false,
  sourceNames: [],
  valueAliases: null,
  importDefault: null,
  rule: null,
  ...patch,
})

const fields = [
  field('registration_operation', {
    dataType: 'SELECT',
    allowedValues: ['CREATE', 'LINK', 'UPDATE'],
    importDefault: 'CREATE',
  }),
  field('beneficiary_code', { isRequired: true }),
  field('first_name'),
  field('last_name'),
  field('birth_date', { dataType: 'DATE' }),
  field('civil_status', { dataType: 'SELECT', allowedValues: ['Single', 'Married'] }),
  field('age_stated', {
    dataType: 'INTEGER',
    rule: { kind: 'AGE_CHECK', birthField: 'birth_date', atFields: ['enrollment_date'] },
  }),
  field('enrollment_date', { dataType: 'DATE' }),
  field('consent_recorded', { dataType: 'BOOLEAN' }),
  field('data_processing_consent_recorded', {
    dataType: 'BOOLEAN',
    rule: { kind: 'SAME_ANSWER_AS', field: 'consent_recorded' },
  }),
  field('guardian_consent_recorded', { dataType: 'BOOLEAN' }),
  field('wg_seeing', {
    dataType: 'SELECT',
    allowedValues: ['No difficulty', 'Some difficulty', 'A lot of difficulty', 'Cannot do at all'],
  }),
  field('disability_status', {
    dataType: 'SELECT',
    allowedValues: ['WITH_DISABILITY', 'WITHOUT_DISABILITY', 'NOT_SPECIFIED'],
    rule: {
      kind: 'WASHINGTON_GROUP_DISABILITY',
      questionFields: [
        'wg_seeing',
        'wg_hearing',
        'wg_walking',
        'wg_remembering',
        'wg_selfcare',
        'wg_talking',
      ],
      disabilityValues: ['Some difficulty', 'A lot of difficulty', 'Cannot do at all'],
    },
  }),
  field('external_identifier_type', { importDefault: 'STUDENT_ID' }),
  field('external_identifier_value'),
  field('profile_update_fields', {
    dataType: 'MULTIPLE_SELECT',
    allowedValues: ['first_name', 'last_name', 'birth_date', 'disability_status'],
  }),
]
const fieldId = (code: string) => fields.find((item) => item.code === code)?.id

const columns = [
  'beneficiary_code',
  'first_name',
  'last_name',
  'birth_date',
  'civil_status',
  'age_stated',
  'enrollment_date',
  'consent_recorded',
  'external_identifier_value',
]

const stored = {
  registration_operation: 'LINK',
  beneficiary_code: 'PW0000000001',
  first_name: 'Ana',
  last_name: 'Cruz',
  birth_date: '1990-01-01',
  civil_status: 'Single',
  age_stated: 36,
  enrollment_date: '2026-01-01',
  consent_recorded: true,
  data_processing_consent_recorded: true,
  guardian_consent_recorded: null,
  wg_seeing: 'No difficulty',
  disability_status: 'NOT_SPECIFIED',
  external_identifier_type: 'STUDENT_ID',
  external_identifier_value: 'S-1',
  profile_update_fields: null,
}

const fileValues = {
  ...stored,
  registration_operation: 'CREATE',
  beneficiary_code: 'PART-FILE-1',
  last_name: 'Santos',
  civil_status: 'Married',
}

const makeRow = (id: string, rowNumber: number, patch: Json) => ({
  id,
  organizationId,
  projectId,
  importBatchId: batchId,
  rowNumber,
  rawData: {},
  status: 'UNPROCESSED',
  mappingRevision: 1,
  validationRevision: 1,
  processingClaimId: null as string | null,
  processingClaimedAt: null as Date | null,
  processingAttempts: 1,
  processingErrorCode: null as string | null,
  registrationOutcome: null as string | null,
  processedAt: null as Date | null,
  normalizedData: null as Json | null,
  validationErrors: [] as unknown[],
  resolutionData: null as Json | null,
  resolvedById: null as string | null,
  resolvedAt: null as Date | null,
  ...patch,
})

const rawRow = (patch: Json) => ({
  column_0001: 'PART-FILE-2',
  column_0002: 'Ben',
  column_0003: 'Reyes',
  column_0004: '1990-02-02',
  column_0005: 'Single',
  column_0006: '36',
  column_0007: '2026-01-01',
  column_0008: 'true',
  column_0009: 'S-7',
  ...patch,
})

interface Store {
  batch: Json
  rows: ReturnType<typeof makeRow>[]
}

function createStore(): Store {
  return {
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
    rows: [
      makeRow(heldRowId, 2, {
        normalizedData: fileValues,
        processingErrorCode: 'PROFILE_CHANGED',
      }),
      makeRow(dateRowId, 3, {
        status: 'INVALID',
        rawData: rawRow({ column_0004: 'not a date' }),
        validationErrors: [{ fieldCode: 'birth_date', code: 'AMBIGUOUS_DATE', message: 'x' }],
      }),
      makeRow(ageRowId, 4, {
        status: 'INVALID',
        rawData: rawRow({ column_0004: '1990-01-01', column_0006: '25', column_0009: 'S-8' }),
        validationErrors: [{ fieldCode: 'age_stated', code: 'AGE_MISMATCH', message: 'x' }],
      }),
      // The participant of the held row, whose age is wrong in the file.
      makeRow(knownRowId, 5, {
        status: 'INVALID',
        rawData: rawRow({
          column_0001: 'PART-FILE-3',
          column_0002: 'Ana',
          column_0003: 'Cruz',
          column_0004: '1990-01-01',
          column_0006: '25',
          column_0009: 'S-1',
        }),
        validationErrors: [{ fieldCode: 'age_stated', code: 'AGE_MISMATCH', message: 'x' }],
      }),
    ],
  }
}

const state = vi.hoisted(() => ({ actor: undefined as unknown }))
let store: Store

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

const mappings = columns.map((code, index) => ({
  sourceFieldName: `column_000${index + 1}`,
  status: 'MAPPED',
  dataType: null,
  valueMap: null,
  dateOrder: null,
  targetField: fields.find((item) => item.code === code),
}))

// The latest registration of the participant, as the matcher reads it.
const submissionOf = (values: Json) => ({
  formResponseValue_submission: Object.entries(values).map(([code, value]) => ({
    field: { code },
    value,
  })),
})

const fakeTx = {
  $queryRaw: vi.fn(async (sql: { values: unknown[] }) =>
    sql.values.includes(store.batch.projectId) && sql.values.includes(organizationId)
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
    findFirst: vi.fn(async (args: { where: Json }) => {
      const row = rowById(args.where.id as string)
      const scoped =
        row &&
        row.organizationId === args.where.organizationId &&
        row.projectId === args.where.projectId &&
        row.importBatchId === args.where.importBatchId
      return scoped ? structuredClone(row) : null
    }),
    findMany: vi.fn(async () => store.rows.map((row) => ({ rawData: row.rawData }))),
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
  metadataMapping: { findMany: vi.fn(async () => mappings) },
  formField: { findMany: vi.fn(async () => fields) },
  beneficiaryIdentifier: {
    findUnique: vi.fn(
      async (args: {
        where: { organizationId_identifierType_normalizedValue: { normalizedValue: string } }
      }) =>
        args.where.organizationId_identifierType_normalizedValue.normalizedValue === 'S-1'
          ? { beneficiaryId: personId }
          : null,
    ),
  },
  beneficiaryProjectEnrollment: { findUnique: vi.fn(async () => ({ id: 'enrollment' })) },
  formSubmission: { findFirst: vi.fn(async () => submissionOf(stored)) },
  beneficiary: {
    findFirst: vi.fn(async () => ({
      code: 'PW0000000001',
      displayName: 'Ana Cruz',
      firstName: 'Ana',
      lastName: 'Cruz',
      birthDate: new Date('1990-01-01T00:00:00.000Z'),
    })),
    findUnique: vi.fn(async () => null),
  },
  importValueRejection: { findMany: vi.fn(async () => []), createMany: vi.fn() },
  auditLog: { create: vi.fn(async () => ({ id: 'audit' })) },
}

// Stands in for the registration service and holds the line the database holds: a processing row of a processing batch.
const registration = {
  readRegistrationForm: vi.fn(async () => ({
    id: formId,
    projectId,
    version: 1,
    status: 'PUBLISHED',
    formField_form: fields,
  })),
  promoteRegistration: vi.fn(
    async (_tx: unknown, _who: unknown, input: { importRowId: string }) => {
      const row = rowById(input.importRowId)
      if (
        row?.status !== 'PROCESSING' ||
        store.batch.status !== 'PROCESSING' ||
        !row.resolutionData
      ) {
        throw new Error('Imported submissions require a currently reviewed processing row')
      }
      return {
        kind: 'PROCESSED',
        beneficiaryId: personId,
        enrollmentId: 'enrollment',
        submissionId: 'submission',
      }
    },
  ),
}

const service = () =>
  new ImportReviewService(
    {} as PrismaService,
    registration as unknown as BeneficiaryRegistrationService,
  )

const review = (rowId = heldRowId) => service().review(actor, projectId, batchId, rowId)
const resolve = (body: Json, rowId = heldRowId) =>
  service().resolve(actor, projectId, batchId, rowId, {
    expectedValidationRevision: 1,
    saveAs: 'UPDATE',
    choices: {},
    own: {},
    ...body,
  } as never)

// Choices that settle both changed fields of the held row.
const keepBoth = { last_name: 'FILE', civil_status: 'FILE' } as const

const writes = () => [
  fakeTx.dataImportRow.updateMany,
  fakeTx.dataImportRow.update,
  fakeTx.dataImportBatch.update,
  fakeTx.importValueRejection.createMany,
  fakeTx.auditLog.create,
  registration.promoteRegistration,
]

const expectNoWrites = () => {
  for (const write of writes()) expect(write).not.toHaveBeenCalled()
}

beforeEach(() => {
  vi.clearAllMocks()
  fakeTx.importValueRejection.findMany.mockResolvedValue([])
  fakeTx.formSubmission.findFirst.mockImplementation(async () => submissionOf(stored) as never)
  state.actor = structuredClone(actor)
  store = createStore()
})

describe('review', () => {
  it('review lists changed fields with PATHWAYS and file values', async () => {
    const result = await review()

    expect(result).toMatchObject({
      rowId: heldRowId,
      rowNumber: 2,
      reason: 'PROFILE_CHANGED',
      participant: { beneficiaryId: personId, clientId: 'S-1', displayName: 'Ana Cruz' },
      canAddNew: true,
    })
    const byCode = Object.fromEntries(result.fields.map((item) => [item.code, item]))
    expect(byCode.last_name).toMatchObject({ pathways: 'Cruz', file: 'Santos', changed: true })
    expect(byCode.civil_status).toMatchObject({
      pathways: 'Single',
      file: 'Married',
      options: ['Single', 'Married'],
      changed: true,
    })
    expect(byCode.first_name).toMatchObject({ pathways: 'Ana', file: 'Ana', changed: false })
    expect(result.fields.map((item) => item.code)).not.toContain('beneficiary_code')
    expect(registration.promoteRegistration).not.toHaveBeenCalled()
  })

  it('review shows calculated value for a mismatch', async () => {
    const result = await review(ageRowId)

    expect(result.reason).toBe('AGE_MISMATCH')
    expect(result.participant).toBeNull()
    // Born 1990-01-01 and measured on the Manila upload date 2026-10-03.
    expect(result.fields.find((item) => item.code === 'age_stated')).toMatchObject({
      file: 25,
      calculated: 36,
    })
  })

  it('an invalid row of an updated participant shows no change PATHWAYS made itself', async () => {
    // An earlier update stored profile_update_fields and the approval stored guardian consent.
    fakeTx.formSubmission.findFirst.mockImplementation(
      async () =>
        submissionOf({
          ...stored,
          profile_update_fields: ['last_name'],
          guardian_consent_recorded: true,
          disability_status: null,
        }) as never,
    )

    const result = await review(knownRowId)

    expect(result.participant).toMatchObject({ clientId: 'S-1' })
    expect(result.fields.filter((item) => item.changed)).toEqual([])
    expect(result.fields.map((item) => item.code)).not.toContain('profile_update_fields')
  })

  it('a row of another batch or project is 404 and nothing is read from it', async () => {
    await expect(
      service().review(actor, projectId, batchId, heldRowId.replace('6', '7')),
    ).rejects.toThrow('Import row unavailable.')
    expect(fakeTx.formSubmission.findFirst).not.toHaveBeenCalled()
  })
})

describe('resolve', () => {
  const rejectedMarried = () =>
    fakeTx.importValueRejection.findMany.mockResolvedValue([
      { fieldId: fieldId('civil_status') as string, valueHash: valueHash('Married') },
    ] as never)

  it('a typed answer and a calculated choice save the value recomputed from it', async () => {
    await resolve({
      choices: { ...keepBoth, wg_seeing: 'OWN', disability_status: 'CALCULATED' },
      own: { wg_seeing: 'A lot of difficulty' },
    })

    const [, , input] = registration.promoteRegistration.mock.calls[0] as unknown as [
      unknown,
      unknown,
      { values: Json },
    ]
    expect(input.values).toMatchObject({
      wg_seeing: 'A lot of difficulty',
      disability_status: 'WITH_DISABILITY',
      registration_operation: 'UPDATE',
    })
  })

  it('a rejected file value is not shown as changed and needs no choice', async () => {
    rejectedMarried()
    const shown = await review()
    expect(shown.fields.find((item) => item.code === 'civil_status')?.changed).toBe(false)
    expect(shown.fields.find((item) => item.code === 'last_name')?.changed).toBe(true)

    rejectedMarried()
    await expect(resolve({ choices: { last_name: 'FILE' } })).resolves.toEqual({
      status: 'PROCESSED',
    })
  })

  it('a rejected value nobody re-chose keeps the PATHWAYS value', async () => {
    rejectedMarried()
    await resolve({ choices: { last_name: 'FILE' } })

    const [, , input] = registration.promoteRegistration.mock.calls[0] as unknown as [
      unknown,
      unknown,
      { values: Json },
    ]
    expect(input.values).toMatchObject({ civil_status: 'Single', last_name: 'Santos' })
  })

  it('a held row without a hold code is refused', async () => {
    store.rows[0].processingErrorCode = null

    await expect(resolve({ choices: keepBoth })).rejects.toBeInstanceOf(ConflictException)
    expectNoWrites()
  })

  it('an answer the form does not offer keeps the row held', async () => {
    await expect(
      resolve({
        choices: { last_name: 'FILE', civil_status: 'OWN' },
        own: { civil_status: 'Divorced' },
      }),
    ).rejects.toMatchObject({
      response: { errors: [expect.objectContaining({ fieldCode: 'civil_status' })] },
    })
    expectNoWrites()
    expect(store.rows[0]).toMatchObject({ status: 'UNPROCESSED', resolvedAt: null })
  })

  it('a system administrator without registration permission is refused before any read', async () => {
    state.actor = {
      ...actor,
      roles: ['SYSTEM_ADMINISTRATOR'],
      permissions: [...rolePermissions.SYSTEM_ADMINISTRATOR],
    }

    await expect(resolve({ saveAs: 'NEW' })).rejects.toThrow('registration permission')
    expect(fakeTx.$queryRaw).not.toHaveBeenCalled()
    expectNoWrites()
  })

  it('own value saved and row processed', async () => {
    const result = await resolve({
      choices: { last_name: 'OWN', civil_status: 'FILE' },
      own: { last_name: 'De la Cruz' },
    })

    expect(result).toEqual({ status: 'PROCESSED' })
    const [, , input] = registration.promoteRegistration.mock.calls[0] as unknown as [
      unknown,
      unknown,
      { values: Json; matchByIdentifier: boolean; importRowId: string; validatedById: string },
    ]
    expect(input).toMatchObject({
      matchByIdentifier: true,
      importRowId: heldRowId,
      validatedById: actorId,
      values: {
        registration_operation: 'UPDATE',
        beneficiary_code: 'PW0000000001',
        last_name: 'De la Cruz',
        civil_status: 'Married',
        profile_update_fields: ['last_name'],
      },
    })
    expect(store.rows[0]).toMatchObject({
      status: 'PROCESSED',
      registrationOutcome: 'UPDATED',
      resolvedById: actorId,
      processingClaimId: null,
      normalizedData: fileValues,
      resolutionData: {
        saveAs: 'UPDATE',
        choices: { last_name: 'OWN', civil_status: 'FILE' },
        values: { last_name: 'De la Cruz' },
      },
    })
    expect(store.rows[0].resolvedAt).toBeInstanceOf(Date)
    // The batch is released with fresh counts: three invalid rows remain.
    expect(store.batch).toMatchObject({
      status: 'PARTIALLY_PROCESSED',
      processedRows: 1,
      invalidRows: 3,
      processingClaimId: null,
    })
  })

  it('an invalid row of an updated participant can be confirmed without choosing for system fields', async () => {
    fakeTx.formSubmission.findFirst.mockImplementation(
      async () =>
        submissionOf({
          ...stored,
          disability_status: null,
          profile_update_fields: ['last_name'],
        }) as never,
    )

    await expect(resolve({ choices: { age_stated: 'CALCULATED' } }, knownRowId)).resolves.toEqual({
      status: 'PROCESSED',
    })
  })

  it('your value over a differing file value is remembered, so the next upload does not hold it', async () => {
    await resolve({
      choices: { last_name: 'OWN', civil_status: 'FILE' },
      own: { last_name: 'De la Cruz' },
    })

    expect(fakeTx.importValueRejection.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({ fieldId: fieldId('last_name'), valueHash: valueHash('Santos') }),
      ],
      skipDuplicates: true,
    })
    // The same file again: the remembered value no longer counts as a change.
    fakeTx.importValueRejection.findMany.mockResolvedValue([
      { fieldId: fieldId('last_name') as string, valueHash: valueHash('Santos') },
    ] as never)
    Object.assign(store.rows[0], {
      status: 'UNPROCESSED',
      processingErrorCode: 'PROFILE_CHANGED',
      resolvedAt: null,
      resolvedById: null,
      resolutionData: null,
    })
    const again = await review()
    expect(again.fields.find((item) => item.code === 'last_name')?.changed).toBe(false)
    expect(again.fields.find((item) => item.code === 'civil_status')?.changed).toBe(true)
  })

  it('a calculated value over a differing file value is remembered too', async () => {
    store.rows[0].normalizedData = { ...fileValues, disability_status: 'WITH_DISABILITY' }
    await resolve({
      choices: { last_name: 'FILE', civil_status: 'FILE', disability_status: 'CALCULATED' },
    })

    const remembered = fakeTx.importValueRejection.createMany.mock.calls.flatMap(
      (call) => (call[0] as { data: Json[] }).data,
    )
    expect(remembered).toEqual([
      expect.objectContaining({
        fieldId: fieldId('disability_status'),
        valueHash: valueHash('WITH_DISABILITY'),
      }),
    ])
  })

  it('keep PATHWAYS records a rejection', async () => {
    await resolve({ choices: { last_name: 'FILE', civil_status: 'PATHWAYS' } })

    expect(fakeTx.importValueRejection.createMany).toHaveBeenCalledWith({
      data: [
        {
          organizationId,
          projectId,
          beneficiaryId: personId,
          fieldId: fieldId('civil_status'),
          valueHash: valueHash('Married'),
          rejectedById: actorId,
        },
      ],
      skipDuplicates: true,
    })
    const [, , input] = registration.promoteRegistration.mock.calls[0] as unknown as [
      unknown,
      unknown,
      { values: Json },
    ]
    expect(input.values).toMatchObject({ civil_status: 'Single', last_name: 'Santos' })
  })

  it('a changed answer that is not a profile field links a new registration', async () => {
    await resolve({ choices: { last_name: 'PATHWAYS', civil_status: 'FILE' } })

    const [, , input] = registration.promoteRegistration.mock.calls[0] as unknown as [
      unknown,
      unknown,
      { values: Json },
    ]
    expect(input.values).toMatchObject({ registration_operation: 'LINK', last_name: 'Cruz' })
    expect(input.values).toMatchObject({ profile_update_fields: null })
    expect(store.rows[0].registrationOutcome).toBe('LINKED')
  })

  it('NEW needs a new client id', async () => {
    await expect(resolve({ saveAs: 'NEW' })).rejects.toMatchObject({
      response: { errors: [expect.objectContaining({ fieldCode: 'external_identifier_value' })] },
    })
    expectNoWrites()
    expect(store.rows[0].status).toBe('UNPROCESSED')

    await resolve({
      saveAs: 'NEW',
      choices: { external_identifier_value: 'OWN' },
      own: { external_identifier_value: 'S-9' },
    })

    const [, , input] = registration.promoteRegistration.mock.calls[0] as unknown as [
      unknown,
      unknown,
      { values: Json },
    ]
    expect(input.values).toMatchObject({
      registration_operation: 'CREATE',
      beneficiary_code: 'PART-FILE-1',
      external_identifier_value: 'S-9',
    })
    expect(fakeTx.importValueRejection.createMany).not.toHaveBeenCalled()
    expect(store.rows[0]).toMatchObject({ status: 'PROCESSED', registrationOutcome: 'CREATED' })
  })

  it('invalid own value keeps the row held', async () => {
    const attempt = resolve({
      choices: { ...keepBoth, birth_date: 'OWN' },
      own: { birth_date: 'not a date' },
    })

    await expect(attempt).rejects.toBeInstanceOf(BadRequestException)
    await expect(attempt).rejects.toMatchObject({
      response: { errors: [expect.objectContaining({ fieldCode: 'birth_date' })] },
    })
    expectNoWrites()
    expect(store.rows[0]).toMatchObject({
      status: 'UNPROCESSED',
      resolvedAt: null,
      resolutionData: null,
    })
  })

  it('a changed field with no choice is refused before any write', async () => {
    await expect(resolve({ choices: { last_name: 'FILE' } })).rejects.toMatchObject({
      response: {
        errors: [expect.objectContaining({ fieldCode: 'civil_status', code: 'choice_required' })],
      },
    })
    expectNoWrites()
  })

  it('consent cannot be typed into Your value', async () => {
    await expect(
      resolve({
        choices: { ...keepBoth, consent_recorded: 'OWN' },
        own: { consent_recorded: true },
      }),
    ).rejects.toMatchObject({
      response: { errors: [expect.objectContaining({ fieldCode: 'consent_recorded' })] },
    })
    expectNoWrites()
  })

  it('an oversized own value is refused before any write', async () => {
    await expect(
      resolve({
        choices: { ...keepBoth, first_name: 'OWN' },
        own: { first_name: 'x'.repeat(100_000) },
      }),
    ).rejects.toMatchObject({
      response: {
        errors: [expect.objectContaining({ fieldCode: 'first_name', code: 'too_long' })],
      },
    })
    expectNoWrites()
  })

  it('second resolve conflicts', async () => {
    const body = { choices: keepBoth }
    await resolve(body)

    await expect(resolve(body)).rejects.toBeInstanceOf(ConflictException)

    // The second request read the row again and met the first one's result.
    expect(fakeTx.dataImportRow.findFirst).toHaveBeenCalledTimes(2)
    expect(fakeTx.dataImportRow.updateMany).toHaveBeenCalledTimes(1)
    expect(registration.promoteRegistration).toHaveBeenCalledTimes(1)
    expect(fakeTx.auditLog.create).toHaveBeenCalledTimes(1)
  })

  it('simultaneous resolves process once', async () => {
    const results = await Promise.allSettled([
      resolve({ choices: keepBoth }),
      resolve({ choices: keepBoth }),
    ])

    expect(results.map((item) => item.status).sort()).toEqual(['fulfilled', 'rejected'])
    expect(
      (results.find((item) => item.status === 'rejected') as PromiseRejectedResult).reason,
    ).toBeInstanceOf(ConflictException)
    expect(registration.promoteRegistration).toHaveBeenCalledTimes(1)
  })

  it('a live processing claim on the batch refuses with 409', async () => {
    Object.assign(store.batch, {
      status: 'PROCESSING',
      processingClaimId: 'claim',
      processingClaimedAt: new Date(),
    })

    await expect(resolve({ choices: keepBoth })).rejects.toBeInstanceOf(ConflictException)
    expectNoWrites()
  })

  describe('a minor who needs guardian consent', () => {
    const needsGuardian = () =>
      registration.promoteRegistration.mockResolvedValueOnce({
        kind: 'REVIEW',
        code: 'GUARDIAN_CONSENT_REQUIRED',
      } as never)

    // A new participant, who a Project Officer can approve.
    const asNew = {
      saveAs: 'NEW',
      choices: { external_identifier_value: 'OWN' },
      own: { external_identifier_value: 'S-9' },
    }

    it('is saved and parked for a Project Officer with the resolution kept', async () => {
      needsGuardian()

      await expect(resolve(asNew)).resolves.toEqual({
        status: 'WAITING_FOR_PROJECT_OFFICER',
      })

      expect(store.rows[0]).toMatchObject({
        status: 'UNPROCESSED',
        processingErrorCode: 'GUARDIAN_CONSENT_REQUIRED',
        processingClaimId: null,
        processingClaimedAt: null,
        resolvedById: actorId,
        resolutionData: { saveAs: 'NEW', choices: asNew.choices },
        registrationOutcome: null,
      })
      expect(store.rows[0].resolvedAt).toBeInstanceOf(Date)
      expect(store.batch).toMatchObject({ status: 'PARTIALLY_PROCESSED', processingClaimId: null })
      expect(fakeTx.auditLog.create).toHaveBeenCalledTimes(1)
    })

    it('an invalid row is parked too', async () => {
      needsGuardian()

      await expect(
        resolve(
          {
            saveAs: 'NEW',
            choices: { birth_date: 'OWN', age_stated: 'CALCULATED' },
            own: { birth_date: '2014-03-04' },
          },
          dateRowId,
        ),
      ).resolves.toEqual({ status: 'WAITING_FOR_PROJECT_OFFICER' })

      expect(store.rows[1]).toMatchObject({
        status: 'UNPROCESSED',
        processingErrorCode: 'GUARDIAN_CONSENT_REQUIRED',
        normalizedData: null,
        resolutionData: { saveAs: 'NEW', values: { birth_date: '2014-03-04' } },
      })
    })

    it('a row already held for guardian consent stays with the Project Officer', async () => {
      store.rows[0].processingErrorCode = 'GUARDIAN_CONSENT_REQUIRED'
      needsGuardian()

      await expect(resolve(asNew)).rejects.toThrow(
        'Row 2 still needs guardian consent. A Project Officer must approve it.',
      )
    })

    it('an update of an existing participant is 409 with its next step and is not parked', async () => {
      needsGuardian()

      await expect(resolve({ choices: keepBoth })).rejects.toMatchObject({
        response: {
          code: 'GUARDIAN_CONSENT_REQUIRED',
          message: expect.stringContaining('Row 2 still needs review'),
        },
      })
      // Nothing parked it; the real transaction rolls the claim back.
      expect(store.rows[0].processingErrorCode).toBeNull()
    })

    it('a held guardian row of a participant who needs no approval any more is saved', async () => {
      store.rows[0].processingErrorCode = 'GUARDIAN_CONSENT_REQUIRED'

      await expect(resolve({ choices: keepBoth })).resolves.toEqual({ status: 'PROCESSED' })
      expect(store.rows[0]).toMatchObject({ status: 'PROCESSED', resolvedById: actorId })
    })
  })

  it('a row the registration still sends to review is 409 with its next step', async () => {
    registration.promoteRegistration.mockResolvedValueOnce({
      kind: 'REVIEW',
      code: 'CONSENT_REQUIRED',
    } as never)

    await expect(resolve({ choices: keepBoth })).rejects.toMatchObject({
      response: {
        code: 'CONSENT_REQUIRED',
        message: expect.stringContaining('upload a corrected file'),
      },
    })
  })

  it('a stale validation revision is refused', async () => {
    await expect(
      resolve({ choices: keepBoth, expectedValidationRevision: 2 }),
    ).rejects.toBeInstanceOf(ConflictException)
    expectNoWrites()
  })

  it('invalid row resolved after correcting the date', async () => {
    const result = await resolve(
      {
        saveAs: 'NEW',
        choices: { birth_date: 'OWN' },
        own: { birth_date: '1990-02-02' },
      },
      dateRowId,
    )

    expect(result).toEqual({ status: 'PROCESSED' })
    const invalid = store.rows[1]
    expect(invalid).toMatchObject({
      status: 'PROCESSED',
      registrationOutcome: 'CREATED',
      resolvedById: actorId,
      normalizedData: null,
      rawData: rawRow({ column_0004: 'not a date' }),
      validationErrors: [expect.objectContaining({ code: 'AMBIGUOUS_DATE' })],
      resolutionData: { saveAs: 'NEW', values: { birth_date: '1990-02-02', first_name: 'Ben' } },
    })
    const [, , input] = registration.promoteRegistration.mock.calls[0] as unknown as [
      unknown,
      unknown,
      { values: Json },
    ]
    expect(input.values).toMatchObject({
      registration_operation: 'CREATE',
      beneficiary_code: 'PART-FILE-2',
      external_identifier_value: 'S-7',
      birth_date: '1990-02-02',
    })
  })

  it('audit has choices and no values', async () => {
    await resolve({
      choices: { last_name: 'OWN', civil_status: 'PATHWAYS' },
      own: { last_name: 'De la Cruz' },
    })

    const entries = fakeTx.auditLog.create.mock.calls as unknown as Array<[{ data: Json }]>
    const resolved = entries.filter(([call]) => call.data.action === 'IMPORT_ROW_RESOLVED')
    expect(resolved).toHaveLength(1)
    expect(resolved[0][0].data).toMatchObject({
      projectId,
      entityType: 'DataImportRow',
      entityId: heldRowId,
      changes: {
        rowNumber: 2,
        reason: 'PROFILE_CHANGED',
        saveAs: 'UPDATE',
        choices: { last_name: 'OWN', civil_status: 'PATHWAYS' },
      },
    })
    expect(JSON.stringify(entries)).not.toMatch(/Cruz|Santos|Married|Single|S-1|Ana/)
  })
})
