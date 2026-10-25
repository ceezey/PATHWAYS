import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common'
import { rolePermissions } from '@pathways/shared'
import { Prisma } from '@prisma/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { PrismaService } from '@app/prisma/prisma.service'
import type { ApplicationIdentity } from '../../common/authz/application-identity'
import { BeneficiaryRegistrationService } from '../beneficiaries/beneficiary-registration.service'
import type { StorageService } from '../storage/storage.service'
import { mapStoredBatch } from './import-batches.service'
import { ImportsService } from './imports.service'
import { valueHash } from './participant-match'

type Json = Record<string, unknown>

interface FakeRow {
  id: string
  organizationId: string
  projectId: string
  importBatchId: string
  rowNumber: number
  rawData: Json
  status: string
  mappingRevision: number
  validationRevision: number
  processingClaimId: string | null
  processingClaimedAt: Date | null
  processingAttempts: number
  processingErrorCode: string | null
  registrationOutcome: string | null
  matchedBeneficiaryId: string | null
  normalizedData: Json | null
  validationErrors: unknown[]
  validationWarnings: unknown[]
}

interface FakeMapping {
  sourceFieldName: string
  status: 'MAPPED' | 'IGNORED'
  dataType?: string
  valueMap?: Array<{ from: string; to: string }>
  dateOrder?: string
  targetField: Json | null
}

const state = vi.hoisted(() => ({
  actor: undefined as unknown as ApplicationIdentity,
  store: undefined as unknown as Store,
}))

interface Store {
  batch: Json & { id: string; projectId: string; organizationId: string }
  rows: FakeRow[]
  mappings: FakeMapping[]
  fields: Json[]
  submissions: Array<{ id: string; importRowId: string }>
  existingCodes: Set<string>
  // Database state a later upload meets: profiles and their registration submissions.
  people: FakePerson[]
  registrations: Array<{
    id: string
    beneficiaryId: string
    projectId: string
    status: string
    values: Json
  }>
}

interface FakePerson {
  id: string
  code: string
  identifier: string | null
  enrolledIn: Set<string>
  guardianConsentRecorded: boolean
  firstName: string | null
  lastName: string | null
  birthDate: Date | null
  ageAtRegistration: number | null
  isMinor: boolean
  archivedAt: Date | null
}

vi.mock('../../common/authz/authorized-operation', () => ({
  withAuthorizedOperation: vi.fn(
    async (_prisma, _identity, permission, work: (tx: unknown, actor: unknown) => unknown) => {
      if (!state.actor.permissions.includes(permission)) {
        throw new ForbiddenException('Required application permission is missing.')
      }
      return work(fakeTx, state.actor)
    },
  ),
}))

const organizationId = '10000000-0000-4000-8000-000000000001'
const actorId = '20000000-0000-4000-8000-000000000002'
const projectId = '30000000-0000-4000-8000-000000000003'
const otherProjectId = '30000000-0000-4000-8000-0000000000ff'
const formId = '40000000-0000-4000-8000-000000000004'
const batchId = '50000000-0000-4000-8000-000000000005'
const publisherId = '20000000-0000-4000-8000-0000000000aa'
const now = new Date('2026-10-03T00:00:00.000Z')

const baseActor: ApplicationIdentity = {
  id: '90000000-0000-4000-8000-000000000009',
  aal: 'aal2',
  userId: actorId,
  organizationId,
  fullName: 'Synthetic M&E actor',
  roles: ['MONITORING_AND_EVALUATION_OFFICER'],
  permissions: ['imports.read', 'imports.review', 'imports.validate', 'imports.process'],
  assignedProjectIds: [projectId],
}

let fieldSequence = 0

const field = (code: string, patch: Json = {}) => ({
  id: `41000000-0000-4000-8000-${String(++fieldSequence).padStart(12, '0')}`,
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

const scoreField = field('score', { dataType: 'DECIMAL', isRequired: true })
const sexField = field('sex', { dataType: 'SELECT', allowedValues: ['Male', 'Female'] })
const enrolledField = field('enrolled', { dataType: 'BOOLEAN' })

const sourceHeaders = (count: number) =>
  Array.from({ length: count }, (_, index) => ({
    key: `column_000${index + 1}`,
    header: `Column ${index + 1}`,
    columnIndex: index + 1,
  }))

const mapped = (key: string, target: Json, patch: Partial<FakeMapping> = {}): FakeMapping => ({
  sourceFieldName: key,
  status: 'MAPPED',
  targetField: target,
  ...patch,
})

function createStore(
  fields: Json[],
  mappings: FakeMapping[],
  rawRows: Json[],
  batchPatch: Json = {},
): Store {
  return {
    batch: {
      id: batchId,
      organizationId,
      projectId,
      formId,
      formVersion: 1,
      originalFileName: 'scores.csv',
      fileType: 'CSV',
      sourceChecksum: 'a'.repeat(64),
      clientImportId: '70000000-0000-4000-8000-000000000007',
      storageBucket: 'uploads',
      storageObjectKey: 'private',
      storageStatus: 'STORED',
      sourceHeaders: sourceHeaders(mappings.length),
      status: 'MAPPED',
      mappingRevision: 1,
      validationRevision: 0,
      validatedMappingRevision: null,
      processingRevision: 0,
      processingClaimId: null,
      processingClaimedAt: null,
      totalRows: rawRows.length,
      validRows: 0,
      invalidRows: 0,
      processedRows: 0,
      unprocessedRows: 0,
      failedRows: 0,
      failureCode: null,
      uploadedById: actorId,
      reviewedById: null,
      uploadedAt: now,
      validatedAt: null,
      processedAt: null,
      updatedAt: now,
      createdAt: now,
      form: {
        code: 'scores',
        name: 'Scores',
        formType: 'OTHER',
        status: 'PUBLISHED',
        publishedById: publisherId,
      },
      ...batchPatch,
    },
    rows: rawRows.map((rawData, index) => ({
      id: `60000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
      organizationId,
      projectId,
      importBatchId: batchId,
      rowNumber: index + 2,
      rawData,
      status: 'PENDING',
      mappingRevision: 1,
      validationRevision: 0,
      processingClaimId: null,
      processingClaimedAt: null,
      processingAttempts: 0,
      processingErrorCode: null,
      registrationOutcome: null,
      matchedBeneficiaryId: null,
      normalizedData: null,
      validationErrors: [],
      validationWarnings: [],
    })),
    mappings,
    fields,
    submissions: [],
    existingCodes: new Set(),
    people: [],
    registrations: [],
  }
}

function matches(row: FakeRow, where: Json) {
  return Object.entries(where).every(([key, condition]) => {
    const value = (row as unknown as Json)[key]
    if (condition && typeof condition === 'object' && !(condition instanceof Date)) {
      const operators = condition as Record<string, unknown>
      if ('in' in operators) return (operators.in as unknown[]).includes(value)
      if ('lt' in operators) return value !== null && (value as number) < (operators.lt as number)
      if ('gte' in operators) return (value as number) >= (operators.gte as number)
      return false
    }
    return value === condition
  })
}

function apply(target: Json, data: Json) {
  for (const [key, value] of Object.entries(data)) {
    target[key] =
      value && typeof value === 'object' && 'increment' in value
        ? (target[key] as number) + (value as { increment: number }).increment
        : value
  }
}

const rowById = (id: string) => state.store.rows.find((row) => row.id === id)

const fakeTx = {
  // The lock query binds the project id, so a foreign project finds no batch.
  // A tagged-template call is the registration service reading its lock or the transaction clock.
  $queryRaw: vi.fn(async (sql: { values: unknown[]; sql?: string }) => {
    if (Array.isArray(sql)) return [{ locked: true, transactionTime: new Date(now) }]
    if (sql.sql?.includes('validation_warnings')) {
      const warned = state.store.rows.filter((row) => row.validationWarnings.length > 0).length
      return warned > 0 ? [{ batchId: state.store.batch.id, warnings: warned }] : []
    }
    return sql.values.includes(state.store.batch.projectId) &&
      sql.values.includes(state.store.batch.organizationId)
      ? [{ id: state.store.batch.id }]
      : []
  }),
  // Applies the validation write: its bound values carry both revisions and the row-update JSON.
  $executeRaw: vi.fn(async (sql: { values: unknown[] }) => {
    const [mappingRevision, validationRevision] = sql.values.filter(
      (value): value is number => typeof value === 'number',
    )
    const updates = JSON.parse(
      sql.values.find((value) => typeof value === 'string' && value.startsWith('[')) as string,
    ) as Array<{
      id: string
      status: string
      normalized_data: Json | null
      validation_errors: []
      validation_warnings: []
    }>
    for (const update of updates) {
      const row = rowById(update.id)
      if (!row) continue
      Object.assign(row, {
        status: update.status,
        normalizedData: update.normalized_data,
        validationErrors: update.validation_errors,
        validationWarnings: update.validation_warnings,
        mappingRevision,
        validationRevision,
      })
    }
    return updates.length
  }),
  project: {
    findFirst: vi.fn(async (args: { where: { AND: [Json, { id: string }] } }) => {
      const [scope, wanted] = args.where.AND
      const allowed = (scope.id as { in: string[] } | undefined)?.in ?? [wanted.id]
      return state.store.batch.projectId === wanted.id && allowed.includes(wanted.id)
        ? { id: wanted.id }
        : null
    }),
  },
  digitalForm: {
    findFirst: vi.fn(async () => ({
      id: formId,
      projectId,
      version: 1,
      status: 'PUBLISHED',
      formField_form: state.store.fields,
    })),
  },
  dataImportBatch: {
    findFirst: vi.fn(async (args: { where: Json }) =>
      args.where.projectId === state.store.batch.projectId
        ? structuredClone(state.store.batch)
        : null,
    ),
    findUnique: vi.fn(async () => structuredClone(state.store.batch)),
    update: vi.fn(async (args: { data: Json }) => {
      apply(state.store.batch, args.data)
      return structuredClone(state.store.batch)
    }),
  },
  dataImportRow: {
    createMany: vi.fn(),
    findMany: vi.fn(async (args: { where: Json; take: number }) =>
      state.store.rows
        .filter((row) => matches(row, args.where))
        .sort((left, right) => left.rowNumber - right.rowNumber)
        .slice(0, args.take)
        .map((row) => ({ id: row.id, rowNumber: row.rowNumber, rawData: row.rawData })),
    ),
    findFirst: vi.fn(async (args: { where: Json }) => {
      const row = rowById(args.where.id as string)
      return row && matches(row, args.where)
        ? {
            id: row.id,
            rowNumber: row.rowNumber,
            normalizedData: row.normalizedData,
            processingAttempts: row.processingAttempts,
          }
        : null
    }),
    update: vi.fn(async (args: { where: { id: string }; data: Json }) => {
      const row = rowById(args.where.id)
      if (!row) throw new Error('missing row')
      apply(row as unknown as Json, args.data)
      return row
    }),
    updateMany: vi.fn(async (args: { where: Json; data: Json }) => {
      const rows = state.store.rows.filter((row) => matches(row, args.where))
      for (const row of rows) apply(row as unknown as Json, args.data)
      return { count: rows.length }
    }),
    groupBy: vi.fn(async (args: { by: Array<'status' | 'registrationOutcome'> }) => {
      const [key] = args.by
      const counts = new Map<string | null, number>()
      for (const row of state.store.rows) counts.set(row[key], (counts.get(row[key]) ?? 0) + 1)
      return [...counts].map(([value, count]) => ({ [key]: value, _count: { _all: count } }))
    }),
  },
  metadataMapping: {
    findMany: vi.fn(async () => state.store.mappings),
    findFirst: vi.fn(async (args: { where: { targetField: { code: string } } }) =>
      state.store.mappings.find(
        (mapping) =>
          mapping.status === 'MAPPED' &&
          (mapping.targetField as { code?: string } | null)?.code === args.where.targetField.code,
      )
        ? { id: 'mapping' }
        : null,
    ),
    createMany: vi.fn(),
  },
  formField: {
    findMany: vi.fn(async () => state.store.fields),
  },
  formSubmission: {
    // Honours status, project and ordering; row security hides projects the actor is not assigned to.
    findFirst: vi.fn(
      async (args: {
        where: {
          organizationId?: string
          projectId?: string
          status?: string
          enrollment?: { beneficiaryId: string }
        }
      }) => {
        const { where } = args
        if (!where.enrollment) return null
        const latest = state.store.registrations
          .filter(
            (item) =>
              item.beneficiaryId === where.enrollment?.beneficiaryId &&
              (where.organizationId === undefined || where.organizationId === organizationId) &&
              (where.projectId === undefined || item.projectId === where.projectId) &&
              (where.status === undefined || item.status === where.status) &&
              state.actor.assignedProjectIds.includes(item.projectId),
          )
          .at(-1)
        return latest
          ? {
              formResponseValue_submission: Object.entries(latest.values).map(([code, value]) => ({
                field: { code },
                value,
              })),
            }
          : null
      },
    ),
    findUnique: vi.fn(async (args: { where: { importRowId: string } }) => {
      const found = state.store.submissions.find(
        (item) => item.importRowId === args.where.importRowId,
      )
      return found ? { id: found.id } : null
    }),
    create: vi.fn(
      async (args: { data: { importRowId: string; projectId: string; enrollmentId?: string } }) => {
        const id = `sub-${args.data.importRowId}`
        state.store.submissions.push({ id, importRowId: args.data.importRowId })
        if (args.data.enrollmentId?.startsWith('enr:')) {
          const beneficiaryId = args.data.enrollmentId.split(':')[1]
          const { projectId: submissionProject } = args.data
          state.store.registrations.push({
            id,
            beneficiaryId,
            projectId: submissionProject,
            status: 'DRAFT',
            values: {},
          })
        }
        return { id }
      },
    ),
    update: vi.fn(async (args: { where: { id: string }; data: { status?: string } }) => {
      const registration = state.store.registrations.find((item) => item.id === args.where.id)
      if (registration && args.data.status) registration.status = args.data.status
      return {}
    }),
  },
  formResponseValue: {
    createMany: vi.fn(
      async (args: { data: Array<{ submissionId: string; fieldId: string; value: unknown }> }) => {
        const registration = state.store.registrations.find(
          (item) => item.id === args.data[0]?.submissionId,
        )
        for (const item of args.data) {
          const code = state.store.fields.find((entry) => entry.id === item.fieldId)?.code
          if (registration && typeof code === 'string')
            registration.values[code] = item.value === Prisma.JsonNull ? null : item.value
        }
        return { count: args.data.length }
      },
    ),
  },
  beneficiary: {
    findUnique: vi.fn(async (args: { where: { organizationId_code: { code: string } } }) => {
      const code = args.where.organizationId_code.code
      if (state.store.existingCodes.has(code)) return { id: `existing-${code}` }
      const person = state.store.people.find((item) => item.code === code)
      return person ? { id: person.id } : null
    }),
    findFirst: vi.fn(async (args: { where: { id: string; archivedAt?: null } }) => {
      const person = state.store.people.find((item) => item.id === args.where.id)
      if (!person) {
        return { code: args.where.id.replace('existing-', ''), subjectType: 'INDIVIDUAL' }
      }
      if (args.where.archivedAt === null && person.archivedAt) return null
      return {
        code: person.code,
        subjectType: 'INDIVIDUAL',
        firstName: person.firstName,
        lastName: person.lastName,
        birthDate: person.birthDate,
        ageAtRegistration: person.ageAtRegistration,
        isMinor: person.isMinor,
        guardianConsentRecorded: person.guardianConsentRecorded,
      }
    }),
    createMany: vi.fn(async (args: { data: Json & { id: string; code: string } }) => {
      const { data } = args
      state.store.people.push({
        id: data.id,
        code: data.code,
        identifier: null,
        enrolledIn: new Set(),
        guardianConsentRecorded: data.guardianConsentRecorded === true,
        firstName: (data.firstName as string | null) ?? null,
        lastName: (data.lastName as string | null) ?? null,
        birthDate: (data.birthDate as Date | null) ?? null,
        ageAtRegistration: (data.ageAtRegistration as number | null) ?? null,
        isMinor: data.isMinor === true,
        archivedAt: null,
      })
      return { count: 1 }
    }),
  },
  beneficiaryIdentifier: {
    findUnique: vi.fn(
      async (args: {
        where: { organizationId_identifierType_normalizedValue: { normalizedValue: string } }
      }) => {
        const key = args.where.organizationId_identifierType_normalizedValue.normalizedValue
        const person = state.store.people.find((item) => item.identifier === key)
        return person ? { beneficiaryId: person.id } : null
      },
    ),
    create: vi.fn(async (args: { data: { beneficiaryId: string; normalizedValue: string } }) => {
      const person = state.store.people.find((item) => item.id === args.data.beneficiaryId)
      if (person) person.identifier = args.data.normalizedValue
    }),
  },
  beneficiaryProjectEnrollment: {
    findUnique: vi.fn(
      async (args: {
        where: {
          organizationId_projectId_beneficiaryId: { projectId: string; beneficiaryId: string }
        }
      }) => {
        const key = args.where.organizationId_projectId_beneficiaryId
        const person = state.store.people.find((item) => item.id === key.beneficiaryId)
        return person?.enrolledIn.has(key.projectId)
          ? { id: `enr:${person.id}:${key.projectId}` }
          : null
      },
    ),
    create: vi.fn(async (args: { data: { beneficiaryId: string; projectId: string } }) => {
      const { beneficiaryId, projectId: enrolledProject } = args.data
      state.store.people.find((item) => item.id === beneficiaryId)?.enrolledIn.add(enrolledProject)
      return { id: `enr:${beneficiaryId}:${enrolledProject}` }
    }),
  },
  importValueRejection: { findMany: vi.fn(async () => []) },
  beneficiaryConsentRecord: { createMany: vi.fn(async () => ({ count: 2 })) },
  beneficiaryActivityParticipation: { findUnique: vi.fn() },
  auditLog: { create: vi.fn(async () => ({ id: 'audit' })) },
}

function service(registration: unknown = {}) {
  return new ImportsService(
    {} as PrismaService,
    { isConfigured: () => true } as unknown as StorageService,
    registration as BeneficiaryRegistrationService,
    { promoteParticipation: vi.fn() } as never,
  )
}

const validate = (target: ImportsService) =>
  target.validate(state.actor, projectId, batchId, { expectedMappingRevision: 1 })

const revalidate = (target: ImportsService, revision: number) =>
  target.validate(state.actor, projectId, batchId, { expectedMappingRevision: revision })

const runProcess = (target: ImportsService) =>
  target.process(state.actor, projectId, batchId, { expectedValidationRevision: 1 })

const rowWrites = () => {
  const call = fakeTx.$executeRaw.mock.calls[0] as unknown as [{ values: unknown[] }]
  const json = call[0].values.find((value) => typeof value === 'string' && value.startsWith('['))
  return JSON.parse(json as string) as Array<{
    status: string
    normalized_data: Json | null
    validation_errors: Array<{ fieldCode: string; code: string; message: string }>
    validation_warnings: Array<{ fieldCode: string; code: string }>
  }>
}

describe('PRD-F6 gates', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    state.actor = structuredClone(baseActor)
  })

  it('G-F6-2: validation is refused when a required form field has no source mapping', async () => {
    state.store = createStore(
      [scoreField, sexField],
      [
        mapped('column_0001', sexField),
        { ...mapped('column_0002', sexField), status: 'IGNORED', targetField: null },
      ],
      [{ column_0001: 'Male', column_0002: 'x' }],
    )

    await expect(validate(service())).rejects.toThrow(
      new BadRequestException(
        'Every required form field must have a source mapping. No source for: score.',
      ),
    )

    expect(fakeTx.dataImportRow.findMany).not.toHaveBeenCalled()
    expect(fakeTx.$executeRaw).not.toHaveBeenCalled()
    expect(fakeTx.dataImportBatch.update).not.toHaveBeenCalled()
    expect(fakeTx.auditLog.create).not.toHaveBeenCalled()
    expect(state.store.rows.every((row) => row.status === 'PENDING')).toBe(true)
  })

  it('G-F6-1: a confirmed full mapping validates rows with normalized data, then processing promotes them to PROCESSED', async () => {
    state.store = createStore(
      [scoreField, sexField],
      [mapped('column_0001', scoreField), mapped('column_0002', sexField)],
      [
        { column_0001: '2.5', column_0002: 'Male' },
        { column_0001: '4', column_0002: 'Female' },
      ],
    )
    const imports = service()

    const validated = await validate(imports)

    // The validation write is the exact normalized payload stored per row.
    expect(rowWrites()).toEqual([
      {
        id: state.store.rows[0].id,
        status: 'VALID',
        normalized_data: { score: '2.5', sex: 'Male' },
        validation_errors: [],
        validation_warnings: [],
      },
      {
        id: state.store.rows[1].id,
        status: 'VALID',
        normalized_data: { score: '4', sex: 'Female' },
        validation_errors: [],
        validation_warnings: [],
      },
    ])
    expect(validated).toMatchObject({
      status: 'VALIDATED',
      validationRevision: 1,
      validatedMappingRevision: 1,
      uploadedByCurrentUser: true,
      totals: { rows: 2, valid: 2, invalid: 0 },
    })

    // The same fixture then flows into the process run.
    const processed = await runProcess(imports)

    expect(state.store.rows.map((row) => row.status)).toEqual(['PROCESSED', 'PROCESSED'])
    expect(state.store.submissions).toHaveLength(2)
    expect(processed).toMatchObject({ status: 'PROCESSED', totals: { processed: 2, invalid: 0 } })
  })

  it('flags a batch as uploaded by the current user only for its uploader', async () => {
    state.store = createStore([scoreField], [mapped('column_0001', scoreField)], [])
    expect(await service().getBatch(state.actor, projectId, batchId)).toMatchObject({
      uploadedByCurrentUser: true,
    })
    state.actor = { ...state.actor, userId: '20000000-0000-4000-8000-0000000000cc' }
    expect(await service().getBatch(state.actor, projectId, batchId)).toMatchObject({
      uploadedByCurrentUser: false,
    })
  })

  it('G-F6-2: a batch with an invalid row stays staged, promoting only the valid rows', async () => {
    state.store = createStore(
      [scoreField],
      [mapped('column_0001', scoreField)],
      [{ column_0001: '2.5' }, { column_0001: 'not a number' }],
    )
    const imports = service()

    await validate(imports)
    expect(state.store.rows.map((row) => row.status)).toEqual(['VALID', 'INVALID'])

    const processed = await runProcess(imports)

    expect(state.store.rows.map((row) => row.status)).toEqual(['PROCESSED', 'INVALID'])
    expect(state.store.submissions.map((item) => item.importRowId)).toEqual([
      state.store.rows[0].id,
    ])
    expect(processed).toMatchObject({ status: 'PARTIALLY_PROCESSED', totals: { invalid: 1 } })
  })

  describe('G-F6-4', () => {
    const save = (target: ImportsService, project = projectId) =>
      target.saveMapping(state.actor, project, batchId, {
        expectedMappingRevision: 1,
        mappings: [{ sourceFieldName: 'column_0001', targetFieldCode: 'score', ignored: false }],
      })

    const expectNoWrites = () => {
      expect(fakeTx.metadataMapping.createMany).not.toHaveBeenCalled()
      expect(fakeTx.dataImportRow.updateMany).not.toHaveBeenCalled()
      expect(fakeTx.dataImportBatch.update).not.toHaveBeenCalled()
      expect(fakeTx.auditLog.create).not.toHaveBeenCalled()
    }

    beforeEach(() => {
      state.store = createStore([scoreField], [mapped('column_0001', scoreField)], [])
    })

    it('G-F6-4: saveMapping for a batch in another project is denied before any write', async () => {
      await expect(save(service(), otherProjectId)).rejects.toBeInstanceOf(NotFoundException)
      expectNoWrites()
    })

    it('G-F6-4: saveMapping by an actor not assigned to the project is denied before any write', async () => {
      state.actor = { ...state.actor, assignedProjectIds: [] }

      await expect(save(service())).rejects.toBeInstanceOf(NotFoundException)
      expectNoWrites()
    })

    it('G-F6-4: saveMapping without imports.review is denied before any write', async () => {
      state.actor = { ...state.actor, permissions: ['imports.read', 'imports.process'] }

      await expect(save(service())).rejects.toBeInstanceOf(ForbiddenException)
      expect(fakeTx.$queryRaw).not.toHaveBeenCalled()
      expectNoWrites()
    })
  })

  it('G-F6-7: a declared type and value map translate source values, and an unmatched misfit stays INVALID with a reason', async () => {
    state.store = createStore(
      [sexField, enrolledField],
      [
        mapped('column_0001', sexField, {
          dataType: 'TEXT',
          valueMap: [
            { from: 'M', to: 'Male' },
            { from: 'F', to: 'Female' },
          ],
        }),
        mapped('column_0002', enrolledField, {
          dataType: 'BOOLEAN',
          valueMap: [
            { from: 'Yes', to: 'true' },
            { from: 'No', to: 'false' },
          ],
        }),
      ],
      [
        { column_0001: 'M', column_0002: 'Yes' },
        { column_0001: ' f ', column_0002: 'no' },
        { column_0001: 'M', column_0002: 'maybe' },
      ],
    )

    const validated = await validate(service())

    const [first, second, third] = rowWrites()
    expect(first).toMatchObject({
      status: 'VALID',
      normalized_data: { sex: 'Male', enrolled: true },
      validation_errors: [],
    })
    expect(second).toMatchObject({
      status: 'VALID',
      normalized_data: { sex: 'Female', enrolled: false },
    })
    expect(third).toEqual({
      id: state.store.rows[2].id,
      status: 'INVALID',
      normalized_data: null,
      validation_errors: [
        { fieldCode: 'enrolled', code: 'AMBIGUOUS_BOOLEAN', message: 'Expected true or false.' },
      ],
      validation_warnings: [],
    })
    // The stored reason never echoes the rejected source value.
    expect(JSON.stringify(third.validation_errors)).not.toContain('maybe')
    expect(state.store.rows[2]).toMatchObject({ status: 'INVALID', normalizedData: null })
    expect(validated).toMatchObject({ totals: { rows: 3, valid: 2, invalid: 1 } })
  })
})

describe('metadata-driven intake validation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    state.actor = structuredClone(baseActor)
  })

  const rule = (value: Json) => ({ rule: value })

  // A reduced registration form: defaults, calculations and a consent copy rule.
  const registrationFields = (copyConsent = true) => [
    field('registration_operation', {
      dataType: 'SELECT',
      isRequired: true,
      allowedValues: ['CREATE', 'LINK', 'UPDATE'],
      importDefault: 'CREATE',
    }),
    field('beneficiary_code', { isRequired: true }),
    field('subject_type', {
      dataType: 'SELECT',
      isRequired: true,
      allowedValues: ['INDIVIDUAL', 'GROUP', 'COMMUNITY'],
      importDefault: 'INDIVIDUAL',
    }),
    field('display_name'),
    field('first_name'),
    field('middle_name'),
    field('last_name'),
    field('sex', {
      dataType: 'SELECT',
      allowedValues: ['MALE', 'FEMALE', 'OTHER', 'PREFER_NOT_TO_SAY', 'NOT_SPECIFIED'],
      importDefault: 'NOT_SPECIFIED',
    }),
    field('birth_date', { dataType: 'DATE' }),
    field('age_at_registration', {
      dataType: 'INTEGER',
      ...rule({ kind: 'AGE_AT_DATE', birthField: 'birth_date', atField: 'enrollment_date' }),
    }),
    field('disability_status', {
      dataType: 'SELECT',
      allowedValues: ['WITH_DISABILITY', 'WITHOUT_DISABILITY', 'NOT_SPECIFIED'],
      importDefault: 'NOT_SPECIFIED',
    }),
    field('location_barangay'),
    field('location_city_municipality'),
    field('location_province'),
    field('consent_recorded', { dataType: 'BOOLEAN', isRequired: true }),
    field('data_processing_consent_recorded', {
      dataType: 'BOOLEAN',
      isRequired: true,
      ...(copyConsent ? rule({ kind: 'SAME_ANSWER_AS', field: 'consent_recorded' }) : {}),
    }),
    field('is_minor', {
      dataType: 'BOOLEAN',
      ...rule({ kind: 'MINOR_AT_DATE', birthField: 'birth_date', atField: 'enrollment_date' }),
    }),
    field('guardian_consent_recorded', { dataType: 'BOOLEAN' }),
    field('enrollment_date', { dataType: 'DATE', isRequired: true }),
    field('external_identifier_type'),
    field('external_identifier_value'),
    field('profile_update_fields', {
      dataType: 'MULTIPLE_SELECT',
      allowedValues: [
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
      ],
    }),
  ]

  const byCode = (fields: Json[], code: string) => fields.find((item) => item.code === code) as Json

  const mappedColumns = (fields: Json[], codes: string[]) =>
    codes.map((code, index) => mapped(`column_000${index + 1}`, byCode(fields, code)))

  // Ten participants; rows 3 and 7 are minors at enrollment, with a blank and a "false" guardian answer.
  const participants = Array.from({ length: 10 }, (_, index) => {
    const minor = index === 2 || index === 6
    return {
      column_0001: `BEN-${String(index + 1).padStart(3, '0')}`,
      column_0002: `First${index + 1}`,
      column_0003: `Last${index + 1}`,
      column_0004: minor ? '2014-01-01' : '1990-01-01',
      column_0005: '2026-01-01',
      column_0006: 'true',
      column_0007: index === 6 ? 'false' : '',
    }
  })

  const registrationStore = (
    copyConsent = true,
    edit = (row: (typeof participants)[number]) => row,
  ) => {
    const fields = registrationFields(copyConsent)
    return createStore(
      fields,
      mappedColumns(fields, [
        'beneficiary_code',
        'first_name',
        'last_name',
        'birth_date',
        'enrollment_date',
        'consent_recorded',
        'guardian_consent_recorded',
      ]),
      participants.map((row) => edit({ ...row })),
      {
        form: {
          code: 'registration',
          name: 'Registration',
          formType: 'BENEFICIARY_REGISTRATION',
          status: 'PUBLISHED',
          publishedById: publisherId,
        },
      },
    )
  }

  const registrar = () => {
    state.actor = {
      ...state.actor,
      permissions: [
        ...state.actor.permissions,
        'beneficiaries.records.register',
        'beneficiaries.identities.review',
      ],
    }
    return service(new BeneficiaryRegistrationService())
  }

  it('a covered registration file validates every row VALID with a guardian warning per minor', async () => {
    state.store = registrationStore()

    const validated = await validate(service())

    const writes = rowWrites()
    expect(writes.map((row) => row.status)).toEqual(Array(10).fill('VALID'))
    expect(writes[0].normalized_data).toMatchObject({
      registration_operation: 'CREATE',
      subject_type: 'INDIVIDUAL',
      age_at_registration: 36,
      is_minor: false,
      data_processing_consent_recorded: true,
    })
    expect(writes[2].normalized_data).toMatchObject({ age_at_registration: 12, is_minor: true })
    const warned = writes.flatMap((row, index) => (row.validation_warnings.length ? [index] : []))
    expect(warned).toEqual([2, 6])
    expect(writes[2].validation_warnings).toEqual([
      { fieldCode: 'guardian_consent_recorded', code: 'GUARDIAN_CONSENT_MISSING' },
    ])
    // Warnings carry codes only, never source values.
    expect(JSON.stringify(writes.map((row) => row.validation_warnings))).not.toContain('2014')
    expect(validated).toMatchObject({ totals: { rows: 10, valid: 10, invalid: 0, warnings: 2 } })
    expect(fakeTx.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'IMPORT_VALIDATED',
        changes: expect.objectContaining({
          formVersionId: formId,
          formPublishedById: publisherId,
          warnings: 2,
        }),
      }),
    })
  })

  it('processing with SAME_ANSWER_AS promotes the adults and holds the minors for guardian consent', async () => {
    state.store = registrationStore()
    const imports = registrar()

    await validate(imports)
    const processed = await runProcess(imports)

    const held = state.store.rows.filter((row) => row.status === 'UNPROCESSED')
    expect(held.map((row) => row.rowNumber)).toEqual([4, 8])
    expect(held.every((row) => row.processingErrorCode === 'GUARDIAN_CONSENT_REQUIRED')).toBe(true)
    expect(state.store.rows.filter((row) => row.status === 'PROCESSED')).toHaveLength(8)
    expect(fakeTx.beneficiary.createMany).toHaveBeenCalledTimes(8)
    expect(state.store.submissions).toHaveLength(8)
    expect(processed).toMatchObject({
      status: 'PARTIALLY_PROCESSED',
      totals: { processed: 8, unprocessed: 2, failed: 0, invalid: 0 },
    })
  })

  it('reads text enrollment dates when one day-month-year order fits every row', async () => {
    state.store = registrationStore(true, (row) => ({ ...row, column_0005: '15/01/2026' }))

    await validate(service())

    const writes = rowWrites()
    expect(writes.map((row) => row.status)).toEqual(Array(10).fill('VALID'))
    expect(writes[0].normalized_data).toMatchObject({ enrollment_date: '2026-01-15' })
  })

  it('holds text enrollment dates that more than one order could read', async () => {
    state.store = registrationStore(true, (row) => ({ ...row, column_0005: '26/01/15' }))

    await validate(service())

    const writes = rowWrites()
    expect(writes.map((row) => row.status)).toEqual(Array(10).fill('INVALID'))
    expect(writes[0].validation_errors).toEqual([
      expect.objectContaining({ fieldCode: 'enrollment_date', code: 'AMBIGUOUS_DATE' }),
    ])
  })

  it('reads ambiguous text dates by the date order a reviewer saved with the mapping', async () => {
    state.store = registrationStore(true, (row) => ({ ...row, column_0005: '26/01/15' }))
    const enrollment = state.store.mappings.find(
      (mapping) => (mapping.targetField as { code?: string } | null)?.code === 'enrollment_date',
    )
    if (!enrollment) throw new Error('fixture lost the enrollment mapping')
    enrollment.dateOrder = 'YMD'

    await validate(service())

    const writes = rowWrites()
    expect(writes.map((row) => row.status)).toEqual(Array(10).fill('VALID'))
    expect(writes[0].normalized_data).toMatchObject({ enrollment_date: '2026-01-15' })
  })

  it('without SAME_ANSWER_AS the required consent has no source and no row is promoted', async () => {
    state.store = registrationStore(false)
    const imports = registrar()

    await expect(validate(imports)).rejects.toThrow(
      new BadRequestException(
        'Every required form field must have a source mapping. No source for: data_processing_consent_recorded.',
      ),
    )
    await expect(runProcess(imports)).rejects.toBeInstanceOf(ConflictException)

    expect(state.store.rows.every((row) => row.status === 'PENDING')).toBe(true)
    expect(fakeTx.beneficiary.createMany).not.toHaveBeenCalled()
    expect(state.store.submissions).toHaveLength(0)
  })

  it('re-importing existing participants is held as DUPLICATE_IDENTITY, not failed', async () => {
    state.store = registrationStore()
    for (const row of participants) state.store.existingCodes.add(row.column_0001)
    const imports = registrar()

    await validate(imports)
    const processed = await runProcess(imports)

    const codes = state.store.rows.map((row) => row.processingErrorCode)
    expect(codes.filter((code) => code === 'DUPLICATE_IDENTITY')).toHaveLength(8)
    expect(codes.filter((code) => code === 'GUARDIAN_CONSENT_REQUIRED')).toHaveLength(2)
    expect(state.store.rows.every((row) => row.status === 'UNPROCESSED')).toBe(true)
    expect(fakeTx.beneficiary.createMany).not.toHaveBeenCalled()
    expect(processed).toMatchObject({
      status: 'PARTIALLY_PROCESSED',
      totals: { processed: 0, unprocessed: 10, failed: 0 },
    })
  })

  it('holds a participant who answered no to consent instead of failing the row', async () => {
    state.store = registrationStore()
    state.store.rows[1].rawData.column_0006 = 'false'
    const imports = registrar()

    await validate(imports)
    const processed = await runProcess(imports)

    expect(state.store.rows[1]).toMatchObject({
      status: 'UNPROCESSED',
      processingErrorCode: 'CONSENT_REQUIRED',
    })
    expect(processed).toMatchObject({
      status: 'PARTIALLY_PROCESSED',
      totals: { processed: 7, unprocessed: 3, failed: 0 },
    })
  })

  it('a provided consent_recorded of false is never overwritten, so the row is held', async () => {
    const fields = registrationFields()
    state.store = createStore(
      fields,
      mappedColumns(fields, [
        'beneficiary_code',
        'first_name',
        'last_name',
        'birth_date',
        'enrollment_date',
        'consent_recorded',
        'guardian_consent_recorded',
        'data_processing_consent_recorded',
      ]),
      participants.map((row) => ({ ...row, column_0008: 'false' })),
      {
        form: {
          code: 'registration',
          name: 'Registration',
          formType: 'BENEFICIARY_REGISTRATION',
          status: 'PUBLISHED',
          publishedById: publisherId,
        },
      },
    )
    state.store.rows[1].rawData.column_0006 = 'true'
    const imports = registrar()

    await validate(imports)
    await runProcess(imports)

    // Row 2 says consent yes but processing consent no: the source answer stays false.
    expect(state.store.rows[1]).toMatchObject({
      status: 'UNPROCESSED',
      processingErrorCode: 'CONSENT_REQUIRED',
    })
    expect(rowWrites()[1].normalized_data).toMatchObject({
      consent_recorded: true,
      data_processing_consent_recorded: false,
    })
  })

  it('re-validation stores no warnings for a row that was fixed', async () => {
    state.store = registrationStore()
    const imports = service()
    await validate(imports)
    expect(state.store.rows[2].validationWarnings).toHaveLength(1)

    state.store.rows[2].rawData.column_0007 = 'true'
    const revalidated = await revalidate(imports, 1)

    expect(state.store.rows[2]).toMatchObject({ status: 'VALID', validationWarnings: [] })
    expect(state.store.rows[6].validationWarnings).toHaveLength(1)
    expect(revalidated.totals.warnings).toBe(1)
  })

  it('saving a new mapping clears the stored warnings of the batch', async () => {
    state.store = registrationStore()
    const imports = service()
    const validated = await validate(imports)
    expect(validated.totals.warnings).toBe(2)

    const remapped = await imports.saveMapping(state.actor, projectId, batchId, {
      expectedMappingRevision: 1,
      mappings: [
        'beneficiary_code',
        'first_name',
        'last_name',
        'birth_date',
        'enrollment_date',
        'consent_recorded',
        'guardian_consent_recorded',
      ].map((code, index) => ({
        sourceFieldName: `column_000${index + 1}`,
        targetFieldCode: code,
        ignored: false,
      })),
    })

    expect(state.store.rows.every((row) => row.validationWarnings.length === 0)).toBe(true)
    expect(remapped).toMatchObject({ status: 'MAPPED', totals: { warnings: 0 } })
  })

  it('a disagreeing disability flag makes the row INVALID with CALCULATION_MISMATCH', async () => {
    const questions = Array.from({ length: 6 }, (_, index) => `wg_${index + 1}`)
    const fields = [
      ...questions.map((code) => field(code)),
      field('disability_status', {
        dataType: 'SELECT',
        allowedValues: ['WITH_DISABILITY', 'WITHOUT_DISABILITY', 'NOT_SPECIFIED'],
        isSadddField: true,
        ...rule({
          kind: 'WASHINGTON_GROUP_DISABILITY',
          questionFields: questions,
          disabilityValues: ['A lot of difficulty', 'Cannot do at all'],
        }),
      }),
    ]
    const answers = (last: string) =>
      Object.fromEntries(
        questions.map((_, index) => [
          `column_000${index + 1}`,
          index === 5 ? last : 'No difficulty',
        ]),
      )
    state.store = createStore(fields, mappedColumns(fields, [...questions, 'disability_status']), [
      { ...answers('No difficulty'), column_0007: 'WITHOUT_DISABILITY' },
      { ...answers('Cannot do at all'), column_0007: 'WITHOUT_DISABILITY' },
      { ...answers('Cannot do at all'), column_0007: 'WITH_DISABILITY' },
    ])

    const validated = await validate(service())

    const [agree, mismatch, flagged] = rowWrites()
    expect(agree.status).toBe('VALID')
    expect(mismatch).toMatchObject({
      status: 'INVALID',
      normalized_data: null,
      validation_errors: [{ fieldCode: 'disability_status', code: 'CALCULATION_MISMATCH' }],
    })
    expect(flagged.status).toBe('VALID')
    expect(validated).toMatchObject({ totals: { valid: 2, invalid: 1, warnings: 0 } })
  })

  describe('age cross-check', () => {
    const ageStore = (ages: string[], batchPatch: Json = {}) => {
      const fields = [
        field('birth_date', { dataType: 'DATE' }),
        field('enrollment_date', { dataType: 'DATE' }),
        field('age_stated', {
          dataType: 'INTEGER',
          ...rule({ kind: 'AGE_CHECK', birthField: 'birth_date', atFields: ['enrollment_date'] }),
        }),
      ]
      return createStore(
        fields,
        mappedColumns(fields, ['birth_date', 'enrollment_date', 'age_stated']),
        ages.map((age) => ({
          column_0001: '1990-10-03',
          column_0002: '2020-01-01',
          column_0003: age,
        })),
        batchPatch,
      )
    }

    it('an Age column more than a year off holds the row INVALID, one year off stays VALID', async () => {
      state.store = ageStore(['36', '37', '25'])

      const validated = await validate(service())

      const [current, drifted, stale] = rowWrites()
      expect(current).toMatchObject({ status: 'VALID', validation_warnings: [] })
      expect(drifted).toMatchObject({ status: 'VALID', validation_warnings: [] })
      expect(stale).toMatchObject({
        status: 'INVALID',
        normalized_data: null,
        validation_errors: [{ fieldCode: 'age_stated', code: 'AGE_MISMATCH' }],
      })
      expect(validated).toMatchObject({ totals: { valid: 2, invalid: 1, warnings: 0 } })
    })

    it('measures age today at the Manila calendar date of the batch creation', async () => {
      // 17:00 UTC on 2 October is already 3 October in Manila, the 36th birthday, so 38 is two years off.
      state.store = ageStore(['37', '38'], { createdAt: new Date('2026-10-02T17:00:00.000Z') })

      await validate(service())

      expect(rowWrites().map((row) => row.status)).toEqual(['VALID', 'INVALID'])
    })

    it('follows the configured business time zone for the upload date', async () => {
      vi.stubEnv('BUSINESS_TIME_ZONE', 'UTC')
      try {
        // Still 2 October in UTC, so the computed age is 35 and the stated 37 is two years ahead.
        state.store = ageStore(['37'], { createdAt: new Date('2026-10-02T17:00:00.000Z') })

        await validate(service())

        expect(rowWrites()[0].validation_errors).toEqual([
          expect.objectContaining({ fieldCode: 'age_stated', code: 'AGE_MISMATCH' }),
        ])
      } finally {
        vi.unstubAllEnvs()
      }
    })
  })

  describe('participant matching by client id', () => {
    const registrationForm = {
      code: 'registration',
      name: 'Registration',
      formType: 'BENEFICIARY_REGISTRATION',
      status: 'PUBLISHED',
      publishedById: publisherId,
    }

    // The client's Student ID decides the match; Participant ID and Age are recalculated columns.
    const identifierFields = () => [
      ...registrationFields().filter((item) => item.code !== 'external_identifier_type'),
      field('external_identifier_type', { importDefault: 'STUDENT_ID' }),
      field('age_stated', {
        dataType: 'INTEGER',
        ...rule({ kind: 'AGE_CHECK', birthField: 'birth_date', atFields: ['enrollment_date'] }),
      }),
    ]

    const identifierStore = (rows: Json[]) => {
      const fields = identifierFields()
      return createStore(
        fields,
        mappedColumns(fields, [
          'beneficiary_code',
          'first_name',
          'last_name',
          'birth_date',
          'enrollment_date',
          'consent_recorded',
          'guardian_consent_recorded',
          'external_identifier_value',
          'age_stated',
        ]),
        rows,
        { form: registrationForm },
      )
    }

    const person = (index: number, patch: Json = {}) => ({
      column_0001: `BEN-00${index}`,
      column_0002: `First${index}`,
      column_0003: `Last${index}`,
      column_0004: '1990-01-01',
      column_0005: '2026-01-01',
      column_0006: 'true',
      column_0007: '',
      column_0008: `S-${index}`,
      column_0009: '36',
      ...patch,
    })

    const linker = () => {
      state.actor = {
        ...state.actor,
        permissions: [...state.actor.permissions, 'beneficiaries.enrollments.manage'],
      }
      return registrar()
    }

    // Processes the rows as a first upload, then stages the next export on top of that database state.
    const reupload = async (imports: ImportsService, first: Json[], next: Json[]) => {
      state.store = identifierStore(first)
      await validate(imports)
      await runProcess(imports)
      const { people, registrations } = state.store
      expect(state.store.rows.every((row) => row.status === 'PROCESSED')).toBe(true)
      vi.clearAllMocks()
      state.store = identifierStore(next)
      Object.assign(state.store, { people, registrations })
      return { people }
    }

    // The participant now belongs to another project, whose submissions this actor cannot read.
    const moveToOtherProject = () => {
      for (const item of state.store.people) item.enrolledIn = new Set([otherProjectId])
      for (const item of state.store.registrations) item.projectId = otherProjectId
    }

    it('unchanged re-upload holds nothing', async () => {
      const rows = [1, 2, 3].map((index) => person(index))
      const imports = linker()
      // The next export recalculated Participant ID and Age, which are not profile changes.
      await reupload(
        imports,
        rows,
        rows.map((row, index) => ({ ...row, column_0001: `BEN-X${index}`, column_0009: '37' })),
      )

      await validate(imports)
      const processed = await runProcess(imports)

      expect(fakeTx.beneficiary.createMany).not.toHaveBeenCalled()
      expect(state.store.people).toHaveLength(3)
      expect(state.store.rows.map((row) => row.status)).toEqual(Array(3).fill('PROCESSED'))
      expect(state.store.rows.every((row) => row.processingErrorCode === null)).toBe(true)
      expect(state.store.rows.map((row) => row.registrationOutcome)).toEqual(
        Array(3).fill('UNCHANGED'),
      )
      expect(state.store.rows.map((row) => row.matchedBeneficiaryId)).toEqual(
        state.store.people.map((item) => item.id),
      )
      expect(state.store.submissions).toHaveLength(0)
      expect(processed).toMatchObject({
        status: 'PROCESSED',
        totals: { processed: 3, unprocessed: 0, failed: 0 },
      })
      const unchanged = (
        fakeTx.auditLog.create.mock.calls as unknown as Array<[{ data: { action: string } }]>
      ).filter(([call]) => call.data.action === 'IMPORT_REGISTRATION_UNCHANGED')
      expect(unchanged).toHaveLength(3)
      expect(JSON.stringify(unchanged)).not.toMatch(/S-\d|First|Last/)
    })

    it('a Project Officer cannot process a batch matched by client id and no row is claimed', async () => {
      state.store = identifierStore([1, 2].map((index) => person(index)))
      const imports = service(new BeneficiaryRegistrationService())
      await validate(imports)
      state.actor = {
        ...baseActor,
        roles: ['PROJECT_OFFICER'],
        permissions: [...rolePermissions.PROJECT_OFFICER],
      }
      vi.clearAllMocks()

      const refused = runProcess(imports)

      await expect(refused).rejects.toBeInstanceOf(ForbiddenException)
      await expect(refused).rejects.toThrow(
        'Importing participants by client ID needs the identity review and enrollment management permissions.',
      )
      expect(state.store.rows.map((row) => row.status)).toEqual(['VALID', 'VALID'])
      expect(state.store.rows.every((row) => row.processingClaimId === null)).toBe(true)
      expect(state.store.people).toHaveLength(0)
    })

    it('a Monitoring and Evaluation Officer processes a batch matched by client id', async () => {
      state.store = identifierStore([1, 2].map((index) => person(index)))
      const imports = service(new BeneficiaryRegistrationService())
      await validate(imports)
      state.actor = {
        ...baseActor,
        permissions: [...rolePermissions.MONITORING_AND_EVALUATION_OFFICER],
      }

      await runProcess(imports)

      expect(state.store.rows.map((row) => row.status)).toEqual(['PROCESSED', 'PROCESSED'])
      expect(state.store.people).toHaveLength(2)
    })

    it('a Project Officer still processes a batch with no client id column', async () => {
      const fields = identifierFields()
      state.store = createStore(
        fields,
        mappedColumns(fields, [
          'beneficiary_code',
          'first_name',
          'last_name',
          'birth_date',
          'enrollment_date',
          'consent_recorded',
          'guardian_consent_recorded',
        ]),
        [1, 2].map((index) => person(index)),
        { form: registrationForm },
      )
      const imports = service(new BeneficiaryRegistrationService())
      await validate(imports)
      state.actor = {
        ...baseActor,
        roles: ['PROJECT_OFFICER'],
        permissions: [...rolePermissions.PROJECT_OFFICER],
      }

      await expect(runProcess(imports)).resolves.toBeTruthy()
    })

    it('a changed profile value in a re-upload is held PROFILE_CHANGED', async () => {
      const rows = [1, 2].map((index) => person(index))
      const imports = linker()
      await reupload(imports, rows, [rows[0], { ...rows[1], column_0005: '2026-02-01' }])

      await validate(imports)
      await runProcess(imports)

      expect(state.store.rows.map((row) => row.status)).toEqual(['PROCESSED', 'UNPROCESSED'])
      expect(state.store.rows[1].processingErrorCode).toBe('PROFILE_CHANGED')
      expect(fakeTx.beneficiary.createMany).not.toHaveBeenCalled()
    })

    it('a blank Student ID cell in a mapped column is held IDENTITY_MISSING and the others process', async () => {
      state.store = identifierStore([person(1, { column_0008: '' }), person(2)])
      const imports = linker()

      await validate(imports)
      await runProcess(imports)

      expect(state.store.rows.map((row) => row.status)).toEqual(['UNPROCESSED', 'PROCESSED'])
      expect(state.store.rows[0].processingErrorCode).toBe('IDENTITY_MISSING')
      expect(fakeTx.beneficiary.createMany).toHaveBeenCalledTimes(1)
    })

    it('same client id twice in one file', async () => {
      state.store = identifierStore([person(1), person(2, { column_0008: ' S-1 ' }), person(3)])
      const imports = linker()

      await validate(imports)
      const [first, second, third] = rowWrites()
      for (const row of [first, second]) {
        expect(row).toMatchObject({
          status: 'INVALID',
          normalized_data: null,
          validation_errors: [
            { fieldCode: 'external_identifier_value', code: 'IDENTITY_CONFLICT' },
          ],
        })
      }
      expect(third.status).toBe('VALID')

      await runProcess(imports)

      expect(state.store.rows.map((row) => row.status)).toEqual(['INVALID', 'INVALID', 'PROCESSED'])
      expect(fakeTx.beneficiary.createMany).toHaveBeenCalledTimes(1)
      expect(state.store.people).toHaveLength(1)
    })

    it('an invalid twin of a client id still holds its valid twin', async () => {
      state.store = identifierStore([
        person(1),
        person(2, { column_0008: 'S-1', column_0004: 'not a date' }),
        person(3),
      ])
      const imports = linker()

      await validate(imports)
      expect(rowWrites().map((row) => row.status)).toEqual(['INVALID', 'INVALID', 'VALID'])
      expect(rowWrites()[0].validation_errors).toEqual([
        expect.objectContaining({
          fieldCode: 'external_identifier_value',
          code: 'IDENTITY_CONFLICT',
        }),
      ])

      await runProcess(imports)

      expect(state.store.rows.map((row) => row.status)).toEqual(['INVALID', 'INVALID', 'PROCESSED'])
      expect(state.store.people).toHaveLength(1)
    })

    it('known id in another project is enrolled here, no second profile', async () => {
      const rows = [person(1)]
      const imports = linker()
      const { people } = await reupload(imports, rows, rows)
      moveToOtherProject()

      await validate(imports)
      await runProcess(imports)

      expect(fakeTx.beneficiary.createMany).not.toHaveBeenCalled()
      // No baseline read from the project that cannot be seen; the profile decided.
      expect(fakeTx.beneficiary.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ select: { firstName: true, lastName: true, birthDate: true } }),
      )
      expect(people).toHaveLength(1)
      expect([...people[0].enrolledIn].sort()).toEqual([projectId, otherProjectId].sort())
      expect(state.store.rows[0]).toMatchObject({
        status: 'PROCESSED',
        registrationOutcome: 'LINKED',
      })
      expect(state.store.submissions).toHaveLength(1)
    })

    it('a remembered rejection links the PATHWAYS value, not the rejected one', async () => {
      const rows = [person(1)]
      const imports = linker()
      await reupload(imports, rows, [{ ...rows[0], column_0003: 'Changed' }])
      moveToOtherProject()
      const lastName = state.store.fields.find((item) => item.code === 'last_name')
      fakeTx.importValueRejection.findMany.mockResolvedValue([
        { fieldId: lastName?.id as string, valueHash: valueHash('Changed') },
      ] as never)

      try {
        await validate(imports)
        await runProcess(imports)
      } finally {
        fakeTx.importValueRejection.findMany.mockResolvedValue([])
      }

      expect(state.store.rows[0]).toMatchObject({
        status: 'PROCESSED',
        registrationOutcome: 'LINKED',
      })
      // Row ids repeat across the fake's batches, so read what the new submission was given.
      const [written] = fakeTx.formResponseValue.createMany.mock.calls.at(-1) as unknown as [
        { data: Array<{ fieldId: string; value: unknown }> },
      ]
      expect(written.data.find((item) => item.fieldId === lastName?.id)?.value).toBe('Last1')
    })

    it('PW code generated when Participant ID is taken', async () => {
      state.store = identifierStore([person(1), person(2)])
      state.store.existingCodes.add('BEN-001')
      const imports = linker()

      await validate(imports)
      await runProcess(imports)

      expect(state.store.rows.map((row) => row.status)).toEqual(['PROCESSED', 'PROCESSED'])
      const codes = state.store.people.map((item) => item.code)
      expect(codes[0]).toMatch(/^PW[0-9A-HJKMNP-TV-Z]{10}$/)
      expect(codes[0]).toMatch(/^[A-Z0-9][A-Z0-9_-]{1,39}$/)
      expect(codes[1]).toBe('BEN-002')
      expect(state.store.rows.map((row) => row.registrationOutcome)).toEqual(['CREATED', 'CREATED'])
    })

    it('adult with guardian consent false processes', async () => {
      const rows = [person(1, { column_0007: 'false' })]
      const imports = linker()
      const { people } = await reupload(imports, rows, rows)
      expect(people).toHaveLength(1)

      // A later link of the same known adult into another project is not a guardian matter either.
      moveToOtherProject()
      await validate(imports)
      await runProcess(imports)

      expect(state.store.rows[0]).toMatchObject({
        status: 'PROCESSED',
        processingErrorCode: null,
        registrationOutcome: 'LINKED',
      })
    })

    const outcomes = ['CREATED', 'CREATED', 'UPDATED', 'LINKED', 'UNCHANGED', null]
    const readBatch = () => mapStoredBatch(fakeTx as never, state.actor, projectId, batchId)

    it('registration batch reports created, updated and unchanged', async () => {
      state.store = identifierStore(outcomes.map((_, index) => person(index)))
      for (const [index, row] of state.store.rows.entries()) {
        row.registrationOutcome = outcomes[index]
      }

      expect((await readBatch()).registrationCounts).toEqual({
        created: 2,
        updated: 2,
        unchanged: 1,
      })
    })

    it('detail and a repeated process of a processed registration batch carry the counts', async () => {
      state.store = identifierStore([1, 2, 3].map((index) => person(index)))
      const imports = linker()
      await validate(imports)
      await runProcess(imports)

      const counts = { created: 3, updated: 0, unchanged: 0 }
      const detail = await imports.getBatch(state.actor, projectId, batchId)
      expect(detail.registrationCounts).toEqual(counts)
      // A second process of a finished batch takes the claim.complete path.
      expect((await runProcess(imports)).registrationCounts).toEqual(counts)
    })

    it('non-registration batch has no registration counts', async () => {
      state.store = createStore([scoreField], [], [{}, {}])
      for (const row of state.store.rows) row.registrationOutcome = 'CREATED'

      expect(await readBatch()).not.toHaveProperty('registrationCounts')
      expect(fakeTx.dataImportRow.groupBy).not.toHaveBeenCalled()
    })
  })
})
