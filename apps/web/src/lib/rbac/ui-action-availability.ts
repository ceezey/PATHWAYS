import type { PathwaysRole } from '@/types/pathways-role'
import {
  type AtomicPermission,
  type CanonicalRole,
  hasAtomicPermission,
  roleNames,
  rolePermissions,
} from '../../../../api/src/modules/auth/authorization-policy'

export type UiAction =
  | 'activities.status.edit'
  | 'activities.edit'
  | 'beneficiaries.edit'
  | 'beneficiaries.merge'
  | 'beneficiaries.create'
  | 'beneficiaries.participation.record'
  | 'dashboard.configure'
  | 'outcomes.log'
  | 'indicators.manage'
  | 'progress.review'
  | 'projects.profile.manage'
  | 'projects.team.manage'
  | 'journeys.manage'
  | 'milestones.manage'

// Only actions backed by an existing, usable API are enabled here. The server
// still checks the current profile and database grants on every request.
const supportedActionPermission: Partial<Record<UiAction, AtomicPermission>> = {
  'activities.status.edit': 'activities.complete',
  'activities.edit': 'activities.update',
  'beneficiaries.create': 'beneficiaries.records.register',
  'beneficiaries.edit': 'beneficiaries.profiles.update',
  'beneficiaries.participation.record': 'participation.record',
  'indicators.manage': 'indicators.create',
  'journeys.manage': 'journeys.manage',
  'milestones.manage': 'milestones.manage',
  'projects.profile.manage': 'projects.update',
  'projects.team.manage': 'assignments.manage',
}

export const isUiActionAvailable = (
  role: PathwaysRole | null,
  action: UiAction,
  principal?: { roles: readonly string[]; permissions: readonly string[] } | null,
) => {
  if (!role) return false
  const permission = supportedActionPermission[action]
  if (!permission) return false
  const roleCode = (Object.keys(roleNames) as CanonicalRole[]).find(
    (code) => roleNames[code] === role,
  )
  if (!roleCode) return false
  // Role-only use describes the ceiling. Mounted controls pass the current profile.
  if (principal !== undefined) {
    return Boolean(
      principal &&
        principal.roles.length === 1 &&
        principal.roles[0] === roleCode &&
        hasAtomicPermission(roleCode, principal.permissions, permission),
    )
  }
  return hasAtomicPermission(roleCode, rolePermissions[roleCode], permission)
}
