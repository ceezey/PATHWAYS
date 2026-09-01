import { describe, expect, it } from 'vitest'

import {
  getPrototypeAccountById,
  isPrototypeRoleValue,
  validatePrototypeCredentials,
} from './prototype-credentials.server'

describe('prototype Grant Manager credentials', () => {
  it('validates the Grant Manager demo account using the existing credential convention', () => {
    expect(validatePrototypeCredentials('grant.manager', 'PathwaysDemo!2026')).toMatchObject({
      id: 'grant-manager',
      role: 'Grant Manager',
      email: 'grant.manager@demo.pathways.local',
    })
    expect(validatePrototypeCredentials('grant.manager', 'incorrect-password')).toBeNull()
  })

  it('recognizes Grant Manager without aliasing Program Manager', () => {
    expect(getPrototypeAccountById('grant-manager')).toMatchObject({ role: 'Grant Manager' })
    expect(isPrototypeRoleValue('Grant Manager')).toBe(true)
    expect(isPrototypeRoleValue('Program Manager')).toBe(true)
  })
})
