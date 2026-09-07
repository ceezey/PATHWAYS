import { describe, expect, it } from 'vitest'
import {
  type CanonicalRole,
  canAssignRole,
  canAuthorizeRole,
  hasAtomicPermission,
  permissionCodes,
  roleNames,
  rolePermissions,
} from './authorization-policy'

describe('canonical least-privilege policy ceiling', () => {
  it('has exactly six distinct roles, atomic codes, and duplicate-free explicit mappings', () => {
    expect(Object.keys(roleNames)).toHaveLength(6)
    expect(new Set(permissionCodes).size).toBe(permissionCodes.length)
    for (const [role, permissions] of Object.entries(rolePermissions)) {
      expect(new Set(permissions).size).toBe(permissions.length)
      for (const permission of permissions) {
        expect(permission).not.toMatch(/\*|\.full/)
        // assignments.manage is a single assignment-configuration capability.
        expect(permissionCodes).toContain(permission)
        expect(hasAtomicPermission(role, [permission], permission)).toBe(true)
        expect(hasAtomicPermission(role, [], permission)).toBe(false)
      }
    }
  })
  it('does not give administrators an implicit workflow approval bypass', () => {
    expect(
      hasAtomicPermission('SYSTEM_ADMINISTRATOR', ['expenses.approve'], 'expenses.approve'),
    ).toBe(false)
    expect(hasAtomicPermission('SYSTEM_ADMINISTRATOR', ['*'], 'projects.read')).toBe(false)
    expect(hasAtomicPermission('toString', ['projects.read'], 'projects.read')).toBe(false)
  })
  it.each(['PROGRAM_MANAGER', 'GRANT_MANAGER'])(
    'never grants beneficiary identities to %s',
    (role) => {
      expect(
        hasAtomicPermission(role, ['beneficiaries.records.read'], 'beneficiaries.records.read'),
      ).toBe(false)
      expect(rolePermissions[role as CanonicalRole]).not.toContain('reports.beneficiary.read')
    },
  )
  it('enforces the exact account-administration and assignment role matrix', () => {
    for (const actor of Object.keys(roleNames) as CanonicalRole[]) {
      for (const target of Object.keys(roleNames) as CanonicalRole[]) {
        const expected =
          actor === 'SYSTEM_ADMINISTRATOR' ||
          (actor === 'PROGRAM_MANAGER' &&
            ['PROJECT_MANAGER', 'MONITORING_AND_EVALUATION_OFFICER'].includes(target)) ||
          (actor === 'PROJECT_MANAGER' &&
            ['PROJECT_OFFICER', 'MONITORING_AND_EVALUATION_OFFICER'].includes(target))
        expect(canAuthorizeRole(actor, target)).toBe(expected)
        expect(canAssignRole(actor, target)).toBe(
          expected &&
            ['PROJECT_MANAGER', 'PROJECT_OFFICER', 'MONITORING_AND_EVALUATION_OFFICER'].includes(
              target,
            ),
        )
      }
    }
  })
})
