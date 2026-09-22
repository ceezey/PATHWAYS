import { describe, expect, it } from 'vitest'

import { getAccessScopeLabel } from './access-context'

describe('staff shell access-scope label', () => {
  it('does not present an unavailable verified role as authority', () => {
    expect(getAccessScopeLabel(null, [])).toBe('Scope pending verification')
  })

  it('labels organization, portfolio, and assigned scopes concisely', () => {
    expect(getAccessScopeLabel('System Administrator', [])).toBe('Organization-wide')
    expect(getAccessScopeLabel('Grant Manager', [])).toBe('Portfolio')
    expect(getAccessScopeLabel('Project Officer', ['project-1'])).toBe('1 assigned project')
  })
})
