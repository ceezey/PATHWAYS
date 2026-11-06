// biome-ignore organizeImports: the harness registers the module mocks and must load first
import {
  actor,
  actorId,
  batch,
  batchId,
  claimId,
  formId,
  projectId,
  publisherId,
  rowId,
  secondRowId,
  service,
  tx,
  useImportsHarness,
} from './imports.service.harness'

import { ConflictException } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { describe, expect, it } from 'vitest'

import { fakeRowCounts, isRowCountsQuery } from './batch-row-counts.harness'

describe('P03 import service', () => {
  useImportsHarness()

  it.each(['PENDING', 'INVALID'])(
    'rejects unresolved %s mappings before validating rows',
    async (status) => {
      tx.dataImportBatch.findFirst.mockResolvedValue(batch())
      tx.dataImportBatch.findUnique.mockResolvedValue(batch())
      tx.metadataMapping.findMany.mockResolvedValue([
        { sourceFieldName: 'score', status, targetField: null },
      ])
      await expect(
        service.validate(actor, projectId, batchId, { expectedMappingRevision: 1 }),
      ).rejects.toBeInstanceOf(ConflictException)
      expect(tx.dataImportRow.findMany).not.toHaveBeenCalled()
      expect(tx.$executeRaw).not.toHaveBeenCalled()
      expect(tx.auditLog.create).not.toHaveBeenCalled()
    },
  )

  it('regression: a revision with a PENDING column is refused as incomplete', async () => {
    tx.dataImportBatch.findFirst.mockResolvedValue(batch())
    tx.dataImportBatch.findUnique.mockResolvedValue(batch())
    tx.metadataMapping.findMany.mockResolvedValue([
      { sourceFieldName: 'score', status: 'PENDING', targetField: null },
    ])
    await expect(
      service.validate(actor, projectId, batchId, { expectedMappingRevision: 1 }),
    ).rejects.toThrow('The reviewed mapping is incomplete.')
  })

  it('rejects unknown source keys even when the mapping count matches', async () => {
    tx.dataImportBatch.findFirst.mockResolvedValue(batch())
    tx.dataImportBatch.findUnique.mockResolvedValue(batch())
    tx.metadataMapping.findMany.mockResolvedValue([
      { sourceFieldName: 'other_column', status: 'IGNORED', targetField: null },
    ])
    await expect(
      service.validate(actor, projectId, batchId, { expectedMappingRevision: 1 }),
    ).rejects.toBeInstanceOf(ConflictException)
    expect(tx.dataImportRow.findMany).not.toHaveBeenCalled()
  })

  it('rejects a stale mapping revision before row validation writes', async () => {
    tx.dataImportBatch.findFirst.mockResolvedValue(batch({ mappingRevision: 2 }))
    tx.dataImportBatch.findUnique.mockResolvedValue(batch({ mappingRevision: 2 }))

    await expect(
      service.validate(actor, projectId, batchId, { expectedMappingRevision: 1 }),
    ).rejects.toBeInstanceOf(ConflictException)
    expect(tx.$executeRaw).not.toHaveBeenCalled()
  })

  it('freezes mapping and validation revisions after processing has started', async () => {
    const started = batch({ processingRevision: 1, status: 'PARTIALLY_PROCESSED' })
    tx.dataImportBatch.findFirst.mockResolvedValue(started)
    tx.dataImportBatch.findUnique.mockResolvedValue(started)

    await expect(
      service.saveMapping(actor, projectId, batchId, {
        expectedMappingRevision: 1,
        mappings: [{ sourceFieldName: 'score', targetFieldCode: 'score', ignored: false }],
      }),
    ).rejects.toBeInstanceOf(ConflictException)
    await expect(
      service.validate(actor, projectId, batchId, { expectedMappingRevision: 1 }),
    ).rejects.toBeInstanceOf(ConflictException)
    expect(tx.metadataMapping.createMany).not.toHaveBeenCalled()
    expect(tx.$executeRaw).not.toHaveBeenCalled()
  })

  it('marks duplicate metadata business keys invalid with bounded non-PII errors', async () => {
    const keyField = {
      id: '41000000-0000-4000-8000-000000000004',
      code: 'score',
      label: 'Score',
      dataType: 'DECIMAL',
      isRequired: true,
      allowedValues: null,
      minimumValue: new Prisma.Decimal(0),
      maximumValue: new Prisma.Decimal(10),
      minimumDate: null,
      maximumDate: null,
      minimumLength: null,
      maximumLength: null,
      isMetadataKey: true,
    }
    tx.dataImportBatch.findFirst.mockResolvedValue(batch())
    tx.dataImportBatch.findUnique.mockResolvedValue(batch())
    tx.metadataMapping.findMany.mockResolvedValue([
      { sourceFieldName: 'score', status: 'MAPPED', targetField: keyField },
    ])
    tx.formField.findMany.mockResolvedValue([keyField])
    tx.dataImportRow.findMany.mockResolvedValue([
      { id: rowId, rowNumber: 2, rawData: { score: '2.5' } },
      { id: secondRowId, rowNumber: 3, rawData: { score: '2.5' } },
    ])

    await service.validate(actor, projectId, batchId, { expectedMappingRevision: 1 })

    expect(tx.$executeRaw).toHaveBeenCalledOnce()
    const validationWrite = JSON.stringify(tx.$executeRaw.mock.calls[0])
    expect(validationWrite).toContain('DUPLICATE_BUSINESS_KEY')
    expect(validationWrite).not.toContain('2.5')
  })

  it('attributes the validation audit to the pinned form version and its publisher', async () => {
    const scoreField = {
      id: '41000000-0000-4000-8000-000000000004',
      code: 'score',
      label: 'Score',
      dataType: 'DECIMAL',
      isRequired: true,
      allowedValues: null,
      minimumValue: null,
      maximumValue: null,
      minimumDate: null,
      maximumDate: null,
      minimumLength: null,
      maximumLength: null,
      isMetadataKey: false,
    }
    tx.dataImportBatch.findFirst.mockResolvedValue(batch())
    tx.dataImportBatch.findUnique.mockResolvedValue(batch())
    tx.metadataMapping.findMany.mockResolvedValue([
      { sourceFieldName: 'score', status: 'MAPPED', targetField: scoreField },
    ])
    tx.formField.findMany.mockResolvedValue([scoreField])
    tx.dataImportRow.findMany.mockResolvedValue([
      { id: rowId, rowNumber: 2, rawData: { score: '2.5' } },
      { id: secondRowId, rowNumber: 3, rawData: { score: '3' } },
    ])

    await service.validate(actor, projectId, batchId, { expectedMappingRevision: 1 })

    expect(tx.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'IMPORT_VALIDATED',
        changes: expect.objectContaining({
          formVersionId: formId,
          formPublishedById: publisherId,
          warnings: 0,
        }),
      }),
    })
  })

  it('rejects an active concurrent processing claim', async () => {
    const processing = batch({
      status: 'PROCESSING',
      validationRevision: 1,
      validatedMappingRevision: 1,
      reviewedById: actorId,
      processingClaimId: claimId,
      processingClaimedAt: new Date(Date.now() + 60_000),
    })
    tx.dataImportBatch.findFirst.mockResolvedValue(processing)
    tx.dataImportBatch.findUnique.mockResolvedValue(processing)

    await expect(
      service.process(actor, projectId, batchId, { expectedValidationRevision: 1 }),
    ).rejects.toBeInstanceOf(ConflictException)
    expect(tx.dataImportRow.findMany).not.toHaveBeenCalled()
  })

  it('recovers expired row claims and clears the batch checkpoint on restart', async () => {
    const processing = batch({
      status: 'PROCESSING',
      validationRevision: 1,
      validatedMappingRevision: 1,
      reviewedById: actorId,
      processingClaimId: claimId,
      processingClaimedAt: new Date(0),
    })
    tx.dataImportBatch.findFirst.mockResolvedValue(processing)
    tx.dataImportBatch.findUnique.mockResolvedValue(processing)
    tx.dataImportRow.findMany.mockResolvedValue([])
    tx.$queryRaw.mockImplementation(async (sql) =>
      isRowCountsQuery(sql) ? fakeRowCounts([{ status: 'PROCESSED' }]) : [{ id: batchId }],
    )
    tx.metadataMapping.findMany.mockResolvedValue([])

    await service.process(actor, projectId, batchId, { expectedValidationRevision: 1 })

    expect(tx.dataImportRow.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: 'PROCESSING' }),
        data: expect.objectContaining({ status: 'VALID', processingClaimId: null }),
      }),
    )
    expect(tx.dataImportBatch.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ processingClaimId: null, processingClaimedAt: null }),
      }),
    )
  })
})
