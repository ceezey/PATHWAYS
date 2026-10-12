import {
  type CreateActivityExtensionRequest,
  type DecideActivityExtensionRequest,
  type VerifyActivityExtensionRequest,
  activityExtensionSchema,
} from '@pathways/shared'

import { requestFoundation } from '@/lib/api/core/request'

const extensionPath = (projectId: string, activityId: string) =>
  `/projects/${encodeURIComponent(projectId)}/activities/${encodeURIComponent(activityId)}/extension-requests`

export const activityExtensionsClient = {
  async listActivityExtensions(projectId: string, activityId: string) {
    return activityExtensionSchema
      .array()
      .parse(await requestFoundation(extensionPath(projectId, activityId)))
  },

  async requestActivityExtension(
    projectId: string,
    activityId: string,
    input: CreateActivityExtensionRequest,
  ) {
    return activityExtensionSchema.parse(
      await requestFoundation(extensionPath(projectId, activityId), {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    )
  },

  async verifyActivityExtension(
    projectId: string,
    activityId: string,
    requestId: string,
    input: VerifyActivityExtensionRequest,
  ) {
    return activityExtensionSchema.parse(
      await requestFoundation(
        `${extensionPath(projectId, activityId)}/${encodeURIComponent(requestId)}/verify`,
        {
          method: 'POST',
          body: JSON.stringify(input),
        },
      ),
    )
  },

  async decideActivityExtension(
    projectId: string,
    activityId: string,
    requestId: string,
    input: DecideActivityExtensionRequest,
  ) {
    return activityExtensionSchema.parse(
      await requestFoundation(
        `${extensionPath(projectId, activityId)}/${encodeURIComponent(requestId)}/decide`,
        {
          method: 'POST',
          body: JSON.stringify(input),
        },
      ),
    )
  },
}
