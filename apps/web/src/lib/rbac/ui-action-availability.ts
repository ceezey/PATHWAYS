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
  | 'dashboard.configure'
  | 'outcomes.log'
  | 'indicators.manage'
  | 'progress.review'
  | 'projects.team.manage'

// Only actions backed by an existing, usable API are enabled here. The server
// still checks the current profile and database grants on every request.
const supportedActionPermission: Partial<Record<UiAction, AtomicPermission>> = {
  'activities.status.edit': 'activities.update',
  'activities.edit': 'activities.update',
  'indicators.manage': 'indicators.create',
}

export const isUiActionAvailable = (role: PathwaysRole | null, action: UiAction) => {
  if (!role) return false
  const permission = supportedActionPermission[action]
  if (!permission) return false
  const roleCode = (Object.keys(roleNames) as CanonicalRole[]).find(
    (code) => roleNames[code] === role,
  )
  return Boolean(roleCode && hasAtomicPermission(roleCode, rolePermissions[roleCode], permission))
}
