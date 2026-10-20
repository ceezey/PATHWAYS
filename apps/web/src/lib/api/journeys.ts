import type { CorrectJourneyEventResponse, RecordJourneyEventResponse } from '@pathways/shared'

import { requestFoundation } from '@/lib/api/core/request'
import type {
  BeneficiaryJourneyHistory,
  CorrectJourneyEventInput,
  EnrollmentJourneyEventInput,
  JourneyStageConfig,
} from '@/types/pathways'

import { parseJourneyHistory, parseJourneyStages } from './journeys.schema'

export const journeysClient = {
  async getJourneyStages(projectId: string, signal?: AbortSignal): Promise<JourneyStageConfig[]> {
    return parseJourneyStages(
      await requestFoundation(`/projects/${encodeURIComponent(projectId)}/journey-stages`, {
        signal,
      }),
    )
  },

  async saveJourneyStages(
    projectId: string,
    stages: JourneyStageConfig[],
  ): Promise<JourneyStageConfig[]> {
    const stageType = {
      Entry: 'ENTRY',
      Core: 'CORE',
      Branch: 'BRANCH',
      'Follow-Up': 'FOLLOW_UP',
    } as const
    return parseJourneyStages(
      await requestFoundation(`/projects/${encodeURIComponent(projectId)}/journey-stages`, {
        method: 'PUT',
        body: JSON.stringify({
          stages: stages.map((stage) => ({
            id: stage.id,
            code: stage.code,
            name: stage.name,
            order: stage.order,
            type: stageType[stage.type],
            parentStageId: stage.parentStageId,
            terminal: stage.terminal,
            description: stage.description,
            mappedActivityIds: stage.mappedActivityIds,
            expectedUpdatedAt: stage.updatedAt,
          })),
        }),
      }),
    )
  },

  async getBeneficiaryJourneyHistory(
    projectId: string,
    beneficiaryId: string,
  ): Promise<BeneficiaryJourneyHistory> {
    return parseJourneyHistory(
      await requestFoundation(
        `/beneficiaries/projects/${encodeURIComponent(projectId)}/${encodeURIComponent(beneficiaryId)}/journey`,
      ),
    )
  },

  async transitionBeneficiaryJourney(
    projectId: string,
    beneficiaryId: string,
    input: EnrollmentJourneyEventInput,
  ) {
    return requestFoundation(
      `/beneficiaries/projects/${encodeURIComponent(projectId)}/${encodeURIComponent(beneficiaryId)}/journey/events`,
      { method: 'POST', body: JSON.stringify(input) },
    ) as Promise<RecordJourneyEventResponse>
  },

  async correctBeneficiaryJourneyEvent(
    projectId: string,
    beneficiaryId: string,
    eventId: string,
    input: CorrectJourneyEventInput,
  ) {
    return requestFoundation(
      `/beneficiaries/projects/${encodeURIComponent(projectId)}/${encodeURIComponent(beneficiaryId)}/journey/events/${encodeURIComponent(eventId)}/corrections`,
      { method: 'POST', body: JSON.stringify(input) },
    ) as Promise<CorrectJourneyEventResponse>
  },
}
