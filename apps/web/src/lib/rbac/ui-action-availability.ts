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

// Only actions backed by an existing, usable API are enabled here. The server
// still checks the current profile and database grants on every request.
const supportedActionPermission: Partial<Record<UiAction, AtomicPermission>> = {
  'activities.status.edit': 'activities.update',
  'activities.edit': 'activities.update',
  'beneficiaries.create': 'beneficiaries.records.register',
  'beneficiaries.edit': 'beneficiaries.profiles.update',
  'beneficiaries.participation.record': 'participation.record',
  'indicators.manage': 'indicators.create',
  'journeys.manage': 'journeys.manage',
  'projects.profile.manage': 'projects.create',
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
