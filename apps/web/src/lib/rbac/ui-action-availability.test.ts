import { describe, expect, it } from 'vitest'
import { isUiActionAvailable } from './ui-action-availability'

describe('UI actions against the accepted backend policy', () => {
  it('hides a mounted action after revocation and rejects a forged role/profile pair', () => {
    const principal = { roles: ['PROJECT_MANAGER'], permissions: ['projects.update'] }
    expect(isUiActionAvailable('Project Manager', 'projects.profile.manage', principal)).toBe(true)
    expect(
      isUiActionAvailable('Project Manager', 'projects.profile.manage', {
        ...principal,
        permissions: [],
      }),
    ).toBe(false)
    expect(isUiActionAvailable('System Administrator', 'projects.profile.manage', principal)).toBe(
      false,
    )
    expect(isUiActionAvailable('Project Manager', 'projects.profile.manage', null)).toBe(false)
  })
  it('allows Project Manager and M&E to manage project indicators', () => {
    expect(isUiActionAvailable('Project Manager', 'indicators.manage')).toBe(true)
    expect(isUiActionAvailable('Monitoring and Evaluation Officer', 'indicators.manage')).toBe(true)
    expect(isUiActionAvailable('Project Officer', 'indicators.manage')).toBe(false)
    expect(isUiActionAvailable('Program Manager', 'indicators.manage')).toBe(false)
  })

  it('keeps actions without a usable backend endpoint unavailable', () => {
    expect(isUiActionAvailable('System Administrator', 'dashboard.configure')).toBe(false)
    expect(isUiActionAvailable('Project Manager', 'projects.team.manage')).toBe(true)
    expect(isUiActionAvailable('Project Officer', 'beneficiaries.merge')).toBe(false)
    expect(isUiActionAvailable(null, 'activities.edit')).toBe(false)
  })

  it('matches beneficiary and journey controls to the accepted C3/C4 permissions', () => {
    expect(isUiActionAvailable('Project Officer', 'beneficiaries.create')).toBe(true)
    expect(isUiActionAvailable('Project Manager', 'beneficiaries.create')).toBe(true)
    expect(isUiActionAvailable('Project Manager', 'beneficiaries.edit')).toBe(true)
    expect(isUiActionAvailable('Monitoring and Evaluation Officer', 'beneficiaries.edit')).toBe(
      true,
    )
    expect(isUiActionAvailable('Project Officer', 'beneficiaries.participation.record')).toBe(true)
    expect(isUiActionAvailable('Project Officer', 'journeys.manage')).toBe(false)
    expect(isUiActionAvailable('Project Manager', 'journeys.manage')).toBe(true)
    expect(isUiActionAvailable('Program Manager', 'beneficiaries.create')).toBe(false)
    expect(isUiActionAvailable('Grant Manager', 'beneficiaries.edit')).toBe(false)
  })

  it('enables project profile writes only for roles with the accepted project permission', () => {
    expect(isUiActionAvailable('System Administrator', 'projects.profile.manage')).toBe(false)
    expect(isUiActionAvailable('Project Manager', 'projects.profile.manage')).toBe(true)
    expect(isUiActionAvailable('Program Manager', 'projects.profile.manage')).toBe(false)
    expect(isUiActionAvailable('Project Officer', 'projects.profile.manage')).toBe(false)
  })
})
