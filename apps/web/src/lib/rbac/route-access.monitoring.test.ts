import { describe, expect, it } from 'vitest'
import { getVerifiedRouteAccess, routeAllowed } from './route-access'

const projectId = '10000000-0000-4000-8000-000000000001'
const route = `/projects/${projectId}/indicators`

describe('P06 indicator route viewing is separate from management', () => {
  it.each(['PROJECT_MANAGER', 'MONITORING_AND_EVALUATION_OFFICER'])(
    '%s can read its assigned project without indicator write permission',
    (role) => {
      const principal = {
        roles: [role],
        permissions: ['indicators.read'],
        assignedProjectIds: [projectId],
      }
      expect(getVerifiedRouteAccess(principal, route).allowed).toBe(true)
      expect(routeAllowed(principal, { route: 'indicators', projectId }, false)).toBe(true)
      expect(principal.permissions).not.toContain('indicators.create')
    },
  )

  it('requires the current assignment for project-scoped readers', () => {
    expect(
      getVerifiedRouteAccess(
        { roles: ['PROJECT_MANAGER'], permissions: ['indicators.read'], assignedProjectIds: [] },
        route,
      ).allowed,
    ).toBe(false)
  })

  it.each(['PROJECT_OFFICER', 'GRANT_MANAGER'])(
    'does not give %s an unapproved monitoring permission',
    (role) => {
      expect(
        getVerifiedRouteAccess(
          {
            roles: [role],
            permissions: ['indicators.read', 'indicators.create', 'indicators.update'],
            assignedProjectIds: [projectId],
          },
          route,
        ).allowed,
      ).toBe(false)
    },
  )

  it('fails closed when the database profile no longer grants read access', () => {
    expect(
      getVerifiedRouteAccess(
        {
          roles: ['MONITORING_AND_EVALUATION_OFFICER'],
          permissions: [],
          assignedProjectIds: [projectId],
        },
        route,
      ).allowed,
    ).toBe(false)
  })
})
