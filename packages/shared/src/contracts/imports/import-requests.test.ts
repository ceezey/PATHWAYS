import { describe, expect, it } from 'vitest'

import {
  type ValidateImportRequest,
  automaticImportMappingRequest,
  importMappingItemRequest,
  importRowsQuery,
  processImportRequest,
  saveImportMappingRequest,
  uploadImportRequest,
  validateImportRequest,
} from './import-requests'

const uuid = '10000000-0000-4000-8000-000000000001'
const accepts = (schema: { safeParse: (value: unknown) => { success: boolean } }, value: unknown) =>
  schema.safeParse(value).success
const item = (valueMap: unknown, dataType?: string) => ({
  sourceFieldName: 'column_0001',
  targetFieldCode: 'sex',
  ignored: false,
  dataType,
  valueMap,
})

describe('validateImportRequest', () => {
  it('accepts a positive integer mapping revision', () => {
    const body: ValidateImportRequest = validateImportRequest.parse({ expectedMappingRevision: 3 })
    expect(body).toEqual({ expectedMappingRevision: 3 })
  })

  it.each([
    { expectedMappingRevision: 0 },
    { expectedMappingRevision: 1.5 },
    { expectedMappingRevision: '2' },
    {},
    { expectedMappingRevision: 1, extra: true },
    JSON.parse('{"expectedMappingRevision":1,"__proto__":{"x":1}}'),
    { expectedMappingRevision: 1, constructor: { x: 1 } },
  ])('rejects %j', (body) => {
    expect(validateImportRequest.safeParse(body).success).toBe(false)
  })
})

// QAD-T54
describe('mapping value map contract', () => {
  it('accepts a bounded map and a known data type', () => {
    expect(accepts(importMappingItemRequest, item([{ from: 'M', to: 'Male' }], 'TEXT'))).toBe(true)
  })

  it('rejects an oversized map, an unknown type, and formula-like or control text', () => {
    const many = Array.from({ length: 51 }, (_, index) => ({ from: `k${index}`, to: 'v' }))
    expect(accepts(importMappingItemRequest, item(many))).toBe(false)
    expect(accepts(importMappingItemRequest, item([{ from: 'M', to: 'Male' }], 'JSON'))).toBe(false)
    expect(accepts(importMappingItemRequest, item([{ from: 'M', to: '=HYPERLINK("x")' }]))).toBe(
      false,
    )
    expect(accepts(importMappingItemRequest, item([{ from: '@SUM(1)', to: 'v' }]))).toBe(false)
    expect(accepts(importMappingItemRequest, item([{ from: 'M', to: '-cmd' }]))).toBe(false)
    const bell = String.fromCharCode(7)
    expect(accepts(importMappingItemRequest, item([{ from: 'M', to: `a${bell}b` }]))).toBe(false)
    expect(accepts(importMappingItemRequest, item([{ from: 'M', to: '-5' }]))).toBe(true)
  })
})

describe('import request contracts', () => {
  it('trims names and lower-cases the target code as the DTO transforms did', () => {
    expect(
      saveImportMappingRequest.parse({
        expectedMappingRevision: 0,
        mappings: [{ ...item([{ from: ' M ', to: ' Male ' }]), sourceFieldName: ' a ' }],
      }),
    ).toEqual({
      expectedMappingRevision: 0,
      mappings: [
        {
          sourceFieldName: 'a',
          targetFieldCode: 'sex',
          ignored: false,
          valueMap: [{ from: 'M', to: 'Male' }],
        },
      ],
    })
    expect(
      importMappingItemRequest.parse({ ...item(undefined), targetFieldCode: ' SEX ' }),
    ).toEqual({ sourceFieldName: 'column_0001', targetFieldCode: 'sex', ignored: false })
  })

  it('keeps null on the optional mapping fields the DTO let through', () => {
    const nulls = { targetFieldCode: null, dataType: null, valueMap: null }
    expect(importMappingItemRequest.parse({ ...item(undefined), ...nulls })).toEqual({
      sourceFieldName: 'column_0001',
      ignored: false,
      ...nulls,
    })
  })

  it('reads query bounds with Number() and applies the defaults', () => {
    expect(importRowsQuery.parse({})).toEqual({ offset: 0, take: 50 })
    expect(importRowsQuery.parse({ offset: ' 3 ', take: '0x10' })).toEqual({ offset: 3, take: 16 })
    expect(accepts(importRowsQuery, { offset: ['5'] })).toBe(false)
    expect(accepts(importRowsQuery, { take: '' })).toBe(false)
  })

  it.each([
    ['upload', uploadImportRequest, { formId: uuid, clientImportId: uuid }, true],
    ['upload', uploadImportRequest, { formId: uuid, clientImportId: uuid, extra: 'x' }, false],
    ['automatic', automaticImportMappingRequest, { expectedMappingRevision: 1 }, true],
    ['automatic', automaticImportMappingRequest, { expectedMappingRevision: 2 }, false],
    ['process', processImportRequest, { expectedValidationRevision: 1 }, true],
    ['process', processImportRequest, { expectedValidationRevision: 0 }, false],
  ] as const)('%s body %j is accepted: %s', (_route, schema, body, expected) => {
    expect(accepts(schema, body)).toBe(expected)
  })
})
