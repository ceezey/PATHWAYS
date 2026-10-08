import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  ServiceUnavailableException,
} from '@nestjs/common'
import { businessCalendarDate, isCalendarDate, normalizeMetricDecimal } from '@pathways/shared'
import type { Prisma } from '@prisma/client'
import { z } from 'zod'

export const operations = [
  'PROJECT_UPDATE',
  'ACTIVITY_CREATE',
  'ACTIVITY_UPDATE',
  'ACTIVITY_START',
  'ACTIVITY_CANCEL',
  'ACTIVITY_REVIEW',
  'ACTIVITY_PROOF_FINALIZE',
  'INDICATOR_CREATE',
  'INDICATOR_UPDATE',
  'INDICATOR_ARCHIVE',
  'INDICATOR_MEASUREMENT',
] as const
type SourceOperation = (typeof operations)[number]
export type SourceRequestKey =
  | { kind: 'CLIENT_MUTATION'; id: string }
  | { kind: 'CLIENT_MEASUREMENT'; id: string }
  | { kind: 'PROOF_FINALIZE'; id: string; phase: 'FINALIZE' }
const uuid = z
  .string()
  .uuid()
  .transform((value) => value.toLowerCase())
const instant = z.string().refine((value) => {
  try {
    return new Date(value).toISOString() === value
  } catch {
    return false
  }
})
const day = z.string().refine(isCalendarDate)
const ack = z
  .object({ requestId: uuid, committed: z.literal(true), replayed: z.boolean() })
  .strict()
type MutationAcknowledgement = z.infer<typeof ack>
const generated = z
  .object({
    timestamp: instant,
    businessDate: day,
    normalizedValue: z.null(),
    requestHash: z.null(),
  })
  .strict()
const measurementGenerated = generated
  .extend({
    normalizedValue: z.string().refine((value) => {
      try {
        return normalizeMetricDecimal(value, 'SIGNED_CHANGE') === value
      } catch {
        return false
      }
    }),
    requestHash: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict()
type SourceOperationStart =
  | { kind: 'REPLAY'; acknowledgement: MutationAcknowledgement }
  | {
      kind: 'NEW'
      operationHandle: string
      reservedRecordId: string | null
      generatedValues: {
        timestamp: string
        businessDate: string
        normalizedValue: string | null
        requestHash: string | null
      }
    }

/** Preserve omission/null while binding semantically equivalent input to one immutable receipt. */
export function sourceMutationBody(
  value: object,
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  const normalize = (field: string, item: unknown): unknown => {
    if (item === undefined || item === null) return item
    if (Array.isArray(item))
      return item
        .map((entry) => normalize(field === 'files' ? 'file' : field, entry))
        .sort((a, b) => {
          const left = JSON.stringify(a)
          const right = JSON.stringify(b)
          return left < right ? -1 : left > right ? 1 : 0
        })
    if (typeof item === 'object')
      return Object.fromEntries(
        Object.entries(item)
          .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
          .map(([key, entry]) => [key, normalize(key, entry)]),
      )
    if (typeof item !== 'string') return item
    if (field === 'expectedUpdatedAt') {
      try {
        return new Date(item).toISOString()
      } catch {
        throw new BadRequestException('Invalid mutation version.')
      }
    }
    if (field === 'startDate' || field === 'endDate') {
      try {
        return new Date(item).toISOString().slice(0, 10)
      } catch {
        throw new BadRequestException('Invalid mutation date.')
      }
    }
    if (field.endsWith('Id') || field.endsWith('Ids')) return item.toLowerCase()
    if (field === 'code') return item.trim().toUpperCase()
    if (field === 'value' || field === 'baseline' || field === 'target') {
      try {
        return normalizeMetricDecimal(item, 'SIGNED_CHANGE')
      } catch {
        throw new BadRequestException('Invalid mutation numeric value.')
      }
    }
    return item.trim()
  }
  const body = { ...value, ...extra } as Record<string, unknown>
  return Object.fromEntries(
    Object.entries(body)
      .filter(
        ([field, item]) =>
          !['clientMutationId', 'clientMeasurementId', 'clientUpdateId'].includes(field) &&
          item !== undefined,
      )
      .map(([field, item]) => [field, normalize(field, item)]),
  )
}
const unavailable = () =>
  new ServiceUnavailableException(
    'The mutation response could not be confirmed. Retry the same request.',
  )
/** SQL receipts remain keyed by the private reservation; the HTTP response binds to the caller's immutable proof key. */
export function proofClientAcknowledgement(
  value: unknown,
  reservationId: string,
  clientUpdateId: string,
): MutationAcknowledgement {
  const parsed = ack.safeParse(value)
  const internal = uuid.safeParse(reservationId)
  const external = uuid.safeParse(clientUpdateId)
  if (
    !parsed.success ||
    !internal.success ||
    !external.success ||
    parsed.data.requestId !== internal.data
  )
    throw unavailable()
  return { ...parsed.data, requestId: external.data }
}
function sqlError(error: unknown): never {
  const code =
    error && typeof error === 'object'
      ? (error as { meta?: { code?: unknown } }).meta?.code
      : undefined
  if (code === '42501')
    throw new ForbiddenException('The mutation is unavailable under your current access.')
  if (code === '40001' || code === '23505')
    throw new ConflictException(
      'The resource or request changed. Reload before changing this request.',
    )
  if (code === '22023') throw new BadRequestException('Invalid mutation request.')
  throw unavailable()
}
function input(
  operation: SourceOperation,
  projectId: string,
  sourceId: string | null,
  key: SourceRequestKey,
  body: unknown,
) {
  if (!operations.includes(operation)) throw new BadRequestException('Invalid mutation operation.')
  const expectedKind =
    operation === 'ACTIVITY_PROOF_FINALIZE'
      ? 'PROOF_FINALIZE'
      : operation === 'INDICATOR_MEASUREMENT'
        ? 'CLIENT_MEASUREMENT'
        : 'CLIENT_MUTATION'
  if (key.kind !== expectedKind || (key.kind === 'PROOF_FINALIZE' && key.phase !== 'FINALIZE'))
    throw new BadRequestException('Invalid mutation request identity.')
  const phase =
    key.kind === 'PROOF_FINALIZE'
      ? 'FINALIZE'
      : key.kind === 'CLIENT_MEASUREMENT'
        ? 'MEASUREMENT'
        : 'MUTATION'
  const parsedProject = uuid.safeParse(projectId)
  const parsedSource = sourceId === null ? null : uuid.safeParse(sourceId)
  const parsedId = uuid.safeParse(key.id)
  if (!parsedProject.success || (parsedSource && !parsedSource.success) || !parsedId.success)
    throw new BadRequestException('Invalid mutation identity.')
  let canonical: string
  try {
    canonical = JSON.stringify(body)
    if (
      !canonical ||
      body === null ||
      typeof body !== 'object' ||
      Array.isArray(body) ||
      Buffer.byteLength(canonical) > 65536
    )
      throw Error('Invalid body')
  } catch {
    throw new BadRequestException('Invalid mutation body.')
  }
  return {
    projectId: parsedProject.data,
    sourceId: parsedSource?.data ?? null,
    id: parsedId.data,
    phase,
    canonical,
  }
}
async function one(work: () => Promise<Array<{ result: unknown }>>) {
  let rows: Array<{ result: unknown }>
  try {
    rows = await work()
  } catch (error) {
    sqlError(error)
  }
  if (rows.length !== 1 || !Object.hasOwn(rows[0] ?? {}, 'result')) throw unavailable()
  return rows[0]?.result
}
export async function readRuleSourceAcknowledgement(
  tx: Prisma.TransactionClient,
  operation: SourceOperation,
  projectId: string,
  sourceId: string | null,
  key: SourceRequestKey,
  body: unknown,
): Promise<MutationAcknowledgement | null> {
  const i = input(operation, projectId, sourceId, key, body)
  const envelope = JSON.stringify({
    operation,
    sourceId: i.sourceId,
    body: JSON.parse(i.canonical),
  })
  const value = await one(
    () =>
      tx.$queryRaw`SELECT pathways.f10_source_acknowledgement(${i.projectId}::uuid,${operation}::text,${key.kind}::text,${i.id}::uuid,${i.phase}::text,${envelope}::jsonb) AS result`,
  )
  if (value === null) return null
  const parsed = ack.safeParse(value)
  if (!parsed.success || parsed.data.requestId !== i.id || !parsed.data.replayed)
    throw unavailable()
  return parsed.data
}
export async function bootstrapRuleSourceProject(
  tx: Prisma.TransactionClient,
  projectId: string,
  operation: SourceOperation,
) {
  const id = uuid.safeParse(projectId)
  if (!id.success || !operations.includes(operation))
    throw new BadRequestException('Invalid mutation identity.')
  try {
    await tx.$queryRaw`SELECT pathways.f10_bootstrap_project(${id.data}::uuid,${operation}::text)::text`
  } catch (error) {
    sqlError(error)
  }
}
export async function beginRuleSourceOperation(
  tx: Prisma.TransactionClient,
  operation: SourceOperation,
  projectId: string,
  sourceId: string | null,
  key: SourceRequestKey,
  body: unknown,
): Promise<SourceOperationStart> {
  const i = input(operation, projectId, sourceId, key, body)
  const value = await one(
    () =>
      tx.$queryRaw`SELECT pathways.f10_begin_source_operation(${operation}::text,${i.projectId}::uuid,${i.sourceId}::uuid,${key.kind}::text,${i.id}::uuid,${i.phase}::text,${i.canonical}::jsonb) AS result`,
  )
  const replay = z
    .object({ kind: z.literal('REPLAY'), acknowledgement: ack })
    .strict()
    .safeParse(value)
  if (replay.success) {
    if (replay.data.acknowledgement.requestId !== i.id || !replay.data.acknowledgement.replayed)
      throw unavailable()
    return replay.data
  }
  const created = z
    .object({
      kind: z.literal('NEW'),
      operationHandle: uuid,
      reservedRecordId: uuid.nullable(),
      generatedValues: operation === 'INDICATOR_MEASUREMENT' ? measurementGenerated : generated,
    })
    .strict()
    .safeParse(value)
  if (
    !created.success ||
    businessCalendarDate(new Date(created.data.generatedValues.timestamp), 'Asia/Manila') !==
      created.data.generatedValues.businessDate
  )
    throw unavailable()
  const reserves = ['ACTIVITY_CREATE', 'INDICATOR_CREATE', 'INDICATOR_MEASUREMENT'].includes(
    operation,
  )
  if (reserves !== (created.data.reservedRecordId !== null)) throw unavailable()
  return created.data
}
export async function finishRuleSourceOperation(
  tx: Prisma.TransactionClient,
  handle: string,
  expectedRequestId: string,
): Promise<MutationAcknowledgement> {
  const id = uuid.safeParse(handle)
  const expected = uuid.safeParse(expectedRequestId)
  if (!id.success || !expected.success) throw new BadRequestException('Invalid mutation identity.')
  const value = await one(
    () => tx.$queryRaw`SELECT pathways.f10_finish_source_operation(${id.data}::uuid) AS result`,
  )
  const parsed = ack.safeParse(value)
  if (!parsed.success || parsed.data.requestId !== expected.data || parsed.data.replayed)
    throw unavailable()
  return parsed.data
}

type SourceAbandonment = MutationAcknowledgement | { requestId: string; abandoned: true }
export async function abandonRuleSourceOperation(
  tx: Prisma.TransactionClient,
  operation: SourceOperation,
  projectId: string,
  sourceId: string | null,
  key: SourceRequestKey,
  body: unknown,
): Promise<SourceAbandonment> {
  const i = input(operation, projectId, sourceId, key, body)
  const value = await one(
    () =>
      tx.$queryRaw`SELECT pathways.f10_abandon_source_operation(${operation}::text,${i.projectId}::uuid,${i.sourceId}::uuid,${key.kind}::text,${i.id}::uuid,${i.phase}::text,${i.canonical}::jsonb) AS result`,
  )
  const parsed = z
    .union([
      ack.extend({ replayed: z.literal(true) }).strict(),
      z.object({ requestId: uuid, abandoned: z.literal(true) }).strict(),
    ])
    .safeParse(value)
  if (!parsed.success || parsed.data.requestId !== i.id) throw unavailable()
  return parsed.data
}
