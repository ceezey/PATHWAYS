import { z } from 'zod'

const revision = z.string().datetime({ offset: true })
// A calendar date that also names a real UTC day.
const dateOnly = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => !Number.isNaN(new Date(`${value}T00:00:00.000Z`).valueOf()))

// Body of POST projects/:projectId/evaluation/evaluations.
export const createEvaluationRequest = z
  .object({
    clientRequestId: z.string().uuid(),
    title: z.string().trim().min(1).max(200),
    periodLabel: z.string().trim().min(1).max(80).optional(),
    periodStart: dateOnly,
    periodEnd: dateOnly,
  })
  .strict()
  .refine((value) => value.periodEnd >= value.periodStart, {
    message: 'The period end cannot be before its start.',
    path: ['periodEnd'],
  })
export type CreateEvaluationRequest = z.infer<typeof createEvaluationRequest>

// Body of PATCH projects/:projectId/evaluation/evaluations/:evaluationId/scores.
export const saveEvaluationScoresRequest = z
  .object({
    expectedUpdatedAt: revision,
    commentary: z.string().trim().max(4000).optional(),
  })
  .strict()
export type SaveEvaluationScoresRequest = z.infer<typeof saveEvaluationScoresRequest>

// Body of POST projects/:projectId/evaluation/evaluations/:evaluationId/submit.
export const submitEvaluationRequest = z.object({ expectedUpdatedAt: revision }).strict()
export type SubmitEvaluationRequest = z.infer<typeof submitEvaluationRequest>

// Body of POST projects/:projectId/evaluation/evaluations/:evaluationId/return.
export const returnEvaluationRequest = z
  .object({
    expectedUpdatedAt: revision,
    reason: z.string().trim().min(1).max(2000),
  })
  .strict()
export type ReturnEvaluationRequest = z.infer<typeof returnEvaluationRequest>

// Body of POST projects/:projectId/evaluation/evaluations/:evaluationId/signoff.
export const signOffEvaluationRequest = z
  .object({
    expectedUpdatedAt: revision,
    feedback: z.string().trim().min(1).max(2000),
  })
  .strict()
export type SignOffEvaluationRequest = z.infer<typeof signOffEvaluationRequest>

// Query of GET projects/:projectId/evaluation/assessments; other query keys are ignored.
export const enrollmentAssessmentsQuery = z.object({ enrollmentId: z.string().uuid() })
export type EnrollmentAssessmentsQuery = z.infer<typeof enrollmentAssessmentsQuery>
