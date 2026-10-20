import {
  type SourceMutationContext,
  ensureSourceInvalidationSubscription,
  sourceMutationTickets,
} from '../api/core/source-mutation'

import { PathwaysClientError, requestFoundation } from '@/lib/api/core/request'

const sourceTickets = sourceMutationTickets
ensureSourceInvalidationSubscription()
/** Only existing owned source operations are eligible; proof and project creation are excluded. */
export async function recoverSourceMutation(context: SourceMutationContext, operationKey: string) {
  const match =
    /^(POST|PATCH):\/projects\/([0-9a-f-]{36})(?:\/(activities|indicators)(?:\/([0-9a-f-]{36})(?:\/(transition|archive|measurements|updates\/([0-9a-f-]{36})\/review))?)?)?$/.exec(
      operationKey,
    )
  if (!match) throw new PathwaysClientError('This request does not support recovery.', 'invalid')
  const [, method, projectId, resource, sourceId, action, updateId] = match
  return sourceTickets.recover(context, operationKey, async (captured) => {
    const operation =
      !resource && method === 'PATCH'
        ? 'PROJECT_UPDATE'
        : resource === 'activities'
          ? !sourceId && method === 'POST'
            ? 'ACTIVITY_CREATE'
            : action === 'transition'
              ? captured.body.status === 'IN_PROGRESS'
                ? 'ACTIVITY_START'
                : captured.body.status === 'CANCELLED'
                  ? 'ACTIVITY_CANCEL'
                  : null
              : updateId
                ? 'ACTIVITY_REVIEW'
                : !action && method === 'PATCH'
                  ? 'ACTIVITY_UPDATE'
                  : null
          : resource === 'indicators'
            ? !sourceId && method === 'POST'
              ? 'INDICATOR_CREATE'
              : action === 'archive'
                ? 'INDICATOR_ARCHIVE'
                : action === 'measurements'
                  ? 'INDICATOR_MEASUREMENT'
                  : !action && method === 'PATCH'
                    ? 'INDICATOR_UPDATE'
                    : null
            : null
    if (!operation)
      throw new PathwaysClientError('This request does not support recovery.', 'invalid')
    if (!context.isCurrent())
      throw new PathwaysClientError('Current recovery ownership is required.', 'unauthorized')
    return requestFoundation(
      `/projects/${projectId}/source-operations/abandon`,
      {
        method: 'POST',
        body: JSON.stringify({
          operation,
          sourceId: sourceId ?? (resource ? null : projectId),
          requestId: captured.requestId,
          body: updateId ? { ...captured.body, updateId } : captured.body,
        }),
      },
      context.isCurrent,
    )
  })
}
