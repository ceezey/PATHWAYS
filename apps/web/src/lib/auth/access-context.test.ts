import { describe, expect, it } from 'vitest'

import { getAccessScopeLabel } from './access-context'

describe('staff shell access-scope label', () => {
  it('does not present a browser role as verified authority outside prototype mode', () => {
    expect(getAccessScopeLabel('Program Manager', false)).toBe('Scope requires server verification')
  })

  it('labels organization, portfolio, and assigned scopes as previews', () => {
    expect(getAccessScopeLabel('System Administrator', true)).toBe('Organization-wide preview')
    expect(getAccessScopeLabel('Grant Manager', true)).toBe('Portfolio preview')
    expect(getAccessScopeLabel('Project Officer', true)).toBe('1 assigned project · preview')
  })
})
