import { type PrototypeRole, prototypeRoles } from '@/types/prototype-role'
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
] as const satisfies readonly PrototypeRole[]

export type ProjectAssignableRole = (typeof projectAssignableRoles)[number]

export interface UserAdministrationCapabilities {
  createAndAuthorizeRoles: readonly PrototypeRole[]
  projectAssignmentRoles: readonly ProjectAssignableRole[]
  projectAssignmentScope: ProjectAssignmentScope
}

export interface RoleAccessProfile {
  role: PrototypeRole
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

const noUserAdministration = {
  createAndAuthorizeRoles: [],
  projectAssignmentRoles: [],
  projectAssignmentScope: 'none',
} as const satisfies UserAdministrationCapabilities

export const roleAccessProfiles: Record<PrototypeRole, RoleAccessProfile> = {
  'Project Officer': {
    role: 'Project Officer',
    permissions: [
      'projects.view',
      'activities.view',
      'activities.submit_update_proof',
      'budget.expense.log',
      'beneficiaries.scoped_view',
      'collection.view',
      'analytics.view',
      'reports.view',
      'reports.beneficiary_summary.view',
    ],
    dataScopes: ['assigned_projects', 'assigned_activities'],
    projectAccess: 'assigned-projects',
    beneficiaryDataAccess: 'assigned-project-records',
    userAdministration: noUserAdministration,
    modules: {
      budget: 'scoped',
      monitorEvaluate: 'none',
      rules: 'none',
      beneficiaries: 'scoped',
      alerts: 'none',
      activities: 'scoped',
      evaluation: 'none',
      transparency: 'none',
    },
  },
  'Monitoring and Evaluation Officer': {
    role: 'Monitoring and Evaluation Officer',
    permissions: [
      'projects.view',
      'activities.view',
      'evidence.review',
      'indicators.manage',
      'budget.expense.view',
      'budget.expense.verify',
      'monitor_evaluate.view',
      'monitor_evaluate.full',
      'rules.view',
      'beneficiaries.scoped_view',
      'evaluation.formal.submit',
      'collection.view',
      'analytics.view',
      'reports.view',
      'reports.project_summary.view',
      'reports.indicator_summary.view',
      'reports.beneficiary_summary.view',
    ],
    dataScopes: ['monitored_projects'],
    projectAccess: 'assigned-projects',
    beneficiaryDataAccess: 'assigned-project-records',
    userAdministration: noUserAdministration,
    modules: {
      budget: 'view',
      monitorEvaluate: 'full',
      rules: 'view',
      beneficiaries: 'scoped',
      alerts: 'none',
      activities: 'view',
      evaluation: 'full',
      transparency: 'none',
    },
  },
  'Project Manager': {
    role: 'Project Manager',
    permissions: [
      'projects.view',
      'projects.create',
      'activities.view',
      'activities.create_edit',
      'budget.full',
      'budget.expense.view',
      'budget.expense.approve',
      'monitor_evaluate.view',
      'monitor_evaluate.full',
      'rules.view',
      'beneficiaries.scoped_view',
      'alerts.outcome.log',
      'evaluation.approve',
      'transparency.preview',
      'transparency.publish',
      'collection.view',
      'analytics.view',
      'reports.view',
      'reports.project_summary.view',
      'reports.indicator_summary.view',
      'settings.users.manage',
      'reports.beneficiary_summary.view',
    ],
    dataScopes: ['managed_projects'],
    projectAccess: 'assigned-projects',
    beneficiaryDataAccess: 'assigned-project-records',
    userAdministration: {
      createAndAuthorizeRoles: ['Project Officer', 'Monitoring and Evaluation Officer'],
      projectAssignmentRoles: ['Project Officer', 'Monitoring and Evaluation Officer'],
      projectAssignmentScope: 'assigned-projects',
    },
    modules: {
      budget: 'full',
      monitorEvaluate: 'full',
      rules: 'view',
      beneficiaries: 'scoped',
      alerts: 'full',
      activities: 'full',
      evaluation: 'full',
      transparency: 'full',
    },
  },
  'Program Manager': {
    role: 'Program Manager',
    permissions: [
      'projects.view',
      'activities.view',
      'budget.portfolio_view',
      'monitor_evaluate.view',
      'monitor_evaluate.full',
      'rules.view',
      'alerts.outcome.log',
      'transparency.preview',
      'collection.view',
      'analytics.view',
      'reports.view',
      'reports.project_summary.view',
      'reports.indicator_summary.view',
      'settings.users.manage',
    ],
    dataScopes: ['portfolio_projects'],
    projectAccess: 'portfolio',
    beneficiaryDataAccess: 'aggregate-only',
    userAdministration: {
      createAndAuthorizeRoles: ['Project Manager', 'Monitoring and Evaluation Officer'],
      projectAssignmentRoles: ['Project Manager', 'Monitoring and Evaluation Officer'],
      projectAssignmentScope: 'portfolio-projects',
    },
    modules: {
      budget: 'view',
      monitorEvaluate: 'full',
      rules: 'view',
      beneficiaries: 'aggregate',
      alerts: 'full',
      activities: 'view',
      evaluation: 'view',
      transparency: 'view',
    },
  },
  'Grant Manager': {
    role: 'Grant Manager',
    permissions: [
      'projects.view',
      'budget.portfolio_view',
      'analytics.view',
      'reports.view',
      'reports.project_summary.view',
      'reports.indicator_summary.view',
    ],
    dataScopes: ['portfolio_projects'],
    projectAccess: 'portfolio',
    beneficiaryDataAccess: 'aggregate-only',
    userAdministration: noUserAdministration,
    modules: {
      budget: 'view',
      monitorEvaluate: 'view',
      rules: 'none',
      beneficiaries: 'aggregate',
      alerts: 'none',
      activities: 'none',
      evaluation: 'view',
      transparency: 'none',
    },
  },
  'System Administrator': {
    role: 'System Administrator',
    permissions: [
      'projects.view',
      'activities.view',
      'activities.create_edit',
      'budget.full',
      'budget.expense.view',
      'monitor_evaluate.view',
      'monitor_evaluate.full',
      'rules.view',
      'rules.configure',
      'beneficiaries.full_view',
      'alerts.outcome.log',
      'collection.view',
      'analytics.view',
      'reports.view',
      'reports.project_summary.view',
      'reports.indicator_summary.view',
      'reports.beneficiary_summary.view',
      'settings.users.manage',
      'settings.view',
    ],
    dataScopes: ['organization'],
    projectAccess: 'organization',
    beneficiaryDataAccess: 'all-records',
    userAdministration: {
      createAndAuthorizeRoles: [...prototypeRoles],
      projectAssignmentRoles: [...projectAssignableRoles],
      projectAssignmentScope: 'all-projects',
    },
    modules: {
      budget: 'full',
      monitorEvaluate: 'full',
      rules: 'configure',
      beneficiaries: 'full',
      alerts: 'full',
      activities: 'full',
      evaluation: 'none',
      transparency: 'none',
    },
  },
}

export const fallbackAccessProfile: RoleAccessProfile = {
  role: 'Project Officer',
  permissions: [],
  dataScopes: [],
  projectAccess: 'assigned-projects',
  beneficiaryDataAccess: 'aggregate-only',
  userAdministration: noUserAdministration,
  modules: {
    budget: 'none',
    monitorEvaluate: 'none',
    rules: 'none',
    beneficiaries: 'none',
    alerts: 'none',
    activities: 'none',
    evaluation: 'none',
    transparency: 'none',
  },
}
