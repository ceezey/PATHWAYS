import { describe, expect, it } from 'vitest'
import { isUiActionAvailable } from './ui-action-availability'

describe('UI actions against the accepted backend policy', () => {
  it('allows Project Manager and M&E to manage project indicators', () => {
    expect(isUiActionAvailable('Project Manager', 'indicators.manage')).toBe(true)
    expect(isUiActionAvailable('Monitoring and Evaluation Officer', 'indicators.manage')).toBe(true)
    expect(isUiActionAvailable('Project Officer', 'indicators.manage')).toBe(false)
    expect(isUiActionAvailable('Program Manager', 'indicators.manage')).toBe(false)
  })

  it('keeps actions without a usable backend endpoint unavailable', () => {
    expect(isUiActionAvailable('System Administrator', 'dashboard.configure')).toBe(false)
    expect(isUiActionAvailable('Project Manager', 'projects.team.manage')).toBe(false)
    expect(isUiActionAvailable('Project Officer', 'beneficiaries.create')).toBe(false)
    expect(isUiActionAvailable(null, 'activities.edit')).toBe(false)
  })
})
