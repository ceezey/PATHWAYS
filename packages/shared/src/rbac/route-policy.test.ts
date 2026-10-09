import { describe, expect, it } from 'vitest'

import { rolePermissions } from './authorization-policy'
import type { CanonicalRole } from './role-catalog'
import {
  type RoutePrincipal,
  isAggregateOnly,
  matchRoute,
  parseRouteSelection,
  routeAllowed,
  routeUuidPattern,
} from './route-policy'

const projectId = 'a1000000-0000-4000-8000-00000000000b'
const otherProjectId = 'a2000000-0000-4000-8000-00000000000c'
const principal = (role: CanonicalRole): RoutePrincipal => ({
  roles: [role],
  permissions: rolePermissions[role],
  assignedProjectIds: [projectId],
})

describe('route policy', () => {
  it('matches a project path and lowercases its id', () => {
    expect(matchRoute(`/projects/${projectId.toUpperCase()}`)).toEqual({
      route: 'project',
      projectId,
    })
  })

  it('parses only known routes with valid ids and no extra keys', () => {
    expect(parseRouteSelection({ route: 'project', projectId })).toEqual({
      route: 'project',
      projectId,
    })
    expect(parseRouteSelection({ route: 'project', projectId: 'not-a-uuid' })).toBeNull()
    expect(parseRouteSelection({ route: 'project', projectId, extra: 'x' })).toBeNull()
    expect(parseRouteSelection({ route: 'unknown' })).toBeNull()
  })

  it('checks project assignment unless the caller verifies it in the database', () => {
    const other = { route: 'project' as const, projectId: otherProjectId }
    expect(routeAllowed(principal('PROJECT_OFFICER'), { route: 'project', projectId })).toBe(true)
    expect(routeAllowed(principal('PROJECT_OFFICER'), other)).toBe(false)
    expect(routeAllowed(principal('PROJECT_OFFICER'), other, false)).toBe(true)
  })

  it('treats only program and grant managers as aggregate-only', () => {
    expect(isAggregateOnly(principal('PROGRAM_MANAGER'))).toBe(true)
    expect(isAggregateOnly(principal('GRANT_MANAGER'))).toBe(true)
    expect(isAggregateOnly(principal('PROJECT_MANAGER'))).toBe(false)
  })

  it('accepts version 1 to 8 UUIDs only', () => {
    expect(routeUuidPattern.test(projectId)).toBe(true)
    expect(routeUuidPattern.test('a1000000-0000-0000-8000-00000000000b')).toBe(false)
  })
})
