import {
  type AtomicPermission,
  type RoleName,
  type RoutePrincipal,
  hasAtomicPermission,
  matchRoute,
  roleCodeFor,
  rolePermissions,
  routeAllowed,
  routePolicy,
} from '@pathways/shared'

export const reportKindPermissions = {
  'project-summary': 'reports.project_summary.view',
  'indicator-summary': 'reports.indicator_summary.view',
  'beneficiary-summary': 'reports.beneficiary_summary.view',
  'survey-results': 'reports.view',
} as const
type RouteAccessResult = {
  allowed: boolean
  moduleName: string
  requiresBeneficiaryStepUp?: boolean
}
export function getVerifiedRouteAccess(principal: RoutePrincipal, path: string): RouteAccessResult {
  const selection = matchRoute(path)
  const previewNames = {
    'project-summary': 'Project Summary',
    'indicator-summary': 'Indicator Summary',
    'beneficiary-summary': 'Beneficiary Summary',
    'survey-results': 'Survey/Form Results',
  }
  const moduleName =
    selection?.route === 'reportPreview'
      ? `${previewNames[selection.kind ?? 'beneficiary-summary']} preview`
      : selection
        ? routePolicy[selection.route].title
        : 'Workspace'
  return {
    allowed: !!selection && routeAllowed(principal, selection),
    moduleName,
    requiresBeneficiaryStepUp: false,
  }
}

export const principalHasAtomicPermission = (
  principal: RoutePrincipal | null | undefined,
  permission: AtomicPermission,
) =>
  Boolean(
    principal?.roles.length === 1 &&
      hasAtomicPermission(principal.roles[0], principal.permissions, permission),
  )

// One principal's atomic permission check, for code that tests several grants.
export const permissionChecker =
  (principal: RoutePrincipal | null | undefined) => (permission: AtomicPermission) =>
    principalHasAtomicPermission(principal, permission)

export function getRouteAccess(
  role: RoleName,
  path: string,
  assignedProjectIds: readonly string[] = [],
) {
  const key = roleCodeFor(role)
  return getVerifiedRouteAccess(
    { roles: key ? [key] : [], permissions: key ? rolePermissions[key] : [], assignedProjectIds },
    path,
  )
}

/** Post-sign-in destination; each target page still runs its own server route check. */
export const landingPath = (principal: RoutePrincipal | null | undefined) =>
  principal?.roles[0] === 'SYSTEM_ADMINISTRATOR' &&
  principalHasAtomicPermission(principal, 'users.authorize')
    ? routePolicy.users.path
    : '/workspace'
