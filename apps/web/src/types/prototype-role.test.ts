import { describe, expect, it } from 'vitest'

import { getPrototypeRoleDisplayName } from './prototype-role'

describe('prototype role display names', () => {
  it('uses Program Manager as the sole executive role label', () => {
    expect(getPrototypeRoleDisplayName('Program Manager')).toBe('Program Manager')
  })

  it('preserves the locked operational role names', () => {
    expect(getPrototypeRoleDisplayName('Monitoring and Evaluation Officer')).toBe(
      'Monitoring and Evaluation Officer',
    )
    expect(getPrototypeRoleDisplayName('System Administrator')).toBe('System Administrator')
  })
})
