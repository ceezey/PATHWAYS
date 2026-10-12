import { z } from 'zod'

import { sourceMutationAcknowledgement } from '../common/source-mutation-acknowledgement'
import { activityEvidenceContentTypes } from './activity-evidence'

// Types the response shapes of the activity routes, which are never parsed at runtime.

const storedStatus = z.enum(['NOT_STARTED', 'IN_PROGRESS', 'FOR_REVIEW', 'COMPLETED', 'CANCELLED'])
const presentedStatus = z.enum([
  'Planned',
  'In Progress',
  'For Review',
  'Completed',
  'Cancelled',
  'Overdue',
])
const reviewLabel = z.enum(['Submitted', 'Accepted', 'Flagged'])

// Holds advisory per-activity flags for the calling user, while every mutation re-checks its own authority.
export const activityCapabilitiesResponse = z.object({
  canEdit: z.boolean(),
  canRecordProgress: z.boolean(),
  canSubmitProof: z.boolean(),
  canExplainOverdue: z.boolean(),
})
export type ActivityCapabilitiesResponse = z.infer<typeof activityCapabilitiesResponse>

const activityRecord = z.object({
  id: z.string(),
  projectId: z.string(),
  code: z.string(),
  title: z.string(),
  description: z.string(),
  activityType: z.string().nullable(),
  timelineOverrideJustification: z.string().nullable(),
  storedStatus,
  status: presentedStatus,
  overdue: z.boolean(),
  startDate: z.string(),
  dueDate: z.string(),
  actualStartDate: z.string().nullable(),
  actualEndDate: z.string().nullable(),
  assignedUserIds: z.array(z.string()),
  assignedTo: z.array(z.string()),
  assignedEmails: z.array(z.string()),
  journeyStageIds: z.array(z.string()),
  journeyStageId: z.string(),
  indicatorIds: z.array(z.string()),
  targetBeneficiaries: z.number(),
  beneficiariesReached: z.number(),
  budgetAllocation: z.string().nullable(),
  progress: z.number(),
  reviewedById: z.string().nullable(),
  reviewedAt: z.string().nullable(),
  cancellationReason: z.string().nullable(),
  submittedProof: z.array(
    z.object({
      id: z.string(),
      updateId: z.string(),
      fileName: z.string(),
      status: reviewLabel,
      rejectionReason: z.string().nullable(),
      submittedAt: z.string(),
      submittedBy: z.string(),
      updateUpdatedAt: z.string(),
      note: z.string(),
    }),
  ),
  updateNotes: z.array(
    z.object({
      id: z.string(),
      proofIncomplete: z.boolean(),
      resumeClientUpdateId: z.string().nullable(),
      kind: z.enum(['proof', 'progress']),
      note: z.string(),
      progress: z.number(),
      beneficiariesReachedThisSession: z.number().nullable(),
      status: reviewLabel,
      submittedBy: z.string(),
      submittedAt: z.string(),
      reviewedBy: z.string().nullable(),
      reviewedAt: z.string().nullable(),
      reviewReason: z.string().nullable(),
      updatedAt: z.string(),
    }),
  ),
  updatedAt: z.string(),
  budgetLogged: z.string().nullable(),
  budgetLoggedEntries: z.number().nullable(),
  overdueExplanations: z.array(
    z.object({
      id: z.string(),
      category: z.string(),
      explanation: z.string(),
      actorName: z.string(),
      recordedAt: z.string(),
    }),
  ),
  overdueExplanationNeeded: z.boolean(),
})
// The activity as the mapper builds it, before the caller's capabilities are added.
export type ActivityRecordResponse = z.infer<typeof activityRecord>

// One activity as the detail, progress, explanation and read-back routes return it.
export const activityResponse = activityRecord.extend({
  capabilities: activityCapabilitiesResponse,
})
export type ActivityResponse = z.infer<typeof activityResponse>

// One activity after a source mutation, with the receipt of the committed request.
export const activityMutationResponse = activityResponse.extend({
  sourceAcknowledgement: sourceMutationAcknowledgement,
})
export type ActivityMutationResponse = z.infer<typeof activityMutationResponse>

const activityListRecord = z.object({
  id: z.string(),
  projectId: z.string(),
  code: z.string(),
  title: z.string(),
  description: z.string(),
  storedStatus,
  status: presentedStatus,
  overdue: z.boolean(),
  startDate: z.string(),
  dueDate: z.string(),
  assignedUserIds: z.array(z.string()),
  assignedTo: z.array(z.string()),
  journeyStageIds: z.array(z.string()),
  journeyStageId: z.string(),
  indicatorIds: z.array(z.string()),
  targetBeneficiaries: z.number(),
  progress: z.number(),
  updatedAt: z.string(),
  overdueExplanationNeeded: z.boolean(),
})
// A list row as the mapper builds it, before the per-viewer metrics are added.
export type ActivityListItemRecordResponse = z.infer<typeof activityListRecord>

// One row of GET /projects/:projectId/activities.
export const activityListItemResponse = activityListRecord.extend({
  indicatorCount: z.number(),
  beneficiariesTarget: z.number().nullable(),
  beneficiariesReached: z.number().nullable(),
  budgetUtilization: z.number().nullable(),
  capabilities: activityCapabilitiesResponse,
})
export type ActivityListItemResponse = z.infer<typeof activityListItemResponse>

// One row of GET /projects/:projectId/activities/context.
export const activityContextItemResponse = z.object({
  id: z.string(),
  title: z.string(),
  status: storedStatus,
  journeyStageId: z.string(),
})
export type ActivityContextItemResponse = z.infer<typeof activityContextItemResponse>

// One row of GET /projects/:projectId/activities/assignable-officers.
export const assignableOfficerResponse = z.object({ userId: z.string(), displayName: z.string() })
export type AssignableOfficerResponse = z.infer<typeof assignableOfficerResponse>

// Body of GET /projects/:projectId/evidence: counts for aggregate-only roles, records for the rest.
export const activityEvidenceListResponse = z.union([
  z.object({
    scope: z.literal('aggregate'),
    activities: z.array(
      z.object({
        activityId: z.string(),
        activityTitle: z.string(),
        total: z.number(),
        submitted: z.number(),
        approved: z.number(),
        returned: z.number(),
      }),
    ),
  }),
  z.object({
    scope: z.literal('detail'),
    records: z.array(
      z.object({
        id: z.string(),
        projectId: z.string(),
        activityId: z.string(),
        updateId: z.string(),
        updateUpdatedAt: z.string(),
        fileName: z.string(),
        reportTitle: z.string(),
        status: z.enum(['Approved', 'Returned', 'Submitted']),
        submitter: z.string(),
        submittedDate: z.string(),
        contentType: z.string().nullable(),
        byteSize: z.number(),
        isIdentifying: z.boolean(),
        reviewedDate: z.string().nullable(),
        reviewer: z.string().nullable(),
        previewSummary: z.string(),
      }),
    ),
  }),
])
export type ActivityEvidenceListResponse = z.infer<typeof activityEvidenceListResponse>

// Body of GET /projects/:projectId/activities/proof-upload-limits.
export const activityProofUploadLimitsResponse = z.object({
  maxFiles: z.number(),
  maxFileBytes: z.number(),
  maxTotalBytes: z.number(),
  contentTypes: z.array(z.enum(activityEvidenceContentTypes)),
})
export type ActivityProofUploadLimitsResponse = z.infer<typeof activityProofUploadLimitsResponse>

// Answer to a proof reservation: the signed upload targets, or the receipt of an already committed update.
export const activityProofReservationResponse = z.union([
  z.object({
    clientUpdateId: z.string(),
    status: z.literal('COMMITTED'),
    acknowledgement: sourceMutationAcknowledgement,
  }),
  z.object({
    clientUpdateId: z.string(),
    updateId: z.string(),
    status: z.enum(['UPLOADING', 'READY_TO_COMMIT']),
    files: z.array(
      z.object({
        evidenceId: z.string(),
        fileName: z.string(),
        contentType: z.string().nullable(),
        byteSize: z.number(),
        sha256: z.string(),
        storageReady: z.boolean(),
        uploadUrl: z.string().nullable(),
      }),
    ),
  }),
])
export type ActivityProofReservationResponse = z.infer<typeof activityProofReservationResponse>

// Answer to finalizing one evidence file: more files pending, or the update committed for review.
export const activityProofFinalizeResponse = z.union([
  z.object({
    status: z.literal('UPLOADING'),
    updateId: z.string(),
    remaining: z.number(),
  }),
  z.object({ status: z.literal('COMMITTED'), acknowledgement: sourceMutationAcknowledgement }),
  z.object({ status: z.literal('COMMITTED'), activity: activityMutationResponse }),
])
export type ActivityProofFinalizeResponse = z.infer<typeof activityProofFinalizeResponse>
