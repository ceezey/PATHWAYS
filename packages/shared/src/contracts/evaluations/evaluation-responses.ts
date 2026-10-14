import { z } from 'zod'

const uuid = z.string().uuid()
const timestamp = z.string().datetime({ offset: true })
const decimal = z.string().regex(/^-?\d+(?:\.\d+)?$/)

// Response shapes of the evaluation routes; the api only uses their types and the web parses them.

// One scoring criterion of the project.
export const evaluationCriterionResponse = z
  .object({
    id: uuid,
    code: z.string(),
    name: z.string(),
    description: z.string().nullable(),
    type: z.enum([
      'KPI',
      'TIMELINE_COMPLIANCE',
      'BUDGET_EFFICIENCY',
      'BENEFICIARY_REACH',
      'INDICATOR_LINKAGE',
      'ASSESSMENT_GAIN',
      'OTHER',
    ]),
    version: z.number().int(),
    weightPercentage: decimal,
    maximumScore: decimal,
    status: z.enum(['DRAFT', 'PUBLISHED', 'ARCHIVED']),
    updatedAt: timestamp,
  })
  .strict()
export type EvaluationCriterionResponse = z.infer<typeof evaluationCriterionResponse>

const evaluationPersonSchema = z.object({ id: uuid, name: z.string() }).strict().nullable()

// The criterion as it stood when the round was scored.
const criterionSnapshotSchema = z
  .object({
    id: uuid,
    code: z.string(),
    version: z.number().int(),
    type: z.string(),
    name: z.string(),
    description: z.string().nullable(),
    weight_percentage: z.string(),
    maximum_score: z.string(),
  })
  .strict()

// One criterion score of an evaluation round.
export const evaluationScoreResponse = z
  .object({
    criterionId: uuid,
    score: decimal,
    maximumScore: decimal,
    weightedScore: decimal,
    source: z.enum(['computed', 'no_data', 'manual']),
    evidence: z.string().nullable(),
    reason: z.string().nullable(),
    note: z.string().nullable(),
    criterion: criterionSnapshotSchema,
  })
  .strict()
export type EvaluationScoreResponse = z.infer<typeof evaluationScoreResponse>

// One evaluation round with its scores, as the read and every workflow route return it.
export const evaluationDetailResponse = z
  .object({
    id: uuid,
    title: z.string(),
    periodLabel: z.string().nullable(),
    periodStart: z.string(),
    periodEnd: z.string(),
    overallScore: decimal.nullable(),
    commentary: z.string().nullable(),
    returnReason: z.string().nullable(),
    status: z.enum(['DRAFT', 'SUBMITTED', 'REVIEWED', 'SIGNED_OFF', 'ARCHIVED']),
    updatedAt: timestamp,
    evaluatedBy: evaluationPersonSchema,
    evaluatedAt: timestamp.nullable(),
    reviewedBy: evaluationPersonSchema,
    reviewedAt: timestamp.nullable(),
    reviewFeedback: z.string().nullable(),
    signedOffBy: evaluationPersonSchema,
    signedOffAt: timestamp.nullable(),
    scores: z.array(evaluationScoreResponse).max(100),
  })
  .strict()
export type EvaluationDetailResponse = z.infer<typeof evaluationDetailResponse>

// The criteria and rounds of one project.
export const evaluationsResponse = z
  .object({
    projectId: uuid,
    criteria: z.array(evaluationCriterionResponse).max(100),
    evaluations: z.array(evaluationDetailResponse).max(20),
    hasMore: z.boolean(),
  })
  .strict()
export type EvaluationsResponse = z.infer<typeof evaluationsResponse>
