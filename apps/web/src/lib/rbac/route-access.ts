import {
  type AtomicPermission,
  type RoleName,
  type RouteDecision,
  type RouteKey,
  type RoutePrincipal,
  type RouteSelection,
  hasAtomicPermission,
  hasRoutePermission,
  matchRoute,
  parseRouteSelection,
  roleCodeFor,
  rolePermissions,
  routeAllowed,
  routePolicy,
  routeUuidPattern,
} from '@pathways/shared'
import { approvedApiBaseUrl } from '../api-base-url'
export const reportKindPermissions = {
  'project-summary': 'reports.project_summary.view',
  'indicator-summary': 'reports.indicator_summary.view',
  'beneficiary-summary': 'reports.beneficiary_summary.view',
  'survey-results': 'reports.view',
} as const
export const isPublicPath = (path: string) =>
  path === '/' || path === '/public/projects' || /^\/public\/projects\/[^/]+$/.test(path)
/** UI-only paths reuse an existing verified route; no role policy is added. */
// Display-only query keys, shared by the middleware and protected pages so they cannot drift.
export const displayQueryKeys: Partial<Record<RouteKey, readonly string[]>> = {
  activity: ['proof', 'review', 'action'],
  alerts: ['alert'],
  beneficiaries: ['q', 'project', 'location', 'sex', 'age', 'disability', 'status', 'page'],
  beneficiary: ['returnTo'],
  budget: ['expense'],
  formEntry: ['submissionId'],
  indicatorLibrary: ['project'],
}
export function authorizationPathForUiPath(input: string): string | null {
  if (input.split('?').length > 2) return null
  const [pathname, rawQuery = ''] = input.split('?')
  let canonical = pathname
  if (
    pathname === '/beneficiaries/duplicates' ||
    pathname === '/beneficiaries/evaluation-center' ||
    pathname === '/participants'
  )
    canonical = '/beneficiaries'
  else if (pathname === '/imports') canonical = '/collection/import'
  else if (pathname === '/indicators') canonical = '/projects'
  else if (/^\/recommendations\/[^/]+\/?$/.test(pathname)) {
    const id = pathname.split('/')[2]
    if (!routeUuidPattern.test(id)) return null
    canonical = '/recommendations'
  } else if (/^\/transparency\/[^/]+\/preview\/?$/.test(pathname))
    canonical = pathname
      .replace(/^\/transparency\//, '/projects/')
      .replace(/\/preview\/?$/, '/transparency/preview')

  const route = matchRoute(canonical)?.route
  if (!route) return null
  const authorityKeys: Partial<Record<RouteKey, readonly string[]>> = {
    beneficiary: ['projectId'],
    beneficiaryEdit: ['projectId'],
    imports: ['mode'],
    reportPreview: ['kind'],
  }
  const authorizedQuery = new URLSearchParams()
  const seen = new Set<string>()
  for (const [key, value] of new URLSearchParams(rawQuery)) {
    if (seen.has(key) || value.length > 512) return null
    seen.add(key)
    if (displayQueryKeys[route]?.includes(key)) continue
    if (!authorityKeys[route]?.includes(key)) return null
    authorizedQuery.set(key, value)
  }
  const checked = canonical + (authorizedQuery.size ? `?${authorizedQuery.toString()}` : '')
  return matchRoute(checked) ? checked : null
}
export const isInternalPath = (path: string) =>
  path === '/workspace' ||
  path === '/auth/mfa' ||
  authorizationPathForUiPath(path) !== null ||
  Object.values(routePolicy).some(
    (r) => path === r.path.split('/:')[0] || path.startsWith(`${r.path.split('/:')[0]}/`),
  )
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

export const canonicalFeatures = [
  {
    group: 'Core',
    title: 'Role-Based Access Control and Workspace Management',
    href: '/dashboard',
    route: 'dashboard',
  },
  {
    group: 'Core',
    title: 'Project Profile and Activity Tracking',
    href: '/projects',
    route: 'projects',
  },
  {
    group: 'Core',
    title: 'Centralized Beneficiary Profile',
    href: '/beneficiaries',
    route: 'beneficiaries',
  },
  {
    group: 'Core',
    title: 'Beneficiary Journey Tracking',
    href: '/beneficiaries',
    route: 'beneficiaries',
  },
  {
    group: 'Core',
    title: 'Digital Data Collection and Preparation',
    href: '/collection/forms',
    route: 'forms',
  },
  {
    group: 'Core',
    title: 'Metadata-Driven Data Integration',
    href: '/collection/import',
    route: 'imports',
  },
  {
    group: 'Core',
    title: 'Project Indicator and Monitoring',
    href: '/projects',
    route: 'monitoring',
  },
  {
    group: 'Core',
    title: 'Aggregated Monitoring Dashboard with SADDD Analysis',
    href: '/analytics',
    route: 'analytics',
  },
  {
    group: 'Supporting',
    title: 'Descriptive Analytics and Project Performance Summaries',
    href: '/analytics',
    route: 'analytics',
  },
  {
    group: 'Supporting',
    title: 'Rule-Based Alerts for Underperforming Indicators',
    href: '/alerts/repository',
    route: 'rules',
  },
  {
    group: 'Supporting',
    title: 'Rule-Based Decision Support and Project Recommendation',
    href: '/recommendations',
    route: 'recommendations',
  },
  {
    group: 'Supporting',
    title: 'Reporting and Data Visualization',
    href: '/reports',
    route: 'reports',
  },
  {
    group: 'Supporting',
    title: 'Public Project Tracker for Donors',
    href: '/public/projects',
    route: null,
  },
] as const
export const visibleFeatures = (profile: RoutePrincipal) =>
  canonicalFeatures.filter(
    (feature) =>
      !feature.route ||
      (profile.roles.length === 1 &&
        hasRoutePermission(
          profile.roles[0],
          profile.permissions,
          feature.route,
          routePolicy[feature.route].permissions,
        )),
  )
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
export function filterDashboardNavGroups<T extends { items: { href: string }[] }>(
  groups: T[],
  role: RoleName | null,
  profile?: RoutePrincipal,
): T[] {
  return groups
    .map((group) => ({
      ...group,
      items: group.items.filter(
        (item) =>
          (profile
            ? getVerifiedRouteAccess(profile, item.href)
            : role
              ? getRouteAccess(role, item.href)
              : { allowed: false }
          ).allowed,
      ),
    }))
    .filter((group) => group.items.length > 0)
}
/** A project workspace tab opens a route, so it carries that route's permissions. */
export interface WorkspaceTabAccess {
  label: string
  path: string
  route?: RouteKey
}
export const filterWorkspaceTabs = <T extends WorkspaceTabAccess>(
  tabs: T[],
  role: RoleName,
  profile?: RoutePrincipal,
  projectId?: string,
) => {
  if (profile)
    return tabs.filter(
      (tab) =>
        !!projectId &&
        getVerifiedRouteAccess(profile, `/projects/${projectId}/${tab.path}`).allowed,
    )
  const key = roleCodeFor(role)
  return tabs.filter(
    (tab) =>
      !!key &&
      (!tab.route ||
        routePolicy[tab.route].permissions.some((permission) =>
          hasAtomicPermission(key, rolePermissions[key], permission),
        )),
  )
}
type RouteCheckFailure =
  | 'rejected'
  | 'configuration'
  | 'http'
  | 'invalid-response'
  | 'network'
  | 'timeout'
  | 'cancelled'
export class RouteCheckError extends Error {
  constructor(
    readonly status: number,
    readonly failure: RouteCheckFailure = 'rejected',
  ) {
    super('Current route access could not be verified.')
  }
}
export async function requestRouteCheck(
  base: string,
  token: string,
  context: { userId: string; organizationId: string },
  selection: RouteSelection,
  signal?: AbortSignal,
  trustedBaseUrl?: string,
): Promise<RouteDecision> {
  if (
    !parseRouteSelection(selection) ||
    !routeUuidPattern.test(context.userId) ||
    !routeUuidPattern.test(context.organizationId)
  )
    throw new RouteCheckError(403)
  let target: URL
  try {
    target = approvedApiBaseUrl(base, trustedBaseUrl)
  } catch {
    throw new RouteCheckError(503, 'configuration')
  }
  target.pathname = `${target.pathname.replace(/\/$/, '')}/access/route-check`
  target.search = new URLSearchParams(selection as Record<string, string>).toString()
  const controller = new AbortController()
  const abort = () => controller.abort()
  let timedOut = false
  const timeout = setTimeout(() => {
    timedOut = true
    abort()
  }, 15000)
  const cancellation = () => new RouteCheckError(503, timedOut ? 'timeout' : 'cancelled')
  const checkCancellation = () => {
    if (controller.signal.aborted) throw cancellation()
  }
  signal?.addEventListener('abort', abort, { once: true })
  if (signal?.aborted) abort()
  try {
    checkCancellation()
    const response = await fetch(target, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        'X-Pathways-User-Id': context.userId,
        'X-Pathways-Organization-Id': context.organizationId,
      },
      credentials: 'omit',
      redirect: 'error',
      cache: 'no-store',
      referrerPolicy: 'no-referrer',
      signal: controller.signal,
    })
    checkCancellation()
    if (!response.ok) throw new RouteCheckError(response.status, 'http')
    let body: unknown
    try {
      body = await response.json()
    } catch {
      checkCancellation()
      throw new RouteCheckError(503, 'invalid-response')
    }
    checkCancellation()
    if (
      !body ||
      typeof body !== 'object' ||
      !('route' in body) ||
      body.route !== selection.route ||
      !('authorization' in body) ||
      body.authorization !== 'database-verified' ||
      !('beneficiaryAccess' in body) ||
      (body.beneficiaryAccess !== 'aggregate-only' &&
        body.beneficiaryAccess !== 'records-or-none') ||
      Object.keys(body).length !== 3
    )
      throw new RouteCheckError(503, 'invalid-response')
    return body as RouteDecision
  } catch (error) {
    if (error instanceof RouteCheckError) throw error
    checkCancellation()
    throw new RouteCheckError(503, 'network')
  } finally {
    clearTimeout(timeout)
    signal?.removeEventListener('abort', abort)
  }
}

/** Post-sign-in destination; each target page still runs its own server route check. */
export const landingPath = (principal: RoutePrincipal | null | undefined) =>
  principal?.roles[0] === 'SYSTEM_ADMINISTRATOR' &&
  principalHasAtomicPermission(principal, 'users.authorize')
    ? routePolicy.users.path
    : '/workspace'
