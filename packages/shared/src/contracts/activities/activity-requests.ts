import { z } from 'zod'

import { overdueExplanationCategories } from '../../constants/domain-codes'
import {
  countInput,
  hasUniqueItems,
  isoDateString,
  lengthString,
  pesoAmountInput,
  strictIsoDateString,
  uuidString,
} from '../common/field-schemas'
import { recordCodeInput } from '../projects/project-requests'
import { MAX_ACTIVITY_EVIDENCE_FILES, activityEvidenceFile } from './activity-evidence'

const activityFields = {
  clientMutationId: uuidString,
  code: recordCodeInput.nullish(),
  title: lengthString(3, 160),
  description: lengthString(0, 4000).nullish(),
  activityType: lengthString(1, 80).nullish(),
  plannedStartDate: strictIsoDateString,
  plannedEndDate: strictIsoDateString,
  timelineOverrideJustification: lengthString(1, 1000).nullish(),
  targetBeneficiaries: countInput(2_147_483_647).nullish(),
  budgetAllocation: pesoAmountInput.optional(),
  assignedUserIds: z
    .array(uuidString)
    .max(50)
    .refine(hasUniqueItems, 'must not repeat an assignee'),
  indicatorIds: z
    .array(uuidString)
    .max(100)
    .refine(hasUniqueItems, 'must not repeat an indicator')
    .optional(),
  journeyStageId: uuidString.nullish(),
}

// Body of POST /projects/:projectId/activities.
export const createActivityRequest = z.object(activityFields).strict()
export type CreateActivityRequest = z.infer<typeof createActivityRequest>

// Body of PATCH /projects/:projectId/activities/:activityId.
export const updateActivityRequest = z
  .object({ ...activityFields, expectedUpdatedAt: isoDateString })
  .strict()
export type UpdateActivityRequest = z.infer<typeof updateActivityRequest>

// Body of POST /projects/:projectId/activities/:activityId/transition.
export const transitionActivityRequest = z
  .object({
    clientMutationId: uuidString,
    status: z.enum(['IN_PROGRESS', 'CANCELLED']),
    reason: lengthString(1, 1000).nullish(),
    expectedUpdatedAt: isoDateString,
  })
  .strict()
export type TransitionActivityRequest = z.infer<typeof transitionActivityRequest>

const progressFields = {
  clientUpdateId: uuidString,
  progressPercent: z.number().int().min(0).max(100),
  note: lengthString(1, 4000),
}

// Body of POST /projects/:projectId/activities/:activityId/progress.
export const recordActivityProgressRequest = z.object(progressFields).strict()
export type RecordActivityProgressRequest = z.infer<typeof recordActivityProgressRequest>

// Body of POST /projects/:projectId/activities/:activityId/updates/reservations.
export const reserveActivityProofRequest = z
  .object({
    ...progressFields,
    files: z.array(activityEvidenceFile).min(1).max(MAX_ACTIVITY_EVIDENCE_FILES),
    beneficiariesReachedThisSession: z.number().int().min(0).max(100000).nullish(),
  })
  .strict()
export type ReserveActivityProofRequest = z.infer<typeof reserveActivityProofRequest>

// Body of POST /projects/:projectId/activities/:activityId/overdue-explanations.
export const recordOverdueExplanationRequest = z
  .object({
    clientMutationId: uuidString,
    category: z.enum(overdueExplanationCategories),
    explanation: lengthString(10, 2000),
  })
  .strict()
export type RecordOverdueExplanationRequest = z.infer<typeof recordOverdueExplanationRequest>

// Body of POST /projects/:projectId/activities/:activityId/updates/:updateId/review.
export const reviewActivityUpdateRequest = z
  .object({
    clientMutationId: uuidString,
    decision: z.enum(['APPROVE', 'RETURN']),
    reason: lengthString(1, 1000),
    expectedUpdatedAt: isoDateString,
  })
  .strict()
export type ReviewActivityUpdateRequest = z.infer<typeof reviewActivityUpdateRequest>

const milestoneFields = {
  title: lengthString(3, 160),
  description: lengthString(0, 2000).nullish(),
  targetDate: strictIsoDateString.nullish(),
}

// Body of POST /projects/:projectId/milestones.
export const saveMilestoneRequest = z.object(milestoneFields).strict()
export type SaveMilestoneRequest = z.infer<typeof saveMilestoneRequest>

// Body of PATCH /projects/:projectId/milestones/:milestoneId.
export const updateMilestoneRequest = z
  .object({
    ...milestoneFields,
    status: z.enum(['PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED']),
    completionDate: strictIsoDateString.nullish(),
    expectedUpdatedAt: isoDateString,
  })
  .strict()
export type UpdateMilestoneRequest = z.infer<typeof updateMilestoneRequest>
