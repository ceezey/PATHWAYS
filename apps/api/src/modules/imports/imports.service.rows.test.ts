// biome-ignore organizeImports: the harness registers the module mocks and must load first
import {
  actor,
  batch,
  batchId,
  projectId,
  publisherId,
  service,
  tx,
  useImportsHarness,
} from './imports.service.harness'

import { NotFoundException } from '@nestjs/common'
import { describe, expect, it } from 'vitest'

const registrationForm = {
  code: 'registration',
  name: 'Registration',
  formType: 'BENEFICIARY_REGISTRATION',
  status: 'PUBLISHED',
  publishedById: publisherId,
}

describe('import rows listing', () => {
  useImportsHarness()

  it('lists every row of the batch and reports the batch total by default', async () => {
    tx.dataImportBatch.findFirst.mockResolvedValue(batch({ totalRows: 250 }))
    tx.dataImportRow.findMany.mockResolvedValue([])
    const page = await service.listRows(actor, projectId, batchId, { offset: 0, take: 100 })
    expect(page.total).toBe(250)
    expect(tx.dataImportRow.count).not.toHaveBeenCalled()
    const where = tx.dataImportRow.findMany.mock.calls[0][0].where
    expect(where).toEqual({
      organizationId: actor.organizationId,
      projectId,
      importBatchId: batchId,
    })
  })

  it('filters to held rows, includes invalid registration rows and counts the filtered rows', async () => {
    tx.dataImportBatch.findFirst.mockResolvedValue(batch({ form: registrationForm }))
    tx.dataImportRow.findMany.mockResolvedValue([])
    tx.dataImportRow.count.mockResolvedValue(130)
    const page = await service.listRows(actor, projectId, batchId, {
      offset: 100,
      take: 100,
      held: true,
    })
    const expected = {
      organizationId: actor.organizationId,
      projectId,
      importBatchId: batchId,
      OR: [{ status: 'UNPROCESSED', processingErrorCode: { not: null } }, { status: 'INVALID' }],
    }
    expect(page.total).toBe(130)
    expect(tx.dataImportRow.count).toHaveBeenCalledWith({ where: expected })
    expect(tx.dataImportRow.findMany.mock.calls[0][0]).toMatchObject({
      where: expected,
      skip: 100,
      take: 100,
    })
  })

  it('reports when a row was resolved and null when it was not', async () => {
    tx.dataImportBatch.findFirst.mockResolvedValue(batch({ form: registrationForm }))
    const stored = {
      rawData: {},
      validationErrors: [],
      validationWarnings: [],
      mappingRevision: 1,
      validationRevision: 1,
      processingAttempts: 1,
      processingErrorCode: 'GUARDIAN_CONSENT_REQUIRED',
      status: 'UNPROCESSED',
      updatedAt: new Date('2026-10-20T00:00:00.000Z'),
    }
    tx.dataImportRow.findMany.mockResolvedValue([
      { ...stored, id: 'a', rowNumber: 1, resolvedAt: new Date('2026-10-19T01:02:03.000Z') },
      { ...stored, id: 'b', rowNumber: 2, resolvedAt: null },
    ])
    const page = await service.listRows(actor, projectId, batchId, { offset: 0, take: 100 })
    expect(tx.dataImportRow.findMany.mock.calls[0][0].select).toMatchObject({ resolvedAt: true })
    expect(page.rows.map((row) => row.resolvedAt)).toEqual(['2026-10-19T01:02:03.000Z', null])
  })

  it('leaves invalid rows out of the held filter for other form types', async () => {
    tx.dataImportBatch.findFirst.mockResolvedValue(batch())
    tx.dataImportRow.findMany.mockResolvedValue([])
    tx.dataImportRow.count.mockResolvedValue(0)
    await service.listRows(actor, projectId, batchId, { offset: 0, take: 100, held: true })
    expect(tx.dataImportRow.findMany.mock.calls[0][0].where.OR).toEqual([
      { status: 'UNPROCESSED', processingErrorCode: { not: null } },
    ])
  })

  it('reads no rows of a batch outside the actor scope', async () => {
    tx.dataImportBatch.findFirst.mockResolvedValue(null)
    await expect(
      service.listRows(actor, projectId, batchId, { offset: 0, take: 100, held: true }),
    ).rejects.toBeInstanceOf(NotFoundException)
    expect(tx.dataImportRow.count).not.toHaveBeenCalled()
    expect(tx.dataImportRow.findMany).not.toHaveBeenCalled()
  })
})
