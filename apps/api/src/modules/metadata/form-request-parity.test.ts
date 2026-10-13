import 'reflect-metadata'

import { BadRequestException, ValidationPipe } from '@nestjs/common'
import { describe, expect, it } from 'vitest'

import {
  createFormRequest,
  digitalFormTypes,
  formVersionRequest,
  generateFormRequest,
  listSubmissionsQuery,
  saveSubmissionRequest,
  submitSubmissionRequest,
  updateFormRequest,
  updateSubmissionRequest,
  validateFormValuesRequest,
} from '@pathways/shared'
import { ZodPipe } from '../../common/validation/zod-pipe'
import {
  CreateFormDto,
  ExpectedVersionDto,
  GenerateFormDto,
  ListSubmissionsQueryDto,
  SaveSubmissionDto,
  SubmitSubmissionDto,
  UpdateFormDto,
  UpdateSubmissionDto,
  ValidateValuesDto,
} from './metadata.dto'

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
const grin = String.fromCodePoint(0x1f600)
const routes: Record<string, [new () => object, Pipe, Kind]> = {
  create: [CreateFormDto, new ZodPipe(createFormRequest), 'body'],
  update: [UpdateFormDto, new ZodPipe(updateFormRequest), 'body'],
  generate: [GenerateFormDto, new ZodPipe(generateFormRequest), 'body'],
  version: [ExpectedVersionDto, new ZodPipe(formVersionRequest), 'body'],
  values: [ValidateValuesDto, new ZodPipe(validateFormValuesRequest), 'body'],
  save: [SaveSubmissionDto, new ZodPipe(saveSubmissionRequest), 'body'],
  edit: [UpdateSubmissionDto, new ZodPipe(updateSubmissionRequest), 'body'],
  submit: [SubmitSubmissionDto, new ZodPipe(submitSubmissionRequest), 'body'],
  list: [ListSubmissionsQueryDto, new ZodPipe(listSubmissionsQuery), 'query'],
}
type Case = [string, unknown]

// A JSON string is parsed fresh for each pipe; query objects pass as built.
const input = (value: unknown) => (typeof value === 'string' ? JSON.parse(value) : value)
async function both(route: string, value: unknown) {
  const [dto, pipe, type] = routes[route]
  return {
    dto: await viaDto(input(value), dto, type),
    zod: await viaZod(input(value), pipe, type),
  }
}

const field = (extra: Record<string, unknown> = {}) => ({
  code: 'first_name',
  label: 'First name',
  dataType: 'TEXT',
  required: true,
  metadataKey: false,
  sadddField: false,
  ...extra,
})
const form = (extra: Record<string, unknown> = {}, fields: unknown = [field()]) =>
  JSON.stringify({
    code: 'intake',
    name: 'Intake form',
    formType: 'TRAINING_SURVEY',
    fields,
    ...extra,
  })
const withField = (extra: Record<string, unknown>) => form({}, [field(extra)])
const stamp = '2026-09-24T00:00:00.000Z'
const save = (extra: Record<string, unknown>) =>
  JSON.stringify({ clientSubmissionId: uuid, values: { first_name: 'Ana' }, ...extra })

const acceptedCases: Case[] = [
  ['create', form()],
  ...digitalFormTypes.map((formType): Case => ['create', form({ formType })]),
  ['create', form({ code: '  INTAKE_2026 ', name: '  Intake form  ' })],
  ['create', form({ name: grin.repeat(3) })],
  ['create', form({ description: null, activityId: null, journeyStageId: null })],
  [
    'create',
    form({ description: 'x'.repeat(2000), activityId: uuid, journeyStageId: uuid.toUpperCase() }),
  ],
  ['create', form({ code: `a${'b'.repeat(63)}` })],
  [
    'create',
    form(
      {},
      Array.from({ length: 100 }, () => field()),
    ),
  ],
  ['create', withField({ code: ' FIRST_NAME ', label: '  Given name  ' })],
  ['create', withField({ allowedValues: ['Yes', 'No'], dataType: 'SELECT' })],
  ['create', withField({ allowedValues: ['x'.repeat(120)] })],
  ['create', withField({ allowedValues: [''] })],
  [
    'create',
    withField({ allowedValues: null, minimumValue: null, minimumDate: null, minimumLength: null }),
  ],
  ['create', withField({ minimumValue: '-12.5', maximumValue: '1000.1234' })],
  ['create', withField({ minimumDate: '2026-02-30', maximumDate: '2026-12-31' })],
  ['create', withField({ minimumLength: 0, maximumLength: 10000 })],
  ['update', form({ expectedUpdatedAt: stamp })],
  ['update', form({ expectedUpdatedAt: '2026-W01-1' })],
  ['generate', '{"templateKey":"training_survey","code":"ok_code","name":"Okay"}'],
  ['generate', `{"sourceFormId":"${uuid}","code":" OK_CODE ","name":"  Okay  "}`],
  ['generate', '{"templateKey":null,"sourceFormId":null,"code":"ok_code","name":"Okay"}'],
  ['generate', '{"templateKey":"","code":"ok_code","name":"Okay"}'],
  ['version', `{"expectedUpdatedAt":"${stamp}"}`],
  ['version', '{"expectedUpdatedAt":"20260924"}'],
  ['values', '{"values":{}}'],
  ['values', '{"values":{"first_name":"Ana","age":3,"tags":["a","b"],"ok":true,"empty":null}}'],
  ['values', '{"values":{"first_name":"Ana","hasOwnProperty":1,"toString":"x","valueOf":2}}'],
  ['values', '{"values":{"__proto__":{"a":1},"first_name":"Ana"}}'],
  ['save', save({})],
  ['save', save({ beneficiaryId: uuid })],
  ['edit', `{"expectedUpdatedAt":"${stamp}","values":{"first_name":"Ana"}}`],
  ['submit', `{"expectedUpdatedAt":"${stamp}"}`],
  ['list', {}],
  ['list', { offset: '10000', limit: '50' }],
  ['list', { offset: '', limit: '1' }],
  ['list', { offset: ' 2 ', limit: '0x5' }],
]

const rejectedCases: Case[] = [
  ['create', form({ code: 'a' })],
  ['create', form({ code: '1intake' })],
  ['create', form({ code: `a${'b'.repeat(64)}` })],
  ['create', form({ code: 7 })],
  ['create', form({ name: 'ab' })],
  ['create', form({ name: '   ab   ' })],
  ['create', form({ name: grin.repeat(2) })],
  ['create', form({ name: 'x'.repeat(161) })],
  ['create', form({ description: 'x'.repeat(2001) })],
  ['create', form({ description: 7 })],
  ['create', form({ formType: 'SURVEY' })],
  ['create', form({ activityId: 'not-a-uuid' })],
  ['create', form({ journeyStageId: '10000000-0000-0000-8000-000000000001' })],
  ['create', form({ extra: true })],
  ['create', form({}, [])],
  [
    'create',
    form(
      {},
      Array.from({ length: 101 }, () => field()),
    ),
  ],
  ['create', form({}, [null])],
  ['create', form({}, ['first_name'])],
  ['create', form({}, { 0: field() })],
  ['create', JSON.stringify({ code: 'intake', name: 'Intake form', formType: 'OTHER' })],
  ['create', withField({ code: '' })],
  ['create', withField({ code: 'First Name' })],
  ['create', withField({ code: `a${'b'.repeat(64)}` })],
  ['create', withField({ label: '   ' })],
  ['create', withField({ label: 'x'.repeat(161) })],
  ['create', withField({ dataType: 'JSON' })],
  ['create', withField({ required: 'true' })],
  ['create', withField({ metadataKey: 1 })],
  ['create', withField({ sadddField: null })],
  ['create', withField({ allowedValues: [] })],
  ['create', withField({ allowedValues: Array.from({ length: 101 }, (_, i) => `v${i}`) })],
  ['create', withField({ allowedValues: ['x'.repeat(121)] })],
  ['create', withField({ allowedValues: [1] })],
  ['create', withField({ allowedValues: 'Yes' })],
  ['create', withField({ minimumValue: '1.23456' })],
  ['create', withField({ minimumValue: '01' })],
  ['create', withField({ minimumValue: 5 })],
  ['create', withField({ maximumValue: '1e3' })],
  ['create', withField({ minimumDate: '2026-1-1' })],
  ['create', withField({ maximumDate: '2026-01-01T00:00:00Z' })],
  ['create', withField({ minimumLength: -1 })],
  ['create', withField({ minimumLength: 1.5 })],
  ['create', withField({ maximumLength: 0 })],
  ['create', withField({ maximumLength: 10001 })],
  ['create', withField({ maximumLength: '5' })],
  ['create', withField({ extra: 1 })],
  ['update', form()],
  ['update', form({ expectedUpdatedAt: 'yesterday' })],
  ['update', form({ expectedUpdatedAt: 5 })],
  ['generate', '{"code":"ok_code"}'],
  ['generate', '{"templateKey":7,"code":"ok_code","name":"x"}'],
  ['generate', `{"templateKey":"${'k'.repeat(65)}","code":"ok_code","name":"Okay"}`],
  ['generate', '{"sourceFormId":"not-a-uuid","code":"ok_code","name":"Okay"}'],
  ['generate', '{"templateKey":"training_survey","code":"1bad","name":"Okay"}'],
  ['generate', '{"templateKey":"training_survey","code":"ok_code","name":"Okay","fields":[]}'],
  ['version', '{}'],
  ['version', '{"expectedUpdatedAt":"not a date"}'],
  ['version', `{"expectedUpdatedAt":"${stamp}","extra":1}`],
  ['values', '{}'],
  ['values', '{"values":null}'],
  ['values', '{"values":[1]}'],
  ['values', '{"values":"x"}'],
  ['values', '{"values":{},"extra":1}'],
  ['save', save({ clientSubmissionId: 'not-a-uuid' })],
  ['save', save({ clientSubmissionId: undefined })],
  ['save', save({ beneficiaryId: 'x' })],
  ['save', save({ values: [] })],
  ['save', save({ extra: 1 })],
  ['edit', '{"values":{}}'],
  ['edit', `{"expectedUpdatedAt":"${stamp}"}`],
  ['submit', '{"expectedUpdatedAt":"x"}'],
  ['list', { offset: '-1' }],
  ['list', { offset: '10001' }],
  ['list', { limit: '0' }],
  ['list', { limit: '' }],
  ['list', { limit: '51' }],
  ['list', { offset: '2.5' }],
  ['list', { offset: ['1'] }],
  ['list', { offset: { a: '1' } }],
  ['list', { page: '1' }],
]

describe('metadata DTOs and request contracts parity', () => {
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

  // Ruling 3: the DTO pipe let an array through where a field object belongs; the service then answered 400.
  it('only the contract rejects an array in place of a field', async () => {
    const { dto, zod } = await both('create', form({}, [[]]))
    expect(dto.accepted).toBe(true)
    expect(zod).toEqual(badRequestShape)
  })

  // Ruling 3: a null beneficiary passed the DTO pipe and failed inside the service, after the form checks.
  it('only the contract rejects a null beneficiary', async () => {
    const { dto, zod } = await both('save', save({ beneficiaryId: null }))
    expect(dto.accepted).toBe(true)
    expect(zod).toEqual(badRequestShape)
  })

  // Ruling 5: a constructor key at any depth of the values crashed class-transformer, which answered 500.
  it.each([
    ['values', '{"values":{"constructor":"x"}}'],
    ['save', save({ values: { first_name: { constructor: 1 } } })],
    ['edit', `{"expectedUpdatedAt":"${stamp}","values":{"tags":[{"constructor":1}]}}`],
  ] as Case[])(
    'only the contract answers 400 for the constructor key in %s %j',
    async (route, value) => {
      const { dto, zod } = await both(route, value)
      expect(dto).toEqual({ accepted: false, value: 'TypeError' })
      expect(zod).toEqual(badRequestShape)
    },
  )

  // F3b ruling 3: the DTO pipe dropped own prototype keys; strict contracts reject them.
  it.each([
    [
      'create',
      '{"code":"intake","name":"Intake form","formType":"OTHER","fields":[{"code":"a","label":"A","dataType":"TEXT","required":true,"metadataKey":false,"sadddField":false}],"__proto__":{"a":1}}',
    ],
    [
      'create',
      '{"code":"intake","name":"Intake form","formType":"OTHER","fields":[{"code":"a","label":"A","dataType":"TEXT","required":true,"metadataKey":false,"sadddField":false,"constructor":{"a":1}}]}',
    ],
    ['version', `{"expectedUpdatedAt":"${stamp}","constructor":{"a":1}}`],
    ['save', `{"clientSubmissionId":"${uuid}","values":{},"__proto__":{"a":1}}`],
  ] as Case[])('only the contract rejects the prototype key in %s %j', async (route, value) => {
    const { dto, zod } = await both(route, value)
    expect(dto.accepted).toBe(true)
    expect(zod).toEqual(badRequestShape)
  })
})
