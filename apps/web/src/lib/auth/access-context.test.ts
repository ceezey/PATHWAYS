import { describe, expect, it } from 'vitest'

import { getAccessScopeLabel } from './access-context'

describe('staff shell access-scope label', () => {
  it('does not present an unverified browser role as verified authority', () => {
    expect(getAccessScopeLabel('Program Manager', false)).toBe('Scope pending verification')
  })

  it('labels organization, portfolio, and assigned scopes concisely', () => {
    expect(getAccessScopeLabel('System Administrator', true)).toBe('Organization-wide')
    expect(getAccessScopeLabel('Grant Manager', true)).toBe('Portfolio')
    expect(getAccessScopeLabel('Project Officer', true)).toBe('1 assigned project')
  })
})
