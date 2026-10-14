import {
  type SourceMutationContext,
  ensureSourceInvalidationSubscription,
  sourceMutationTickets,
} from './source-mutation'

import { PathwaysClientError, requestFoundation } from '@/lib/api/core/request'
import type {
  AuthorizeExistingUserInput,
  UpdateAuthorizedUserInput,
  UserRecord,
} from '@/types/pathways'
import type { PathwaysRole } from '@/types/pathways-role'
import { roleCodeByName } from '@pathways/shared'

interface PathwaysClient {
  getUsers(signal?: AbortSignal): Promise<UserRecord[]>
  authorizeExistingUser(input: AuthorizeExistingUserInput): Promise<UserRecord>
  updateAuthorizedUser(id: string, input: UpdateAuthorizedUserInput): Promise<UserRecord>
}

class BackendReadyPathwaysClient implements PathwaysClient {
  async getUsers(signal?: AbortSignal): Promise<UserRecord[]> {
    return requestFoundation('/users', { signal }).then(parseUsers)
  }

  async authorizeExistingUser(input: AuthorizeExistingUserInput): Promise<UserRecord> {
    return mapUser(
      (await requestFoundation('/users/authorize-existing', {
        method: 'POST',
        body: JSON.stringify({
          authUserId: input.authUserId,
          fullName: input.fullName,
          role: roleCodeByName[input.role],
          projectIds: input.projectIds,
        }),
      })) as ApiUser,
    )
  }

  async updateAuthorizedUser(id: string, input: UpdateAuthorizedUserInput): Promise<UserRecord> {
    return mapUser(
      (await requestFoundation(`/users/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: JSON.stringify({
          fullName: input.fullName,
          role: roleCodeByName[input.role],
          accountStatus: input.accountStatus === 'Active' ? 'ACTIVE' : 'DEACTIVATED',
          projectIds: input.projectIds,
        }),
      })) as ApiUser,
    )
  }
}

export const pathwaysClient: PathwaysClient = new BackendReadyPathwaysClient()

interface ApiUser {
  id: string
  authUserId: string | null
  name: string
  email: string
  role: PathwaysRole
  accountStatus: 'ACTIVE' | 'INVITED' | 'SUSPENDED' | 'DEACTIVATED' | 'ARCHIVED'
  projectIds: string[]
  projectAccess: string[]
  createdAt: string
  lastActiveAt?: string
}

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

function mapUser(user: ApiUser): UserRecord {
  const accountStatus = {
    ACTIVE: 'Active',
    INVITED: 'Invited',
    SUSPENDED: 'Suspended',
    DEACTIVATED: 'Deactivated',
    ARCHIVED: 'Archived',
  } as const
  return {
    ...user,
    accountStatus: accountStatus[user.accountStatus],
    signInMethod: 'Supabase account',
  }
}

function parseUsers(value: unknown) {
  if (!Array.isArray(value) || value.length > 200)
    throw new PathwaysClientError('Invalid user response.', 'network')
  return value.map((row) => mapUser(row as ApiUser))
}
