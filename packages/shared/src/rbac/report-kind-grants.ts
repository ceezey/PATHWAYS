import { type ReportKindCode, reportKinds } from '../constants/domain-codes'
import { type AtomicPermission, hasAtomicPermission } from './authorization-policy'

export type ReportKindGrant = {
  permission: AtomicPermission
  requires: readonly AtomicPermission[]
}

// The grants each report kind needs: its own permission plus the extra grants the api also requires.
export const reportKindGrants: Record<ReportKindCode, ReportKindGrant> = {
  PROJECT_SUMMARY: { permission: 'reports.project.read', requires: [] },
  INDICATOR_SUMMARY: { permission: 'reports.indicator.read', requires: [] },
  BENEFICIARY_SUMMARY: {
    permission: 'reports.beneficiary.read',
    requires: ['analytics.saddd.read', 'beneficiaries.aggregates.read'],
  },
  SURVEY_FORM_RESULTS: { permission: 'reports.project.read', requires: ['assessments.read'] },
  MONITORING_REPORT: { permission: 'reports.indicator.read', requires: ['monitoring.read'] },
  EVALUATION_REPORT: { permission: 'reports.project.read', requires: ['monitoring.read'] },
}

// Report kinds a role may open: every kind whose permission and extra grants it holds, in catalog order.
export function grantedReportKinds(role: string, granted: readonly string[]): ReportKindCode[] {
  const has = (permission: string) => hasAtomicPermission(role, granted, permission)
  return reportKinds.filter((kind) => {
    const { permission, requires } = reportKindGrants[kind]
    return has(permission) && requires.every(has)
  })
}
