import { describe, expect, it } from 'vitest'

import {
  createDashboardNavGroups,
  dashboardNavigation,
  getDashboardNavigationLabel,
  publicNavigation,
} from './navigation'

describe('navigation constants', () => {
  it('exposes the expected dashboard sections', () => {
    expect(dashboardNavigation.map((item) => item.href)).toEqual([
      '/dashboard',
      '/projects',
      '/beneficiaries',
      '/analytics',
      '/alerts',
      '/recommendations',
      '/reports',
      '/alerts/repository',
      '/settings/users',
      '/settings/labels',
    ])
    expect(dashboardNavigation.map((item) => item.label)).toEqual([
      'Dashboard',
      'Projects',
      'Beneficiaries',
      'Analytics',
      'Alerts',
      'Recommendations',
      'Reports',
      'Alerts Repository',
      'User Management',
      'Edit Labels',
    ])
  })

  it('keeps both sidebar item labels and section headings fixed', () => {
    const groups = createDashboardNavGroups()

    expect(groups[0]?.items.find((item) => item.href === '/beneficiaries')?.label).toBe(
      'Beneficiaries',
    )
    expect(groups.map((group) => group.label)).toEqual([
      'Workspace',
      'Decision Support',
      'Administration',
    ])
  })

  it('keeps staff login out of public navigation', () => {
    expect(publicNavigation.some((item) => item.href.includes('login'))).toBe(false)
  })

  it('exposes public project browsing without dashboard navigation', () => {
    expect(publicNavigation.map((item) => item.href)).toEqual(['/', '/public/projects'])
  })

  it('uses the fixed label for the most specific current workspace route', () => {
    expect(getDashboardNavigationLabel('/projects/futuremakers-ncr/activities')).toBe('Projects')
    expect(getDashboardNavigationLabel('/settings/users')).toBe('User Management')
    expect(getDashboardNavigationLabel('/alerts/repository')).toBe('Alerts Repository')
  })
})
