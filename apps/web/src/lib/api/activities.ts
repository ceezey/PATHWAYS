import {
  PathwaysClientError,
  requestFoundation,
  requestFoundationResponse,
} from '@/lib/api/core/request'
import { requestSourceMutation } from '@/lib/api/core/source-mutation-request'
import type { SourceMutationContext, SourceMutationResult } from '@/lib/services/source-mutation'
import type {
  Activity,
  ActivityProofFinalizeResult,
  ActivityProofReservation,
  ActivityProofUploadLimits,
  ActivitySummary,
  AssignableProjectOfficer,
  CreateActivityInput,
  EvidenceList,
  RecordActivityProgressInput,
  RecordOverdueExplanationInput,
  ReserveActivityProofUploadInput,
  UpdateActivityInput,
} from '@/types/pathways'
import type {
  CreateActivityRequest,
  RecordActivityProgressRequest,
  RecordOverdueExplanationRequest,
  ReviewActivityUpdateRequest,
  TransitionActivityRequest,
  UpdateActivityRequest,
} from '@pathways/shared'

import {
  parseActivity,
  parseActivitySummaries,
  parseAssignableProjectOfficers,
  parseEvidenceList,
} from './activities.schema'
import {
  parseActivityProofFinalizeResult,
  parseActivityProofReservation,
  parseActivityProofUploadLimits,
} from './activity-proofs.schema'

export const activitiesClient = {
  async getActivityContext(
    projectId: string,
    signal?: AbortSignal,
  ): Promise<Pick<Activity, 'id' | 'title' | 'journeyStageId'>[]> {
    const rows = await requestFoundation(
      `/projects/${encodeURIComponent(projectId)}/activities/context`,
      { signal },
    )
    if (
      !Array.isArray(rows) ||
      rows.length > 100 ||
      rows.some(
        (row) =>
          !row ||
          typeof row.id !== 'string' ||
          typeof row.title !== 'string' ||
          typeof row.journeyStageId !== 'string',
      )
    ) {
      throw new PathwaysClientError('Invalid activity context response.', 'network')
    }
    return rows.map((row) => ({ id: row.id, title: row.title, journeyStageId: row.journeyStageId }))
  },

  async getActivities(projectId: string, signal?: AbortSignal): Promise<ActivitySummary[]> {
    return requestFoundation(`/projects/${encodeURIComponent(projectId)}/activities`, {
      signal,
    }).then(parseActivitySummaries)
  },

  async getActivity(
    projectId: string,
    activityId: string,
    signal?: AbortSignal,
  ): Promise<Activity> {
    return parseActivity(
      await requestFoundation(
        `/projects/${encodeURIComponent(projectId)}/activities/${encodeURIComponent(activityId)}`,
        { signal },
      ),
    )
  },

  // Assignable Project Officers (feature/project-rbac-ui-and-partners). Replaces GET /users
  // in the activity editor; the response is exactly userId and displayName, at most 50 rows.
  async getAssignableProjectOfficers(
    projectId: string,
    signal?: AbortSignal,
  ): Promise<AssignableProjectOfficer[]> {
    return parseAssignableProjectOfficers(
      await requestFoundation(
        `/projects/${encodeURIComponent(projectId)}/activities/assignable-officers`,
        { signal },
      ),
    )
  },

  async createActivity(
    input: CreateActivityInput,
    context?: SourceMutationContext,
  ): Promise<SourceMutationResult<Activity>> {
    return requestSourceMutation(
      `/projects/${encodeURIComponent(input.projectId)}/activities`,
      'POST',
      {
        title: input.title,
        description: input.description,
        plannedStartDate: input.startDate,
        plannedEndDate: input.dueDate,
        timelineOverrideJustification: input.timelineOverrideJustification,
        targetBeneficiaries: input.targetBeneficiaries,
        budgetAllocation: input.budgetAllocation,
        assignedUserIds: input.assignedUserIds,
        indicatorIds: input.indicatorIds,
        journeyStageId: input.journeyStageId,
      } satisfies Omit<CreateActivityRequest, 'clientMutationId'>,
      context,
      parseActivity,
    )
  },

  async updateActivity(
    input: UpdateActivityInput,
    context?: SourceMutationContext,
  ): Promise<SourceMutationResult<Activity>> {
    return requestSourceMutation(
      `/projects/${encodeURIComponent(input.projectId)}/activities/${encodeURIComponent(input.id)}`,
      'PATCH',
      {
        title: input.title,
        description: input.description,
        plannedStartDate: input.startDate,
        plannedEndDate: input.dueDate,
        timelineOverrideJustification: input.timelineOverrideJustification,
        targetBeneficiaries: input.targetBeneficiaries,
        budgetAllocation: input.budgetAllocation,
        assignedUserIds: input.assignedUserIds,
        indicatorIds: input.indicatorIds,
        journeyStageId: input.journeyStageId,
        expectedUpdatedAt: input.expectedUpdatedAt,
      } satisfies Omit<UpdateActivityRequest, 'clientMutationId'>,
      context,
      parseActivity,
    )
  },

  async transitionActivity(
    projectId: string,
    activityId: string,
    status: 'IN_PROGRESS' | 'CANCELLED',
    expectedUpdatedAt: string,
    reason?: string,
    context?: SourceMutationContext,
  ): Promise<SourceMutationResult<Activity>> {
    return requestSourceMutation(
      `/projects/${encodeURIComponent(projectId)}/activities/${encodeURIComponent(activityId)}/transition`,
      'POST',
      { status, expectedUpdatedAt, reason } satisfies Omit<
        TransitionActivityRequest,
        'clientMutationId'
      >,
      context,
      parseActivity,
    )
  },

  async recordActivityProgress(input: RecordActivityProgressInput): Promise<Activity> {
    return parseActivity(
      await requestFoundation(
        `/projects/${encodeURIComponent(input.projectId)}/activities/${encodeURIComponent(input.activityId)}/progress`,
        {
          method: 'POST',
          body: JSON.stringify({
            clientUpdateId: input.clientUpdateId,
            progressPercent: input.progress,
            note: input.note,
          } satisfies RecordActivityProgressRequest),
        },
      ),
    )
  },

  async recordOverdueExplanation(input: RecordOverdueExplanationInput): Promise<Activity> {
    return parseActivity(
      await requestFoundation(
        `/projects/${encodeURIComponent(input.projectId)}/activities/${encodeURIComponent(input.activityId)}/overdue-explanations`,
        {
          method: 'POST',
          body: JSON.stringify({
            clientMutationId: input.clientMutationId,
            category: input.category,
            explanation: input.explanation,
          } satisfies RecordOverdueExplanationRequest),
        },
      ),
    )
  },

  // Proof uploads use the reserve, signed upload and finalize routes below.

  async getActivityProofUploadLimits(projectId: string): Promise<ActivityProofUploadLimits> {
    return requestFoundation(
      `/projects/${encodeURIComponent(projectId)}/activities/proof-upload-limits`,
    ).then(parseActivityProofUploadLimits)
  },

  async reserveActivityProofUpload(
    input: ReserveActivityProofUploadInput,
  ): Promise<ActivityProofReservation> {
    const path = `/projects/${encodeURIComponent(input.projectId)}/activities/${encodeURIComponent(input.activityId)}/updates/reservations`
    return requestFoundation(path, {
      method: 'POST',
      body: JSON.stringify({
        clientUpdateId: input.clientUpdateId,
        progressPercent: input.progressPercent,
        note: input.note,
        files: input.files,
        ...(input.beneficiariesReachedThisSession === undefined
          ? {}
          : { beneficiariesReachedThisSession: input.beneficiariesReachedThisSession }),
      }),
    }).then(parseActivityProofReservation)
  },

  // A raw PUT to the server-issued signed upload URL. This never carries the caller's own API
  // bearer token or workspace headers: the signed URL's embedded token is the only credential,
  // scoped to one server-derived object key, and it authorizes a write only, never a read.
  async uploadActivityProofFile(uploadUrl: string, file: File): Promise<void> {
    const body = new FormData()
    body.append('cacheControl', '3600')
    body.append('', file)
    const response = await fetch(uploadUrl, {
      method: 'PUT',
      body,
      cache: 'no-store',
      credentials: 'omit',
      redirect: 'error',
      referrerPolicy: 'no-referrer',
    })
    if (!response.ok)
      throw new PathwaysClientError(
        'The file could not be uploaded. Retry this file.',
        'network',
        [],
        response.status,
      )
  },

  async finalizeActivityProofFile(
    projectId: string,
    activityId: string,
    updateId: string,
    evidenceId: string,
  ): Promise<ActivityProofFinalizeResult> {
    const path = `/projects/${encodeURIComponent(projectId)}/activities/${encodeURIComponent(activityId)}/updates/${encodeURIComponent(updateId)}/files/${encodeURIComponent(evidenceId)}/finalize`
    return requestFoundation(path, { method: 'POST' }).then(parseActivityProofFinalizeResult)
  },

  async reviewActivityUpdate(
    projectId: string,
    activityId: string,
    updateId: string,
    decision: 'APPROVE' | 'RETURN',
    reason: string,
    expectedUpdatedAt: string,
    context?: SourceMutationContext,
  ): Promise<SourceMutationResult<Activity>> {
    return requestSourceMutation(
      `/projects/${encodeURIComponent(projectId)}/activities/${encodeURIComponent(activityId)}/updates/${encodeURIComponent(updateId)}/review`,
      'POST',
      { decision, reason, expectedUpdatedAt } satisfies Omit<
        ReviewActivityUpdateRequest,
        'clientMutationId'
      >,
      context,
      parseActivity,
    )
  },

  async downloadActivityProof(projectId: string, activityId: string, evidenceId: string) {
    const response = await requestFoundationResponse(
      `/projects/${encodeURIComponent(projectId)}/activities/${encodeURIComponent(activityId)}/proof/${encodeURIComponent(evidenceId)}`,
    )
    return response.blob()
  },

  async getEvidence(projectId: string): Promise<EvidenceList> {
    return parseEvidenceList(
      await requestFoundation(`/projects/${encodeURIComponent(projectId)}/evidence`),
    )
  },
}
