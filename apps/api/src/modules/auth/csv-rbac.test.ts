import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  canAssignRole,
  hasAtomicPermission,
  permissionCodes,
  rolePermissions,
} from './authorization-policy'
import contract from './rbac-contract.json'

describe('approved CSV RBAC contract', () => {
  it('maps every source action and matches both SQL grants and immutable ceilings', () => {
    expect(new Set(contract.rows.map((row) => row.row)).size).toBe(contract.rows.length)
    for (const row of contract.rows) {
      expect(row.disposition.length).toBeGreaterThan(0)
      for (const permission of row.permissions) expect(permissionCodes).toContain(permission)
    }
    const sql = readFileSync(
      path.resolve(__dirname, '../../../prisma/migrations/0026_csv_rbac_realignment/migration.sql'),
      'utf8',
    )
    const expected = Object.entries(contract.permissions)
      .flatMap(([permission, roles]) => roles.map((role) => `${role}:${permission}`))
      .sort()
    for (const block of [
      sql.split('INSERT INTO rbac_expected VALUES')[1].split(';')[0],
      sql.split('AS $matrix$')[1].split('$matrix$;')[0],
    ]) {
      const actual = [...block.matchAll(/\('([A-Z_]+)','([a-z.]+)'\)/g)]
        .map((match) => `${match[1]}:${match[2]}`)
        .sort()
      expect(actual).toEqual(expected)
    }
  })
  it('matches every canonical grant and preserves unique permission definitions', () => {
    expect(new Set(permissionCodes).size).toBe(permissionCodes.length)
    expect(Object.keys(contract.permissions).sort()).toEqual([...permissionCodes].sort())
    for (const [role, permissions] of Object.entries(rolePermissions)) {
      const expected = Object.entries(contract.permissions)
        .filter(([, roles]) => (roles as readonly string[]).includes(role))
        .map(([permission]) => permission)
      expect([...permissions].sort()).toEqual(expected.sort())
    }
  })
  it('enforces detailed rows over conflicting overviews', () => {
    expect(
      hasAtomicPermission('SYSTEM_ADMINISTRATOR', ['projects.create'], 'projects.create'),
    ).toBe(false)
    expect(hasAtomicPermission('PROJECT_MANAGER', ['imports.upload'], 'imports.upload')).toBe(false)
    expect(hasAtomicPermission('PROJECT_OFFICER', ['alerts.review'], 'alerts.review')).toBe(false)
    expect(rolePermissions.PROJECT_OFFICER).toContain('activities.create')
    expect(rolePermissions.SYSTEM_ADMINISTRATOR).toContain('indicators.create')
    expect(rolePermissions.PROJECT_MANAGER).toContain('beneficiaries.profiles.update')
  })
  it('keeps context distinct from full detail and aggregate-only identities', () => {
    for (const role of ['SYSTEM_ADMINISTRATOR', 'PROJECT_OFFICER'] as const) {
      expect(rolePermissions[role]).toContain('projects.read')
      expect(rolePermissions[role]).not.toContain('projects.detail.read')
    }
    for (const role of ['PROGRAM_MANAGER', 'GRANT_MANAGER'] as const) {
      expect(rolePermissions[role]).not.toContain('beneficiaries.records.read')
      expect(rolePermissions[role]).not.toContain('reports.beneficiary.read')
      expect(rolePermissions[role]).not.toContain('submissions.write')
    }
  })
  it('permits only Admin to assign Grant Manager', () => {
    for (const role of Object.keys(rolePermissions) as Array<keyof typeof rolePermissions>) {
      expect(canAssignRole(role, 'GRANT_MANAGER')).toBe(role === 'SYSTEM_ADMINISTRATOR')
    }
  })
  it('denies discretionary actions absent from the CSV', () => {
    for (const permissions of Object.values(rolePermissions)) {
      expect(permissions).not.toContain('programs.create')
      expect(permissions).not.toContain('beneficiaries.records.archive')
      expect(permissions).not.toContain('journeys.manage')
      expect(permissions).not.toContain('settings.labels.manage')
      expect(permissions).not.toContain('forms.archive')
      expect(permissions).not.toContain('indicators.archive')
      expect(permissions).not.toContain('milestones.manage')
    }
  })
})
