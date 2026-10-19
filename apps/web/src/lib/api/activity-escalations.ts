import {
  type CreateActivityEscalation,
  type DecideActivityEscalation,
  activityEscalationResponse,
} from '@pathways/shared'

import { requestFoundation } from '@/lib/api/core/request'

const escalationPath = (projectId: string, activityId: string) =>
  `/projects/${encodeURIComponent(projectId)}/activities/${encodeURIComponent(activityId)}/escalations`

export type EscalationStep = 'forward' | 'resolve' | 'program-resolve'

export const activityEscalationsClient = {
  async listActivityEscalations(projectId: string, activityId: string) {
    return activityEscalationResponse
      .array()
      .parse(await requestFoundation(escalationPath(projectId, activityId)))
  },

  async raiseActivityEscalation(
    projectId: string,
    activityId: string,
    input: CreateActivityEscalation,
  ) {
    return activityEscalationResponse.parse(
      await requestFoundation(escalationPath(projectId, activityId), {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    )
  },

  async stepActivityEscalation(
    projectId: string,
    activityId: string,
    escalationId: string,
    step: EscalationStep,
    input: DecideActivityEscalation,
  ) {
    return activityEscalationResponse.parse(
      await requestFoundation(
        `${escalationPath(projectId, activityId)}/${encodeURIComponent(escalationId)}/${step}`,
        { method: 'POST', body: JSON.stringify(input) },
      ),
    )
  },
}
