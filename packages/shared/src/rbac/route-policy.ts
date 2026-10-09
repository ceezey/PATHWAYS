import { type AtomicPermission, hasAtomicPermission } from './authorization-policy'

// Route decisions are a UI ceiling; the API remains identity authority.
export type RoutePrincipal = {
  roles: readonly string[]
  permissions: readonly string[]
  assignedProjectIds: readonly string[]
}
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
  project: entry('/projects/:projectId', 'Projects', ['projects.detail.read'], 'project'),
  projectEdit: entry('/projects/:projectId/edit', 'Edit project', ['projects.update'], 'project'),
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
  evidence: entry('/projects/:projectId/evidence', 'Evidence review', ['evidence.read'], 'project'),
  indicators: entry(
    '/projects/:projectId/indicators',
    'Target indicators',
    ['indicators.read'],
    'project',
  ),
  indicatorLibrary: entry('/indicators/library', 'Indicator library', ['indicators.library.read']),
  monitoring: entry(
    '/projects/:projectId/monitor-evaluate',
    'Monitor & Evaluate',
    ['monitoring.read'],
    'project',
  ),
  budget: entry('/projects/:projectId/budget', 'Budget', ['budgets.read'], 'project'),
  journey: entry(
    '/projects/:projectId/journey-stages',
    'Journey stages',
    ['journeys.manage'],
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
  transparencyQueue: entry('/transparency', 'Public Tracker', ['public.preview', 'public.publish']),
  beneficiaries: entry('/beneficiaries', 'Beneficiaries', ['beneficiaries.records.read']),
  beneficiaryCreate: entry('/beneficiaries/new', 'Beneficiary registration', [
    'beneficiaries.records.register',
  ]),
  beneficiary: entry(
    '/beneficiaries/:beneficiaryId',
    'Beneficiary profile and journey',
    ['beneficiaries.records.read'],
    'beneficiary',
  ),
  beneficiaryEdit: entry(
    '/beneficiaries/:beneficiaryId/edit',
    'Edit beneficiary profile',
    ['beneficiaries.profiles.update'],
    'beneficiary',
  ),
  collection: entry('/collection', 'Collection', ['collection.read']),
  forms: entry('/collection/forms', 'Forms', ['forms.manage']),
  formCreate: entry('/collection/forms/new', 'Form setup', ['forms.manage']),
  form: entry(
    '/collection/projects/:projectId/forms/:formId',
    'Form definition',
    ['forms.read'],
    'project',
  ),
  formEntry: entry(
    '/collection/projects/:projectId/forms/:formId/entries/new',
    'Direct data entry',
    ['submissions.write'],
    'project',
  ),
  imports: entry('/collection/import', 'Metadata-Driven Data Integration', ['imports.read']),
  analytics: entry('/analytics', 'Analytics', ['analytics.read']),
  alerts: entry('/alerts', 'Alerts', ['alerts.read']),
  recommendations: entry('/recommendations', 'Recommendations', ['recommendations.read']),
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
  surveyReport: entry('/reports/survey-results', 'Survey/Form Results', ['reports.project.read']),
  reportPreview: entry('/reports/preview', 'Report preview', ['reports.read']),
  users: entry('/settings/users', 'User Management', ['users.authorize']),
  labels: entry('/settings/labels', 'Edit Labels', ['settings.labels.manage']),
  audit: entry('/settings/audit', 'Audit Log', ['audit.read']),
  backups: entry('/settings/backups', 'Backup & Recovery', ['backups.create', 'backups.restore']),
  profile: entry('/settings/profile', 'My Profile', ['profile.manage']),
  settings: entry('/settings', 'Settings', ['settings.read']),
} as const
export type RouteKey = keyof typeof routePolicy
export const hasRoutePermission = (
  role: string,
  granted: readonly string[],
  _route: RouteKey,
  permissions: readonly AtomicPermission[],
) => permissions.some((permission) => hasAtomicPermission(role, granted, permission))

export type RouteSelection = {
  route: RouteKey
  projectId?: string
  formId?: string
  activityId?: string
  beneficiaryId?: string
  kind?: 'project-summary' | 'indicator-summary' | 'beneficiary-summary' | 'survey-results'
  mode?: 'import' | 'extend'
}
const reportAtomic = {
  'project-summary': 'reports.project.read',
  'indicator-summary': 'reports.indicator.read',
  'beneficiary-summary': 'reports.beneficiary.read',
  'survey-results': 'reports.read',
} as const
export const routeUuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
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
          (route === 'imports' && search.has('mode')) ||
          ((route === 'beneficiary' || route === 'beneficiaryEdit') && search.has('projectId'))
        ))
    )
      return null
    const result: RouteSelection = { route: route as RouteKey }
    for (let i = 0; i < names.length; i++) {
      if (!routeUuidPattern.test(matched[i + 1])) return null
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
    if ((route === 'beneficiary' || route === 'beneficiaryEdit') && search.has('projectId')) {
      const projectId = search.get('projectId')
      if (!projectId || !routeUuidPattern.test(projectId)) return null
      result.projectId = projectId.toLowerCase()
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
    if (typeof input[key] !== 'string' || !routeUuidPattern.test(input[key] as string)) return null
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
  if (input.route === 'beneficiary' || input.route === 'beneficiaryEdit') {
    allowed.push('projectId')
    if (input.projectId !== undefined) {
      if (typeof input.projectId !== 'string' || !routeUuidPattern.test(input.projectId))
        return null
      path += `?projectId=${input.projectId.toLowerCase()}`
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
  if (!hasRoutePermission(role, principal.permissions, selection.route, permissions)) return false
  if (
    selection.route === 'imports' &&
    selection.mode === 'extend' &&
    !(['forms.manage', 'forms.templates.import', 'imports.upload'] as const).every((permission) =>
      hasAtomicPermission(role, principal.permissions, permission),
    )
  )
    return false
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
export type RouteDecision = {
  route: RouteKey
  authorization: 'database-verified'
  beneficiaryAccess: 'aggregate-only' | 'records-or-none'
}
