import { PathwaysClientError } from '@/lib/api/core/request'

export interface AssessmentDetail {
  id: string
  projectId: string
  activityId: string | null
  enrollmentId: string | null
  type: 'PRE_TEST' | 'POST_TEST' | 'OUTCOME_SURVEY' | 'FEEDBACK_SURVEY' | 'OTHER'
  score: string
  maximumScore: string
  assessmentDate: string
  recordedAt: string
  beneficiary: { id: string; code: string } | null
}

const assessmentTypes = new Set([
  'PRE_TEST',
  'POST_TEST',
  'OUTCOME_SURVEY',
  'FEEDBACK_SURVEY',
  'OTHER',
])

const isNullableString = (value: unknown) => value === null || typeof value === 'string'

export type AssessmentSummary = Omit<
  AssessmentDetail,
  'projectId' | 'enrollmentId' | 'beneficiary'
> & {
  stageId: string | null
}

export function parseAssessmentSummaries(value: unknown): AssessmentSummary[] {
  const invalid = () => new PathwaysClientError('Invalid assessment response.', 'network')
  if (!Array.isArray(value) || value.length > 100) throw invalid()
  return value.map((item) => {
    const row = item as Record<string, unknown> | null
    if (
      !row ||
      typeof row.id !== 'string' ||
      !isNullableString(row.activityId) ||
      !isNullableString(row.stageId) ||
      !assessmentTypes.has(row.type as string) ||
      typeof row.score !== 'string' ||
      typeof row.maximumScore !== 'string' ||
      typeof row.assessmentDate !== 'string' ||
      typeof row.recordedAt !== 'string'
    )
      throw invalid()
    return {
      id: row.id,
      type: row.type as AssessmentDetail['type'],
      activityId: row.activityId as string | null,
      stageId: row.stageId as string | null,
      score: row.score,
      maximumScore: row.maximumScore,
      assessmentDate: row.assessmentDate,
      recordedAt: row.recordedAt,
    }
  })
}
