import { describe, expect, it } from 'vitest'

import { canLoadDashboardMonitoring, canOpenDashboardMonitoring } from './role-dashboard'

describe('dashboard monitoring authorization', () => {
  it('does not mount monitoring or show its action for Project Officer', () => {
    expect(canLoadDashboardMonitoring('Project Officer')).toBe(false)
    expect(canOpenDashboardMonitoring('Project Officer')).toBe(false)
  })

  it('preserves monitoring access for an authorized role', () => {
    expect(canLoadDashboardMonitoring('Monitoring and Evaluation Officer')).toBe(true)
    expect(canOpenDashboardMonitoring('Monitoring and Evaluation Officer')).toBe(true)
  })
})
