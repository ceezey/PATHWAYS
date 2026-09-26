import { type PathwaysRole, pathwaysRoles } from '@/types/pathways-role'
import {
  type AtomicPermission,
  type CanonicalRole,
  canAssignRole,
  canAuthorizeRole,
  roleNames,
  rolePermissions,
} from '../../../../api/src/modules/auth/authorization-policy'
import type { DataScopeCode, PermissionCode } from './permissions'

export type AccessLevel = 'none' | 'view' | 'aggregate' | 'scoped' | 'full' | 'configure'
export type ProjectAccessScope = 'organization' | 'portfolio' | 'assigned-projects'
export type BeneficiaryDataAccess = 'all-records' | 'assigned-project-records' | 'aggregate-only'
export type ProjectAssignmentScope =
  | 'all-projects'
  | 'portfolio-projects'
  | 'assigned-projects'
  | 'none'

export const projectAssignableRoles = [
  'Project Manager',
  'Project Officer',
  'Monitoring and Evaluation Officer',
  'Grant Manager',
] as const satisfies readonly PathwaysRole[]

export type ProjectAssignableRole = (typeof projectAssignableRoles)[number]

export interface UserAdministrationCapabilities {
  createAndAuthorizeRoles: readonly PathwaysRole[]
  projectAssignmentRoles: readonly ProjectAssignableRole[]
  projectAssignmentScope: ProjectAssignmentScope
}

export interface RoleAccessProfile {
  role: PathwaysRole
  permissions: readonly PermissionCode[]
  dataScopes: readonly DataScopeCode[]
  projectAccess: ProjectAccessScope
  beneficiaryDataAccess: BeneficiaryDataAccess
  userAdministration: UserAdministrationCapabilities
  modules: {
    budget: AccessLevel
    monitorEvaluate: AccessLevel
    rules: AccessLevel
    beneficiaries: AccessLevel
    alerts: AccessLevel
    activities: AccessLevel
    evaluation: AccessLevel
    transparency: AccessLevel
  }
}

export const legacyAtomicPermissions: Record<PermissionCode, readonly AtomicPermission[]> = {
  'projects.view': ['projects.detail.read'],
  'projects.create': ['projects.create'],
  'activities.view': ['activities.read'],
  'activities.create_edit': ['activities.create', 'activities.update'],
  'activities.submit_update_proof': ['activities.proof.submit'],
  'budget.expense.log': ['expenses.submit'],
  'budget.expense.view': ['expenses.read'],
  'budget.expense.verify': ['expenses.verify'],
  'budget.expense.approve': ['expenses.approve'],
  'budget.full': ['budgets.create', 'budgets.update'],
  'budget.portfolio_view': ['budgets.read'],
  'monitor_evaluate.view': ['monitoring.read'],
  'monitor_evaluate.full': ['monitoring.review'],
  'rules.view': ['rules.read'],
  'rules.configure': ['rules.update'],
  'beneficiaries.scoped_view': ['beneficiaries.records.read'],
  'beneficiaries.full_view': ['beneficiaries.records.read'],
  'alerts.view': ['alerts.read'],
  'alerts.review': ['alerts.review'],
  'alerts.outcome.record': ['alerts.outcome.record'],
  'alerts.outcome.log': ['recommendations.outcome.record'],
  'recommendations.view': ['recommendations.read'],
  'recommendations.review': ['recommendations.review'],
  'recommendations.outcome.record': ['recommendations.outcome.record'],
  'evaluation.formal.submit': ['evaluations.submit'],
  'evaluation.approve': ['evaluations.approve'],
  'transparency.preview': ['public.preview'],
  'transparency.publish': ['public.publish'],
  'evidence.review': ['evidence.review'],
  'indicators.manage': ['indicators.create', 'indicators.update'],
  'collection.view': ['collection.read'],
  'analytics.view': ['analytics.read'],
  'reports.view': ['reports.read'],
  'reports.project_summary.view': ['reports.project.read'],
  'reports.indicator_summary.view': ['reports.indicator.read'],
  'reports.beneficiary_summary.view': ['reports.beneficiary.read'],
  'settings.users.manage': ['users.authorize'],
  'settings.view': ['settings.read'],
}

const entries = Object.entries(roleNames) as Array<[CanonicalRole, PathwaysRole]>
const roleCodesByName = Object.fromEntries(entries.map(([code, name]) => [name, code])) as Record<
  PathwaysRole,
  CanonicalRole
>
export const roleAccessProfiles = Object.fromEntries(
  entries.map(([code, role]) => {
    const permissions = rolePermissions[code]
    const has = (permission: AtomicPermission) => permissions.includes(permission)
    const managesUsers = has('users.authorize')
    const aggregate = code === 'PROGRAM_MANAGER' || code === 'GRANT_MANAGER'
    const profile: RoleAccessProfile = {
      role,
      permissions: (Object.keys(legacyAtomicPermissions) as PermissionCode[]).filter((permission) =>
        legacyAtomicPermissions[permission].some(has),
      ),
      dataScopes:
        code === 'SYSTEM_ADMINISTRATOR'
          ? ['organization']
          : code === 'PROGRAM_MANAGER'
            ? ['portfolio_projects']
            : ['assigned_projects'],
      projectAccess:
        code === 'SYSTEM_ADMINISTRATOR'
          ? 'organization'
          : code === 'PROGRAM_MANAGER'
            ? 'portfolio'
            : 'assigned-projects',
      beneficiaryDataAccess:
        aggregate || !has('beneficiaries.records.read')
          ? 'aggregate-only'
          : 'assigned-project-records',
      userAdministration: {
        createAndAuthorizeRoles: managesUsers
          ? pathwaysRoles.filter((name) => canAuthorizeRole(code, roleCodesByName[name]))
          : [],
        projectAssignmentRoles: managesUsers
          ? projectAssignableRoles.filter((name) => canAssignRole(code, roleCodesByName[name]))
          : [],
        projectAssignmentScope: !managesUsers
          ? 'none'
          : code === 'SYSTEM_ADMINISTRATOR'
            ? 'all-projects'
            : code === 'PROGRAM_MANAGER'
              ? 'portfolio-projects'
              : 'assigned-projects',
      },
      modules: {
        budget: has('budgets.update')
          ? 'full'
          : has('expenses.submit')
            ? 'scoped'
            : has('budgets.read')
              ? 'view'
              : 'none',
        monitorEvaluate: has('monitoring.review')
          ? 'full'
          : has('monitoring.read')
            ? 'view'
            : 'none',
        rules: has('rules.update') ? 'configure' : 'none',
        beneficiaries: has('beneficiaries.records.read')
          ? 'scoped'
          : aggregate
            ? 'aggregate'
            : 'none',
        alerts: has('alerts.review') ? 'full' : 'none',
        activities: has('activities.update') ? 'full' : has('activities.read') ? 'scoped' : 'none',
        evaluation: has('evaluations.submit')
          ? 'full'
          : has('evaluations.approve') || has('evaluations.signoff')
            ? 'view'
            : 'none',
        transparency: has('public.publish') ? 'full' : 'none',
      },
    }
    return [role, profile]
  }),
) as Record<PathwaysRole, RoleAccessProfile>
