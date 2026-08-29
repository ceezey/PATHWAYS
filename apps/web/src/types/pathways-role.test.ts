import { describe, expect, it } from 'vitest'

import { getPathwaysRoleDisplayName } from './pathways-role'

describe('PATHWAYS role display names', () => {
  it('keeps Program Manager and Grant Manager as distinct role labels', () => {
    expect(getPathwaysRoleDisplayName('Program Manager')).toBe('Program Manager')
    expect(getPathwaysRoleDisplayName('Grant Manager')).toBe('Grant Manager')
    expect(getPathwaysRoleDisplayName('Grant Manager')).not.toBe(
      getPathwaysRoleDisplayName('Program Manager'),
    )
  })

  it('preserves the locked operational role names', () => {
    expect(getPathwaysRoleDisplayName('Monitoring and Evaluation Officer')).toBe(
      'Monitoring and Evaluation Officer',
    )
    expect(getPathwaysRoleDisplayName('System Administrator')).toBe('System Administrator')
  })
})
