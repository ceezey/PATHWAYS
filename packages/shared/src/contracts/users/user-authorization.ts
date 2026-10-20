import { z } from 'zod'

import { type CanonicalRole, type RoleName, roleNames } from '../../rbac/role-catalog'
import { lengthString, trimmedInput, uuidString } from '../common/field-schemas'

const roleCodes = Object.keys(roleNames) as [CanonicalRole, ...CanonicalRole[]]
const roleDisplayNames = Object.values(roleNames) as [RoleName, ...RoleName[]]
const fullName = trimmedInput(lengthString(1, 120))
const projectIds = z.array(uuidString).max(100, 'must contain no more than 100 elements')

// Body of POST users/authorize-existing.
export const authorizeExistingUserRequest = z
  .object({
    authUserId: uuidString,
    fullName,
    role: z.enum(roleCodes),
    projectIds: projectIds.default([]),
  })
  .strict()
export type AuthorizeExistingUserRequest = z.infer<typeof authorizeExistingUserRequest>

// Body of PATCH users/:userId; a null or absent name leaves the name unchanged.
export const updateAuthorizedUserRequest = z
  .object({
    fullName: fullName.nullish(),
    role: z.enum(roleCodes),
    accountStatus: z.enum(['ACTIVE', 'DEACTIVATED']),
    projectIds,
  })
  .strict()
export type UpdateAuthorizedUserRequest = z.infer<typeof updateAuthorizedUserRequest>

// One authorized user as the users routes return it; a type for the web, never parsed at runtime.
export const authorizedUserResponse = z.object({
  id: z.string(),
  authUserId: z.string().nullable(),
  name: z.string(),
  email: z.string(),
  role: z.enum(roleDisplayNames),
  roleCode: z.enum(roleCodes),
  accountStatus: z.enum(['ACTIVE', 'INVITED', 'SUSPENDED', 'DEACTIVATED', 'ARCHIVED']),
  projectIds: z.array(z.string()),
  projectAccess: z.array(z.string()),
  createdAt: z.string(),
  lastActiveAt: z.string().optional(),
})
export type AuthorizedUserResponse = z.infer<typeof authorizedUserResponse>
