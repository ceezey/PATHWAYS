import type { PrototypeRole } from '@/types/prototype-role'
import {
  type ProjectAssignableRole,
  fallbackAccessProfile,
  roleAccessProfiles,
} from './access-matrix'
import type { PermissionCode } from './permissions'

export const getAccessProfile = (role: PrototypeRole) =>
  roleAccessProfiles[role] ?? fallbackAccessProfile

export const can = (role: PrototypeRole, permission: PermissionCode) =>
  getAccessProfile(role).permissions.includes(permission)

export const canAny = (role: PrototypeRole, permissions: PermissionCode[]) =>
  permissions.some((permission) => can(role, permission))

export const cannot = (role: PrototypeRole, permission: PermissionCode) => !can(role, permission)

export const canCreateOrAuthorizeRole = (actorRole: PrototypeRole, targetRole: PrototypeRole) =>
  getAccessProfile(actorRole).userAdministration.createAndAuthorizeRoles.includes(targetRole)

export const canConfigureProjectAssignmentsForRole = (
  actorRole: PrototypeRole,
  targetRole: ProjectAssignableRole,
) => getAccessProfile(actorRole).userAdministration.projectAssignmentRoles.includes(targetRole)
