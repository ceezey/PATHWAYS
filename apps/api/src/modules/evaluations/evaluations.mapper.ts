import type { Prisma } from '@prisma/client'
import { z } from 'zod'
import { classifyScoreCommentary, day } from './evaluations.helpers'

const person = { select: { id: true, fullName: true } } as const
const named = (value: { id: string; fullName: string } | null) =>
  value ? { id: value.id, name: value.fullName.slice(0, 200) } : null

// Allowlist for the stored criterion snapshot; numbers become strings and any other key is dropped.
const snapshotNumber = z.union([z.string(), z.number()]).transform(String)
const criterionSnapshotView = z.object({
  id: z.string(),
  code: z.string(),
  version: z.number().int(),
  type: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  weight_percentage: snapshotNumber,
  maximum_score: snapshotNumber,
})

export const evaluationDetailSelect = {
  id: true,
  title: true,
  periodLabel: true,
  periodStart: true,
  periodEnd: true,
  overallScore: true,
  commentary: true,
  returnReason: true,
  status: true,
  updatedAt: true,
  evaluatedBy: person,
  evaluatedAt: true,
  reviewedBy: person,
  reviewedAt: true,
  reviewFeedback: true,
  signedOffBy: person,
  signedOffAt: true,
} as const
export type EvaluationDetailRow = Prisma.ProjectEvaluationGetPayload<{
  select: typeof evaluationDetailSelect
}>
export const scoreDetailSelect = {
  evaluationId: true,
  criterionId: true,
  score: true,
  maximumScore: true,
  weightedScore: true,
  commentary: true,
  criterionSnapshot: true,
} as const
type ScoreDetailRow = Prisma.ProjectEvaluationScoreGetPayload<{ select: typeof scoreDetailSelect }>

export function mapEvaluationDetail(row: EvaluationDetailRow, scores: ScoreDetailRow[]) {
  return {
    id: row.id,
    title: row.title,
    periodLabel: row.periodLabel,
    periodStart: day(row.periodStart),
    periodEnd: day(row.periodEnd),
    overallScore: row.overallScore?.toString() ?? null,
    commentary: row.commentary,
    returnReason: row.returnReason,
    status: row.status,
    updatedAt: row.updatedAt.toISOString(),
    evaluatedBy: named(row.evaluatedBy),
    evaluatedAt: row.evaluatedAt?.toISOString() ?? null,
    reviewedBy: named(row.reviewedBy),
    reviewedAt: row.reviewedAt?.toISOString() ?? null,
    reviewFeedback: row.reviewFeedback,
    signedOffBy: named(row.signedOffBy),
    signedOffAt: row.signedOffAt?.toISOString() ?? null,
    scores: scores.map(mapScore),
  }
}

function mapScore(score: ScoreDetailRow) {
  const parsed = criterionSnapshotView.safeParse(score.criterionSnapshot)
  const criterion = parsed.success
    ? parsed.data
    : {
        id: score.criterionId,
        code: '',
        version: 0,
        type: 'OTHER',
        name: 'Criterion unavailable',
        description: null,
        weight_percentage: '0',
        maximum_score: score.maximumScore.toString(),
      }
  const view = classifyScoreCommentary(score.commentary, criterion.type)
  return {
    criterionId: score.criterionId,
    score: score.score.toString(),
    maximumScore: score.maximumScore.toString(),
    weightedScore: score.weightedScore.toString(),
    ...view,
    criterion,
  }
}
