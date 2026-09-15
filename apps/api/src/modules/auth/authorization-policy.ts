/** Reviewed Phase 5 ceiling, derived from the master context sections 7/20.3
 * and the frontend policy specification. Database mappings are authoritative;
 * this allowlist can only narrow them. No wildcard or administrator bypass.
 */
export const roleNames = {
  SYSTEM_ADMINISTRATOR: 'System Administrator',
  PROGRAM_MANAGER: 'Program Manager',
  GRANT_MANAGER: 'Grant Manager',
  PROJECT_MANAGER: 'Project Manager',
  MONITORING_AND_EVALUATION_OFFICER: 'Monitoring and Evaluation Officer',
  PROJECT_OFFICER: 'Project Officer',
} as const
export type CanonicalRole = keyof typeof roleNames

export const permissionCodes = [
  'projects.read',
  'projects.create',
  'activities.read',
  'activities.create',
  'activities.update',
  'activities.proof.submit',
  'journeys.read',
  'journeys.manage',
  'participation.record',
  'budgets.read',
  'budgets.create',
  'budgets.update',
  'expenses.read',
  'expenses.submit',
  'expenses.verify',
  'expenses.approve',
  'monitoring.read',
  'monitoring.review',
  'rules.read',
  'rules.create',
  'rules.update',
  'rules.activate',
  'beneficiaries.records.read',
  'beneficiaries.records.register',
  'beneficiaries.profiles.update',
  'beneficiaries.enrollments.manage',
  'beneficiaries.identities.review',
  'beneficiaries.records.archive',
  'beneficiaries.aggregates.read',
  'recommendations.outcome.record',
  'evaluations.submit',
  'evaluations.approve',
  'public.preview',
  'public.publish',
  'evidence.review',
  'indicators.create',
  'indicators.update',
  'collection.read',
  'forms.read',
  'forms.manage',
  'forms.publish',
  'submissions.write',
  'imports.read',
  'imports.upload',
  'imports.review',
  'imports.process',
  'analytics.read',
  'reports.read',
  'reports.project.read',
  'reports.indicator.read',
  'reports.beneficiary.read',
  'users.authorize',
  'assignments.manage',
  'settings.read',
] as const
export type AtomicPermission = (typeof permissionCodes)[number]

const reports = ['reports.read', 'reports.project.read', 'reports.indicator.read'] as const
export const rolePermissions: Record<CanonicalRole, readonly AtomicPermission[]> = {
  SYSTEM_ADMINISTRATOR: [
    'projects.read',
    'projects.create',
    'activities.read',
    'activities.create',
    'activities.update',
    'journeys.read',
    'journeys.manage',
    'participation.record',
    'budgets.read',
    'budgets.create',
    'budgets.update',
    'expenses.read',
    'monitoring.read',
    'monitoring.review',
    'rules.read',
    'rules.create',
    'rules.update',
    'rules.activate',
    'beneficiaries.records.read',
    'beneficiaries.records.register',
    'beneficiaries.profiles.update',
    'beneficiaries.enrollments.manage',
    'beneficiaries.identities.review',
    'beneficiaries.records.archive',
    'beneficiaries.aggregates.read',
    'recommendations.outcome.record',
    'collection.read',
    'forms.read',
    'forms.manage',
    'submissions.write',
    'imports.read',
    'imports.upload',
    'analytics.read',
    ...reports,
    'reports.beneficiary.read',
    'users.authorize',
    'assignments.manage',
    'settings.read',
  ],
  PROGRAM_MANAGER: [
    'projects.read',
    'activities.read',
    'journeys.read',
    'budgets.read',
    'monitoring.read',
    'monitoring.review',
    'rules.read',
    'beneficiaries.aggregates.read',
    'recommendations.outcome.record',
    'public.preview',
    'collection.read',
    'forms.read',
    'analytics.read',
    ...reports,
    'users.authorize',
    'assignments.manage',
  ],
  GRANT_MANAGER: [
    'projects.read',
    'budgets.read',
    'beneficiaries.aggregates.read',
    'analytics.read',
    ...reports,
  ],
  PROJECT_MANAGER: [
    'projects.read',
    'projects.create',
    'activities.read',
    'activities.create',
    'activities.update',
    'journeys.read',
    'journeys.manage',
    'participation.record',
    'budgets.read',
    'budgets.create',
    'budgets.update',
    'expenses.read',
    'expenses.approve',
    'monitoring.read',
    'monitoring.review',
    'rules.read',
    'beneficiaries.records.read',
    'beneficiaries.records.register',
    'beneficiaries.enrollments.manage',
    'beneficiaries.records.archive',
    'beneficiaries.aggregates.read',
    'recommendations.outcome.record',
    'evaluations.approve',
    'public.preview',
    'public.publish',
    'collection.read',
    'forms.read',
    'forms.manage',
    'submissions.write',
    'imports.read',
    'imports.upload',
    'analytics.read',
    ...reports,
    'reports.beneficiary.read',
    'users.authorize',
    'assignments.manage',
  ],
  MONITORING_AND_EVALUATION_OFFICER: [
    'projects.read',
    'activities.read',
    'journeys.read',
    'journeys.manage',
    'participation.record',
    'evidence.review',
    'indicators.create',
    'indicators.update',
    'expenses.read',
    'expenses.verify',
    'monitoring.read',
    'monitoring.review',
    'rules.read',
    'beneficiaries.records.read',
    'beneficiaries.records.register',
    'beneficiaries.profiles.update',
    'beneficiaries.enrollments.manage',
    'beneficiaries.identities.review',
    'beneficiaries.aggregates.read',
    'evaluations.submit',
    'collection.read',
    'forms.read',
    'forms.manage',
    'forms.publish',
    'submissions.write',
    'imports.read',
    'imports.upload',
    'imports.review',
    'imports.process',
    'analytics.read',
    ...reports,
    'reports.beneficiary.read',
  ],
  PROJECT_OFFICER: [
    'projects.read',
    'activities.read',
    'activities.proof.submit',
    'journeys.read',
    'participation.record',
    'expenses.submit',
    'beneficiaries.records.read',
    'beneficiaries.records.register',
    'beneficiaries.aggregates.read',
    'collection.read',
    'forms.read',
    'submissions.write',
    'imports.read',
    'imports.upload',
    'reports.read',
    'reports.beneficiary.read',
  ],
}

export function isCanonicalRole(role: string): role is CanonicalRole {
  return Object.hasOwn(roleNames, role)
}

export function hasAtomicPermission(role: string, granted: readonly string[], permission: string) {
  return (
    isCanonicalRole(role) &&
    granted.includes(permission) &&
    rolePermissions[role].includes(permission as AtomicPermission)
  )
}

export const aggregateOnlyRoles: readonly string[] = ['PROGRAM_MANAGER', 'GRANT_MANAGER']

export function canAuthorizeRole(actor: CanonicalRole, target: CanonicalRole) {
  if (actor === 'SYSTEM_ADMINISTRATOR') return true
  if (actor === 'PROGRAM_MANAGER') {
    return ['PROJECT_MANAGER', 'MONITORING_AND_EVALUATION_OFFICER'].includes(target)
  }
  return (
    actor === 'PROJECT_MANAGER' &&
    ['PROJECT_OFFICER', 'MONITORING_AND_EVALUATION_OFFICER'].includes(target)
  )
}

export function canAssignRole(actor: CanonicalRole, target: CanonicalRole) {
  return (
    ['PROJECT_MANAGER', 'PROJECT_OFFICER', 'MONITORING_AND_EVALUATION_OFFICER'].includes(target) &&
    canAuthorizeRole(actor, target)
  )
}
