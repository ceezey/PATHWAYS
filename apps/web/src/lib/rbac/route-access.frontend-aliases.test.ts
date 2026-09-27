import { describe, expect, it } from 'vitest'
import { authorizationPathForUiPath, getVerifiedRouteAccess, matchRoute } from './route-access'

const projectId = '72000000-0000-4000-8000-000000000004'
const beneficiaryId = '72000000-0000-4000-8000-000000000006'

describe('frontend route aliases', () => {
  it('admits only a valid recommendation display UUID through the existing current permission', () => {
    const path = `/recommendations/${beneficiaryId}`
    expect(authorizationPathForUiPath(path)).toBe('/recommendations')
    expect(matchRoute(authorizationPathForUiPath(path) ?? '')).toEqual({ route: 'recommendations' })
    const principal = {
      roles: ['PROJECT_OFFICER'],
      permissions: ['recommendations.read'],
      assignedProjectIds: [],
    }
    expect(getVerifiedRouteAccess(principal, authorizationPathForUiPath(path) ?? '').allowed).toBe(
      true,
    )
    expect(
      getVerifiedRouteAccess(
        { ...principal, permissions: [] },
        authorizationPathForUiPath(path) ?? '',
      ).allowed,
    ).toBe(false)
    for (const invalid of [
      '/recommendations/not-a-uuid',
      `${path}/extra`,
      '/recommendations/%31',
      `${path}?projectId=${projectId}`,
      `${path}?role=PROJECT_MANAGER`,
      `${path}?recommendation=other`,
    ]) {
      expect(authorizationPathForUiPath(invalid)).toBeNull()
    }
  })
  it('keeps distinct authorization contracts for edit and settings destinations', () => {
    expect(matchRoute(authorizationPathForUiPath('/beneficiaries/duplicates') ?? '')?.route).toBe(
      'beneficiaries',
    )
    expect(
      matchRoute(authorizationPathForUiPath(`/beneficiaries/${beneficiaryId}/edit`) ?? '')?.route,
    ).toBe('beneficiaryEdit')
    expect(matchRoute(authorizationPathForUiPath(`/projects/${projectId}/edit`) ?? '')?.route).toBe(
      'projectEdit',
    )
    expect(
      matchRoute(authorizationPathForUiPath(`/transparency/${projectId}/preview`) ?? '')?.route,
    ).toBe('transparencyPreview')
    expect(matchRoute(authorizationPathForUiPath('/settings/backups') ?? '')?.route).toBe('backups')
    expect(matchRoute(authorizationPathForUiPath('/settings/audit') ?? '')?.route).toBe('audit')
    expect(matchRoute(authorizationPathForUiPath('/settings/profile') ?? '')?.route).toBe('profile')
    expect(matchRoute(authorizationPathForUiPath('/transparency') ?? '')?.route).toBe(
      'transparencyQueue',
    )
    expect(matchRoute(authorizationPathForUiPath('/collection/entry') ?? '')?.route).toBe(
      'manualEntry',
    )
  })

  it('omits display filters from authorization and rejects unexpected selectors', () => {
    expect(authorizationPathForUiPath('/alerts?alert=local-panel')).toBe('/alerts')
    expect(authorizationPathForUiPath('/beneficiaries?q=sample&page=2')).toBe('/beneficiaries')
    expect(
      authorizationPathForUiPath(`/projects/${projectId}/activities/${beneficiaryId}?proof=panel`),
    ).toBe(`/projects/${projectId}/activities/${beneficiaryId}`)
    expect(authorizationPathForUiPath('/alerts?role=System%20Administrator')).toBeNull()
    expect(authorizationPathForUiPath('/alerts?alert=one&alert=two')).toBeNull()
    expect(
      authorizationPathForUiPath(`/beneficiaries/${beneficiaryId}/edit?projectId=${projectId}`),
    ).toBe(`/beneficiaries/${beneficiaryId}/edit?projectId=${projectId}`)
  })
})
