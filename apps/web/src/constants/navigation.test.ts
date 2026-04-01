import { describe, expect, it } from 'vitest'

import { dashboardNavigation, publicNavigation } from './navigation'

describe('navigation constants', () => {
  it('exposes the expected dashboard sections', () => {
    expect(dashboardNavigation.map((item) => item.href)).toEqual([
      '/dashboard',
      '/participants',
      '/imports',
      '/reports',
      '/settings',
    ])
  })

  it('keeps the login route available from the public nav', () => {
    expect(publicNavigation.some((item) => item.href === '/login')).toBe(true)
  })
})
