import { describe, expect, it } from 'vitest'
import {
  type CanonicalRole,
  type RoleName,
  isCanonicalRole,
  roleCodeByName,
  roleCodeFor,
  roleNames,
} from './role-catalog'

const entries = Object.entries(roleNames) as Array<[CanonicalRole, RoleName]>

describe('role catalog', () => {
  it('maps six role codes to six distinct names and back', () => {
    expect(entries).toHaveLength(6)
    expect(new Set(Object.values(roleNames)).size).toBe(6)
    for (const [code, name] of entries) {
      expect(roleCodeByName[name]).toBe(code)
      expect(roleCodeFor(name)).toBe(code)
      expect(isCanonicalRole(code)).toBe(true)
    }
  })

  it('finds no role for unknown, cased or inherited keys', () => {
    for (const value of [
      'constructor',
      '__proto__',
      'toString',
      'hasOwnProperty',
      '',
      'Administrator',
      'system administrator',
      'SYSTEM_ADMINISTRATOR',
    ])
      expect(roleCodeFor(value)).toBeUndefined()
    for (const value of ['constructor', '__proto__', 'ADMIN', 'System Administrator'])
      expect(isCanonicalRole(value)).toBe(false)
  })
})
