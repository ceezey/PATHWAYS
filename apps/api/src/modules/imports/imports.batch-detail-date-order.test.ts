// biome-ignore organizeImports: the harness registers the module mocks and must load first
import { actor, batch, projectId, service, tx, useImportsHarness } from './imports.service.harness'

import { describe, expect, it } from 'vitest'

const timeHeaders = [
  { key: 'column_0001', columnIndex: 1, header: 'Timestamp' },
  { key: 'column_0002', columnIndex: 2, header: 'Name' },
]
const registration = { ...batch().form, formType: 'BENEFICIARY_REGISTRATION' }

function stage(
  patch: Record<string, unknown> = {},
  { headers = timeHeaders, held = 1, dateOrder = null as string | null } = {},
) {
  tx.dataImportBatch.findFirst.mockResolvedValue(
    batch({ status: 'PARTIALLY_PROCESSED', unprocessedRows: 3, form: registration, ...patch }),
  )
  tx.dataImportBatch.findUnique.mockResolvedValue({ sourceHeaders: headers })
  tx.metadataMapping.findMany.mockResolvedValue([])
  tx.metadataMapping.findFirst.mockResolvedValue(dateOrder ? { dateOrder } : null)
  tx.dataImportRow.count.mockResolvedValue(held)
  // Only month-day-year reads 1/14/2026, so the whole batch, confirmed rows too, fits that one order.
  tx.dataImportRow.findMany.mockResolvedValue([
    { rawData: { column_0001: '1/14/2026 23:30:00' } },
    { rawData: { column_0001: '3/1/2026 9:00:00' } },
  ])
}
const order = async () =>
  (await service.getBatch(actor, projectId, batch().id)).submissionTimeDateOrder

describe('batch detail submission time date order', () => {
  useImportsHarness()

  it('is the one order every value of the batch fits while rows wait for an enrollment date', async () => {
    stage()
    expect(await order()).toBe('MDY')
    expect(tx.dataImportRow.count).toHaveBeenCalledWith({
      where: expect.objectContaining({
        importBatchId: batch().id,
        status: 'UNPROCESSED',
        processingErrorCode: 'ENROLLMENT_DATE_REQUIRED',
        resolvedAt: null,
      }),
    })
    expect(tx.dataImportRow.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.not.objectContaining({ status: expect.anything() }),
      }),
    )
  })

  it("is the time column mapping's stored order when it has one", async () => {
    stage({}, { dateOrder: 'DMY' })
    expect(await order()).toBe('DMY')
    expect(tx.dataImportRow.findMany).not.toHaveBeenCalled()
  })

  it('is null with no row held for a date, for another form type, or with no time column', async () => {
    stage({}, { held: 0 })
    expect(await order()).toBeNull()
    stage({ form: batch().form })
    expect(await order()).toBeNull()
    stage({}, { headers: [{ key: 'column_0001', columnIndex: 1, header: 'Name' }] })
    expect(await order()).toBeNull()
    expect(tx.dataImportRow.findMany).not.toHaveBeenCalled()
  })
})
