// biome-ignore organizeImports: the harness registers the module mocks and must load first
import {
  actor,
  batch,
  batchId,
  clientImportId,
  file,
  formId,
  organizationId,
  projectId,
  service,
  state,
  storage,
  testUploadsBucket,
  tx,
  useImportsHarness,
} from './imports.service.harness'

import { createHash } from 'node:crypto'
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common'
import { describe, expect, it, vi } from 'vitest'

import { W10_CLIENT_IMPORT_ID, W10_SOURCE_SHA256 } from './upload-finalization-fault'

describe('P03 import service', () => {
  useImportsHarness()

  it('rejects unsafe filenames and inconsistent byte metadata before Storage or database access', async () => {
    await expect(
      service.upload(
        actor,
        projectId,
        { formId, clientImportId },
        file({ originalname: '../x.csv' }),
      ),
    ).rejects.toBeInstanceOf(BadRequestException)
    await expect(
      service.upload(actor, projectId, { formId, clientImportId }, file({ size: 999 })),
    ).rejects.toBeInstanceOf(BadRequestException)
    expect(storage.uploadPrivateFile).not.toHaveBeenCalled()
    expect(tx.project.findFirst).not.toHaveBeenCalled()
  })

  it('denies a wrong-project or unpublished form before uploading the private object', async () => {
    tx.digitalForm.findFirst.mockResolvedValue(null)

    await expect(
      service.upload(actor, projectId, { formId, clientImportId }, file()),
    ).rejects.toBeInstanceOf(NotFoundException)
    expect(tx.digitalForm.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ organizationId, projectId, status: 'PUBLISHED' }),
      }),
    )
    expect(storage.uploadPrivateFile).not.toHaveBeenCalled()
  })

  it('rejects a conflicting scoped idempotency key without replacing its object', async () => {
    tx.digitalForm.findFirst.mockResolvedValue({ id: formId, version: 1 })
    tx.dataImportBatch.findFirst.mockResolvedValue(batch({ sourceChecksum: 'b'.repeat(64) }))

    await expect(
      service.upload(actor, projectId, { formId, clientImportId }, file()),
    ).rejects.toBeInstanceOf(ConflictException)
    expect(storage.uploadPrivateFile).not.toHaveBeenCalled()
  })

  it('returns an identical completed idempotent upload without a second Storage write', async () => {
    const source = file()
    const sourceChecksum = createHash('sha256').update(source.buffer).digest('hex')
    const existing = batch({ sourceChecksum })
    tx.digitalForm.findFirst.mockResolvedValue({ id: formId, version: 1 })
    tx.dataImportBatch.findFirst.mockImplementation(async (args) =>
      'clientImportId' in args.where ? existing : batch(),
    )
    tx.dataImportBatch.findUnique.mockResolvedValue(batch())
    tx.metadataMapping.findMany.mockResolvedValue([])

    await expect(
      service.upload(actor, projectId, { formId, clientImportId }, source),
    ).resolves.toMatchObject({ id: batchId })
    expect(storage.uploadPrivateFile).not.toHaveBeenCalled()
  })

  it('returns persisted ordinal source columns while preserving legacy header compatibility', async () => {
    const sourceColumns = [
      { key: 'column_0001', header: 'Score', columnIndex: 1 },
      { key: 'column_0002', header: 'Score', columnIndex: 2 },
    ]
    tx.dataImportBatch.findFirst.mockResolvedValue(batch())
    tx.dataImportBatch.findUnique.mockResolvedValue({ sourceHeaders: sourceColumns })
    tx.metadataMapping.findMany.mockResolvedValue([])

    await expect(service.getBatch(actor, projectId, batchId)).resolves.toMatchObject({
      sourceHeaders: ['column_0001', 'column_0002'],
      sourceColumns,
    })

    tx.dataImportBatch.findUnique.mockResolvedValue({ sourceHeaders: ['legacy_score'] })
    await expect(service.getBatch(actor, projectId, batchId)).resolves.toMatchObject({
      sourceHeaders: ['legacy_score'],
      sourceColumns: [{ key: 'legacy_score', header: 'legacy_score', columnIndex: 1 }],
    })
  })

  it('persists separate mapping decisions for repeated source headers', async () => {
    const sourceColumns = [
      { key: 'column_0001', header: 'Score', columnIndex: 1 },
      { key: 'column_0002', header: 'Score', columnIndex: 2 },
    ]
    const staged = batch({
      sourceHeaders: sourceColumns,
      status: 'UPLOADED',
      mappingRevision: 0,
    })
    tx.dataImportBatch.findFirst.mockResolvedValue(staged)
    tx.dataImportBatch.findUnique.mockResolvedValue(staged)
    tx.formField.findMany.mockResolvedValue([
      { id: '41000000-0000-4000-8000-000000000004', code: 'score' },
    ])

    await service.saveMapping(actor, projectId, batchId, {
      expectedMappingRevision: 0,
      mappings: [
        { sourceFieldName: 'column_0001', targetFieldCode: 'score', ignored: false },
        { sourceFieldName: 'column_0002', ignored: true },
      ],
    })

    expect(tx.metadataMapping.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({ sourceFieldName: 'column_0001', status: 'MAPPED' }),
        expect.objectContaining({ sourceFieldName: 'column_0002', status: 'IGNORED' }),
      ],
    })
    expect(tx.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          changes: { revision: 1, mapped: 1, ignored: 1, valueMapped: 0 },
        }),
      }),
    )
  })

  // QAD-T54
  it('stores a reviewed data type and value map, and rejects a type that does not fit', async () => {
    const staged = batch({
      sourceHeaders: [{ key: 'column_0001', header: 'Sex', columnIndex: 1 }],
      status: 'UPLOADED',
      mappingRevision: 0,
    })
    tx.dataImportBatch.findFirst.mockResolvedValue(staged)
    tx.dataImportBatch.findUnique.mockResolvedValue(staged)
    tx.formField.findMany.mockResolvedValue([
      { id: '41000000-0000-4000-8000-000000000005', code: 'sex', dataType: 'SELECT' },
    ])
    const mapped = {
      sourceFieldName: 'column_0001',
      targetFieldCode: 'sex',
      ignored: false,
    }

    await service.saveMapping(actor, projectId, batchId, {
      expectedMappingRevision: 0,
      mappings: [{ ...mapped, dataType: 'TEXT', valueMap: [{ from: 'M', to: 'Male' }] }],
    })
    expect(tx.metadataMapping.createMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({ dataType: 'TEXT', valueMap: [{ from: 'M', to: 'Male' }] })],
    })

    tx.metadataMapping.createMany.mockClear()
    for (const bad of [
      { dataType: 'INTEGER' as const },
      {
        valueMap: [
          { from: 'M', to: 'Male' },
          { from: ' m', to: 'Man' },
        ],
      },
    ]) {
      await expect(
        service.saveMapping(actor, projectId, batchId, {
          expectedMappingRevision: 0,
          mappings: [{ ...mapped, ...bad }],
        }),
      ).rejects.toBeInstanceOf(BadRequestException)
    }
    expect(tx.metadataMapping.createMany).not.toHaveBeenCalled()
  })

  it('keeps the mapped-field ceiling at 100 for a wider source file', async () => {
    const sourceColumns = Array.from({ length: 101 }, (_, index) => ({
      key: `column_${String(index + 1).padStart(4, '0')}`,
      header: `Field ${index + 1}`,
      columnIndex: index + 1,
    }))
    const staged = batch({
      sourceHeaders: sourceColumns,
      status: 'UPLOADED',
      mappingRevision: 0,
    })
    tx.dataImportBatch.findFirst.mockResolvedValue(staged)
    tx.dataImportBatch.findUnique.mockResolvedValue(staged)
    tx.formField.findMany.mockResolvedValue(
      sourceColumns.map((column) => ({ id: `${column.key}-id`, code: column.key })),
    )

    await expect(
      service.saveMapping(actor, projectId, batchId, {
        expectedMappingRevision: 0,
        mappings: sourceColumns.map((column) => ({
          sourceFieldName: column.key,
          targetFieldCode: column.key,
          ignored: false,
        })),
      }),
    ).rejects.toBeInstanceOf(BadRequestException)
    expect(tx.metadataMapping.createMany).not.toHaveBeenCalled()
  })

  it('persists a recovery-required checkpoint when Storage succeeds and DB finalization fails', async () => {
    const reservation = batch({
      sourceHeaders: [],
      storageStatus: 'RESERVED',
      status: 'UPLOADING',
      mappingRevision: 0,
      totalRows: 0,
    })
    tx.digitalForm.findFirst.mockResolvedValue({ id: formId, version: 1 })
    tx.dataImportBatch.findFirst.mockImplementation(async (args) =>
      'clientImportId' in args.where ? null : reservation,
    )
    tx.dataImportBatch.findUnique.mockResolvedValue(reservation)
    tx.dataImportBatch.create.mockResolvedValue({ id: batchId })
    tx.dataImportRow.createMany.mockRejectedValue(new Error('synthetic transaction failure'))
    storage.uploadPrivateFile.mockResolvedValue({ path: 'private' })

    await expect(
      service.upload(actor, projectId, { formId, clientImportId }, file()),
    ).rejects.toBeInstanceOf(ServiceUnavailableException)
    expect(storage.uploadPrivateFile).toHaveBeenCalledWith(
      testUploadsBucket,
      expect.stringMatching(
        new RegExp(
          `^organizations/${organizationId}/projects/${projectId}/imports/.+/[0-9a-f]{64}\\.csv$`,
        ),
      ),
      expect.any(Buffer),
      'text/csv',
    )
    expect(tx.dataImportBatch.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'RECOVERY_REQUIRED',
          storageStatus: 'RECOVERY_REQUIRED',
        }),
      }),
    )
  })

  it('makes only the exact W10 upload fail once after Storage and resumes without a duplicate row', async () => {
    const w10OrganizationId = '7541cfc6-541d-4057-9229-03d89d361d34'
    const w10ProjectId = 'f284d573-c248-4e38-ae0b-115b44190909'
    const w10FormId = '70da2b64-42c5-4c05-8c88-5c4b814f885e'
    const source = Buffer.from('record_key,count,score\nP07-W10-RECOVERY-001,0,0.0\n')
    expect(createHash('sha256').update(source).digest('hex')).toBe(W10_SOURCE_SHA256)
    vi.stubEnv('NODE_ENV', 'development')
    vi.stubEnv('SUPABASE_URL', 'https://pdqwsknbzkdtiwjjibqt.supabase.co')
    vi.stubEnv('UPLOADS_BUCKET', 'pathways-private')
    vi.stubEnv('P07_W10_FAIL_FINALIZATION_ONCE', W10_CLIENT_IMPORT_ID)
    state.actor = {
      ...actor,
      organizationId: w10OrganizationId,
      assignedProjectIds: [w10ProjectId],
    }
    const reservation = batch({
      organizationId: w10OrganizationId,
      projectId: w10ProjectId,
      formId: w10FormId,
      clientImportId: W10_CLIENT_IMPORT_ID,
      sourceChecksum: W10_SOURCE_SHA256,
      storageBucket: 'pathways-private',
      storageStatus: 'RESERVED',
      status: 'UPLOADING',
      totalRows: 0,
      sourceHeaders: [],
    })
    tx.digitalForm.findFirst.mockResolvedValue({ id: w10FormId, version: 1 })
    tx.dataImportBatch.findFirst.mockImplementation(async (args) =>
      'clientImportId' in args.where ? null : reservation,
    )
    tx.dataImportBatch.findUnique.mockResolvedValue(reservation)
    tx.dataImportBatch.create.mockResolvedValue({ id: batchId })
    tx.dataImportRow.createMany.mockResolvedValue({ count: 1 })
    storage.uploadPrivateFile.mockResolvedValue({ path: 'private' })
    storage.downloadPrivateFile.mockResolvedValue(source)
    const upload = {
      buffer: source,
      originalname: 'P07-W10-RECOVERY-001.csv',
      mimetype: 'text/csv',
      size: source.length,
    }

    await expect(
      service.upload(
        state.actor,
        w10ProjectId,
        { formId: w10FormId, clientImportId: W10_CLIENT_IMPORT_ID },
        upload,
      ),
    ).rejects.toBeInstanceOf(ServiceUnavailableException)
    expect(storage.uploadPrivateFile).toHaveBeenCalledTimes(1)
    expect(tx.dataImportRow.createMany).not.toHaveBeenCalled()
    expect(tx.dataImportBatch.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'RECOVERY_REQUIRED' }) }),
    )

    await expect(service.resumeUpload(state.actor, w10ProjectId, batchId)).resolves.toMatchObject({
      id: batchId,
    })
    expect(storage.downloadPrivateFile).toHaveBeenCalledTimes(1)
    expect(tx.dataImportRow.createMany).toHaveBeenCalledTimes(1)
    expect(storage.uploadPrivateFile).toHaveBeenCalledTimes(1)
  })
})
