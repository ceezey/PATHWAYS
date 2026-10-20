import { describe, expect, it } from 'vitest'

import { type ReportKindCode, reportKinds } from '../constants/domain-codes'
import { hasAtomicPermission, rolePermissions } from './authorization-policy'
import { grantedReportKinds, reportKindGrants } from './report-kind-grants'

// The rules the api list route and the web report menu each wrote out before the shared table.
const kindPermission = {
  PROJECT_SUMMARY: 'reports.project.read',
  INDICATOR_SUMMARY: 'reports.indicator.read',
  BENEFICIARY_SUMMARY: 'reports.beneficiary.read',
  SURVEY_FORM_RESULTS: 'reports.project.read',
  MONITORING_REPORT: 'reports.indicator.read',
  EVALUATION_REPORT: 'reports.project.read',
} as const
const extraKindRequires = {
  MONITORING_REPORT: 'monitoring.read',
  EVALUATION_REPORT: 'monitoring.read',
}
const isExtraReportKind = (kind: string): kind is keyof typeof extraKindRequires =>
  kind === 'MONITORING_REPORT' || kind === 'EVALUATION_REPORT'
const reference = (role: string, granted: readonly string[]) => {
  const has = (permission: string) => hasAtomicPermission(role, granted, permission)
  return (Object.keys(kindPermission) as ReportKindCode[]).filter(
    (kind) =>
      has(kindPermission[kind]) &&
      (kind !== 'BENEFICIARY_SUMMARY' ||
        (has('analytics.saddd.read') && has('beneficiaries.aggregates.read'))) &&
      (!isExtraReportKind(kind) || has(extraKindRequires[kind])) &&
      (kind !== 'SURVEY_FORM_RESULTS' || has('assessments.read')),
  )
}

const relevant = [
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
  .reduce<string[][]>(
    (all, index) => all.concat(all.map((subset) => [...subset, relevant[index] as string])),
    [[]],
  )

describe('report kind grants', () => {
  it('names a grant for every report kind in catalog order', () => {
    expect(Object.keys(reportKindGrants)).toEqual([...reportKinds])
  })

  it('offers each role the kinds it was offered before the table, for every subset of the grants', () => {
    expect(subsets).toHaveLength(128)
    for (const role of Object.keys(rolePermissions))
      for (const granted of subsets)
        expect(grantedReportKinds(role, granted), `${role} ${granted}`).toEqual(
          reference(role, granted),
        )
  })

  it.each([
    [
      'SYSTEM_ADMINISTRATOR',
      [
        'PROJECT_SUMMARY',
        'INDICATOR_SUMMARY',
        'SURVEY_FORM_RESULTS',
        'MONITORING_REPORT',
        'EVALUATION_REPORT',
      ],
    ],
    [
      'PROGRAM_MANAGER',
      [
        'PROJECT_SUMMARY',
        'INDICATOR_SUMMARY',
        'SURVEY_FORM_RESULTS',
        'MONITORING_REPORT',
        'EVALUATION_REPORT',
      ],
    ],
    [
      'GRANT_MANAGER',
      [
        'PROJECT_SUMMARY',
        'INDICATOR_SUMMARY',
        'SURVEY_FORM_RESULTS',
        'MONITORING_REPORT',
        'EVALUATION_REPORT',
      ],
    ],
    ['PROJECT_MANAGER', [...reportKinds]],
    ['MONITORING_AND_EVALUATION_OFFICER', [...reportKinds]],
    ['PROJECT_OFFICER', ['PROJECT_SUMMARY', 'INDICATOR_SUMMARY']],
  ])('offers %s every kind it holds the grants for', (role, kinds) => {
    const granted = rolePermissions[role as keyof typeof rolePermissions]
    expect(grantedReportKinds(role, granted)).toEqual(kinds)
  })

  it('offers nothing to an unknown role or to a role without grants', () => {
    expect(grantedReportKinds('UNKNOWN_ROLE', relevant)).toEqual([])
    expect(grantedReportKinds('PROJECT_MANAGER', [])).toEqual([])
  })
})
