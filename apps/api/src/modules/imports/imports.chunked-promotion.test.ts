import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  NotFoundException,
} from '@nestjs/common'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { PrismaService } from '@app/prisma/prisma.service'
import type { ApplicationIdentity } from '../auth/developer-access'
import type { BeneficiariesService } from '../beneficiaries/beneficiaries.service'
import type { StorageService } from '../storage/storage.service'
import { ImportsService, type UploadedImportFile } from './imports.service'

/**
 * In-memory stand-in for the import tables. Each authorized operation snapshots the
 * store and restores it on failure, so a failed chunk rolls back like a transaction.
 */
const state = vi.hoisted(() => ({
  actor: undefined as unknown as ApplicationIdentity,
  store: undefined as unknown as FakeStore,
  operations: [] as Array<{ permission: string; options: unknown }>,
  beforeOperation: undefined as undefined | ((index: number) => void),
}))

interface FakeRow {
  id: string
  organizationId: string
  projectId: string
  importBatchId: string
  rowNumber: number
  status: string
  mappingRevision: number
  validationRevision: number
  processingClaimId: string | null
  processingClaimedAt: Date | null
  processingAttempts: number
  processingErrorCode: string | null
  normalizedData: Record<string, unknown>
  processedAt?: Date | null
}

interface FakeStore {
  projects: Array<{ id: string; organizationId: string }>
  batch: Record<string, unknown> & { id: string; projectId: string; organizationId: string }
  rows: FakeRow[]
  submissions: Array<{ id: string; importRowId: string }>
  audits: Array<{ action: string; entityId: string }>
}

vi.mock('../auth/authorized-operation', async () => {
  const { ForbiddenException: Forbidden, HttpException: Http } = await import('@nestjs/common')
  return {
    withAuthorizedOperation: vi.fn(async (_prisma, _identity, permission, work, options) => {
      const index = state.operations.length
      state.operations.push({ permission, options })
      state.beforeOperation?.(index)
      if (!state.actor.permissions.includes(permission)) {
        throw new Forbidden('Required application permission is missing.')
      }
      const store = state.store
      const snapshot = {
        ...store,
        batch: structuredClone(store.batch),
        rows: store.rows.map((row) => ({ ...row })),
        submissions: [...store.submissions],
        audits: [...store.audits],
      }
      try {
        return await work(fakeTx, state.actor)
      } catch (error) {
        state.store = snapshot
        // The real helper maps unexpected database failures to a safe 403.
        if (error instanceof Http) throw error
        throw new Forbidden('Application scope could not be verified.')
      }
    }),
  }
})

const organizationId = '10000000-0000-4000-8000-000000000001'
const otherOrganizationId = '10000000-0000-4000-8000-0000000000ff'
const actorId = '20000000-0000-4000-8000-000000000002'
const projectId = '30000000-0000-4000-8000-000000000003'
const otherProjectId = '30000000-0000-4000-8000-0000000000ff'
const formId = '40000000-0000-4000-8000-000000000004'
const batchId = '50000000-0000-4000-8000-000000000005'
const fieldId = '41000000-0000-4000-8000-000000000004'
const now = new Date('2026-09-28T00:00:00.000Z')

const baseActor: ApplicationIdentity = {
  id: '90000000-0000-4000-8000-000000000009',
  aal: 'aal2',
  userId: actorId,
  organizationId,
  fullName: 'Synthetic M&E actor',
  roles: ['MONITORING_AND_EVALUATION_OFFICER'],
  permissions: ['imports.read', 'imports.upload', 'imports.process'],
  assignedProjectIds: [projectId],
}

const scoreField = {
  id: fieldId,
  code: 'score',
  label: 'Score',
  dataType: 'TEXT',
  isRequired: false,
  allowedValues: null,
  minimumValue: null,
  maximumValue: null,
  minimumDate: null,
  maximumDate: null,
  minimumLength: null,
  maximumLength: 20,
  isMetadataKey: false,
}

function rowIdFor(index: number) {
  return `60000000-0000-4000-8000-${String(index).padStart(12, '0')}`
}

function createStore(rowCount: number, formType = 'OTHER'): FakeStore {
  return {
    projects: [
      { id: projectId, organizationId },
      { id: otherProjectId, organizationId: otherOrganizationId },
    ],
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
      sourceHeaders: [{ key: 'column_0001', header: 'score', columnIndex: 1 }],
      status: 'VALIDATED',
      mappingRevision: 1,
      validationRevision: 1,
      validatedMappingRevision: 1,
      processingRevision: 0,
      processingClaimId: null,
      processingClaimedAt: null,
      totalRows: rowCount,
      validRows: rowCount,
      invalidRows: 0,
      processedRows: 0,
      unprocessedRows: 0,
      failedRows: 0,
      failureCode: null,
      uploadedById: actorId,
      reviewedById: actorId,
      uploadedAt: now,
      validatedAt: now,
      processedAt: null,
      updatedAt: now,
      form: { code: 'scores', name: 'Scores', formType, status: 'PUBLISHED' },
    },
    rows: Array.from({ length: rowCount }, (_, index) => ({
      id: rowIdFor(index + 1),
      organizationId,
      projectId,
      importBatchId: batchId,
      rowNumber: index + 2,
      status: 'VALID',
      mappingRevision: 1,
      validationRevision: 1,
      processingClaimId: null,
      processingClaimedAt: null,
      processingAttempts: 0,
      processingErrorCode: null,
      normalizedData: { score: `S-${index + 1}` },
    })),
    submissions: [],
    audits: [],
  }
}

type Where = Record<string, unknown>

const rowIndexes = new WeakMap<FakeRow[], Map<string, FakeRow>>()
function rowById(id: string) {
  let index = rowIndexes.get(state.store.rows)
  if (!index) {
    index = new Map(state.store.rows.map((row) => [row.id, row]))
    rowIndexes.set(state.store.rows, index)
  }
  return index.get(id)
}

function matches(row: FakeRow, where: Where) {
  return Object.entries(where).every(([key, condition]) => {
    const value = (row as unknown as Record<string, unknown>)[key]
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

function apply(target: Record<string, unknown>, data: Record<string, unknown>) {
  for (const [key, value] of Object.entries(data)) {
    if (value && typeof value === 'object' && 'increment' in (value as object)) {
      target[key] = (target[key] as number) + (value as { increment: number }).increment
    } else {
      target[key] = value
    }
  }
}

function visibleBatch(where: Where) {
  const batch = state.store.batch
  return where.id === batch.id &&
    where.organizationId === batch.organizationId &&
    where.projectId === batch.projectId
    ? structuredClone(batch)
    : null
}

const calls = {
  formFieldReads: 0,
  submissionCreates: 0,
  failCreateForRow: undefined as string | undefined,
}

const fakeTx = {
  $queryRaw: vi.fn(async () => {
    const batch = state.store.batch
    return batch.organizationId === state.actor.organizationId ? [{ id: batch.id }] : []
  }),
  project: {
    findFirst: vi.fn(async (args: { where: { AND: [Where, { id: string }] } }) => {
      const [scope, wanted] = args.where.AND
      const project = state.store.projects.find(
        (item) =>
          item.id === wanted.id &&
          item.organizationId === scope.organizationId &&
          (!scope.id || ((scope.id as { in: string[] }).in ?? []).includes(item.id)),
      )
      return project ? { id: project.id } : null
    }),
  },
  digitalForm: { findFirst: vi.fn() },
  dataImportBatch: {
    findFirst: vi.fn(async (args: { where: Where }) => visibleBatch(args.where)),
    findUnique: vi.fn(async () => structuredClone(state.store.batch)),
    update: vi.fn(async (args: { data: Record<string, unknown> }) => {
      apply(state.store.batch, args.data)
      return structuredClone(state.store.batch)
    }),
  },
  dataImportRow: {
    createMany: vi.fn(),
    findMany: vi.fn(async (args: { where: Where; take: number }) =>
      state.store.rows
        .filter((row) => matches(row, args.where))
        .sort((left, right) => left.rowNumber - right.rowNumber)
        .slice(0, args.take)
        .map((row) => ({ id: row.id })),
    ),
    findFirst: vi.fn(async (args: { where: Where }) => {
      const candidate = typeof args.where.id === 'string' ? rowById(args.where.id) : undefined
      const row = candidate && matches(candidate, args.where) ? candidate : undefined
      return row
        ? {
            id: row.id,
            rowNumber: row.rowNumber,
            normalizedData: row.normalizedData,
            processingAttempts: row.processingAttempts,
          }
        : null
    }),
    update: vi.fn(async (args: { where: { id: string }; data: Record<string, unknown> }) => {
      const row = rowById(args.where.id)
      if (!row) throw new Error('missing row')
      apply(row as unknown as Record<string, unknown>, args.data)
      return row
    }),
    updateMany: vi.fn(async (args: { where: Where; data: Record<string, unknown> }) => {
      const ids = (args.where.id as { in?: string[] } | undefined)?.in
      const rows = (ids ? ids.flatMap((id) => rowById(id) ?? []) : state.store.rows).filter((row) =>
        matches(row, args.where),
      )
      for (const row of rows) apply(row as unknown as Record<string, unknown>, args.data)
      return { count: rows.length }
    }),
    groupBy: vi.fn(async () => {
      const counts = new Map<string, number>()
      for (const row of state.store.rows) counts.set(row.status, (counts.get(row.status) ?? 0) + 1)
      return [...counts].map(([status, count]) => ({ status, _count: { _all: count } }))
    }),
  },
  metadataMapping: { findMany: vi.fn(async () => []) },
  formField: {
    findMany: vi.fn(async () => {
      calls.formFieldReads += 1
      return [scoreField]
    }),
  },
  formSubmission: {
    findUnique: vi.fn(async (args: { where: { importRowId: string } }) => {
      const found = state.store.submissions.find(
        (item) => item.importRowId === args.where.importRowId,
      )
      return found ? { id: found.id } : null
    }),
    create: vi.fn(async (args: { data: { importRowId: string } }) => {
      calls.submissionCreates += 1
      if (args.data.importRowId === calls.failCreateForRow) {
        throw new ConflictException('Synthetic domain conflict.')
      }
      const id = `sub-${args.data.importRowId}`
      state.store.submissions.push({ id, importRowId: args.data.importRowId })
      return { id }
    }),
    update: vi.fn(async () => ({})),
  },
  formResponseValue: { createMany: vi.fn(async () => ({ count: 1 })) },
  beneficiaryActivityParticipation: { findUnique: vi.fn() },
  auditLog: {
    create: vi.fn(async (args: { data: { action: string; entityId: string } }) => {
      state.store.audits.push({ action: args.data.action, entityId: args.data.entityId })
      return { id: 'audit' }
    }),
  },
}

const beneficiaries = {
  promoteRegistration: vi.fn(),
  readRegistrationForm: vi.fn(),
}

function service() {
  return new ImportsService(
    {} as PrismaService,
    {
      isConfigured: () => true,
      uploadPrivateFile: vi.fn(),
      downloadPrivateFile: vi.fn(),
    } as unknown as StorageService,
    beneficiaries as unknown as BeneficiariesService,
    { promoteParticipation: vi.fn() } as never,
  )
}

const processOnce = (target: ImportsService, project = projectId) =>
  target.process(state.actor, project, batchId, { expectedValidationRevision: 1 })

const chunkCalls = () =>
  state.operations.filter(
    (call) =>
      (call.options as { transactionTimeoutMs?: number } | undefined)?.transactionTimeoutMs ===
      30_000,
  )

const countStatus = (status: string) =>
  state.store.rows.filter((row) => row.status === status).length

describe('chunked import promotion', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv('UPLOADS_BUCKET', 'uploads')
    state.actor = structuredClone(baseActor)
    state.operations = []
    state.beforeOperation = undefined
    calls.formFieldReads = 0
    calls.submissionCreates = 0
    calls.failCreateForRow = undefined
  })

  it('promotes a claim in 25-row chunk transactions with one context read per claim', async () => {
    state.store = createStore(60)
    const imports = service()
    const perRow = vi.spyOn(
      imports as unknown as { promoteGenericRow: () => Promise<void> },
      'promoteGenericRow',
    )

    const result = await processOnce(imports)

    expect(countStatus('PROCESSED')).toBe(60)
    expect(state.store.submissions).toHaveLength(60)
    expect(chunkCalls()).toHaveLength(3)
    expect(state.operations.map((call) => call.permission)).toEqual(
      Array(5).fill('imports.process'),
    )
    expect(calls.formFieldReads).toBe(1)
    expect(perRow).not.toHaveBeenCalled()
    expect(
      state.store.audits.filter((audit) => audit.action === 'IMPORT_ROW_PROMOTED'),
    ).toHaveLength(60)
    expect(result).toMatchObject({ status: 'PROCESSED', totals: { processed: 60 } })
  })

  it('reruns a failed chunk row by row and releases only the failing row', async () => {
    state.store = createStore(30)
    calls.failCreateForRow = rowIdFor(5)
    const imports = service()

    const result = await processOnce(imports)

    expect(countStatus('PROCESSED')).toBe(29)
    const failed = state.store.rows.find((row) => row.id === rowIdFor(5))
    expect(failed).toMatchObject({
      status: 'VALID',
      processingClaimId: null,
      processingErrorCode: 'RETRY_PENDING',
      processingAttempts: 1,
    })
    // The rolled-back chunk left no partial submissions or audits behind.
    expect(new Set(state.store.submissions.map((item) => item.importRowId)).size).toBe(29)
    expect(
      state.store.audits.filter((audit) => audit.action === 'IMPORT_ROW_PROMOTED'),
    ).toHaveLength(29)
    expect(result).toMatchObject({ status: 'PARTIALLY_PROCESSED' })

    // Retries stop at the attempt ceiling, exactly as before chunking.
    await processOnce(imports)
    await processOnce(imports)
    expect(state.store.rows.find((row) => row.id === rowIdFor(5))).toMatchObject({
      status: 'FAILED',
      processingErrorCode: 'RETRY_LIMIT_EXCEEDED',
    })
  })

  it('treats an existing submission for a row as already promoted on retry', async () => {
    state.store = createStore(10)
    for (let index = 1; index <= 4; index += 1) {
      state.store.submissions.push({ id: `sub-prior-${index}`, importRowId: rowIdFor(index) })
    }
    const imports = service()

    await processOnce(imports)

    expect(countStatus('PROCESSED')).toBe(10)
    expect(calls.submissionCreates).toBe(6)
    expect(state.store.submissions).toHaveLength(10)
  })

  it('stops at the next chunk when processing permission is revoked', async () => {
    state.store = createStore(60)
    state.beforeOperation = (index) => {
      // Operation 0 claims, operation 1 promotes the first chunk.
      if (index === 2) state.actor = { ...state.actor, permissions: ['imports.read'] }
    }
    const imports = service()
    const release = vi.spyOn(
      imports as unknown as { releaseFailedRow: () => Promise<void> },
      'releaseFailedRow',
    )

    await expect(processOnce(imports)).rejects.toBeInstanceOf(ForbiddenException)
    expect(countStatus('PROCESSED')).toBe(25)
    expect(countStatus('PROCESSING')).toBe(35)
    expect(release).not.toHaveBeenCalled()
  })

  it('stops promoting when the project assignment is removed between chunks', async () => {
    state.store = createStore(60)
    state.beforeOperation = (index) => {
      if (index === 2) state.actor = { ...state.actor, assignedProjectIds: [] }
    }
    const imports = service()

    await expect(processOnce(imports)).rejects.toBeInstanceOf(HttpException)
    expect(countStatus('PROCESSED')).toBe(25)
    expect(state.store.submissions).toHaveLength(25)
  })

  it('denies cross-project and cross-organization processing before any row is read', async () => {
    state.store = createStore(5)
    const imports = service()

    await expect(processOnce(imports, otherProjectId)).rejects.toBeInstanceOf(NotFoundException)
    state.actor = {
      ...state.actor,
      organizationId: otherOrganizationId,
      assignedProjectIds: [projectId, otherProjectId],
    }
    await expect(processOnce(imports)).rejects.toBeInstanceOf(NotFoundException)
    expect(fakeTx.dataImportRow.findMany).not.toHaveBeenCalled()
    expect(fakeTx.dataImportRow.findFirst).not.toHaveBeenCalled()
    expect(countStatus('VALID')).toBe(5)
  })

  it('finishes a 5,000-row import through repeated process calls', async () => {
    state.store = createStore(5_000)
    const imports = service()
    let calls = 0
    let batch = await processOnce(imports)
    calls += 1
    while (batch.status !== 'PROCESSED' && calls < 100) {
      batch = await processOnce(imports)
      calls += 1
    }

    expect(batch).toMatchObject({ status: 'PROCESSED', totals: { processed: 5_000, failed: 0 } })
    expect(calls).toBe(50)
    expect(chunkCalls()).toHaveLength(200)
    expect(state.store.submissions).toHaveLength(5_000)
  }, 60_000)

  it('shares one registration form read per claim and keeps per-row domain checks', async () => {
    state.store = createStore(30, 'BENEFICIARY_REGISTRATION')
    const form = { id: formId, version: 1, status: 'PUBLISHED', formField_form: [] }
    beneficiaries.readRegistrationForm.mockResolvedValue(form)
    beneficiaries.promoteRegistration.mockImplementation(async (_tx, _actor, input) => ({
      kind: 'PROCESSED',
      beneficiaryId: `b-${input.importRowId}`,
      enrollmentId: `e-${input.importRowId}`,
      submissionId: `s-${input.importRowId}`,
    }))
    const imports = service()

    await processOnce(imports)

    expect(beneficiaries.readRegistrationForm).toHaveBeenCalledOnce()
    expect(beneficiaries.readRegistrationForm).toHaveBeenCalledWith(
      fakeTx,
      state.actor,
      projectId,
      formId,
      'IMPORTED_DATASET',
    )
    expect(beneficiaries.promoteRegistration).toHaveBeenCalledTimes(30)
    expect(beneficiaries.promoteRegistration).toHaveBeenCalledWith(
      fakeTx,
      state.actor,
      expect.objectContaining({ source: 'IMPORTED_DATASET', importRowId: rowIdFor(1) }),
      { form },
    )
    expect(chunkCalls()).toHaveLength(2)
    expect(countStatus('PROCESSED')).toBe(30)
  })

  it('releases an under-age registration row on the existing row-error path', async () => {
    // cr-pathways-default-registration-form: imports inherit the minimum age because
    // promoteRegistration parses every imported registration row.
    state.store = createStore(10, 'BENEFICIARY_REGISTRATION')
    const form = { id: formId, version: 1, status: 'PUBLISHED', formField_form: [] }
    beneficiaries.readRegistrationForm.mockResolvedValue(form)
    beneficiaries.promoteRegistration.mockImplementation(async (_tx, _actor, input) => {
      if (input.importRowId === rowIdFor(3))
        throw new BadRequestException('Beneficiary must be at least 5 years old.')
      return {
        kind: 'PROCESSED',
        beneficiaryId: `b-${input.importRowId}`,
        enrollmentId: `e-${input.importRowId}`,
        submissionId: `s-${input.importRowId}`,
      }
    })
    const result = await processOnce(service())

    expect(countStatus('PROCESSED')).toBe(9)
    expect(state.store.rows.find((row) => row.id === rowIdFor(3))).toMatchObject({
      status: 'VALID',
      processingClaimId: null,
      processingErrorCode: 'RETRY_PENDING',
    })
    expect(result).toMatchObject({ status: 'PARTIALLY_PROCESSED' })
  })

  it('stages parsed rows in 1,000-row inserts within one bounded transaction', async () => {
    state.store = createStore(0)
    Object.assign(state.store.batch, { status: 'UPLOADING', totalRows: 0 })
    const imports = service() as unknown as {
      finalizeUpload: (
        identity: ApplicationIdentity,
        projectId: string,
        batchId: string,
        parsed: unknown,
      ) => Promise<unknown>
    }
    const parsed = {
      sourceColumns: [{ key: 'column_0001', header: 'score', columnIndex: 1 }],
      rows: Array.from({ length: 2_500 }, (_, index) => ({
        sourceRowNumber: index + 2,
        values: { column_0001: String(index) },
      })),
      sheetNames: [],
    }

    await imports.finalizeUpload(state.actor, projectId, batchId, parsed)

    const sizes = fakeTx.dataImportRow.createMany.mock.calls.map(
      ([args]) => (args as { data: unknown[] }).data.length,
    )
    expect(sizes).toEqual([1_000, 1_000, 500])
    expect(state.operations).toEqual([
      { permission: 'imports.upload', options: { transactionTimeoutMs: 30_000 } },
    ])
  })
})

describe('PDF upload allowlist', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    state.actor = structuredClone(baseActor)
    state.store = createStore(0)
    state.operations = []
  })

  const pdf = (patch: Partial<UploadedImportFile> = {}): UploadedImportFile => {
    const buffer = Buffer.from('%PDF-1.4\n%%EOF\n')
    return {
      buffer,
      originalname: 'register.pdf',
      mimetype: 'application/pdf',
      size: buffer.length,
      ...patch,
    }
  }

  it('rejects a PDF extension with a mismatched content type before any database access', async () => {
    await expect(
      service().upload(
        state.actor,
        projectId,
        { formId, clientImportId: '70000000-0000-4000-8000-000000000007' },
        pdf({ mimetype: 'text/csv' }),
      ),
    ).rejects.toBeInstanceOf(BadRequestException)
    expect(state.operations).toHaveLength(0)
  })

  it('accepts .pdf with application/pdf into the authorized reservation path', async () => {
    fakeTx.digitalForm.findFirst.mockResolvedValue(null)
    await expect(
      service().upload(
        state.actor,
        projectId,
        { formId, clientImportId: '70000000-0000-4000-8000-000000000007' },
        pdf(),
      ),
    ).rejects.toBeInstanceOf(NotFoundException)
    expect(state.operations).toEqual([{ permission: 'imports.upload', options: undefined }])
  })
})
