import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { hasAtomicPermission, rolePermissions } from './authorization-policy'
import { projectScope } from './authorized-data.service'
import type { ApplicationIdentity } from './developer-access'

const organizationId = '10000000-0000-4000-8000-000000000001'
const assignedProjectId = '20000000-0000-4000-8000-000000000002'
const targetRoles = ['MONITORING_AND_EVALUATION_OFFICER', 'PROJECT_OFFICER'] as const
const targetPermissions = [
  'rules.read',
  'alerts.read',
  'alerts.review',
  'alerts.outcome.record',
  'recommendations.read',
  'recommendations.review',
  'recommendations.outcome.record',
] as const

const identity = (role: (typeof targetRoles)[number], assignedProjectIds = [assignedProjectId]) =>
  ({
    id: '30000000-0000-4000-8000-000000000003',
    aal: 'aal2',
    userId: '40000000-0000-4000-8000-000000000004',
    organizationId,
    fullName: 'Synthetic rule access tester',
    roles: [role],
    permissions: [...rolePermissions[role]],
    assignedProjectIds,
  }) satisfies ApplicationIdentity

describe('rule-based access alignment contract', () => {
  it.each(targetRoles)('%s receives the detailed CSV alert capabilities', (role) => {
    for (const permission of targetPermissions) {
      expect(hasAtomicPermission(role, rolePermissions[role], permission)).toBe(
        role === 'MONITORING_AND_EVALUATION_OFFICER' && permission !== 'rules.read',
      )
    }
    for (const permission of ['rules.create', 'rules.update', 'rules.activate'] as const) {
      expect(hasAtomicPermission(role, [permission], permission)).toBe(false)
    }
  })

  it.each(targetRoles)(
    '%s remains limited to active assigned projects in its organization',
    (role) => {
      expect(projectScope(identity(role))).toEqual({
        organizationId,
        archivedAt: null,
        id: { in: [assignedProjectId] },
      })
      expect(projectScope(identity(role, []))).toEqual({
        organizationId,
        archivedAt: null,
        id: { in: [] },
      })
    },
  )

  it('retains active, non-ended, same-organization assignment resolution', () => {
    const source = readFileSync(path.join(__dirname, 'application-profile.service.ts'), 'utf8')
    expect(source).toContain("a.status = 'ACTIVE' AND a.ended_at IS NULL")
    expect(source).toContain('a.organization_id = u.organization_id AND a.user_id = u.id')
    expect(source).toContain('project.archived_at IS NULL')
    expect(source).toContain('u.organization_id = ${organizationId}::uuid')
  })
})
