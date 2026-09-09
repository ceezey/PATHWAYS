import { type DemoAction, actionRoles, hasAction } from '@/lib/demo-state/permissions'
import type { PrototypeRole } from '@/types/prototype-role'
import {
  type ProjectAssignableRole,
  fallbackAccessProfile,
  roleAccessProfiles,
} from './access-matrix'
import type { PermissionCode } from './permissions'

const legacyAction: Partial<Record<PermissionCode, DemoAction>> = {
  'activities.view': 'delivery.view',
  'activities.create_edit': 'activities.edit',
  'activities.submit_update_proof': 'activities.edit',
  'evidence.review': 'expenses.verify',
  'budget.expense.log': 'expenses.submit',
  'budget.expense.view': 'delivery.view',
  'budget.expense.verify': 'expenses.verify',
  'budget.expense.approve': 'progress.approve',
  'monitor_evaluate.view': 'monitoring.view',
  'monitor_evaluate.full': 'monitoring.view',
  'beneficiaries.scoped_view': 'beneficiaries.view',
  'beneficiaries.full_view': 'beneficiaries.view',
  'collection.view': 'forms.view',
  'reports.view': 'reports.generate',
  'reports.project_summary.view': 'reports.generate',
  'reports.indicator_summary.view': 'reports.generate',
  'reports.beneficiary_summary.view': 'reports.generate',
  'alerts.outcome.log': 'outcomes.log',
  'transparency.preview': 'public.review',
  'transparency.publish': 'public.publish',
  'settings.users.manage': 'users.view',
  'rules.view': 'rules.configure',
}

export const getAccessProfile = (role: PrototypeRole) =>
  roleAccessProfiles[role] ?? fallbackAccessProfile

export const can = (role: PrototypeRole, permission: PermissionCode) => {
  const action =
    legacyAction[permission] ?? (permission in actionRoles ? (permission as DemoAction) : undefined)
  return action ? hasAction(role, action) : getAccessProfile(role).permissions.includes(permission)
}

export const canAny = (role: PrototypeRole, permissions: PermissionCode[]) =>
  permissions.some((permission) => can(role, permission))

export const cannot = (role: PrototypeRole, permission: PermissionCode) => !can(role, permission)

export const canCreateOrAuthorizeRole = (actorRole: PrototypeRole, targetRole: PrototypeRole) =>
  getAccessProfile(actorRole).userAdministration.createAndAuthorizeRoles.includes(targetRole)

export const canConfigureProjectAssignmentsForRole = (
  actorRole: PrototypeRole,
  targetRole: ProjectAssignableRole,
) => getAccessProfile(actorRole).userAdministration.projectAssignmentRoles.includes(targetRole)
