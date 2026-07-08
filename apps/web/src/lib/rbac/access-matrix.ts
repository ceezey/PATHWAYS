import type { PrototypeRole } from '@/types/prototype-role'
import type { DataScopeCode, PermissionCode } from './permissions'

export type AccessLevel = 'none' | 'view' | 'scoped' | 'full' | 'configure'

export interface RoleAccessProfile {
  role: PrototypeRole
  permissions: PermissionCode[]
  dataScopes: DataScopeCode[]
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
    ],
    dataScopes: ['assigned_projects', 'assigned_activities'],
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
      'evidence.review',
      'indicators.manage',
      'budget.expense.view',
      'budget.expense.verify',
      'monitor_evaluate.view',
      'monitor_evaluate.full',
      'rules.view',
      'beneficiaries.full_view',
      'evaluation.formal.submit',
      'collection.view',
      'analytics.view',
      'reports.view',
    ],
    dataScopes: ['monitored_projects'],
    modules: {
      budget: 'view',
      monitorEvaluate: 'full',
      rules: 'view',
      beneficiaries: 'full',
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
      'beneficiaries.full_view',
      'alerts.outcome.log',
      'evaluation.approve',
      'transparency.publish',
      'analytics.view',
      'reports.view',
    ],
    dataScopes: ['managed_projects'],
    modules: {
      budget: 'full',
      monitorEvaluate: 'full',
      rules: 'view',
      beneficiaries: 'full',
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
      'budget.portfolio_view',
      'monitor_evaluate.view',
      'monitor_evaluate.full',
      'rules.view',
      'beneficiaries.full_view',
      'alerts.outcome.log',
      'analytics.view',
      'reports.view',
    ],
    dataScopes: ['portfolio_projects'],
    modules: {
      budget: 'view',
      monitorEvaluate: 'full',
      rules: 'view',
      beneficiaries: 'full',
      alerts: 'full',
      activities: 'view',
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
      'analytics.view',
      'reports.view',
      'settings.view',
    ],
    dataScopes: ['organization'],
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

export const fallbackAccessProfile = roleAccessProfiles['Project Officer']
