import { type AuthorizedUserResponse, roleCodeByName } from '@pathways/shared'

import { PathwaysClientError, requestFoundation } from '@/lib/api/core/request'
import type {
  AuthorizeExistingUserInput,
  UpdateAuthorizedUserInput,
  UserRecord,
} from '@/types/pathways'

function mapUser(user: AuthorizedUserResponse): UserRecord {
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
  return value.map((row) => mapUser(row as AuthorizedUserResponse))
}

// Authorized user reads and writes; the API decides every role and project scope.
export const usersClient = {
  async getUsers(signal?: AbortSignal): Promise<UserRecord[]> {
    return requestFoundation('/users', { signal }).then(parseUsers)
  },

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
      })) as AuthorizedUserResponse,
    )
  },

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
      })) as AuthorizedUserResponse,
    )
  },
}
