import 'reflect-metadata'

import { BadRequestException, ValidationPipe } from '@nestjs/common'
import { describe, expect, it } from 'vitest'

import {
  automaticImportMappingRequest,
  importRowsQuery,
  processImportRequest,
  saveImportMappingRequest,
  supportedFormFieldTypes,
  uploadImportRequest,
} from '@pathways/shared'
import { ZodPipe } from '../../common/validation/zod-pipe'
import {
  AutomaticImportMappingDto,
  IMPORT_DATA_TYPES,
  ImportRowsQueryDto,
  ProcessImportDto,
  SaveImportMappingDto,
  UploadImportDto,
} from './imports.dto'

// Same options as main.ts.
const globalPipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  forbidUnknownValues: false,
})

type Kind = 'body' | 'query'
type Outcome = { accepted: boolean; value: unknown }
type Pipe = { transform(value: unknown): unknown }

// Records a pipe rejection; an error that is not a 400 is recorded by its class name.
function rejected(error: unknown): Outcome {
  if (!(error instanceof BadRequestException)) {
    return { accepted: false, value: (error as Error).name }
  }
  return { accepted: false, value: error.getResponse() }
}

// The old route: the global pipe with the DTO as metatype.
async function viaDto(input: unknown, metatype: new () => object, type: Kind): Promise<Outcome> {
  try {
    const dto = await globalPipe.transform(input, { type, metatype })
    return { accepted: true, value: JSON.parse(JSON.stringify(dto)) }
  } catch (error) {
    return rejected(error)
  }
}

// The new route: the global pipe with an Object metatype, then the zod pipe.
async function viaZod(input: unknown, pipe: Pipe, type: Kind): Promise<Outcome> {
  try {
    const value = await globalPipe.transform(input, { type, metatype: Object })
    return { accepted: true, value: JSON.parse(JSON.stringify(pipe.transform(value))) }
  } catch (error) {
    return rejected(error)
  }
}

const badRequestShape = {
  accepted: false,
  value: {
    statusCode: 400,
    error: 'Bad Request',
    message: expect.arrayContaining([expect.any(String)]),
  },
}
const uuid = '10000000-0000-4000-8000-000000000001'
const bell = String.fromCharCode(7)
// Multer builds multipart fields on a null-prototype object.
const multipart = (fields: Record<string, unknown>) =>
  Object.assign(Object.create(null) as Record<string, unknown>, fields)
const item = (extra: Record<string, unknown> = {}) => ({
  sourceFieldName: 'column_0001',
  targetFieldCode: 'sex',
  ignored: false,
  ...extra,
})
const mapping = (mappings: unknown, revision: unknown = 0) =>
  JSON.stringify({ expectedMappingRevision: revision, mappings })
const entries = (count: number) =>
  Array.from({ length: count }, (_, index) => ({ from: `k${index}`, to: 'v' }))
const routes: Record<string, [new () => object, Pipe, Kind]> = {
  upload: [UploadImportDto, new ZodPipe(uploadImportRequest), 'body'],
  mapping: [SaveImportMappingDto, new ZodPipe(saveImportMappingRequest), 'body'],
  automatic: [AutomaticImportMappingDto, new ZodPipe(automaticImportMappingRequest), 'body'],
  process: [ProcessImportDto, new ZodPipe(processImportRequest), 'body'],
  rows: [ImportRowsQueryDto, new ZodPipe(importRowsQuery), 'query'],
}
type Case = [string, unknown]

// A JSON string is parsed fresh for each pipe; multipart fields and query objects pass as built.
const input = (value: unknown) => (typeof value === 'string' ? JSON.parse(value) : value)
async function both(route: string, value: unknown) {
  const [dto, pipe, type] = routes[route]
  return {
    dto: await viaDto(input(value), dto, type),
    zod: await viaZod(input(value), pipe, type),
  }
}

const acceptedCases: Case[] = [
  ['upload', multipart({ formId: uuid, clientImportId: uuid.toUpperCase() })],
  ['mapping', mapping([item()])],
  ['mapping', mapping([item({ sourceFieldName: '  column_0001  ', targetFieldCode: ' SEX ' })])],
  [
    'mapping',
    mapping([item({ targetFieldCode: null, ignored: true, dataType: null, valueMap: null })]),
  ],
  ['mapping', mapping([{ sourceFieldName: 'column_0001', ignored: true }])],
  ['mapping', mapping([item({ dataType: 'TEXT', valueMap: [{ from: ' M ', to: ' Male ' }] })])],
  [
    'mapping',
    mapping([
      item({
        valueMap: [
          { from: 'M', to: '-5' },
          { from: 'F', to: '' },
        ],
      }),
    ]),
  ],
  ['mapping', mapping([item({ valueMap: entries(50) })])],
  ['mapping', mapping([item({ sourceFieldName: 'x'.repeat(100) })])],
  ['mapping', mapping([item({ targetFieldCode: `a${'b'.repeat(63)}` })])],
  ['mapping', mapping(Array.from({ length: 500 }, () => item()))],
  ['mapping', mapping([item()], 7)],
  ['automatic', '{"expectedMappingRevision":0}'],
  ['automatic', '{"expectedMappingRevision":1}'],
  ['automatic', '{"expectedMappingRevision":-0}'],
  ['automatic', '{"expectedMappingRevision":1.0}'],
  ['process', '{"expectedValidationRevision":1}'],
  ['process', '{"expectedValidationRevision":9007199254740993}'],
  ['rows', {}],
  ['rows', { offset: '0', take: '1' }],
  ['rows', { offset: '50000', take: '100' }],
  ['rows', { offset: '', take: '7' }],
  ['rows', { offset: ' 3 ', take: '0x10' }],
  ['rows', { offset: '1e3' }],
]

const rejectedCases: Case[] = [
  ['upload', multipart({ formId: uuid })],
  ['upload', multipart({ formId: 'not-a-uuid', clientImportId: uuid })],
  ['upload', multipart({ formId: [uuid, uuid], clientImportId: uuid })],
  ['upload', multipart({ formId: uuid, clientImportId: uuid, extra: 'x' })],
  ['upload', multipart({ formId: '10000000-0000-0000-8000-000000000001', clientImportId: uuid })],
  ['mapping', mapping([])],
  ['mapping', mapping(Array.from({ length: 501 }, () => item()))],
  ['mapping', mapping([item()], -1)],
  ['mapping', mapping([item()], 1.5)],
  ['mapping', mapping([item()], '1')],
  ['mapping', mapping({ 0: item() })],
  ['mapping', mapping([null])],
  ['mapping', mapping(['column_0001'])],
  ['mapping', mapping([item({ extra: 1 })])],
  ['mapping', mapping([item({ sourceFieldName: '   ' })])],
  ['mapping', mapping([item({ sourceFieldName: 'x'.repeat(101) })])],
  ['mapping', mapping([item({ sourceFieldName: 7 })])],
  ['mapping', mapping([item({ targetFieldCode: '' })])],
  ['mapping', mapping([item({ targetFieldCode: '1sex' })])],
  ['mapping', mapping([item({ targetFieldCode: `a${'b'.repeat(64)}` })])],
  ['mapping', mapping([item({ targetFieldCode: 5 })])],
  ['mapping', mapping([item({ ignored: 'false' })])],
  ['mapping', mapping([{ sourceFieldName: 'column_0001', targetFieldCode: 'sex' }])],
  ['mapping', mapping([item({ dataType: 'JSON' })])],
  ['mapping', mapping([item({ valueMap: [] })])],
  ['mapping', mapping([item({ valueMap: entries(51) })])],
  ['mapping', mapping([item({ valueMap: { from: 'M', to: 'Male' } })])],
  ['mapping', mapping([item({ valueMap: [null] })])],
  ['mapping', mapping([item({ valueMap: [{ from: 'M', to: 'Male', note: 'x' }] })])],
  ['mapping', mapping([item({ valueMap: [{ from: '  ', to: 'v' }] })])],
  ['mapping', mapping([item({ valueMap: [{ from: 'M', to: '=HYPERLINK("x")' }] })])],
  ['mapping', mapping([item({ valueMap: [{ from: '@SUM(1)', to: 'v' }] })])],
  ['mapping', mapping([item({ valueMap: [{ from: '+1', to: 'v' }] })])],
  ['mapping', mapping([item({ valueMap: [{ from: 'M', to: '-cmd' }] })])],
  ['mapping', mapping([item({ valueMap: [{ from: 'M', to: `a${bell}b` }] })])],
  ['mapping', mapping([item({ valueMap: [{ from: 'M', to: 'x'.repeat(101) }] })])],
  ['mapping', mapping([item({ valueMap: [{ from: 'M' }] })])],
  ['mapping', '{"mappings":[]}'],
  ['mapping', '[]'],
  ['automatic', '{"expectedMappingRevision":2}'],
  ['automatic', '{"expectedMappingRevision":"0"}'],
  ['automatic', '{"expectedMappingRevision":null}'],
  ['automatic', '{}'],
  ['automatic', '{"expectedMappingRevision":0,"target":"private"}'],
  ['process', '{"expectedValidationRevision":0}'],
  ['process', '{"expectedValidationRevision":"1"}'],
  ['process', '{"expectedValidationRevision":1,"extra":true}'],
  ['rows', { offset: '-1' }],
  ['rows', { offset: '50001' }],
  ['rows', { take: '0' }],
  ['rows', { take: '' }],
  ['rows', { take: '101' }],
  ['rows', { offset: '1.5' }],
  ['rows', { offset: 'abc' }],
  ['rows', { offset: ['5'] }],
  ['rows', { offset: { a: '5' } }],
  ['rows', { foo: '1' }],
]

describe('import DTOs and request contracts parity', () => {
  it('keeps the import data types equal to the shared form field types', () => {
    expect([...IMPORT_DATA_TYPES]).toEqual([...supportedFormFieldTypes])
  })

  it.each(acceptedCases)('%s accepts %j with the same value', async (route, value) => {
    const { dto, zod } = await both(route, value)
    expect(dto.accepted).toBe(true)
    expect(zod).toEqual(dto)
  })

  it.each(rejectedCases)('%s answers the 400 shape for %j', async (route, value) => {
    const { dto, zod } = await both(route, value)
    expect(dto).toEqual(badRequestShape)
    expect(zod).toEqual(badRequestShape)
  })

  // Ruling 3: the DTO pipe let an array through where an entry object belongs; the service then answered 400 or 409.
  it.each([
    ['mapping', mapping([[]])],
    ['mapping', mapping([item({ valueMap: [[]] })])],
  ] as Case[])('only the contract rejects the array entry in %s %j', async (route, value) => {
    const { dto, zod } = await both(route, value)
    expect(dto.accepted).toBe(true)
    expect(zod).toEqual(badRequestShape)
  })

  // F3b ruling 3: the DTO pipe dropped own prototype keys; strict contracts reject them.
  it.each([
    [
      'mapping',
      '{"expectedMappingRevision":0,"mappings":[{"sourceFieldName":"a","ignored":true}],"__proto__":{"a":1}}',
    ],
    [
      'mapping',
      '{"expectedMappingRevision":0,"mappings":[{"sourceFieldName":"a","ignored":true,"constructor":{"a":1}}]}',
    ],
    ['automatic', '{"expectedMappingRevision":0,"__proto__":{"a":1}}'],
    ['process', '{"expectedValidationRevision":1,"constructor":{"a":1}}'],
  ] as Case[])('only the contract rejects the prototype key in %s %j', async (route, value) => {
    const { dto, zod } = await both(route, value)
    expect(dto.accepted).toBe(true)
    expect(zod).toEqual(badRequestShape)
  })
})
