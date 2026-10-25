import {
  type CreateEvaluationRequest,
  type RecordAssessmentRequest,
  type ReturnEvaluationRequest,
  type SaveEvaluationScoresRequest,
  type SignOffEvaluationRequest,
  type SubmitEvaluationRequest,
  evaluationDetailResponse,
  evaluationsResponse,
} from '@pathways/shared'
import { z } from 'zod'

import { ownedJsonPost, ownedJsonRead, projectPath } from '@/lib/api/core/owned-json-read'
import { requestFoundation } from '@/lib/api/core/request'
import { type AssessmentSummary, parseAssessmentSummaries } from './evaluations.schema'

const uuid = z.guid()
export const evaluationsClient = {
  evaluation: (id: string, signal?: AbortSignal) =>
    ownedJsonRead(
      `${projectPath(id)}/evaluation`,
      evaluationsResponse.refine((row) => row.projectId === id),
      { signal },
    ),
  createEvaluation: (id: string, body: CreateEvaluationRequest) =>
    ownedJsonPost(`${projectPath(id)}/evaluation/evaluations`, evaluationDetailResponse, body),
  saveEvaluationScores: (id: string, evaluationId: string, body: SaveEvaluationScoresRequest) =>
    ownedJsonRead(
      `${projectPath(id)}/evaluation/evaluations/${uuid.parse(evaluationId)}/scores`,
      evaluationDetailResponse.refine((row) => row.id === evaluationId),
      { method: 'PATCH', body: JSON.stringify(body) },
    ),
  submitEvaluation: (id: string, evaluationId: string, body: SubmitEvaluationRequest) =>
    ownedJsonPost(
      `${projectPath(id)}/evaluation/evaluations/${uuid.parse(evaluationId)}/submit`,
      evaluationDetailResponse.refine((row) => row.id === evaluationId),
      body,
    ),
  returnEvaluation: (id: string, evaluationId: string, body: ReturnEvaluationRequest) =>
    ownedJsonPost(
      `${projectPath(id)}/evaluation/evaluations/${uuid.parse(evaluationId)}/return`,
      evaluationDetailResponse.refine((row) => row.id === evaluationId),
      body,
    ),
  signoffEvaluation: (id: string, evaluationId: string, body: SignOffEvaluationRequest) =>
    ownedJsonPost(
      `${projectPath(id)}/evaluation/evaluations/${uuid.parse(evaluationId)}/signoff`,
      evaluationDetailResponse.refine((row) => row.id === evaluationId),
      body,
    ),
  recordBeneficiaryAssessment: (
    projectId: string,
    input: RecordAssessmentRequest,
  ): Promise<{ id: string }> =>
    ownedJsonPost(
      `${projectPath(projectId)}/evaluation/assessments`,
      z.object({ id: uuid }).strict(),
      input,
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
