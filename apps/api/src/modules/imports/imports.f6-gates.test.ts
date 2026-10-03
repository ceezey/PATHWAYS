import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { PrismaService } from '@app/prisma/prisma.service'
import type { ApplicationIdentity } from '../auth/developer-access'
import type { BeneficiariesService } from '../beneficiaries/beneficiaries.service'
import type { StorageService } from '../storage/storage.service'
import { ImportsService } from './imports.service'

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
  normalizedData: Json | null
  validationErrors: unknown[]
}

interface FakeMapping {
  sourceFieldName: string
  status: 'MAPPED' | 'IGNORED'
  dataType?: string
  valueMap?: Array<{ from: string; to: string }>
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
}

vi.mock('../auth/authorized-operation', () => ({
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

const field = (code: string, patch: Json = {}) => ({
  id: `41000000-0000-4000-8000-${code.length.toString().padStart(12, '0')}`,
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
      form: { code: 'scores', name: 'Scores', formType: 'OTHER', status: 'PUBLISHED' },
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
      normalizedData: null,
      validationErrors: [],
    })),
    mappings,
    fields,
    submissions: [],
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
  $queryRaw: vi.fn(async (sql: { values: unknown[] }) =>
    sql.values.includes(state.store.batch.projectId) &&
    sql.values.includes(state.store.batch.organizationId)
      ? [{ id: state.store.batch.id }]
      : [],
  ),
  // Applies the validation write: its bound values carry both revisions and the row-update JSON.
  $executeRaw: vi.fn(async (sql: { values: unknown[] }) => {
    const [mappingRevision, validationRevision] = sql.values.filter(
      (value): value is number => typeof value === 'number',
    )
    const updates = JSON.parse(
      sql.values.find((value) => typeof value === 'string' && value.startsWith('[')) as string,
    ) as Array<{ id: string; status: string; normalized_data: Json | null; validation_errors: [] }>
    for (const update of updates) {
      const row = rowById(update.id)
      if (!row) continue
      Object.assign(row, {
        status: update.status,
        normalizedData: update.normalized_data,
        validationErrors: update.validation_errors,
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
  digitalForm: { findFirst: vi.fn() },
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
    groupBy: vi.fn(async () => {
      const counts = new Map<string, number>()
      for (const row of state.store.rows) counts.set(row.status, (counts.get(row.status) ?? 0) + 1)
      return [...counts].map(([status, count]) => ({ status, _count: { _all: count } }))
    }),
  },
  metadataMapping: {
    findMany: vi.fn(async () => state.store.mappings),
    createMany: vi.fn(),
  },
  formField: {
    findMany: vi.fn(async (args: { where: { isRequired?: boolean } }) =>
      args.where.isRequired
        ? state.store.fields.filter((item) => item.isRequired).map(({ code }) => ({ code }))
        : state.store.fields,
    ),
  },
  formSubmission: {
    findUnique: vi.fn(async (args: { where: { importRowId: string } }) => {
      const found = state.store.submissions.find(
        (item) => item.importRowId === args.where.importRowId,
      )
      return found ? { id: found.id } : null
    }),
    create: vi.fn(async (args: { data: { importRowId: string } }) => {
      const id = `sub-${args.data.importRowId}`
      state.store.submissions.push({ id, importRowId: args.data.importRowId })
      return { id }
    }),
    update: vi.fn(async () => ({})),
  },
  formResponseValue: { createMany: vi.fn(async () => ({ count: 1 })) },
  beneficiaryActivityParticipation: { findUnique: vi.fn() },
  auditLog: { create: vi.fn(async () => ({ id: 'audit' })) },
}

function service() {
  return new ImportsService(
    {} as PrismaService,
    { isConfigured: () => true } as unknown as StorageService,
    {} as unknown as BeneficiariesService,
    { promoteParticipation: vi.fn() } as never,
  )
}

const validate = (target: ImportsService) =>
  target.validate(state.actor, projectId, batchId, { expectedMappingRevision: 1 })

const runProcess = (target: ImportsService) =>
  target.process(state.actor, projectId, batchId, { expectedValidationRevision: 1 })

const rowWrites = () => {
  const call = fakeTx.$executeRaw.mock.calls[0] as unknown as [{ values: unknown[] }]
  const json = call[0].values.find((value) => typeof value === 'string' && value.startsWith('['))
  return JSON.parse(json as string) as Array<{
    status: string
    normalized_data: Json | null
    validation_errors: Array<{ fieldCode: string; code: string; message: string }>
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
      new BadRequestException('Every required form field must have a source mapping.'),
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
      },
      {
        id: state.store.rows[1].id,
        status: 'VALID',
        normalized_data: { score: '4', sex: 'Female' },
        validation_errors: [],
      },
    ])
    expect(validated).toMatchObject({
      status: 'VALIDATED',
      validationRevision: 1,
      validatedMappingRevision: 1,
      totals: { rows: 2, valid: 2, invalid: 0 },
    })

    // The same fixture then flows into the process run.
    const processed = await runProcess(imports)

    expect(state.store.rows.map((row) => row.status)).toEqual(['PROCESSED', 'PROCESSED'])
    expect(state.store.submissions).toHaveLength(2)
    expect(processed).toMatchObject({ status: 'PROCESSED', totals: { processed: 2, invalid: 0 } })
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
    })
    // The stored reason never echoes the rejected source value.
    expect(JSON.stringify(third.validation_errors)).not.toContain('maybe')
    expect(state.store.rows[2]).toMatchObject({ status: 'INVALID', normalizedData: null })
    expect(validated).toMatchObject({ totals: { rows: 3, valid: 2, invalid: 1 } })
  })
})
