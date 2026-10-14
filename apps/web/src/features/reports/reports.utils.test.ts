import { principalHasAtomicPermission } from '@/lib/rbac/policy'
import { type AtomicPermission, type ReportKindCode, rolePermissions } from '@pathways/shared'
import { describe, expect, it } from 'vitest'
import { allowedKinds, reportFileName } from './reports.utils'

describe('report file names', () => {
  it.each([
    ['Q3: North/South <draft>?', 'Q3 North South draft.pdf'],
    ['  ...  ', 'report-30000000-0000-4000-8000-000000000003.pdf'],
  ])('makes the report name %j a safe file name', (name, expected) => {
    expect(reportFileName(name, '30000000-0000-4000-8000-000000000003', 'pdf')).toBe(expected)
  })
})

describe('report kinds requiring monitoring.read', () => {
  const profile = (permissions: string[]) =>
    ({
      userId: 'u',
      organizationId: 'org',
      roles: ['MONITORING_AND_EVALUATION_OFFICER'],
      permissions,
      assignedProjectIds: [],
    }) as unknown as Parameters<typeof allowedKinds>[0]
  const grants = ['reports.read', 'reports.project.read', 'reports.indicator.read']

  it('does not offer monitoring or evaluation reports without monitoring.read', () => {
    const offered = allowedKinds(profile(grants))
    expect(offered).not.toContain('MONITORING_REPORT')
    expect(offered).not.toContain('EVALUATION_REPORT')
    expect(offered).toContain('PROJECT_SUMMARY')
  })

  it('offers both kinds with monitoring.read', () => {
    const offered = allowedKinds(profile([...grants, 'monitoring.read']))
    expect(offered).toEqual(expect.arrayContaining(['MONITORING_REPORT', 'EVALUATION_REPORT']))
  })
})

describe('beneficiary summary kind', () => {
  const profile = (role: string, permissions: string[]) =>
    ({
      userId: 'u',
      organizationId: 'org',
      roles: [role],
      permissions,
      assignedProjectIds: [],
    }) as unknown as Parameters<typeof allowedKinds>[0]
  const grants = ['reports.read', 'reports.beneficiary.read', 'beneficiaries.aggregates.read']

  it('is hidden from a project officer who lacks analytics.saddd.read', () => {
    expect(allowedKinds(profile('PROJECT_OFFICER', grants))).not.toContain('BENEFICIARY_SUMMARY')
  })

  it('is hidden when either aggregate grant is revoked', () => {
    const full = [...grants, 'analytics.saddd.read']
    for (const missing of ['analytics.saddd.read', 'beneficiaries.aggregates.read']) {
      const permissions = full.filter((permission) => permission !== missing)
      expect(allowedKinds(profile('MONITORING_AND_EVALUATION_OFFICER', permissions))).not.toContain(
        'BENEFICIARY_SUMMARY',
      )
    }
  })

  it('is offered with both aggregate grants', () => {
    const permissions = [...grants, 'analytics.saddd.read']
    expect(allowedKinds(profile('MONITORING_AND_EVALUATION_OFFICER', permissions))).toContain(
      'BENEFICIARY_SUMMARY',
    )
  })
})

describe('report kind menu before the shared table', () => {
  // The menu rule as the component wrote it before the shared grant table.
  const table: Record<
    ReportKindCode,
    { permission: AtomicPermission; requires?: AtomicPermission[] }
  > = {
    PROJECT_SUMMARY: { permission: 'reports.project.read' },
    INDICATOR_SUMMARY: { permission: 'reports.indicator.read' },
    BENEFICIARY_SUMMARY: {
      permission: 'reports.beneficiary.read',
      requires: ['analytics.saddd.read', 'beneficiaries.aggregates.read'],
    },
    SURVEY_FORM_RESULTS: { permission: 'reports.project.read' },
    MONITORING_REPORT: { permission: 'reports.indicator.read', requires: ['monitoring.read'] },
    EVALUATION_REPORT: { permission: 'reports.project.read', requires: ['monitoring.read'] },
  }
  type Principal = Parameters<typeof allowedKinds>[0]
  const listedBefore = (principal: Principal) =>
    (Object.keys(table) as ReportKindCode[]).filter(
      (kind) =>
        principalHasAtomicPermission(principal, table[kind].permission) &&
        (table[kind].requires ?? []).every((grant) =>
          principalHasAtomicPermission(principal, grant),
        ) &&
        (kind !== 'SURVEY_FORM_RESULTS' ||
          principalHasAtomicPermission(principal, 'assessments.read')),
    )
  const relevant: AtomicPermission[] = [
    'reports.project.read',
    'reports.indicator.read',
    'reports.beneficiary.read',
    'analytics.saddd.read',
    'beneficiaries.aggregates.read',
    'monitoring.read',
    'assessments.read',
  ]
  const subsets = relevant
    .map((_, index) => index)
    .reduce<AtomicPermission[][]>(
      (all, index) =>
        all.concat(all.map((subset) => [...subset, relevant[index] as AtomicPermission])),
      [[]],
    )
  const principalOf = (roles: string[], permissions: string[]) =>
    ({
      userId: 'u',
      organizationId: 'org',
      roles,
      permissions,
      assignedProjectIds: [],
    }) as Principal

  it('offers every role the kinds it was offered before, for every subset of the grants', () => {
    expect(subsets).toHaveLength(128)
    for (const role of Object.keys(rolePermissions))
      for (const granted of subsets) {
        const principal = principalOf([role], granted)
        expect(allowedKinds(principal), `${role} ${granted}`).toEqual(listedBefore(principal))
      }
  })

  it('offers nothing without a profile or with other than exactly one role', () => {
    expect(allowedKinds(null)).toEqual([])
    expect(allowedKinds(undefined)).toEqual([])
    expect(allowedKinds(principalOf([], relevant))).toEqual([])
    expect(allowedKinds(principalOf(['PROJECT_MANAGER', 'PROJECT_OFFICER'], relevant))).toEqual([])
  })
})
