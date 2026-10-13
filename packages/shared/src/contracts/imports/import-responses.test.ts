import { describe, expect, it } from 'vitest'

import {
  importBatchDetailResponse,
  importBatchResponse,
  importRowsPageResponse,
} from './import-responses'

const uuid = '10000000-0000-4000-8000-000000000001'
const batch = {
  id: uuid,
  projectId: uuid,
  formId: uuid,
  formVersion: 2,
  formCode: 'intake',
  formName: 'Intake form',
  formType: 'OTHER',
  originalFileName: 'rows.csv',
  fileType: 'CSV',
  clientImportId: uuid,
  storageStatus: 'STORED',
  status: 'VALIDATED',
  mappingRevision: 1,
  validationRevision: 1,
  validatedMappingRevision: 1,
  processingRevision: 0,
  totals: { rows: 3, valid: 2, invalid: 1, processed: 0, unprocessed: 0, failed: 0 },
  failureCode: null,
  uploadedAt: '2026-10-13T00:00:00.000Z',
  updatedAt: '2026-10-13T00:00:00.000Z',
}
const detail = {
  ...batch,
  sourceHeaders: ['column_0001'],
  sourceColumns: [{ key: 'column_0001', header: 'Name', columnIndex: 1 }],
  mappings: [
    {
      sourceFieldName: 'column_0001',
      status: 'MAPPED',
      revision: 1,
      targetField: { code: 'name', label: 'Name' },
      validationMessage: null,
      suggestedField: null,
      matchScore: null,
      matchReason: null,
      dataType: 'TEXT',
      valueMap: [{ from: 'M', to: 'Male' }],
    },
  ],
}
const row = {
  id: uuid,
  rowNumber: 1,
  rawData: { column_0001: 'Sample', column_0002: 4, column_0003: null },
  status: 'INVALID',
  validationErrors: [{ fieldCode: 'name', code: 'required', message: 'Name is required.' }],
  mappingRevision: 1,
  validationRevision: 1,
  processingAttempts: 0,
  processingErrorCode: null,
  updatedAt: '2026-10-13T00:00:00.000Z',
}

describe('import response contracts', () => {
  it('describe a batch, its detail and a row page', () => {
    expect(importBatchResponse.safeParse(batch).success).toBe(true)
    expect(importBatchResponse.safeParse({ ...batch, validatedAt: '2026-10-13' }).success).toBe(
      true,
    )
    expect(importBatchDetailResponse.safeParse(detail).success).toBe(true)
    expect(
      importRowsPageResponse.safeParse({ offset: 0, take: 100, total: 1, rows: [row] }).success,
    ).toBe(true)
  })

  it('accept the JSON and OTHER file types and a batch with both timestamps', () => {
    for (const fileType of ['JSON', 'OTHER']) {
      expect(importBatchResponse.safeParse({ ...batch, fileType }).success).toBe(true)
    }
    const stamped = { ...batch, validatedAt: '2026-10-13', processedAt: '2026-10-14' }
    expect(importBatchResponse.parse(stamped)).toEqual(stamped)
  })

  it('reject an object that is missing required members', () => {
    expect(importBatchResponse.safeParse({ ...batch, totals: { rows: 3 } }).success).toBe(false)
    expect(importBatchDetailResponse.safeParse(batch).success).toBe(false)
  })

  it('reject a batch that differs from a valid one by a single property', () => {
    const { failed: _failed, ...fewerTotals } = batch.totals
    expect(importBatchResponse.safeParse({ ...batch, status: 'VALIDATING' }).success).toBe(false)
    expect(importBatchResponse.safeParse({ ...batch, totals: fewerTotals }).success).toBe(false)
    expect(
      importBatchResponse.safeParse({ ...batch, totals: { ...batch.totals, valid: '2' } }).success,
    ).toBe(false)
  })

  it('reject a detail that lacks one of the source headers, source columns or mappings', () => {
    const { sourceHeaders: _headers, ...noHeaders } = detail
    const { sourceColumns: _columns, ...noColumns } = detail
    const { mappings: _mappings, ...noMappings } = detail
    for (const broken of [noHeaders, noColumns, noMappings]) {
      expect(importBatchDetailResponse.safeParse(broken).success).toBe(false)
    }
  })

  it('reject a mapping with a value map entry that has no target text', () => {
    const broken = { ...detail, mappings: [{ ...detail.mappings[0], valueMap: [{ from: 'M' }] }] }
    expect(importBatchDetailResponse.safeParse(broken).success).toBe(false)
  })

  it('reject a row whose raw value is an object or whose error has no code', () => {
    const page = (next: unknown) =>
      importRowsPageResponse.safeParse({ offset: 0, take: 1, total: 1, rows: [next] }).success
    expect(page({ ...row, rawData: { column_0001: { nested: true } } })).toBe(false)
    expect(page({ ...row, validationErrors: [{ fieldCode: 'name', message: 'x' }] })).toBe(false)
  })
})
