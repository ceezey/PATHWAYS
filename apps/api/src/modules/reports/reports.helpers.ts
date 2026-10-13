import { ForbiddenException } from '@nestjs/common'
import { type ReportKindCode, hasAtomicPermission } from '@pathways/shared'
import { z } from 'zod'
import type { ApplicationIdentity } from '../../common/authz/application-identity'

export const kindPermission = {
  PROJECT_SUMMARY: 'reports.project.read',
  INDICATOR_SUMMARY: 'reports.indicator.read',
  BENEFICIARY_SUMMARY: 'reports.beneficiary.read',
  SURVEY_FORM_RESULTS: 'reports.project.read',
  MONITORING_REPORT: 'reports.indicator.read',
  EVALUATION_REPORT: 'reports.project.read',
} as const

// Report, project, form and evaluation ids are checked with the zod UUID rule.
export const uuid = z.string().uuid()

// Refuses a report kind the actor may not read, including the extra grants some kinds need.
export function assertReportPermission(actor: ApplicationIdentity, kind: ReportKindCode) {
  if (
    !hasAtomicPermission(actor.roles[0], actor.permissions, 'reports.read') ||
    !hasAtomicPermission(actor.roles[0], actor.permissions, kindPermission[kind]) ||
    (isExtraReportKind(kind) &&
      !hasAtomicPermission(actor.roles[0], actor.permissions, extraKindRequires[kind])) ||
    (kind === 'SURVEY_FORM_RESULTS' &&
      !hasAtomicPermission(actor.roles[0], actor.permissions, 'assessments.read'))
  )
    throw new ForbiddenException('Current report permission required.')
}

// Report kinds the actor may list, with the extra grants the beneficiary summary needs.
export function readableReportKinds(actor: ApplicationIdentity) {
  const allowed = (Object.keys(kindPermission) as ReportKindCode[]).filter(
    (kind) =>
      hasAtomicPermission(actor.roles[0], actor.permissions, kindPermission[kind]) &&
      (kind !== 'BENEFICIARY_SUMMARY' ||
        (hasAtomicPermission(actor.roles[0], actor.permissions, 'analytics.saddd.read') &&
          hasAtomicPermission(
            actor.roles[0],
            actor.permissions,
            'beneficiaries.aggregates.read',
          ))) &&
      (!isExtraReportKind(kind) ||
        hasAtomicPermission(actor.roles[0], actor.permissions, extraKindRequires[kind])) &&
      (kind !== 'SURVEY_FORM_RESULTS' ||
        hasAtomicPermission(actor.roles[0], actor.permissions, 'assessments.read')),
  )
  return allowed
}

type ExtraReportKind = 'MONITORING_REPORT' | 'EVALUATION_REPORT'
export const isExtraReportKind = (kind: string): kind is ExtraReportKind =>
  kind === 'MONITORING_REPORT' || kind === 'EVALUATION_REPORT'
// Both extra kinds read monitoring data, so they also need monitoring.read on top of the kind grant.
export const extraKindRequires = {
  MONITORING_REPORT: 'monitoring.read',
  EVALUATION_REPORT: 'monitoring.read',
} as const
