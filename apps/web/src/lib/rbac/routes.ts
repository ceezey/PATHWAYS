import { type RouteKey, matchRoute, routePolicy, routeUuidPattern } from '@pathways/shared'

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
