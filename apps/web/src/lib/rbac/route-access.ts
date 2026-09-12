// Pure route contract shared with the API; a ceiling, never identity authority.
import {
  type AtomicPermission,
  type CanonicalRole,
  hasAtomicPermission,
  roleNames,
  rolePermissions,
} from '../../../../api/src/modules/auth/authorization-policy'
import type { PermissionCode } from './permissions'
export type RoutePrincipal = {
  roles: readonly string[]
  permissions: readonly string[]
  assignedProjectIds: readonly string[]
}
type DisplayRole = (typeof roleNames)[CanonicalRole]
type Scope = 'workspace' | 'project' | 'activity' | 'beneficiary'
const entry = (
  path: string,
  title: string,
  permissions: readonly AtomicPermission[],
  scope: Scope = 'workspace',
) => ({ path, title, permissions, scope })
export const routePolicy = {
  dashboard: entry('/dashboard', 'Dashboard', ['projects.read']),
  unauthorized: entry('/unauthorized', 'Unauthorized', ['projects.read']),
  projects: entry('/projects', 'Projects', ['projects.read']),
  projectCreate: entry('/projects/new', 'Project setup', ['projects.create']),
  project: entry('/projects/:projectId', 'Projects', ['projects.read'], 'project'),
  activities: entry(
    '/projects/:projectId/activities',
    'Activities',
    ['activities.read'],
    'project',
  ),
  activity: entry(
    '/projects/:projectId/activities/:activityId',
    'Activity',
    ['activities.read'],
    'activity',
  ),
  evidence: entry(
    '/projects/:projectId/evidence',
    'Evidence review',
    ['evidence.review'],
    'project',
  ),
  indicators: entry(
    '/projects/:projectId/indicators',
    'Target indicators',
    ['indicators.create', 'indicators.update'],
    'project',
  ),
  monitoring: entry(
    '/projects/:projectId/monitor-evaluate',
    'Monitor & Evaluate',
    ['monitoring.read'],
    'project',
  ),
  budget: entry(
    '/projects/:projectId/budget',
    'Budget',
    ['budgets.read', 'expenses.read', 'expenses.submit'],
    'project',
  ),
  journey: entry(
    '/projects/:projectId/journey-stages',
    'Journey stages',
    ['activities.create', 'monitoring.review'],
    'project',
  ),
  transparency: entry(
    '/projects/:projectId/transparency',
    'Public dashboard controls',
    ['public.preview', 'public.publish'],
    'project',
  ),
  transparencyPreview: entry(
    '/projects/:projectId/transparency/preview',
    'Public dashboard preview',
    ['public.preview', 'public.publish'],
    'project',
  ),
  beneficiaries: entry('/beneficiaries', 'Beneficiaries', ['beneficiaries.records.read']),
  beneficiaryCreate: entry('/beneficiaries/new', 'Beneficiary registration', []),
  beneficiary: entry(
    '/beneficiaries/:beneficiaryId',
    'Beneficiary profile and journey',
    ['beneficiaries.records.read'],
    'beneficiary',
  ),
  collection: entry('/collection', 'Collection', ['collection.read']),
  forms: entry('/collection/forms', 'Forms', ['collection.read']),
  formCreate: entry('/collection/forms/new', 'Form setup', ['collection.read']),
  imports: entry('/collection/import', 'Metadata-Driven Data Integration', ['collection.read']),
  analytics: entry('/analytics', 'Analytics', ['analytics.read']),
  alerts: entry('/alerts', 'Alerts', ['recommendations.outcome.record']),
  recommendations: entry('/recommendations', 'Recommendations', ['recommendations.outcome.record']),
  rules: entry('/alerts/repository', 'Alerts Repository', ['rules.read']),
  settingsRules: entry('/settings/rules', 'Alerts Repository', ['rules.read']),
  reports: entry('/reports', 'Reports', ['reports.read']),
  projectReport: entry('/reports/project-summary', 'Project Summary', ['reports.project.read']),
  indicatorReport: entry('/reports/indicator-summary', 'Indicator Summary', [
    'reports.indicator.read',
  ]),
  beneficiaryReport: entry('/reports/beneficiary-summary', 'Beneficiary Summary', [
    'reports.beneficiary.read',
  ]),
  surveyReport: entry('/reports/survey-results', 'Survey/Form Results', ['reports.read']),
  reportPreview: entry('/reports/preview', 'Report preview', ['reports.read']),
  users: entry('/settings/users', 'User Management', ['users.authorize']),
  labels: entry('/settings/labels', 'Edit Labels', ['settings.read']),
  settings: entry('/settings', 'Settings', ['settings.read']),
} as const
export type RouteKey = keyof typeof routePolicy
export type RouteSelection = {
  route: RouteKey
  projectId?: string
  activityId?: string
  beneficiaryId?: string
  kind?: 'project-summary' | 'indicator-summary' | 'beneficiary-summary' | 'survey-results'
  mode?: 'import' | 'extend'
}
export const reportKindPermissions = {
  'project-summary': 'reports.project_summary.view',
  'indicator-summary': 'reports.indicator_summary.view',
  'beneficiary-summary': 'reports.beneficiary_summary.view',
  'survey-results': 'reports.view',
} as const
const reportAtomic = {
  'project-summary': 'reports.project.read',
  'indicator-summary': 'reports.indicator.read',
  'beneficiary-summary': 'reports.beneficiary.read',
  'survey-results': 'reports.read',
} as const
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
export const isPublicPath = (path: string) =>
  path === '/' || path === '/public/projects' || /^\/public\/projects\/[^/]+$/.test(path)
export const isInternalPath = (path: string) =>
  path === '/workspace' ||
  path === '/auth/mfa' ||
  Object.values(routePolicy).some(
    (r) => path === r.path.split('/:')[0] || path.startsWith(`${r.path.split('/:')[0]}/`),
  )
export function matchRoute(input: string): RouteSelection | null {
  if (
    input.length > 1024 ||
    !input.startsWith('/') ||
    input.startsWith('//') ||
    /[%\\#\s]/.test(input)
  )
    return null
  const [path, query = ''] = input.split('?')
  if (input.split('?').length > 2) return null
  const search = new URLSearchParams(query)
  for (const [route, spec] of Object.entries(routePolicy)) {
    const names = [...spec.path.matchAll(/:(\w+)/g)].map((m) => m[1])
    const matched = new RegExp(`^${spec.path.replace(/:\w+/g, '([^/]+)')}/?$`).exec(path)
    if (!matched) continue
    if (
      search.size &&
      (search.size !== 1 ||
        !(
          (route === 'reportPreview' && search.has('kind')) ||
          (route === 'imports' && search.has('mode'))
        ))
    )
      return null
    const result: RouteSelection = { route: route as RouteKey }
    for (let i = 0; i < names.length; i++) {
      if (!uuid.test(matched[i + 1])) return null
      Object.assign(result, { [names[i]]: matched[i + 1].toLowerCase() })
    }
    if (route === 'reportPreview') {
      const kind = search.get('kind') ?? 'beneficiary-summary'
      if (!Object.hasOwn(reportAtomic, kind)) return null
      result.kind = kind as RouteSelection['kind']
    }
    if (route === 'imports' && search.has('mode')) {
      const mode = search.get('mode')
      if (mode !== 'import' && mode !== 'extend') return null
      result.mode = mode
    }
    return result
  }
  return null
}
export function parseRouteSelection(input: Record<string, unknown>): RouteSelection | null {
  if (typeof input.route !== 'string' || !Object.hasOwn(routePolicy, input.route)) return null
  let path: string = routePolicy[input.route as RouteKey].path
  const allowed = ['route', ...[...path.matchAll(/:(\w+)/g)].map((m) => m[1])]
  for (const key of allowed.slice(1)) {
    if (typeof input[key] !== 'string' || !uuid.test(input[key] as string)) return null
    path = path.replace(`:${key}`, (input[key] as string).toLowerCase())
  }
  if (input.route === 'reportPreview') {
    allowed.push('kind')
    if (input.kind !== undefined) {
      if (typeof input.kind !== 'string' || !Object.hasOwn(reportAtomic, input.kind)) return null
      path += `?kind=${input.kind}`
    }
  }
  if (input.route === 'imports') {
    allowed.push('mode')
    if (input.mode !== undefined) {
      if (input.mode !== 'import' && input.mode !== 'extend') return null
      path += `?mode=${input.mode}`
    }
  }
  return Object.keys(input).every((k) => allowed.includes(k)) ? matchRoute(path) : null
}
export function routeAllowed(
  principal: RoutePrincipal,
  selection: RouteSelection,
  checkAssignment = true,
) {
  if (principal.roles.length !== 1 || !parseRouteSelection(selection)) return false
  const role = principal.roles[0]
  const spec = routePolicy[selection.route]
  const permissions =
    selection.route === 'reportPreview'
      ? [reportAtomic[selection.kind ?? 'beneficiary-summary']]
      : spec.permissions
  if (!permissions.some((p) => hasAtomicPermission(role, principal.permissions, p))) return false
  if (
    (spec.scope === 'beneficiary' ||
      selection.route === 'beneficiaryReport' ||
      selection.kind === 'beneficiary-summary') &&
    ['PROGRAM_MANAGER', 'GRANT_MANAGER'].includes(role)
  )
    return false
  // Portfolio and organization scope must be checked by relational server queries.
  if (
    checkAssignment &&
    selection.projectId &&
    !['SYSTEM_ADMINISTRATOR', 'PROGRAM_MANAGER'].includes(role) &&
    !principal.assignedProjectIds.includes(selection.projectId)
  )
    return false
  return true
}
export const isAggregateOnly = (principal: RoutePrincipal) =>
  principal.roles.length === 1 && ['PROGRAM_MANAGER', 'GRANT_MANAGER'].includes(principal.roles[0])
export type RouteAccessResult = {
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
        routePolicy[feature.route].permissions.some((p) =>
          hasAtomicPermission(profile.roles[0], profile.permissions, p),
        )),
  )
const roleKey = (role: DisplayRole) =>
  (Object.keys(roleNames) as CanonicalRole[]).find((k) => roleNames[k] === role)
export function getRouteAccess(
  role: DisplayRole,
  path: string,
  assignedProjectIds: readonly string[] = [],
) {
  const key = roleKey(role)
  return getVerifiedRouteAccess(
    { roles: key ? [key] : [], permissions: key ? rolePermissions[key] : [], assignedProjectIds },
    path,
  )
}
export function filterDashboardNavGroups<T extends { items: { href: string }[] }>(
  groups: T[],
  role: DisplayRole,
  profile?: RoutePrincipal,
): T[] {
  return groups
    .map((group) => ({
      ...group,
      items: group.items.filter(
        (item) =>
          (profile ? getVerifiedRouteAccess(profile, item.href) : getRouteAccess(role, item.href))
            .allowed,
      ),
    }))
    .filter((group) => group.items.length > 0)
}
export interface WorkspaceTabAccess {
  label: string
  path: string
  permission?: PermissionCode
  anyPermissions?: PermissionCode[]
}
const legacyPermissions: Partial<Record<PermissionCode, readonly AtomicPermission[]>> = {
  'projects.view': ['projects.read'],
  'projects.create': ['projects.create'],
  'activities.view': ['activities.read'],
  'activities.create_edit': ['activities.create', 'activities.update'],
  'activities.submit_update_proof': ['activities.proof.submit'],
  'evidence.review': ['evidence.review'],
  'indicators.manage': ['indicators.create', 'indicators.update'],
  'monitor_evaluate.view': ['monitoring.read'],
  'monitor_evaluate.full': ['monitoring.review'],
  'budget.full': ['budgets.read'],
  'budget.portfolio_view': ['budgets.read'],
  'budget.expense.view': ['expenses.read'],
  'budget.expense.log': ['expenses.submit'],
  'transparency.preview': ['public.preview'],
  'transparency.publish': ['public.publish'],
  'rules.view': ['rules.read'],
  'alerts.outcome.log': ['recommendations.outcome.record'],
  'reports.view': ['reports.read'],
  'reports.project_summary.view': ['reports.project.read'],
  'reports.indicator_summary.view': ['reports.indicator.read'],
  'reports.beneficiary_summary.view': ['reports.beneficiary.read'],
}
export const filterWorkspaceTabs = <T extends WorkspaceTabAccess>(
  tabs: T[],
  role: DisplayRole,
  profile?: RoutePrincipal,
  projectId?: string,
) => {
  if (profile)
    return tabs.filter(
      (tab) =>
        !!projectId &&
        getVerifiedRouteAccess(profile, `/projects/${projectId}/${tab.path}`).allowed,
    )
  const key = roleKey(role)
  return tabs.filter(
    (tab) =>
      !!key &&
      ((!tab.permission && !tab.anyPermissions) ||
        (tab.anyPermissions ?? (tab.permission ? [tab.permission] : [])).some((p) =>
          legacyPermissions[p]?.some((a) => hasAtomicPermission(key, rolePermissions[key], a)),
        )),
  )
}
export type RouteDecision = {
  route: RouteKey
  presentation: 'prototype-only'
  beneficiaryAccess: 'aggregate-only' | 'records-or-none'
}
export type RouteCheckFailure =
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
): Promise<RouteDecision> {
  if (
    !parseRouteSelection(selection) ||
    !uuid.test(context.userId) ||
    !uuid.test(context.organizationId)
  )
    throw new RouteCheckError(403)
  let target: URL
  try {
    target = new URL(base)
  } catch {
    throw new RouteCheckError(503, 'configuration')
  }
  if (
    !['localhost', '127.0.0.1', '[::1]'].includes(target.hostname) ||
    !['http:', 'https:'].includes(target.protocol) ||
    target.username ||
    target.password ||
    target.search ||
    target.hash
  )
    throw new RouteCheckError(503, 'configuration')
  target.hostname = '127.0.0.1'
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
      !('presentation' in body) ||
      body.presentation !== 'prototype-only' ||
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
