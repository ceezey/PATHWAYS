import 'reflect-metadata'

import { BadRequestException, ValidationPipe } from '@nestjs/common'
import { describe, expect, it } from 'vitest'

import {
  createActivityRequest,
  recordActivityProgressRequest,
  recordOverdueExplanationRequest,
  reserveActivityProofRequest,
  reviewActivityUpdateRequest,
  saveMilestoneRequest,
  transitionActivityRequest,
  updateActivityRequest,
  updateMilestoneRequest,
} from '@pathways/shared'
import { ZodPipe } from '../../common/validation/zod-pipe'
import { sourceMutationBody } from '../rules/rules-source-operation'
import {
  CreateActivityDto,
  RecordActivityProgressDto,
  RecordOverdueExplanationDto,
  ReserveActivityProofDto,
  ReviewActivityUpdateDto,
  SaveMilestoneDto,
  TransitionActivityDto,
  UpdateActivityDto,
  UpdateMilestoneDto,
} from './activities.dto'

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
const uuid = '10000000-0000-4000-8000-000000000001'
const upperId = 'ABCDEFAB-CDEF-4ABC-8ABC-ABCDEFABCDEF'
const instant = '2026-09-24T00:00:00.000Z'
const grin = String.fromCodePoint(0x1f600)
const sha = (n: number) => n.toString(16).padStart(64, '0')
const ids = (count: number) =>
  Array.from({ length: count }, (_, i) => `10000000-0000-4000-8000-${String(i).padStart(12, '0')}`)
const file = {
  fileName: 'report.pdf',
  contentType: 'application/pdf',
  byteSize: 1_048_576,
  sha256: sha(1),
}

type ParityCase = {
  name: string
  dto: new () => object
  pipe: ZodPipe<never>
  base: Record<string, unknown>
  accepted: Record<string, unknown>[]
  rejected: Record<string, unknown>[]
  // Bodies the DTO route let through and the contract rejects.
  contractOnly?: Record<string, unknown>[]
}

const createBase = {
  clientMutationId: uuid,
  title: 'Synthetic activity',
  plannedStartDate: '2026-01-01',
  plannedEndDate: '2026-12-31',
  assignedUserIds: [],
}
const createCases = {
  accepted: [
    {},
    { title: '   ' },
    { title: grin.repeat(3) },
    { title: 'x'.repeat(160) },
    { code: ' act-01 ' },
    { code: null },
    { description: null, activityType: null, timelineOverrideJustification: null },
    { description: 'x'.repeat(4000) },
    { activityType: 'x'.repeat(80) },
    { timelineOverrideJustification: 'x'.repeat(1000) },
    { targetBeneficiaries: 50 },
    { targetBeneficiaries: '50' },
    { targetBeneficiaries: null },
    { targetBeneficiaries: true },
    { targetBeneficiaries: [5] },
    { targetBeneficiaries: [] },
    { targetBeneficiaries: ' 7 ' },
    { targetBeneficiaries: '0x10' },
    { targetBeneficiaries: 2_147_483_647 },
    { budgetAllocation: '25000.25' },
    { budgetAllocation: ' 10 ' },
    { budgetAllocation: '0' },
    { assignedUserIds: [uuid] },
    { assignedUserIds: [upperId] },
    { assignedUserIds: ids(50) },
    { indicatorIds: [] },
    { indicatorIds: ids(100) },
    { journeyStageId: null },
    { journeyStageId: uuid },
    { journeyStageId: '00000000-0000-0000-0000-000000000000' },
    { plannedStartDate: '2024-02-29' },
    { plannedStartDate: '2026-01-01T00:00:00Z' },
    { plannedEndDate: '20261231' },
    { plannedEndDate: '2026-W53' },
  ],
  rejected: [
    { clientMutationId: 'x' },
    { clientMutationId: null },
    { code: 'A' },
    { code: '-AB' },
    { code: 'AB CD' },
    { title: 'ab' },
    { title: grin.repeat(2) },
    { title: 'x'.repeat(161) },
    { title: null },
    { description: 'x'.repeat(4001) },
    { activityType: '' },
    { activityType: 'x'.repeat(81) },
    { timelineOverrideJustification: '' },
    { targetBeneficiaries: '' },
    { targetBeneficiaries: -1 },
    { targetBeneficiaries: 1.5 },
    { targetBeneficiaries: 2_147_483_648 },
    { targetBeneficiaries: 'abc' },
    { targetBeneficiaries: {} },
    { budgetAllocation: '-1' },
    { budgetAllocation: '100.001' },
    { budgetAllocation: '1e3' },
    { budgetAllocation: '01' },
    { budgetAllocation: 10 },
    { budgetAllocation: '' },
    { assignedUserIds: undefined },
    { assignedUserIds: null },
    { assignedUserIds: [uuid, uuid] },
    { assignedUserIds: ids(51) },
    { assignedUserIds: ['x'] },
    { indicatorIds: [uuid, uuid] },
    { indicatorIds: ids(101) },
    { journeyStageId: 'x' },
    { plannedStartDate: '2026-02-30' },
    { plannedStartDate: '2026-1-1' },
    { plannedStartDate: null },
    { plannedEndDate: '' },
    { plannedEndDate: 20261231 },
    { targetGoal: 1 },
    { extra: true },
    { expectedUpdatedAt: instant },
  ],
  contractOnly: [{ budgetAllocation: null }, { indicatorIds: null }],
}

const cases: ParityCase[] = [
  {
    name: 'CreateActivityDto and createActivityRequest',
    dto: CreateActivityDto,
    pipe: new ZodPipe(createActivityRequest) as never,
    base: createBase,
    ...createCases,
  },
  {
    name: 'UpdateActivityDto and updateActivityRequest',
    dto: UpdateActivityDto,
    pipe: new ZodPipe(updateActivityRequest) as never,
    base: { ...createBase, expectedUpdatedAt: instant },
    accepted: [
      ...createCases.accepted,
      { expectedUpdatedAt: '2026-09-24' },
      { expectedUpdatedAt: '2026-02-30' },
    ],
    rejected: [
      ...createCases.rejected.filter((extra) => !('expectedUpdatedAt' in extra)),
      { expectedUpdatedAt: 'yesterday' },
      { expectedUpdatedAt: null },
      { expectedUpdatedAt: undefined },
    ],
    contractOnly: createCases.contractOnly,
  },
  {
    name: 'TransitionActivityDto and transitionActivityRequest',
    dto: TransitionActivityDto,
    pipe: new ZodPipe(transitionActivityRequest) as never,
    base: { clientMutationId: uuid, status: 'IN_PROGRESS', expectedUpdatedAt: instant },
    accepted: [
      {},
      { status: 'CANCELLED', reason: 'Funding withdrawn.' },
      { status: 'CANCELLED', reason: null },
      { reason: 'x'.repeat(1000) },
    ],
    rejected: [
      { status: 'COMPLETED' },
      { status: 'in_progress' },
      { reason: '' },
      { reason: 'x'.repeat(1001) },
      { clientMutationId: 'x' },
      { expectedUpdatedAt: 'x' },
      { expectedUpdatedAt: undefined },
      { extra: true },
    ],
  },
  {
    name: 'RecordActivityProgressDto and recordActivityProgressRequest',
    dto: RecordActivityProgressDto,
    pipe: new ZodPipe(recordActivityProgressRequest) as never,
    base: { clientUpdateId: uuid, progressPercent: 45, note: 'Halfway through sessions.' },
    accepted: [{}, { progressPercent: 0 }, { progressPercent: 100 }, { note: 'x'.repeat(4000) }],
    rejected: [
      { progressPercent: 101 },
      { progressPercent: -1 },
      { progressPercent: '50' },
      { progressPercent: 1.5 },
      { clientUpdateId: 'not-a-uuid' },
      { note: '' },
      { note: 'x'.repeat(4001) },
      { note: undefined },
      { extra: true },
    ],
  },
  {
    name: 'RecordOverdueExplanationDto and recordOverdueExplanationRequest',
    dto: RecordOverdueExplanationDto,
    pipe: new ZodPipe(recordOverdueExplanationRequest) as never,
    base: {
      clientMutationId: uuid,
      category: 'WEATHER',
      explanation: 'Valid enough explanation text here.',
    },
    accepted: [{}, { explanation: 'x'.repeat(10) }, { explanation: 'x'.repeat(2000) }],
    rejected: [
      { category: 'HURRICANE' },
      { category: 'weather' },
      { explanation: 'too short' },
      { explanation: 'x'.repeat(2001) },
      { clientMutationId: 'not-a-uuid' },
      { clientMutationId: undefined },
      { extra: true },
    ],
  },
  {
    name: 'ReviewActivityUpdateDto and reviewActivityUpdateRequest',
    dto: ReviewActivityUpdateDto,
    pipe: new ZodPipe(reviewActivityUpdateRequest) as never,
    base: {
      clientMutationId: uuid,
      decision: 'APPROVE',
      reason: 'Evidence verified.',
      expectedUpdatedAt: instant,
    },
    accepted: [
      {},
      { decision: 'RETURN' },
      { reason: 'x'.repeat(1000) },
      { expectedUpdatedAt: '2026-02-30' },
    ],
    rejected: [
      { decision: 'REJECT' },
      { reason: '' },
      { reason: 'x'.repeat(1001) },
      { expectedUpdatedAt: 'x' },
      { expectedUpdatedAt: undefined },
      { clientMutationId: 'x' },
      { extra: true },
    ],
  },
  {
    name: 'SaveMilestoneDto and saveMilestoneRequest',
    dto: SaveMilestoneDto,
    pipe: new ZodPipe(saveMilestoneRequest) as never,
    base: { title: 'Phase one' },
    accepted: [
      {},
      { title: '   ' },
      { description: null },
      { description: 'x'.repeat(2000) },
      { targetDate: '2026-03-01' },
      { targetDate: null },
      { targetDate: '2026-03-01T00:00:00Z' },
    ],
    rejected: [
      { title: 'ab' },
      { title: 'x'.repeat(161) },
      { title: null },
      { description: 'x'.repeat(2001) },
      { targetDate: '2026-02-30' },
      { targetDate: '' },
      { targetDate: 20260301 },
      { extra: true },
    ],
  },
  {
    name: 'UpdateMilestoneDto and updateMilestoneRequest',
    dto: UpdateMilestoneDto,
    pipe: new ZodPipe(updateMilestoneRequest) as never,
    base: { title: 'Phase one', status: 'PENDING', expectedUpdatedAt: instant },
    accepted: [
      {},
      { status: 'COMPLETED', completionDate: '2026-03-01' },
      { status: 'COMPLETED' },
      { completionDate: null },
      { targetDate: null, description: null },
    ],
    rejected: [
      { status: 'DONE' },
      { status: null },
      { completionDate: '2026-02-30' },
      { expectedUpdatedAt: 'x' },
      { expectedUpdatedAt: undefined },
      { extra: true },
    ],
  },
  {
    name: 'ReserveActivityProofDto and reserveActivityProofRequest',
    dto: ReserveActivityProofDto,
    pipe: new ZodPipe(reserveActivityProofRequest) as never,
    base: { clientUpdateId: uuid, progressPercent: 60, note: '  Sessions held.  ', files: [file] },
    accepted: [
      {},
      { files: Array.from({ length: 10 }, (_, i) => ({ ...file, sha256: sha(i + 1) })) },
      { files: [{ ...file, contentType: 'video/quicktime', fileName: 'clip.mov' }] },
      { files: [{ ...file, byteSize: 104_857_600 }] },
      { files: [{ ...file, fileName: grin.repeat(128) }] },
      { beneficiariesReachedThisSession: 0 },
      { beneficiariesReachedThisSession: 100000 },
      { beneficiariesReachedThisSession: null },
    ],
    rejected: [
      { files: [] },
      { files: undefined },
      { files: null },
      { files: 'x' },
      { files: ['x'] },
      { files: [null] },
      { files: Array.from({ length: 11 }, (_, i) => ({ ...file, sha256: sha(i + 1) })) },
      { files: [{ ...file, contentType: 'text/html' }] },
      { files: [{ ...file, contentType: 'image/gif' }] },
      { files: [{ ...file, fileName: '../escape.pdf' }] },
      { files: [{ ...file, fileName: 'a\\b.pdf' }] },
      { files: [{ ...file, fileName: '' }] },
      { files: [{ ...file, fileName: 'x'.repeat(129) }] },
      { files: [{ ...file, sha256: 'F'.repeat(64) }] },
      { files: [{ ...file, sha256: 'a'.repeat(63) }] },
      { files: [{ ...file, byteSize: 0 }] },
      { files: [{ ...file, byteSize: 104_857_601 }] },
      { files: [{ ...file, byteSize: 1.5 }] },
      { files: [{ ...file, unexpected: true }] },
      { beneficiariesReachedThisSession: -1 },
      { beneficiariesReachedThisSession: 1.5 },
      { beneficiariesReachedThisSession: 100001 },
      { progressPercent: 101 },
      { note: '' },
      { extra: true },
    ],
  },
]

// A request body: the base with each extra key set, and a key set to undefined removed.
const body = (base: Record<string, unknown>, extra: Record<string, unknown>) => {
  const merged: Record<string, unknown> = { ...base }
  for (const [key, value] of Object.entries(extra)) {
    if (value === undefined) delete merged[key]
    else merged[key] = value
  }
  return JSON.stringify(merged)
}

// The base body with one raw member added, for keys an object literal cannot carry as own properties.
const withMember = (base: Record<string, unknown>, member: string) =>
  JSON.stringify(base).replace(/}$/, `,${member}}`)

describe.each(cases)(
  '$name parity',
  ({ dto, pipe, base, accepted, rejected: rejectedExtras, contractOnly }) => {
    it.each(accepted.map((extra) => [JSON.stringify(extra), extra] as const))(
      'both accept the base with %s and keep the same value',
      async (_label, extra) => {
        const json = body(base, extra)
        const [old, next] = await Promise.all([viaDto(json, dto), viaZod(json, pipe)])
        expect(old.accepted).toBe(true)
        expect(next).toEqual(old)
      },
    )

    it.each(rejectedExtras.map((extra) => [JSON.stringify(extra) ?? 'undefined', extra] as const))(
      'both answer the 400 shape for the base with %s',
      async (_label, extra) => {
        const json = body(base, extra)
        expect(await viaDto(json, dto)).toEqual(badRequestShape)
        expect(await viaZod(json, pipe)).toEqual(badRequestShape)
      },
    )

    // Ruling 4: the DTO route let these through (and failed later in the service); the contract rejects them.
    it.each((contractOnly ?? []).map((extra) => [JSON.stringify(extra), extra] as const))(
      'only the contract rejects the base with %s',
      async (_label, extra) => {
        const json = body(base, extra)
        expect((await viaDto(json, dto)).accepted).toBe(true)
        expect(await viaZod(json, pipe)).toEqual(badRequestShape)
      },
    )

    // F3b ruling 3: the DTO route dropped own prototype keys; the strict contract rejects them.
    it.each(['"__proto__":{"a":1}', '"constructor":{"a":1}'])(
      'only the contract rejects the own key %s',
      async (member) => {
        const json = withMember(base, member)
        expect((await viaDto(json, dto)).accepted).toBe(true)
        expect(await viaZod(json, pipe)).toEqual(badRequestShape)
      },
    )
  },
)

const replayCases = [
  [
    'create',
    CreateActivityDto,
    createActivityRequest,
    {
      ...createBase,
      code: ' act-01 ',
      targetBeneficiaries: '5',
      description: null,
      assignedUserIds: [upperId],
    },
  ],
  [
    'update',
    UpdateActivityDto,
    updateActivityRequest,
    {
      ...createBase,
      expectedUpdatedAt: instant,
      code: ' act-01 ',
      budgetAllocation: ' 10 ',
      indicatorIds: [upperId],
    },
  ],
  [
    'transition',
    TransitionActivityDto,
    transitionActivityRequest,
    {
      clientMutationId: uuid,
      status: 'CANCELLED',
      reason: ' Funding withdrawn. ',
      expectedUpdatedAt: instant,
    },
  ],
  [
    'review',
    ReviewActivityUpdateDto,
    reviewActivityUpdateRequest,
    {
      clientMutationId: uuid,
      decision: 'APPROVE',
      reason: ' Verified. ',
      expectedUpdatedAt: instant,
    },
  ],
] as const

describe('replay across the deploy', () => {
  // A retry of the same request must hash to the same stored body on the old and the new route.
  it.each(replayCases)(
    'gives the same source mutation body for %s',
    async (_name, dto, schema, input) => {
      const json = JSON.stringify(input)
      const [old, next] = await Promise.all([
        viaDto(json, dto),
        viaZod(json, new ZodPipe(schema as never)),
      ])
      expect(old.accepted).toBe(true)
      expect(sourceMutationBody(next.value as object)).toEqual(
        sourceMutationBody(old.value as object),
      )
    },
  )
})
