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
    const migration = (name: string) =>
      readFileSync(
        path.resolve(__dirname, `../../../prisma/migrations/${name}/migration.sql`),
        'utf8',
      )
    const sql = migration('0027_revised_csv_rbac')
    const latestMatrix = migration('0035_admin_read_access')
    const expected = Object.entries(contract.permissions)
      .flatMap(([permission, roles]) => roles.map((role) => `${role}:${permission}`))
      .sort()
    const pairs = (block: string) =>
      [...block.matchAll(/\('([A-Z_]+)','([a-z.]+)'\)/g)].map((match) => `${match[1]}:${match[2]}`)
    const key = ([role, permission]: string[]) => `${role}:${permission}`
    const grants = contract.amendments.flatMap((amendment) => amendment.grants.map(key))
    const revokes = contract.amendments.flatMap((amendment) => amendment.revokes?.map(key) ?? [])
    // Effective grants: the 0027 baseline plus forward amendments, minus later revokes.
    expect(
      [...pairs(sql.split('INSERT INTO rbac_expected VALUES')[1].split(';')[0]), ...grants]
        .filter((pair) => !revokes.includes(pair))
        .sort(),
    ).toEqual(expected)
    // 0035 is the last wholesale matrix; 0047 and 0048 wrap it, so undo their deltas here.
    const later = contract.amendments.filter((amendment) => amendment.migration >= '0036')
    const laterGrants = later.flatMap((amendment) => amendment.grants.map(key))
    const at0035 = [...expected.filter((pair) => !laterGrants.includes(pair)), ...revokes]
    expect(pairs(latestMatrix.split('AS $matrix$')[1].split('$matrix$;')[0]).sort()).toEqual(
      at0035.sort(),
    )
    for (const amendment of contract.amendments) {
      const text = migration(amendment.migration)
      for (const [, permission] of amendment.grants) expect(text).toContain(`'${permission}'`)
      for (const [role, permission] of amendment.revokes ?? [])
        expect(text).toContain(`$1='${role}' AND $2='${permission}'`)
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
    expect(hasAtomicPermission('PROJECT_OFFICER', ['alerts.review'], 'alerts.review')).toBe(true)
    expect(rolePermissions.PROJECT_OFFICER).toContain('activities.create')
    expect(rolePermissions.SYSTEM_ADMINISTRATOR).toContain('indicators.create')
    expect(rolePermissions.PROJECT_MANAGER).toContain('beneficiaries.profiles.update')
  })
  it('keeps context distinct from full detail and aggregate-only identities', () => {
    for (const role of ['SYSTEM_ADMINISTRATOR', 'PROJECT_OFFICER'] as const) {
      expect(rolePermissions[role]).toContain('projects.read')
      expect(rolePermissions[role]).toContain('projects.detail.read')
    }
    for (const role of ['PROGRAM_MANAGER', 'GRANT_MANAGER'] as const) {
      expect(rolePermissions[role]).not.toContain('beneficiaries.records.read')
      expect(rolePermissions[role]).not.toContain('reports.beneficiary.read')
      expect(rolePermissions[role]).not.toContain('submissions.write')
    }
  })
  it('separates definition configuration, progress, and private responses', () => {
    expect(rolePermissions.SYSTEM_ADMINISTRATOR).not.toContain('assessments.detail.read')
    expect(rolePermissions.SYSTEM_ADMINISTRATOR).toContain('forms.manage')
    expect(rolePermissions.SYSTEM_ADMINISTRATOR).toContain('journeys.manage')
    expect(rolePermissions.PROJECT_OFFICER).not.toContain('forms.manage')
    expect(rolePermissions.PROJECT_OFFICER).not.toContain('forms.export')
    expect(rolePermissions.PROJECT_OFFICER).not.toContain('activities.update')
    expect(rolePermissions.PROJECT_OFFICER).toContain('activities.progress.update')
    expect(rolePermissions.MONITORING_AND_EVALUATION_OFFICER).toContain(
      'evaluations.weights.configure',
    )
    expect(contract.sourceSha256).toBe(
      'ef1339d951a61d6d8f10c3463a91af696569c304b34614b077e8e485b0ebaafd',
    )
  })
  it('gives System Administrator read-only activity and budget views without detail or writes', () => {
    expect(rolePermissions.SYSTEM_ADMINISTRATOR).toContain('activities.read')
    expect(rolePermissions.SYSTEM_ADMINISTRATOR).toContain('budgets.read')
    for (const permission of [
      'beneficiaries.records.read',
      'activities.create',
      'activities.update',
      'activities.proof.submit',
      'budgets.create',
      'budgets.update',
      'expenses.read',
      'expenses.submit',
    ] as const) {
      expect(rolePermissions.SYSTEM_ADMINISTRATOR).not.toContain(permission)
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
      expect(permissions).not.toContain('settings.labels.manage')
      expect(permissions).not.toContain('forms.archive')
      expect(permissions).not.toContain('indicators.archive')
      expect(permissions).not.toContain('milestones.manage')
    }
  })
})
