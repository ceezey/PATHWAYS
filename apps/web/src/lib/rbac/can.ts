import type { PathwaysRole } from '@/types/pathways-role'
import { type ProjectAssignableRole, roleAccessProfiles } from './access-matrix'
import type { PermissionCode } from './permissions'

export const getAccessProfile = (role: PathwaysRole) => roleAccessProfiles[role]

export const can = (role: PathwaysRole, permission: PermissionCode) =>
  getAccessProfile(role).permissions.includes(permission)

export const canCreateOrAuthorizeRole = (actorRole: PathwaysRole, targetRole: PathwaysRole) =>
  getAccessProfile(actorRole).userAdministration.createAndAuthorizeRoles.includes(targetRole)

export const canConfigureProjectAssignmentsForRole = (
  actorRole: PathwaysRole,
  targetRole: ProjectAssignableRole,
) => getAccessProfile(actorRole).userAdministration.projectAssignmentRoles.includes(targetRole)
