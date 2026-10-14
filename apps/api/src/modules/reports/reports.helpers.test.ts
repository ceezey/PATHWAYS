import { ForbiddenException } from '@nestjs/common'
import {
  type ReportKindCode,
  hasAtomicPermission,
  reportKinds,
  rolePermissions,
} from '@pathways/shared'
import { describe, expect, it } from 'vitest'
import type { ApplicationIdentity } from '../../common/authz/application-identity'
import { assertReportPermission, readableReportKinds } from './reports.helpers'

// The rules of the report kind helpers as they were written before the shared grant table.
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
const actorOf = (role: string, permissions: string[]) =>
  ({ roles: [role], permissions }) as unknown as ApplicationIdentity
const allowedBefore = (role: string, granted: string[], kind: ReportKindCode) => {
  const has = (permission: string) => hasAtomicPermission(role, granted, permission)
  return (
    has('reports.read') &&
    has(kindPermission[kind]) &&
    !(isExtraReportKind(kind) && !has(extraKindRequires[kind])) &&
    !(kind === 'SURVEY_FORM_RESULTS' && !has('assessments.read'))
  )
}
const listedBefore = (role: string, granted: string[]) => {
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
  'reports.read',
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
const roles = Object.keys(rolePermissions)

describe('report kind helpers', () => {
  it('lists the kinds each role could list before the shared table, for every subset of the grants', () => {
    expect(subsets).toHaveLength(256)
    for (const role of roles)
      for (const granted of subsets)
        expect(readableReportKinds(actorOf(role, granted)), `${role} ${granted}`).toEqual(
          listedBefore(role, granted),
        )
  })

  it('refuses a kind exactly where it was refused before the shared table, for every subset of the grants', () => {
    for (const role of roles)
      for (const granted of subsets)
        for (const kind of reportKinds) {
          const run = () => assertReportPermission(actorOf(role, granted), kind)
          if (allowedBefore(role, granted, kind))
            expect(run, `${role} ${kind} ${granted}`).not.toThrow()
          else
            expect(run, `${role} ${kind} ${granted}`).toThrow(
              new ForbiddenException('Current report permission required.'),
            )
        }
  })

  it('leaves the beneficiary aggregate grants to the beneficiary summary source and its own refusal', () => {
    const granted = ['reports.read', 'reports.beneficiary.read']
    expect(() =>
      assertReportPermission(actorOf('PROJECT_MANAGER', granted), 'BENEFICIARY_SUMMARY'),
    ).not.toThrow()
    expect(readableReportKinds(actorOf('PROJECT_MANAGER', granted))).toEqual([])
  })
})
