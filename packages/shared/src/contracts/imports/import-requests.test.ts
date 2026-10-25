import { describe, expect, it } from 'vitest'

import {
  type ValidateImportRequest,
  automaticImportMappingRequest,
  importMappingItemRequest,
  importRowsQuery,
  processImportRequest,
  rerunImportRequest,
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
    ['upload', uploadImportRequest, { formId: uuid, clientImportId: uuid, sheetName: 'Two' }, true],
    [
      'upload',
      uploadImportRequest,
      { formId: uuid, clientImportId: uuid, sheetName: '   ' },
      false,
    ],
    [
      'upload',
      uploadImportRequest,
      { formId: uuid, clientImportId: uuid, sheetName: 'a\tb' },
      false,
    ],
    [
      'upload',
      uploadImportRequest,
      { formId: uuid, clientImportId: uuid, sheetName: 's'.repeat(101) },
      false,
    ],
    ['automatic', automaticImportMappingRequest, { expectedMappingRevision: 1 }, true],
    ['automatic', automaticImportMappingRequest, { expectedMappingRevision: 2 }, false],
    ['rerun', rerunImportRequest, { formId: uuid }, true],
    ['rerun', rerunImportRequest, { formId: uuid, extra: 'x' }, false],
    ['rerun', rerunImportRequest, { formId: 'nope' }, false],
    ['process', processImportRequest, { expectedValidationRevision: 1 }, true],
    ['process', processImportRequest, { expectedValidationRevision: 0 }, false],
  ] as const)('%s body %j is accepted: %s', (_route, schema, body, expected) => {
    expect(accepts(schema, body)).toBe(expected)
  })
})

describe('upload sheet name', () => {
  it('keeps a sheet name exactly, trailing space included, so the parser can match it', () => {
    const uuid = '30000000-0000-4000-8000-000000000003'
    expect(
      uploadImportRequest.parse({ formId: uuid, clientImportId: uuid, sheetName: 'Data ' })
        .sheetName,
    ).toBe('Data ')
  })
})

describe('row page caps', () => {
  it.each([
    [{ offset: '0', take: '1' }, true],
    [{ offset: '50000', take: '100' }, true],
    [{ offset: '', take: '7' }, true],
    [{ offset: '1e3' }, true],
    [{ offset: '-1' }, false],
    [{ offset: '50001' }, false],
    [{ take: '0' }, false],
    [{ take: '101' }, false],
    [{ offset: '1.5' }, false],
    [{ offset: 'abc' }, false],
    [{ offset: { a: '5' } }, false],
    [{ foo: '1' }, false],
  ])('query %j is accepted: %s', (query, expected) => {
    expect(accepts(importRowsQuery, query)).toBe(expected)
  })

  it('reads an empty offset as zero', () => {
    expect(importRowsQuery.parse({ offset: '', take: '7' })).toEqual({ offset: 0, take: 7 })
  })
})

describe('save mapping body rules', () => {
  const column = (extra: Record<string, unknown> = {}) => ({
    sourceFieldName: 'column_0001',
    targetFieldCode: 'sex',
    ignored: false,
    ...extra,
  })
  const body = (mappings: unknown, expectedMappingRevision: unknown = 0) => ({
    expectedMappingRevision,
    mappings,
  })
  const entries = (count: number) =>
    Array.from({ length: count }, (_, index) => ({ from: `k${index}`, to: 'v' }))
  const withMap = (valueMap: unknown) => body([column({ valueMap })])
  const bell = String.fromCharCode(7)

  it.each([
    ['one mapping', body([column()]), true],
    ['500 mappings', body(Array.from({ length: 500 }, () => column())), true],
    ['revision 7', body([column()], 7), true],
    ['source name of 100', body([column({ sourceFieldName: 'x'.repeat(100) })]), true],
    ['target code of 64', body([column({ targetFieldCode: `a${'b'.repeat(63)}` })]), true],
    ['ignored without a target', body([{ sourceFieldName: 'column_0001', ignored: true }]), true],
    ['null data type and map', body([column({ dataType: null, valueMap: null })]), true],
    ['50 map entries', withMap(entries(50)), true],
    ['negative number as map text', withMap([{ from: 'M', to: '-5' }]), true],
    ['empty map target', withMap([{ from: 'M', to: '' }]), true],
    ['map text of 100', withMap([{ from: 'M', to: 'x'.repeat(100) }]), true],
    ['no mappings', body([]), false],
    ['501 mappings', body(Array.from({ length: 501 }, () => column())), false],
    ['object in place of the list', body({ 0: column() }), false],
    ['null mapping', body([null]), false],
    ['string mapping', body(['column_0001']), false],
    ['revision -1', body([column()], -1), false],
    ['revision 1.5', body([column()], 1.5), false],
    ['revision as string', body([column()], '1'), false],
    ['no revision', { mappings: [column()] }, false],
    ['no mappings key', { expectedMappingRevision: 0 }, false],
    ['blank source name', body([column({ sourceFieldName: '   ' })]), false],
    ['source name of 101', body([column({ sourceFieldName: 'x'.repeat(101) })]), false],
    ['numeric source name', body([column({ sourceFieldName: 7 })]), false],
    ['empty target code', body([column({ targetFieldCode: '' })]), false],
    ['target code with a leading digit', body([column({ targetFieldCode: '1sex' })]), false],
    ['target code of 65', body([column({ targetFieldCode: `a${'b'.repeat(64)}` })]), false],
    ['numeric target code', body([column({ targetFieldCode: 5 })]), false],
    ['ignored as string', body([column({ ignored: 'false' })]), false],
    ['no ignored flag', body([{ sourceFieldName: 'column_0001', targetFieldCode: 'sex' }]), false],
    ['unknown data type', body([column({ dataType: 'JSON' })]), false],
    ['empty value map', withMap([]), false],
    ['51 map entries', withMap(entries(51)), false],
    ['object in place of the map', withMap({ from: 'M', to: 'Male' }), false],
    ['null map entry', withMap([null]), false],
    ['blank map source', withMap([{ from: '  ', to: 'v' }]), false],
    ['map target of 101', withMap([{ from: 'M', to: 'x'.repeat(101) }]), false],
    ['map entry without target', withMap([{ from: 'M' }]), false],
    ['plus prefix on map source', withMap([{ from: '+1', to: 'v' }]), false],
    ['control character in map target', withMap([{ from: 'M', to: `a${bell}b` }]), false],
    ['unknown key on the body', { ...body([column()]), extra: 1 }, false],
    ['unknown key on a mapping', body([column({ extra: 1 })]), false],
    ['unknown key on a map entry', withMap([{ from: 'M', to: 'Male', note: 'x' }]), false],
  ])('%s is accepted: %s', (_name, value, expected) => {
    expect(accepts(saveImportMappingRequest, value)).toBe(expected)
  })

  it.each([
    [
      'body',
      '{"expectedMappingRevision":0,"mappings":[{"sourceFieldName":"a","ignored":true}],"__proto__":{"a":1}}',
    ],
    [
      'mapping',
      '{"expectedMappingRevision":0,"mappings":[{"sourceFieldName":"a","ignored":true,"constructor":{"a":1}}]}',
    ],
    ['array body', '[]'],
  ])('rejects the %s %s', (_name, json) => {
    expect(accepts(saveImportMappingRequest, JSON.parse(json))).toBe(false)
  })

  it('rejects an array entry in the list and in the map', () => {
    expect(accepts(saveImportMappingRequest, body([[]]))).toBe(false)
    expect(accepts(saveImportMappingRequest, withMap([[]]))).toBe(false)
  })
})

describe('other import bodies', () => {
  it.each([
    ['upload', uploadImportRequest, { formId: uuid }, false],
    ['upload', uploadImportRequest, { formId: 'not-a-uuid', clientImportId: uuid }, false],
    ['upload', uploadImportRequest, { formId: [uuid, uuid], clientImportId: uuid }, false],
    [
      'upload',
      uploadImportRequest,
      { formId: '10000000-0000-0000-8000-000000000001', clientImportId: uuid },
      false,
    ],
    ['upload', uploadImportRequest, { formId: uuid, clientImportId: uuid.toUpperCase() }, true],
    ['automatic', automaticImportMappingRequest, { expectedMappingRevision: 0 }, true],
    ['automatic', automaticImportMappingRequest, { expectedMappingRevision: -0 }, true],
    ['automatic', automaticImportMappingRequest, { expectedMappingRevision: '0' }, false],
    ['automatic', automaticImportMappingRequest, { expectedMappingRevision: null }, false],
    ['automatic', automaticImportMappingRequest, {}, false],
    [
      'automatic',
      automaticImportMappingRequest,
      { expectedMappingRevision: 0, target: 'private' },
      false,
    ],
    ['process', processImportRequest, { expectedValidationRevision: 2 ** 53 }, true],
    ['process', processImportRequest, { expectedValidationRevision: '1' }, false],
    ['process', processImportRequest, { expectedValidationRevision: 1, extra: true }, false],
  ] as const)('%s row %#: accepted %s', (_route, schema, body, expected) => {
    expect(accepts(schema, body)).toBe(expected)
  })
})
