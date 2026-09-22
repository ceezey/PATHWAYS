import { describe, expect, it } from 'vitest'
import { authorizationPathForUiPath, matchRoute } from './route-access'

const projectId = '72000000-0000-4000-8000-000000000004'
const beneficiaryId = '72000000-0000-4000-8000-000000000006'

describe('frontend route aliases', () => {
  it('maps new UI pages to existing checked routes without new grants', () => {
    expect(matchRoute(authorizationPathForUiPath('/beneficiaries/duplicates') ?? '')?.route).toBe(
      'beneficiaries',
    )
    expect(
      matchRoute(authorizationPathForUiPath(`/beneficiaries/${beneficiaryId}/edit`) ?? '')?.route,
    ).toBe('beneficiary')
    expect(matchRoute(authorizationPathForUiPath(`/projects/${projectId}/edit`) ?? '')?.route).toBe(
      'project',
    )
    expect(
      matchRoute(authorizationPathForUiPath(`/transparency/${projectId}/preview`) ?? '')?.route,
    ).toBe('transparencyPreview')
    expect(matchRoute(authorizationPathForUiPath('/settings/backups') ?? '')?.route).toBe(
      'settings',
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
  })
})
