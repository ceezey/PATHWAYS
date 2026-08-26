import { describe, expect, it } from 'vitest'

import { getPrototypeRoleDisplayName } from './prototype-role'

describe('prototype role display names', () => {
  it('keeps Program Manager and Grant Manager as distinct role labels', () => {
    expect(getPrototypeRoleDisplayName('Program Manager')).toBe('Program Manager')
    expect(getPrototypeRoleDisplayName('Grant Manager')).toBe('Grant Manager')
    expect(getPrototypeRoleDisplayName('Grant Manager')).not.toBe(
      getPrototypeRoleDisplayName('Program Manager'),
    )
  })

  it('preserves the locked operational role names', () => {
    expect(getPrototypeRoleDisplayName('Monitoring and Evaluation Officer')).toBe(
      'Monitoring and Evaluation Officer',
    )
    expect(getPrototypeRoleDisplayName('System Administrator')).toBe('System Administrator')
  })
})
