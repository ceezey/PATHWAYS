import { describe, expect, it } from 'vitest'
import { authorizationPathForUiPath, matchRoute } from './route-access'

const projectId = '72000000-0000-4000-8000-000000000004'
const beneficiaryId = '72000000-0000-4000-8000-000000000006'

describe('frontend route aliases', () => {
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
