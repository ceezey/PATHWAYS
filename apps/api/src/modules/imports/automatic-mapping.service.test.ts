import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common'
import { plainToInstance } from 'class-transformer'
import { validate } from 'class-validator'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AutomaticImportMappingDto } from './imports.dto'
import { ImportsService } from './imports.service'
const state = vi.hoisted(() => ({
  permission: '',
  tx: undefined as unknown,
  actor: undefined as unknown,
}))
vi.mock('../auth/authorized-operation', () => ({
  withAuthorizedOperation: async (
    _prisma: unknown,
    _identity: unknown,
    permission: string,
    work: (tx: unknown, actor: unknown) => unknown,
  ) => {
    state.permission = permission
    return work(state.tx, state.actor)
  },
}))
const organizationId = '10000000-0000-4000-8000-000000000001'
const userId = '20000000-0000-4000-8000-000000000002'
const projectId = '30000000-0000-4000-8000-000000000003'
const batchId = '50000000-0000-4000-8000-000000000005'
const actor = {
  id: userId,
  userId,
  organizationId,
  roles: ['PROJECT_OFFICER'],
  permissions: ['imports.upload'],
  assignedProjectIds: [projectId],
}
const receipt = {
  batchId,
  mappingRevision: 1,
  mapped: 1,
  pending: 1,
  requiredUnmapped: 0,
  complete: false,
}
const fieldIds = {
  first: '60000000-0000-4000-8000-000000000001',
  birth: '60000000-0000-4000-8000-000000000002',
  sex: '60000000-0000-4000-8000-000000000003',
}
const privateValue = 'Synthetic-Private-Value-4471'
const storedBatch = {
  id: batchId,
  projectId,
  formId: '40000000-0000-4000-8000-000000000004',
  uploadedById: userId,
  storageStatus: 'STORED',
  status: 'UPLOADED',
  mappingRevision: 0,
  totalRows: 2,
}
const tx = {
  project: { findFirst: vi.fn() },
  dataImportBatch: { findFirst: vi.fn() },
  formField: { findMany: vi.fn() },
  dataImportRow: { findMany: vi.fn() },
  $queryRaw: vi.fn(),
}
function recorderCall() {
  return tx.$queryRaw.mock.calls.find(([sql]) =>
    String(sql.sql).includes('p38_record_smart_mapping'),
  )
}
describe('automatic mapping API authority boundary', () => {
  let service: ImportsService
  beforeEach(() => {
    vi.resetAllMocks()
    state.actor = actor
    state.tx = tx
    tx.project.findFirst.mockResolvedValue({ id: projectId })
    tx.dataImportBatch.findFirst.mockImplementation(async (query: { select?: object }) =>
      query.select && 'sourceHeaders' in query.select
        ? {
            sourceHeaders: [
              { key: 'column_0001', columnIndex: 1, header: 'Given name' },
              { key: 'column_0002', columnIndex: 2, header: 'DOB' },
              { key: 'column_0003', columnIndex: 3, header: 'Gender' },
            ],
          }
        : storedBatch,
    )
    tx.formField.findMany.mockResolvedValue([
      { id: fieldIds.first, code: 'first_name', label: 'First name', dataType: 'TEXT' },
      { id: fieldIds.birth, code: 'birth_date', label: 'Birth date', dataType: 'DATE' },
      {
        id: fieldIds.sex,
        code: 'sex',
        label: 'Sex',
        dataType: 'SELECT',
        allowedValues: ['MALE', 'FEMALE'],
      },
    ])
    tx.dataImportRow.findMany.mockResolvedValue([
      { rawData: { column_0001: privateValue, column_0002: '2012-04-01', column_0003: 'FEMALE' } },
      { rawData: { column_0001: 'Ana', column_0002: '2011-01-09', column_0003: 'MALE' } },
    ])
    tx.$queryRaw.mockImplementation(async (sql: { sql: string }) =>
      String(sql.sql).includes('FOR UPDATE') ? [{ id: batchId }] : [{ receipt }],
    )
    service = new ImportsService({} as never, {} as never, {} as never, {} as never)
  })
  it('uses current upload operation and structurally scopes batch before fixed SQL', async () => {
    expect(
      await service.automaticMapping(actor as never, projectId, batchId, {
        expectedMappingRevision: 0,
      }),
    ).toEqual(receipt)
    expect(state.permission).toBe('imports.upload')
    expect(tx.dataImportBatch.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: batchId, projectId, organizationId } }),
    )
    // Lock first, then one recorder call with server-derived values only.
    expect(String(tx.$queryRaw.mock.calls[0][0].sql)).toContain('FOR UPDATE')
    const sql = recorderCall()?.[0]
    expect(sql.sql).toContain('pathways.p38_record_smart_mapping')
    expect(sql.sql).not.toContain('p29_auto_map_import')
    expect(sql.values.slice(0, 3)).toEqual([batchId, 0, 'AUTO_SMART_V2'])
    expect(JSON.parse(sql.values[3])).toEqual([
      {
        sourceKey: 'column_0001',
        columnIndex: 1,
        status: 'MAPPED',
        targetFieldId: fieldIds.first,
        suggestedFieldId: null,
        score: 90,
        matchReason: 'SYNONYM',
        reason: 'AUTO_MATCH',
      },
      {
        sourceKey: 'column_0002',
        columnIndex: 2,
        status: 'MAPPED',
        targetFieldId: fieldIds.birth,
        suggestedFieldId: null,
        score: 90,
        matchReason: 'SYNONYM',
        reason: 'AUTO_MATCH',
      },
      {
        sourceKey: 'column_0003',
        columnIndex: 3,
        status: 'PENDING',
        targetFieldId: null,
        suggestedFieldId: fieldIds.sex,
        score: 80,
        matchReason: 'SYNONYM_REVIEW',
        reason: 'SUGGESTED',
      },
    ])
  })
  it('scopes every matcher read to the organization, project, form and batch', async () => {
    await service.automaticMapping(actor as never, projectId, batchId, {
      expectedMappingRevision: 0,
    })
    expect(tx.formField.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organizationId, projectId, formId: storedBatch.formId },
        take: 101,
      }),
    )
    expect(tx.dataImportRow.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organizationId, projectId, formId: storedBatch.formId, importBatchId: batchId },
        take: 100,
      }),
    )
  })
  it('never sends sampled cell values to the database', async () => {
    await service.automaticMapping(actor as never, projectId, batchId, {
      expectedMappingRevision: 0,
    })
    for (const [sql] of tx.$queryRaw.mock.calls) {
      expect(JSON.stringify(sql.values)).not.toContain(privateValue)
      expect(JSON.stringify(sql.values)).not.toContain('2012-04-01')
    }
  })
  it('recomputes identical decisions for a revision 1 retry', async () => {
    await service.automaticMapping(actor as never, projectId, batchId, {
      expectedMappingRevision: 0,
    })
    const first = recorderCall()?.[0].values[3]
    tx.$queryRaw.mockClear()
    storedBatch.mappingRevision = 1
    try {
      await service.automaticMapping(actor as never, projectId, batchId, {
        expectedMappingRevision: 1,
      })
    } finally {
      storedBatch.mappingRevision = 0
    }
    expect(recorderCall()?.[0].values[3]).toBe(first)
    expect(recorderCall()?.[0].values[1]).toBe(1)
  })
  it.each([
    { storageStatus: 'RESERVED' },
    { status: 'VALIDATED' },
    { mappingRevision: 2 },
    { totalRows: 0 },
  ])('conflicts on a stale or frozen batch before reading rows %#', async (change) => {
    const original = { ...storedBatch }
    Object.assign(storedBatch, change)
    try {
      await expect(
        service.automaticMapping(actor as never, projectId, batchId, {
          expectedMappingRevision: 0,
        }),
      ).rejects.toBeInstanceOf(ConflictException)
    } finally {
      Object.assign(storedBatch, original)
    }
    expect(tx.dataImportRow.findMany).not.toHaveBeenCalled()
    expect(recorderCall()).toBeUndefined()
  })
  it('rejects a definition without fields before scoring', async () => {
    tx.formField.findMany.mockResolvedValue([])
    await expect(
      service.automaticMapping(actor as never, projectId, batchId, { expectedMappingRevision: 0 }),
    ).rejects.toBeInstanceOf(BadRequestException)
    expect(recorderCall()).toBeUndefined()
  })
  it('denies a batch outside the caller organization or project before any read', async () => {
    tx.dataImportBatch.findFirst.mockResolvedValue(null)
    await expect(
      service.automaticMapping(actor as never, projectId, batchId, { expectedMappingRevision: 0 }),
    ).rejects.toBeInstanceOf(NotFoundException)
    expect(tx.formField.findMany).not.toHaveBeenCalled()
    expect(tx.dataImportRow.findMany).not.toHaveBeenCalled()
    expect(tx.$queryRaw).not.toHaveBeenCalled()
  })
  it('denies another uploader before calling SQL', async () => {
    tx.dataImportBatch.findFirst.mockResolvedValue({
      id: batchId,
      projectId,
      uploadedById: 'other',
    })
    await expect(
      service.automaticMapping(actor as never, projectId, batchId, { expectedMappingRevision: 0 }),
    ).rejects.toBeInstanceOf(ForbiddenException)
    expect(tx.$queryRaw).not.toHaveBeenCalled()
    expect(tx.dataImportRow.findMany).not.toHaveBeenCalled()
  })
  it('denies inaccessible project before batch retrieval', async () => {
    tx.project.findFirst.mockResolvedValue(null)
    await expect(
      service.automaticMapping(actor as never, projectId, batchId, { expectedMappingRevision: 0 }),
    ).rejects.toBeInstanceOf(NotFoundException)
    expect(tx.dataImportBatch.findFirst).not.toHaveBeenCalled()
    expect(tx.$queryRaw).not.toHaveBeenCalled()
  })
  it.each([
    { expectedMappingRevision: 2 },
    { expectedMappingRevision: '0' },
    { expectedMappingRevision: 0, ignored: true },
    { expectedMappingRevision: 0, actorId: userId },
  ])('rejects additional choices and invalid revisions %#', async (input) => {
    expect(() =>
      service.automaticMapping(actor as never, projectId, batchId, input as never),
    ).toThrow(BadRequestException)
    expect(tx.$queryRaw).not.toHaveBeenCalled()
  })
  it.each([
    ['22023', BadRequestException],
    ['40001', ConflictException],
    ['42501', ForbiddenException],
    ['42883', ServiceUnavailableException],
  ])('sanitizes SQLSTATE %s', async (code, failure) => {
    tx.$queryRaw.mockImplementation(async (sql: { sql: string }) => {
      if (String(sql.sql).includes('FOR UPDATE')) return [{ id: batchId }]
      throw { code: 'P2010', meta: { code, message: 'private sql and data' } }
    })
    await expect(
      service.automaticMapping(actor as never, projectId, batchId, { expectedMappingRevision: 1 }),
    ).rejects.toBeInstanceOf(failure)
    try {
      await service.automaticMapping(actor as never, projectId, batchId, {
        expectedMappingRevision: 1,
      })
    } catch (error) {
      expect(String(error)).not.toContain('private')
    }
  })
  it('DTO validation rejects extra fields under the actual whitelist settings', async () => {
    const errors = await validate(
      plainToInstance(AutomaticImportMappingDto, { expectedMappingRevision: 0, target: 'private' }),
      { whitelist: true, forbidNonWhitelisted: true },
    )
    expect(errors.some((error) => error.property === 'target')).toBe(true)
  })
})
