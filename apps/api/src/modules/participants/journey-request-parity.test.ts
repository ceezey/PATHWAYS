import 'reflect-metadata'

import { BadRequestException, ValidationPipe } from '@nestjs/common'
import { describe, expect, it } from 'vitest'

import {
  correctJourneyEventRequest,
  recordJourneyEventRequest,
  saveJourneyStagesRequest,
} from '@pathways/shared'
import { ZodPipe } from '../../common/validation/zod-pipe'
import { SaveJourneyConfigurationDto } from '../activities/activities.dto'
import { CorrectJourneyEventDto, EnrollmentJourneyEventDto } from './participants.dto'

// Same options as main.ts.
const globalPipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  forbidUnknownValues: false,
})

type Outcome = { accepted: boolean; value: unknown }
type Pipe = { transform(value: unknown): unknown }

// Records a pipe rejection, which must be a BadRequestException.
function rejected(error: unknown): Outcome {
  expect(error).toBeInstanceOf(BadRequestException)
  return { accepted: false, value: (error as BadRequestException).getResponse() }
}

// Copies a validated DTO, and each nested stage DTO, into plain objects.
const plain = (value: unknown): unknown =>
  Array.isArray(value)
    ? value.map(plain)
    : value && typeof value === 'object'
      ? Object.fromEntries(Object.entries(value).map(([key, item]) => [key, plain(item)]))
      : value

// The old route: the global pipe with the DTO as design type, on a fresh copy of the body.
async function viaDto(body: unknown, metatype: new () => object): Promise<Outcome> {
  try {
    const dto = await globalPipe.transform(structuredClone(body), { type: 'body', metatype })
    return { accepted: true, value: plain(dto) }
  } catch (error) {
    return rejected(error)
  }
}

// The new route: the global pipe with an Object design type, then the zod pipe.
async function viaZod(body: unknown, pipe: Pipe): Promise<Outcome> {
  try {
    const value = await globalPipe.transform(structuredClone(body), {
      type: 'body',
      metatype: Object,
    })
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
const other = '10000000-0000-4000-8000-000000000002'
const mixed = 'ABCDEF00-0000-4000-8000-00000000000A'
const event = { eventType: 'FOLLOW_UP', eventDate: '2026-06-01', description: 'Checked in' }
const record = (extra: Record<string, unknown>) => ({ ...event, ...extra })
const fix = { eventDate: '2026-06-02', description: 'Corrected', reason: 'Typo' }
const correct = (extra: Record<string, unknown>) => ({ ...fix, ...extra })
const stage = { code: 'J1', name: 'Intake', order: 1, type: 'ENTRY', mappedActivityIds: [] }
const stages = (...items: Record<string, unknown>[]) => ({
  stages: items.map((item) => ({ ...stage, ...item })),
})

type Case = {
  name: string
  dto: new () => object
  pipe: Pipe
  accepted: unknown[]
  rejected: unknown[]
}

const cases: Case[] = [
  {
    name: 'EnrollmentJourneyEventDto and recordJourneyEventRequest',
    dto: EnrollmentJourneyEventDto,
    pipe: new ZodPipe(recordJourneyEventRequest),
    accepted: [
      record({}),
      record({ eventType: 'COMPLETION' }),
      record({ eventType: 'TRANSFER', destinationProjectId: uuid }),
      record({ stageId: mixed }),
      record({ stageId: null, destinationProjectId: null, note: null }),
      record({ note: '  Brought documents  ' }),
      record({ note: 'x'.repeat(1000) }),
      record({ description: 'x'.repeat(2000) }),
      record({ eventDate: '2024-02-29' }),
      record({ eventDate: '2026-06-01T10:00:00Z' }),
    ],
    rejected: [
      record({ eventType: 'PARTICIPATION' }),
      record({ eventDate: '2026-02-29' }),
      record({ eventDate: '06/01/2026' }),
      record({ description: '' }),
      record({ description: 'x'.repeat(2001) }),
      record({ stageId: 'x' }),
      record({ destinationProjectId: '10000000-0000-0000-8000-000000000001' }),
      record({ note: '' }),
      record({ note: '   ' }),
      record({ note: 'x'.repeat(1001) }),
      record({ note: 42 }),
      record({ reason: 'x' }),
      { eventType: 'FOLLOW_UP', eventDate: '2026-06-01' },
      [],
    ],
  },
  {
    name: 'CorrectJourneyEventDto and correctJourneyEventRequest',
    dto: CorrectJourneyEventDto,
    pipe: new ZodPipe(correctJourneyEventRequest),
    accepted: [
      correct({}),
      correct({ note: '  Clarified  ', stageId: uuid }),
      correct({ note: null, stageId: null }),
      correct({ reason: 'x'.repeat(1000) }),
    ],
    rejected: [
      correct({ reason: '' }),
      correct({ reason: 'x'.repeat(1001) }),
      correct({ description: '' }),
      correct({ eventDate: '2026-13-01' }),
      correct({ note: ' ' }),
      correct({ stageId: 'x' }),
      correct({ eventType: 'FOLLOW_UP' }),
      { eventDate: '2026-06-02', description: 'Corrected' },
    ],
  },
  {
    name: 'SaveJourneyConfigurationDto and saveJourneyStagesRequest',
    dto: SaveJourneyConfigurationDto,
    pipe: new ZodPipe(saveJourneyStagesRequest),
    accepted: [
      { stages: [] },
      stages({}),
      stages({ code: ' j3.1 ' }),
      stages({ code: 'FOLLOW_UP' }),
      stages({ code: 'J3-1' }),
      stages({ id: uuid, expectedUpdatedAt: '2026-06-01T00:00:00.000Z' }),
      stages({ id: null, parentStageId: null, terminal: null, description: null }),
      stages({ terminal: true, description: '' }),
      stages({ description: 'x'.repeat(2000) }),
      stages({ parentStageId: uuid }),
      stages({ mappedActivityIds: [uuid, other] }),
      stages({ mappedActivityIds: [mixed, mixed.toLowerCase()] }),
      stages({ order: 500, type: 'FOLLOW_UP' }),
      stages({ name: 'x'.repeat(160) }),
      stages({ expectedUpdatedAt: '2026-02-30' }),
      stages({ code: 'J1' }, { code: 'J2', order: 2, type: 'CORE' }),
    ],
    rejected: [
      {},
      { stages: null },
      { stages: {} },
      { stages: [1] },
      { stages: [null] },
      stages({ code: 'J' }),
      stages({ code: '.J3' }),
      stages({ code: 'J3 1' }),
      stages({ code: 'J3/1' }),
      stages({ code: 'x'.repeat(41) }),
      stages({ code: 12 }),
      stages({ name: 'x' }),
      stages({ name: 'x'.repeat(161) }),
      stages({ order: 0 }),
      stages({ order: 501 }),
      stages({ order: 1.5 }),
      stages({ order: '1' }),
      stages({ type: 'EXIT' }),
      stages({ id: 'x' }),
      stages({ parentStageId: 'x' }),
      stages({ terminal: 'yes' }),
      stages({ description: 'x'.repeat(2001) }),
      stages({ mappedActivityIds: [uuid, uuid] }),
      stages({ mappedActivityIds: ['x'] }),
      stages({ mappedActivityIds: null }),
      stages({
        mappedActivityIds: Array.from(
          { length: 101 },
          (_, i) => `10000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
        ),
      }),
      stages({ expectedUpdatedAt: 'later' }),
      stages({ extra: true }),
      { stages: Array.from({ length: 101 }, (_, i) => ({ ...stage, order: i + 1 })) },
      { stages: [], extra: true },
    ],
  },
]

describe.each(cases)('$name parity', ({ dto, pipe, accepted, rejected: denied }) => {
  it.each(accepted)('both accept %j with the same value', async (body) => {
    const [old, next] = await Promise.all([viaDto(body, dto), viaZod(body, pipe)])
    expect(old.accepted).toBe(true)
    expect(next).toEqual(old)
  })

  it.each(denied)('both answer the 400 shape for %j', async (body) => {
    expect(await viaDto(body, dto)).toEqual(badRequestShape)
    expect(await viaZod(body, pipe)).toEqual(badRequestShape)
  })
})

describe('journey stage terminal default', () => {
  it('defaults an absent terminal flag to false on both routes', async () => {
    const [old, next] = await Promise.all([
      viaDto(stages({}), SaveJourneyConfigurationDto),
      viaZod(stages({}), new ZodPipe(saveJourneyStagesRequest)),
    ])
    expect((old.value as { stages: { terminal: unknown }[] }).stages[0].terminal).toBe(false)
    expect((next.value as { stages: { terminal: unknown }[] }).stages[0].terminal).toBe(false)
  })
})

// Ruling 3: the DTO routes dropped prototype keys, also inside a stage; strict zod rejects them.
describe('journey prototype keys', () => {
  it.each(['__proto__', 'constructor'])('only the contracts reject a %s key', async (key) => {
    const body = JSON.parse(`{"${key}":{"a":1},${JSON.stringify(event).slice(1)}`)
    expect((await viaDto(body, EnrollmentJourneyEventDto)).accepted).toBe(true)
    expect(await viaZod(body, new ZodPipe(recordJourneyEventRequest))).toEqual(badRequestShape)
    const nested = JSON.parse(`{"stages":[{"${key}":{"a":1},${JSON.stringify(stage).slice(1)}]}`)
    expect((await viaDto(nested, SaveJourneyConfigurationDto)).accepted).toBe(true)
    expect(await viaZod(nested, new ZodPipe(saveJourneyStagesRequest))).toEqual(badRequestShape)
  })
})
