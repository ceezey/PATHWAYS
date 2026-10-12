import 'reflect-metadata'

import { BadRequestException, ValidationPipe } from '@nestjs/common'
import { describe, expect, it } from 'vitest'

import { createProjectRequest, updateProjectRequest } from '@pathways/shared'
import { ZodPipe } from '../../common/validation/zod-pipe'
import { sourceMutationBody } from '../rules/rules-source-operation'
import { CreateProjectDto, UpdateProjectDto } from './projects.dto'

// Same options as main.ts.
const globalPipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  forbidUnknownValues: false,
})

type Outcome = { accepted: boolean; value: unknown }

// Records a pipe rejection, which must be a BadRequestException.
function rejected(error: unknown): Outcome {
  expect(error).toBeInstanceOf(BadRequestException)
  return { accepted: false, value: (error as BadRequestException).getResponse() }
}

// The old route: the global pipe with the DTO as design type, on a freshly parsed JSON body.
async function viaDto(json: string, metatype: new () => object): Promise<Outcome> {
  try {
    const dto = await globalPipe.transform(JSON.parse(json), { type: 'body', metatype })
    return { accepted: true, value: { ...dto } }
  } catch (error) {
    return rejected(error)
  }
}

// The new route: the global pipe with an Object design type, then the zod pipe.
async function viaZod(
  json: string,
  pipe: { transform(value: unknown): unknown },
): Promise<Outcome> {
  try {
    const body = await globalPipe.transform(JSON.parse(json), { type: 'body', metatype: Object })
    return { accepted: true, value: pipe.transform(body) }
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
const createPipe = new ZodPipe(createProjectRequest)
const updatePipe = new ZodPipe(updateProjectRequest)
const uuid = 'ab000000-0000-4000-8000-00000000000a'
const grin = String.fromCodePoint(0x1f600)
const base = { title: 'Synthetic project', status: 'PLANNED' }
const create = (extra: Record<string, unknown>) => JSON.stringify({ ...base, ...extra })
const mutation = { clientMutationId: uuid, expectedUpdatedAt: '2026-09-24T00:00:00.000Z' }
const update = (extra: Record<string, unknown>) =>
  JSON.stringify({ ...base, ...mutation, ...extra })
const officers = (count: number) =>
  Array.from({ length: count }, (_, i) => `10000000-0000-4000-8000-${String(i).padStart(12, '0')}`)

const acceptedCreates = [
  create({}),
  create({ title: '  Padded title  ' }),
  create({ title: '   abc   ' }),
  create({ title: grin.repeat(3) }),
  create({ title: 'x'.repeat(160) }),
  create({ code: ' crl-ns-2026 ' }),
  create({ code: null }),
  create({ description: null, objectives: null, implementationArea: null, sector: null }),
  create({ objectives: 'x'.repeat(4000) }),
  create({ implementingPartnerNames: ['A', 'B'] }),
  create({ implementingPartnerNames: null }),
  create({ targetBeneficiaries: 250 }),
  create({ targetBeneficiaries: '250' }),
  create({ targetBeneficiaries: null }),
  create({ targetBeneficiaries: true }),
  create({ targetBeneficiaries: [5] }),
  create({ targetBeneficiaries: [] }),
  create({ targetBeneficiaries: ' 7 ' }),
  create({ targetBeneficiaries: '0x10' }),
  create({ targetBeneficiaries: '1e3' }),
  create({ targetBeneficiaries: 2_147_483_647 }),
  create({ projectBudget: '125000.50' }),
  create({ projectBudget: ' 10 ' }),
  create({ projectBudget: '0' }),
  create({ programManagerId: uuid, projectManagerId: uuid, monitoringOfficerId: uuid }),
  create({ programManagerId: null, projectManagerId: null, monitoringOfficerId: null }),
  create({ projectManagerId: uuid.toUpperCase() }),
  create({ projectManagerId: '00000000-0000-0000-0000-000000000000' }),
  create({ projectManagerId: 'ffffffff-ffff-ffff-ffff-ffffffffffff' }),
  create({ projectOfficerIds: [uuid] }),
  create({ projectOfficerIds: [] }),
  create({ projectOfficerIds: officers(50) }),
  create({ startDate: '2026-01-01', endDate: '2026-12-31' }),
  create({ startDate: null, endDate: null }),
  create({ startDate: '2024-02-29' }),
  create({ startDate: '2026-01-01T00:00:00Z' }),
  create({ startDate: '2026-01-01 10:00' }),
  create({ startDate: '20260101' }),
  create({ startDate: '2026-W01-1' }),
  create({ startDate: '2024-366' }),
  create({ startDate: '2026-01' }),
  create({ startDate: '+2026-01-01' }),
  create({ programId: uuid }),
  create({ programId: null }),
]

const rejectedCreates = [
  create({ code: 'A' }),
  create({ code: '-AB' }),
  create({ code: 'AB CD' }),
  create({ title: 'ab' }),
  create({ title: grin.repeat(2) }),
  create({ title: 'x'.repeat(161) }),
  create({ title: null }),
  JSON.stringify({ status: 'PLANNED' }),
  create({ description: 'x'.repeat(2001) }),
  create({ implementationArea: 'x'.repeat(241) }),
  create({ implementingPartnerNames: ['A', 'A'] }),
  create({ implementingPartnerNames: [''] }),
  create({ implementingPartnerNames: Array.from({ length: 21 }, (_, i) => `P${i}`) }),
  create({ implementingPartnerNames: 'A' }),
  create({ implementingPartnerNames: [1] }),
  create({ targetBeneficiaries: '' }),
  create({ targetBeneficiaries: -1 }),
  create({ targetBeneficiaries: 1.5 }),
  create({ targetBeneficiaries: 2_147_483_648 }),
  create({ targetBeneficiaries: 'abc' }),
  create({ targetBeneficiaries: {} }),
  create({ projectBudget: '-1' }),
  create({ projectBudget: '1.001' }),
  create({ projectBudget: '1e3' }),
  create({ projectBudget: '01' }),
  create({ projectBudget: 10 }),
  create({ projectBudget: '' }),
  create({ projectManagerId: '10000000-0000-0000-8000-000000000001' }),
  create({ projectManagerId: '10000000-0000-4000-c000-000000000001' }),
  create({ projectManagerId: 'not-a-uuid' }),
  create({ projectOfficerIds: [uuid, uuid] }),
  create({ projectOfficerIds: officers(51) }),
  create({ startDate: '2026-02-30' }),
  create({ startDate: '2026-02-29' }),
  create({ startDate: '2026-366' }),
  create({ startDate: '2026-13-01' }),
  create({ startDate: '2026-1-1' }),
  create({ startDate: '01/02/2026' }),
  create({ startDate: '' }),
  create({ startDate: 20260101 }),
  create({ status: 'ACTIVE' }),
  create({ status: 'planned' }),
  create({ status: null }),
  create({ programId: 'x' }),
  create({ targetGoal: 1 }),
  create({ implementingPartners: 'Partner A' }),
  create({ extra: true }),
  create({ prototype: 1 }),
  create({ clientMutationId: uuid }),
  '[]',
  `[${create({})}]`,
  '{}',
]

const acceptedUpdates = [
  update({}),
  update({ expectedUpdatedAt: '2026-09-24' }),
  update({ expectedUpdatedAt: '2026-02-30' }),
  update({ code: ' ab ', projectOfficerIds: [uuid], targetBeneficiaries: '5' }),
]

const rejectedUpdates = [
  update({ expectedUpdatedAt: 'yesterday' }),
  update({ expectedUpdatedAt: null }),
  update({ clientMutationId: 'x' }),
  update({ clientMutationId: null }),
  update({ targetGoal: 1 }),
  JSON.stringify({ ...base, expectedUpdatedAt: mutation.expectedUpdatedAt }),
  JSON.stringify({ ...base, clientMutationId: uuid }),
]

describe('CreateProjectDto and createProjectRequest parity', () => {
  it.each(acceptedCreates)('both accept %s with the same value', async (json) => {
    const [dto, zod] = await Promise.all([viaDto(json, CreateProjectDto), viaZod(json, createPipe)])
    expect(dto.accepted).toBe(true)
    expect(zod).toEqual(dto)
  })

  it.each(rejectedCreates)('both answer the 400 shape for %s', async (json) => {
    expect(await viaDto(json, CreateProjectDto)).toEqual(badRequestShape)
    expect(await viaZod(json, createPipe)).toEqual(badRequestShape)
  })

  // The DTO route let these bodies through and the contract rejects them.
  it.each([
    create({ projectBudget: null }),
    create({ projectOfficerIds: null }),
    '{"title":"Synthetic project","status":"PLANNED","__proto__":{"a":1}}',
    '{"title":"Synthetic project","status":"PLANNED","constructor":{"a":1}}',
  ])('only the contract rejects %s', async (json) => {
    expect((await viaDto(json, CreateProjectDto)).accepted).toBe(true)
    expect(await viaZod(json, createPipe)).toEqual(badRequestShape)
  })
})

describe('UpdateProjectDto and updateProjectRequest parity', () => {
  it.each(acceptedUpdates)('both accept %s with the same value', async (json) => {
    const [dto, zod] = await Promise.all([viaDto(json, UpdateProjectDto), viaZod(json, updatePipe)])
    expect(dto.accepted).toBe(true)
    expect(zod).toEqual(dto)
  })

  it.each(rejectedUpdates)('both answer the 400 shape for %s', async (json) => {
    expect(await viaDto(json, UpdateProjectDto)).toEqual(badRequestShape)
    expect(await viaZod(json, updatePipe)).toEqual(badRequestShape)
  })

  // A retry across the deploy replays against the same stored body.
  it('produces the same source mutation body as the DTO route', async () => {
    const json = update({
      code: ' ab ',
      projectOfficerIds: [uuid.toUpperCase()],
      targetBeneficiaries: '5',
      startDate: '2026-01-01',
      description: null,
    })
    const [dto, zod] = await Promise.all([viaDto(json, UpdateProjectDto), viaZod(json, updatePipe)])
    expect(sourceMutationBody(zod.value as object)).toEqual(sourceMutationBody(dto.value as object))
  })
})
