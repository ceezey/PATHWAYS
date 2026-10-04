import { z } from 'zod'
import { alertStatuses, decisionOutcomes } from './alert-lifecycle'
import {
  decimalSchema,
  metricCellSchema,
  operators,
  parseRuleTree,
  recommendationSchema,
  ruleMetrics,
  uuidSchema,
} from './rule-contract'

export const revisionSchema = z
  .string()
  .regex(/^[1-9][0-9]{0,18}$/)
  .refine((value) => {
    try {
      return BigInt(value) <= 9223372036854775807n
    } catch {
      return false
    }
  })
const version = z.number().int().positive().max(2147483647)
const note = z.string().trim().min(1).max(2000)
const tree = z.unknown().transform((value, ctx) => {
  try {
    return parseRuleTree(value)
  } catch {
    ctx.addIssue({ code: 'custom', message: 'Invalid bounded typed rule.' })
    return z.NEVER
  }
})
const content = {
  name: z.string().trim().min(1).max(160),
  severity: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']),
  conditions: tree,
  recommendations: z
    .array(recommendationSchema)
    .min(1)
    .max(10)
    .refine(
      (items) => new Set(items.map((item) => item.id)).size === items.length,
      'Recommendation identities must be distinct.',
    ),
}
export const createRuleSchema = z
  .object({
    ...content,
    code: z.string().regex(/^[A-Z][A-Z0-9_-]{1,79}$/),
    projectId: uuidSchema.optional(),
    templateId: uuidSchema.optional(),
    clientOperationId: uuidSchema,
  })
  .strict()
  .superRefine((row, ctx) => {
    if (row.templateId && !row.projectId)
      ctx.addIssue({ code: 'custom', message: 'Copy a template into a project.' })
    if (new Set(row.recommendations.map((item) => item.id)).size !== row.recommendations.length)
      ctx.addIssue({ code: 'custom', message: 'Recommendation identities must be distinct.' })
  })
export const draftRuleSchema = z
  .object({ ...content, expectedVersion: version, clientOperationId: uuidSchema })
  .strict()
export const activateRuleSchema = z
  .object({ expectedVersion: version, clientOperationId: uuidSchema })
  .strict()
export const archiveRuleSchema = activateRuleSchema.extend({ note }).strict()
export const reviewSchema = z
  .object({ expectedRevision: revisionSchema, note, clientOperationId: uuidSchema })
  .strict()
export const dispositionSchema = reviewSchema
  .extend({ action: z.enum(['RESOLVE', 'DISMISS']) })
  .strict()
export const alertPreviewSchema = reviewSchema
  .extend({
    outcome: z.enum(decisionOutcomes),
    recommendationId: uuidSchema.optional(),
    expectedRecommendationRevision: revisionSchema.optional(),
  })
  .strict()
  .superRefine((row, ctx) => {
    if (Boolean(row.recommendationId) !== Boolean(row.expectedRecommendationRevision))
      ctx.addIssue({ code: 'custom', message: 'A recommendation write requires its revision.' })
  })
// Fixed write set: ACCEPT/PARTIALLY_ACCEPT always reserve linked-alert authority
// and revision even if its current lifecycle happens to be terminal at preview.
export const recommendationPreviewSchema = reviewSchema
  .extend({
    outcome: z.enum(decisionOutcomes),
    expectedAlertRevision: revisionSchema.optional(),
  })
  .strict()
  .superRefine((row, ctx) => {
    if (['ACCEPT', 'PARTIALLY_ACCEPT'].includes(row.outcome) && !row.expectedAlertRevision)
      ctx.addIssue({ code: 'custom', message: 'This decision requires the linked alert revision.' })
  })
export const confirmOutcomeSchema = z
  .object({ previewId: uuidSchema, clientOperationId: uuidSchema })
  .strict()
export const emptyBodySchema = z.object({}).strict()
const limit = z
  .string()
  .regex(/^(?:[1-9]|[1-9][0-9]|100)$/)
  .default('25')
  .transform(Number)
const listFields = {
  projectId: uuidSchema.optional(),
  cursor: z.string().max(512).optional(),
  limit,
}
export const ruleListSchema = z
  .object({ ...listFields, kind: z.enum(['PROJECT', 'TEMPLATE']).optional() })
  .strict()
export const alertListSchema = z
  .object({ ...listFields, status: z.enum(alertStatuses).optional() })
  .strict()
export const escalatedAlertListSchema = z.object(listFields).strict()
export const recommendationListSchema = z
  .object({ ...listFields, alertId: uuidSchema.optional() })
  .strict()
export const historyListSchema = z
  .object({ cursor: z.string().max(512).optional(), limit })
  .strict()

// Every output is an explicit allowlist. Notes and note-presence metadata are
// excluded even for Admin and committed retries, matching the approved CR.
const instant = z.string().datetime({ offset: true })
export const alertEvidenceSchema = z
  .object({
    conditionId: z.string().regex(/^[A-Za-z][A-Za-z0-9_-]{0,63}$/),
    metric: z.enum(ruleMetrics),
    operator: z.enum(operators),
    threshold: decimalSchema,
    thresholdMaximum: decimalSchema.nullable(),
    cell: metricCellSchema,
    unit: z.string().min(1).max(80),
    result: z.enum(['TRUE', 'FALSE', 'UNAVAILABLE']),
  })
  .strict()
export const ruleOutputSchema = z
  .object({
    id: uuidSchema,
    projectId: uuidSchema.nullable(),
    logicalRuleId: uuidSchema,
    templateOriginId: uuidSchema.nullable(),
    code: z.string().max(80),
    version,
    ...content,
    status: z.enum(['DRAFT', 'ACTIVE', 'ARCHIVED']),
    activatedAt: instant.nullable(),
    archivedAt: instant.nullable(),
  })
  .strict()
export const alertOutputSchema = z
  .object({
    id: uuidSchema,
    projectId: uuidSchema,
    ruleId: uuidSchema,
    ruleVersion: version,
    title: z.string().max(160),
    explanation: z.string().max(4000),
    severity: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']),
    lifecycle: z.enum(alertStatuses),
    revision: revisionSchema,
    evaluatedAt: instant,
    freshness: z.enum(['CURRENT', 'SUPERSEDED', 'SOURCE_CHANGED']),
    conditions: tree,
    evidence: z.array(alertEvidenceSchema).min(1).max(32),
    asOf: instant,
    reportingDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    calendar: z.object({ zone: z.literal('Asia/Manila'), version: revisionSchema }).strict(),
    predefinedRecommendations: z.array(recommendationSchema).min(1).max(10),
    linkedRecommendationIds: z.array(uuidSchema).max(10),
  })
  .strict()
// Escalation records only an outcome; the queue adds when the latest ESCALATE was recorded.
export const escalatedAlertOutputSchema = alertOutputSchema
  .extend({ escalatedAt: instant })
  .strict()
export const recommendationOutputSchema = z
  .object({
    id: uuidSchema,
    projectId: uuidSchema,
    alertId: uuidSchema,
    ruleId: uuidSchema,
    title: z.string().max(160),
    text: z.string().max(2000),
    basis: z.string().max(4000),
    status: z.enum(['NEW', 'REVIEWED', 'RESOLVED', 'DISMISSED', 'AUTO_RESOLVED']),
    revision: revisionSchema,
    proposedAt: instant,
    reviewedAt: instant.nullable(),
  })
  .strict()
export const previewOutputSchema = z
  .object({
    previewId: uuidSchema,
    expiresAt: instant,
    operationKind: z.enum(['ALERT_OUTCOME', 'RECOMMENDATION_OUTCOME', 'COMBINED_OUTCOME']),
    alertRevision: revisionSchema.nullable(),
    recommendationRevision: revisionSchema.nullable(),
    outcome: z.enum(decisionOutcomes),
    message: z.string().max(500),
    recipientCount: z.number().int().min(0).max(1000),
  })
  .strict()
export const confirmationOutputSchema = z
  .object({
    decisionId: uuidSchema,
    alertId: uuidSchema,
    recommendationId: uuidSchema.nullable(),
    alertRevision: revisionSchema,
    recommendationRevision: revisionSchema.nullable(),
    lifecycle: z.enum(alertStatuses),
    outcome: z.enum(decisionOutcomes),
    recordedAt: instant,
    delivery: z
      .object({
        pending: z.number().int().nonnegative(),
        delivered: z.number().int().nonnegative(),
        failed: z.number().int().nonnegative(),
      })
      .strict(),
  })
  .strict()
export const historyOutputSchema = z
  .object({
    id: uuidSchema,
    occurredAt: instant,
    actorKind: z.enum(['HUMAN', 'SYSTEM']),
    kind: z.enum([
      'EVALUATED',
      'CREATED',
      'REVIEWED',
      'ACTIONED',
      'RESOLVED',
      'DISMISSED',
      'AUTO_RESOLVED',
      'OUTCOME',
      'SUPERSEDED',
    ]),
    lifecycle: z.enum(alertStatuses).nullable(),
    outcome: z.enum(decisionOutcomes).nullable(),
    ruleVersion: version,
    explanation: z.string().max(4000),
    result: z.enum(['TRUE', 'FALSE', 'UNAVAILABLE']).nullable(),
    evidence: z.array(alertEvidenceSchema).max(32),
  })
  .strict()
export const notificationOutputSchema = z
  .object({
    id: uuidSchema,
    projectId: uuidSchema,
    alertId: uuidSchema,
    message: z.string().min(1).max(500),
    createdAt: instant,
    readAt: instant.nullable(),
    deliveryState: z.enum(['PENDING', 'DELIVERED', 'FAILED']),
  })
  .strict()
export const notificationListSchema = z.object(listFields).strict()
export const pageSchema = <T extends z.ZodTypeAny>(item: T) =>
  z
    .object({
      items: z.array(item).max(100),
      nextCursor: z.string().max(512).nullable(),
    })
    .strict()
