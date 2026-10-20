import { roleNames } from '@pathways/shared'
import { describe, expect, it } from 'vitest'

import { pathwaysRoles } from './pathways-role'

describe('PATHWAYS role display order', () => {
  it('lists every catalog role name exactly once', () => {
    expect([...pathwaysRoles].sort()).toEqual(Object.values(roleNames).sort())
  })

  it('keeps the UI order with System Administrator last', () => {
    expect(pathwaysRoles).toEqual([
      'Program Manager',
      'Grant Manager',
      'Project Manager',
      'Monitoring and Evaluation Officer',
      'Project Officer',
      'System Administrator',
    ])
  })
})
