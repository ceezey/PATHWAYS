import type {
  CreateEvaluationRequest,
  ReturnEvaluationRequest,
  SaveEvaluationScoresRequest,
  SignOffEvaluationRequest,
  SubmitEvaluationRequest,
} from '@pathways/shared'
import { z } from 'zod'

import { ownedJsonPost, ownedJsonRead, projectPath } from '@/lib/api/core/owned-json-read'
import { requestFoundation } from '@/lib/api/core/request'
import { type AssessmentSummary, parseAssessmentSummaries } from './evaluations.schema'

const uuid = z.string().uuid()
const timestamp = z.string().datetime({ offset: true })
const decimal = z.string().regex(/^-?\d+(?:\.\d+)?$/)
const criterionSchema = z
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
const evaluationPersonSchema = z.object({ id: uuid, name: z.string() }).strict().nullable()
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
const evaluationScoreSchema = z
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
export const evaluationDetailSchema = z
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
    scores: z.array(evaluationScoreSchema).max(100),
  })
  .strict()
const evaluationSchema = z
  .object({
    projectId: uuid,
    criteria: z.array(criterionSchema).max(100),
    evaluations: z.array(evaluationDetailSchema).max(20),
    hasMore: z.boolean(),
  })
  .strict()
export const evaluationsClient = {
  evaluation: (id: string, signal?: AbortSignal) =>
    ownedJsonRead(
      `${projectPath(id)}/evaluation`,
      evaluationSchema.refine((row) => row.projectId === id),
      { signal },
    ),
  createEvaluation: (id: string, body: CreateEvaluationRequest) =>
    ownedJsonPost(`${projectPath(id)}/evaluation/evaluations`, evaluationDetailSchema, body),
  saveEvaluationScores: (id: string, evaluationId: string, body: SaveEvaluationScoresRequest) =>
    ownedJsonRead(
      `${projectPath(id)}/evaluation/evaluations/${uuid.parse(evaluationId)}/scores`,
      evaluationDetailSchema.refine((row) => row.id === evaluationId),
      { method: 'PATCH', body: JSON.stringify(body) },
    ),
  submitEvaluation: (id: string, evaluationId: string, body: SubmitEvaluationRequest) =>
    ownedJsonPost(
      `${projectPath(id)}/evaluation/evaluations/${uuid.parse(evaluationId)}/submit`,
      evaluationDetailSchema.refine((row) => row.id === evaluationId),
      body,
    ),
  returnEvaluation: (id: string, evaluationId: string, body: ReturnEvaluationRequest) =>
    ownedJsonPost(
      `${projectPath(id)}/evaluation/evaluations/${uuid.parse(evaluationId)}/return`,
      evaluationDetailSchema.refine((row) => row.id === evaluationId),
      body,
    ),
  signoffEvaluation: (id: string, evaluationId: string, body: SignOffEvaluationRequest) =>
    ownedJsonPost(
      `${projectPath(id)}/evaluation/evaluations/${uuid.parse(evaluationId)}/signoff`,
      evaluationDetailSchema.refine((row) => row.id === evaluationId),
      body,
    ),
  async getBeneficiaryAssessments(
    projectId: string,
    enrollmentId: string,
    signal?: AbortSignal,
  ): Promise<AssessmentSummary[]> {
    return parseAssessmentSummaries(
      await requestFoundation(
        `/projects/${encodeURIComponent(projectId)}/evaluation/assessments?enrollmentId=${encodeURIComponent(enrollmentId)}`,
        { signal },
      ),
    )
  },
}
