import { z } from 'zod'

export const alertStatuses = [
  'NEW',
  'REVIEWED',
  'ACTIONED',
  'RESOLVED',
  'DISMISSED',
  'AUTO_RESOLVED',
] as const
export type AlertStatus = (typeof alertStatuses)[number]
export const decisionOutcomes = ['ACCEPT', 'PARTIALLY_ACCEPT', 'DECLINE', 'ESCALATE'] as const
export type DecisionOutcome = (typeof decisionOutcomes)[number]
const terminal = new Set<AlertStatus>(['RESOLVED', 'DISMISSED', 'AUTO_RESOLVED'])
const sequenceSchema = z.string().regex(/^(?:0|[1-9]\d{0,18})$/)
const cursorSchema = z
  .object({
    lastSequence: sequenceSchema,
    latched: z.boolean(),
    episode: z.number().int().min(0).max(2147483647),
    status: z.enum(alertStatuses).nullable(),
    superseded: z.boolean(),
  })
  .strict()
  .superRefine((cursor, ctx) => {
    if (
      (cursor.episode === 0) !== (cursor.status === null) ||
      (cursor.latched && cursor.episode === 0)
    )
      ctx.addIssue({ code: 'custom', message: 'Episode cursor is inconsistent.' })
    if (
      (cursor.status !== null && !terminal.has(cursor.status) && !cursor.latched) ||
      (cursor.status === 'AUTO_RESOLVED' && cursor.latched)
    )
      ctx.addIssue({
        code: 'custom',
        message: 'Episode latch and lifecycle state are inconsistent.',
      })
  })
export type EpisodeCursor = z.infer<typeof cursorSchema>
export const initialEpisodeCursor = (): EpisodeCursor => ({
  lastSequence: '0',
  latched: false,
  episode: 0,
  status: null,
  superseded: false,
})

/** Call under a persisted episode lock; sequence is durable ordering, not wall-clock time. */
export function applyEvaluation(input: unknown): {
  cursor: EpisodeCursor
  effect: 'IGNORED' | 'CREATE' | 'UPDATE' | 'AUTO_RESOLVE' | 'RECORD'
} {
  const { cursor, sequence, result } = z
    .object({
      cursor: cursorSchema,
      sequence: sequenceSchema,
      result: z.enum(['TRUE', 'FALSE', 'UNAVAILABLE']),
    })
    .strict()
    .parse(input)
  if (cursor.superseded || BigInt(sequence) <= BigInt(cursor.lastSequence))
    return { cursor, effect: 'IGNORED' }
  const next = { ...cursor, lastSequence: sequence }
  if (result === 'UNAVAILABLE') return { cursor: next, effect: 'RECORD' }
  if (result === 'FALSE') {
    next.latched = false
    if (next.status !== null && !terminal.has(next.status)) {
      next.status = 'AUTO_RESOLVED'
      return { cursor: next, effect: 'AUTO_RESOLVE' }
    }
    return { cursor: next, effect: 'RECORD' }
  }
  if (!cursor.latched) {
    if (cursor.episode === 2147483647) throw new Error('Episode limit exceeded.')
    return {
      cursor: { ...next, latched: true, episode: cursor.episode + 1, status: 'NEW' },
      effect: 'CREATE',
    }
  }
  return { cursor: next, effect: 'UPDATE' }
}

export function supersedeEpisode(input: unknown): EpisodeCursor {
  return { ...cursorSchema.parse(input), superseded: true }
}

const note = z.string().trim().min(1).max(2000)
export const humanActionSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('REVIEW') }).strict(),
  z.object({ kind: z.literal('OUTCOME'), outcome: z.enum(decisionOutcomes), note }).strict(),
  z.object({ kind: z.literal('RESOLVE'), note }).strict(),
  z.object({ kind: z.literal('DISMISS'), note }).strict(),
])
export type HumanAction = z.infer<typeof humanActionSchema>

/** Pure transition only: the future service must authorize each written resource separately. */
export function applyHumanAction(
  statusInput: unknown,
  actionInput: unknown,
): {
  status: AlertStatus
  outcome: DecisionOutcome | null
  note: string | null
} {
  const status = z.enum(alertStatuses).parse(statusInput)
  const action = humanActionSchema.parse(actionInput)
  if (action.kind === 'OUTCOME')
    return {
      status:
        !terminal.has(status) &&
        (action.outcome === 'ACCEPT' || action.outcome === 'PARTIALLY_ACCEPT')
          ? 'ACTIONED'
          : status,
      outcome: action.outcome,
      note: action.note,
    }
  if (action.kind === 'REVIEW')
    return {
      status: status === 'NEW' ? 'REVIEWED' : status,
      outcome: null,
      note: null,
    }
  if (terminal.has(status)) throw new Error('Terminal alerts cannot receive another disposition.')
  return {
    status: action.kind === 'RESOLVE' ? 'RESOLVED' : 'DISMISSED',
    outcome: null,
    note: action.note,
  }
}

export function isOpenAlert(status: AlertStatus) {
  return !terminal.has(status)
}

/** A recommendation auto-resolves only while it is NEW or REVIEWED and has no recorded decision. */
export function canAutoResolveRecommendation(status: string, hasDecision: boolean) {
  return (status === 'NEW' || status === 'REVIEWED') && !hasDecision
}
