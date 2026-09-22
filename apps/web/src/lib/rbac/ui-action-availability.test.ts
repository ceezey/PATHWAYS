import { describe, expect, it } from 'vitest'
import { isUiActionAvailable } from './ui-action-availability'

describe('UI actions against the accepted backend policy', () => {
  it('does not grant the pending Project Manager indicator management change', () => {
    expect(isUiActionAvailable('Project Manager', 'indicators.manage')).toBe(false)
    expect(isUiActionAvailable('Monitoring and Evaluation Officer', 'indicators.manage')).toBe(true)
  })

  it('keeps actions without a usable backend endpoint unavailable', () => {
    expect(isUiActionAvailable('System Administrator', 'dashboard.configure')).toBe(false)
    expect(isUiActionAvailable('Project Manager', 'projects.team.manage')).toBe(false)
    expect(isUiActionAvailable('Project Officer', 'beneficiaries.create')).toBe(false)
    expect(isUiActionAvailable(null, 'activities.edit')).toBe(false)
  })
})
