import 'reflect-metadata'

import { BadRequestException, ValidationPipe } from '@nestjs/common'
import { describe, expect, it } from 'vitest'

import {
  archiveBeneficiaryRequest,
  beneficiaryListQuery,
  enrollBeneficiaryRequest,
  registerBeneficiaryRequest,
  resolveDuplicateRequest,
  updateBeneficiaryRequest,
} from '@pathways/shared'
import { ZodPipe } from '../../common/validation/zod-pipe'
import {
  ArchiveBeneficiaryDto,
  BeneficiaryListQueryDto,
  EnrollBeneficiaryDto,
  RegisterBeneficiaryDto,
  ResolveDuplicateDto,
  UpdateBeneficiaryDto,
} from './beneficiaries.dto'

// Same options as main.ts.
const globalPipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  forbidUnknownValues: false,
})

type Outcome = { accepted: boolean; value: unknown }
type Part = 'body' | 'query'
type Pipe = { transform(value: unknown): unknown }

// Records a pipe rejection, which must be a BadRequestException.
function rejected(error: unknown): Outcome {
  expect(error).toBeInstanceOf(BadRequestException)
  return { accepted: false, value: (error as BadRequestException).getResponse() }
}

// The old route: the global pipe with the DTO as design type, on a fresh copy of the input.
async function viaDto(input: unknown, metatype: new () => object, type: Part): Promise<Outcome> {
  try {
    const dto = await globalPipe.transform(structuredClone(input), { type, metatype })
    return { accepted: true, value: { ...dto } }
  } catch (error) {
    return rejected(error)
  }
}

// The new route: the global pipe with an Object design type, then the zod pipe.
async function viaZod(input: unknown, pipe: Pipe, type: Part): Promise<Outcome> {
  try {
    const value = await globalPipe.transform(structuredClone(input), { type, metatype: Object })
    return { accepted: true, value: pipe.transform(value) }
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
const mixed = 'ABCDEF00-0000-4000-8000-00000000000A'
const grin = String.fromCodePoint(0x1f600)
const person = {
  subjectType: 'INDIVIDUAL',
  firstName: 'Synthetic',
  lastName: 'Person',
  sex: 'NOT_SPECIFIED',
  disabilityStatus: 'NOT_SPECIFIED',
  expectedUpdatedAt: '2026-09-24T00:00:00.000Z',
}
const update = (extra: Record<string, unknown>) => ({ ...person, ...extra })
const register = (extra: Record<string, unknown>) => ({
  formId: uuid,
  clientRegistrationId: uuid,
  values: { beneficiary_code: 'BEN-1' },
  ...extra,
})

type Case = {
  name: string
  dto: new () => object
  pipe: Pipe
  type: Part
  accepted: unknown[]
  rejected: unknown[]
}

const cases: Case[] = [
  {
    name: 'BeneficiaryListQueryDto and beneficiaryListQuery',
    dto: BeneficiaryListQueryDto,
    pipe: new ZodPipe(beneficiaryListQuery),
    type: 'query',
    accepted: [
      {},
      { limit: '10' },
      { limit: '1' },
      { limit: '50' },
      { limit: ' 7 ' },
      { limit: '1e1' },
      { limit: '0x10' },
      { limit: ['10'] },
      { search: '  Ana  ' },
      { search: 'x'.repeat(80) },
      { search: grin.repeat(80) },
      { status: 'ARCHIVED', sex: 'FEMALE', disabilityStatus: 'WITH_DISABILITY' },
      { ageBand: '0-9' },
      { ageBand: 'Unknown' },
      { enrollmentStatus: 'EXITED' },
      { cursor: uuid },
      { cursor: mixed },
      { cursor: '00000000-0000-0000-0000-000000000000' },
    ],
    rejected: [
      { limit: '0' },
      { limit: '51' },
      { limit: '' },
      { limit: 'abc' },
      { limit: '1.5' },
      { limit: ['1', '2'] },
      { search: '' },
      { search: '   ' },
      { search: 'x'.repeat(81) },
      { search: ['a', 'b'] },
      { search: { a: '1' } },
      { status: 'active' },
      { status: ['ACTIVE', 'ARCHIVED'] },
      { sex: 'M' },
      { disabilityStatus: '' },
      { ageBand: '5-9' },
      { enrollmentStatus: 'DROPPED' },
      { cursor: 'abc' },
      { cursor: '10000000-0000-0000-8000-000000000001' },
      { page: '2' },
    ],
  },
  {
    name: 'RegisterBeneficiaryDto and registerBeneficiaryRequest',
    dto: RegisterBeneficiaryDto,
    pipe: new ZodPipe(registerBeneficiaryRequest),
    type: 'body',
    accepted: [
      register({}),
      register({ values: {} }),
      register({ values: { a: [1, 2], b: { c: null }, d: '2026-01-01' } }),
      register({ formId: mixed }),
    ],
    rejected: [
      register({ formId: 'x' }),
      register({ clientRegistrationId: null }),
      register({ values: [] }),
      register({ values: null }),
      register({ values: 'x' }),
      register({ extra: 1 }),
      { formId: uuid, clientRegistrationId: uuid },
      [],
    ],
  },
  {
    name: 'UpdateBeneficiaryDto and updateBeneficiaryRequest',
    dto: UpdateBeneficiaryDto,
    pipe: new ZodPipe(updateBeneficiaryRequest),
    type: 'body',
    accepted: [
      update({}),
      update({ displayName: 'x'.repeat(160), middleName: 'M' }),
      update({ displayName: null, firstName: null, middleName: null, lastName: null }),
      update({ birthDate: '2000-01-01', ageAtRegistration: 26 }),
      update({ birthDate: null, ageAtRegistration: null }),
      update({ birthDate: '2024-02-29' }),
      update({ birthDate: '20000101' }),
      update({ ageAtRegistration: 0 }),
      update({ ageAtRegistration: 130 }),
      update({ firstName: grin.repeat(120) }),
      update({ locationBarangay: 'B', locationCityMunicipality: 'C', locationProvince: 'P' }),
      update({ locationBarangay: null, locationCityMunicipality: null, locationProvince: null }),
      update({ subjectType: 'GROUP', displayName: 'Group' }),
      update({ expectedUpdatedAt: '2026-02-30' }),
      update({ expectedUpdatedAt: '2026-09-24' }),
    ],
    rejected: [
      update({ subjectType: 'PERSON' }),
      update({ subjectType: null }),
      update({ displayName: '' }),
      update({ displayName: 'x'.repeat(161) }),
      update({ firstName: '' }),
      update({ firstName: 'x'.repeat(121) }),
      update({ firstName: 1 }),
      update({ sex: null }),
      update({ sex: 'male' }),
      update({ birthDate: '2026-02-30' }),
      update({ birthDate: '2026-1-1' }),
      update({ birthDate: '' }),
      update({ ageAtRegistration: -1 }),
      update({ ageAtRegistration: 131 }),
      update({ ageAtRegistration: 1.5 }),
      update({ ageAtRegistration: '26' }),
      update({ disabilityStatus: 'NONE' }),
      update({ locationProvince: '' }),
      update({ expectedUpdatedAt: 'yesterday' }),
      update({ expectedUpdatedAt: null }),
      update({ status: 'ACTIVE' }),
      { subjectType: 'INDIVIDUAL', sex: 'NOT_SPECIFIED', disabilityStatus: 'NOT_SPECIFIED' },
      [],
    ],
  },
  {
    name: 'ArchiveBeneficiaryDto and archiveBeneficiaryRequest',
    dto: ArchiveBeneficiaryDto,
    pipe: new ZodPipe(archiveBeneficiaryRequest),
    type: 'body',
    accepted: [
      { expectedUpdatedAt: '2026-09-24T00:00:00.000Z' },
      { expectedUpdatedAt: '2026-09-24' },
      { expectedUpdatedAt: '2026-W01-1' },
    ],
    rejected: [
      {},
      { expectedUpdatedAt: '' },
      { expectedUpdatedAt: 1 },
      { expectedUpdatedAt: '2026-09-24', extra: true },
    ],
  },
  {
    name: 'EnrollBeneficiaryDto and enrollBeneficiaryRequest',
    dto: EnrollBeneficiaryDto,
    pipe: new ZodPipe(enrollBeneficiaryRequest),
    type: 'body',
    accepted: [
      { enrollmentDate: '2026-01-01' },
      { enrollmentDate: '2024-02-29' },
      { enrollmentDate: '2026-01-01T00:00:00Z' },
    ],
    rejected: [
      {},
      { enrollmentDate: '2026-02-29' },
      { enrollmentDate: '2026-13-01' },
      { enrollmentDate: null },
      { enrollmentDate: '2026-01-01', extra: true },
    ],
  },
  {
    name: 'ResolveDuplicateDto and resolveDuplicateRequest',
    dto: ResolveDuplicateDto,
    pipe: new ZodPipe(resolveDuplicateRequest),
    type: 'body',
    accepted: [
      { leftId: uuid, rightId: uuid, decision: 'LINK' },
      { leftId: mixed, rightId: uuid, decision: 'KEEP_DISTINCT' },
    ],
    rejected: [
      { leftId: uuid, rightId: uuid, decision: 'MERGE' },
      { leftId: 'x', rightId: uuid, decision: 'LINK' },
      { leftId: uuid, decision: 'LINK' },
      { leftId: uuid, rightId: uuid, decision: 'LINK', note: 'x' },
    ],
  },
]

describe.each(cases)('$name parity', ({ dto, pipe, type, accepted, rejected: denied }) => {
  it.each(accepted)('both accept %j with the same value', async (input) => {
    const [old, next] = await Promise.all([viaDto(input, dto, type), viaZod(input, pipe, type)])
    expect(old.accepted).toBe(true)
    expect(next).toEqual(old)
  })

  it.each(denied)('both answer the 400 shape for %j', async (input) => {
    expect(await viaDto(input, dto, type)).toEqual(badRequestShape)
    expect(await viaZod(input, pipe, type)).toEqual(badRequestShape)
  })
})

// Ruling 3: the DTO route dropped top-level prototype keys; strict zod rejects them.
describe('UpdateBeneficiaryDto prototype keys', () => {
  it.each(['__proto__', 'constructor'])(
    'only the contract rejects a top-level %s key',
    async (key) => {
      const body = JSON.parse(`{"${key}":{"a":1},${JSON.stringify(person).slice(1)}`)
      expect((await viaDto(body, UpdateBeneficiaryDto, 'body')).accepted).toBe(true)
      expect(await viaZod(body, new ZodPipe(updateBeneficiaryRequest), 'body')).toEqual(
        badRequestShape,
      )
    },
  )
})

// Ruling 3: class-transformer threw a TypeError (500) on a constructor key inside values.
describe('RegisterBeneficiaryDto nested constructor key', () => {
  it('crashed the DTO route and now reaches the service, which rejects the unknown field', async () => {
    const body = `{"formId":"${uuid}","clientRegistrationId":"${uuid}","values":{"constructor":1}}`
    await expect(
      globalPipe.transform(JSON.parse(body), { type: 'body', metatype: RegisterBeneficiaryDto }),
    ).rejects.toBeInstanceOf(TypeError)
    expect(await viaZod(JSON.parse(body), new ZodPipe(registerBeneficiaryRequest), 'body')).toEqual(
      { accepted: true, value: JSON.parse(body) },
    )
  })
})

// Ruling 4: the compiled DTO instance carried every declared field, so the update audit listed all of them.
describe('UpdateBeneficiaryDto audited fields', () => {
  it('lists every declared field in contract shape order whatever the body holds', async () => {
    const old = await viaDto(update({}), UpdateBeneficiaryDto, 'body')
    expect(Object.keys(old.value as object)).toEqual(Object.keys(updateBeneficiaryRequest.shape))
  })
})
