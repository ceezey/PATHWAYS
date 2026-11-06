import { ForbiddenException } from '@nestjs/common'
import {
  type ReportKindCode,
  grantedReportKinds,
  hasAtomicPermission,
  reportKindGrants,
} from '@pathways/shared'
import { z } from 'zod'
import type { ApplicationIdentity } from '../../common/authz/application-identity'

// Report, project, form and evaluation ids are checked with the zod GUID shape rule.
export const uuid = z.guid()

// Refuses a report kind the actor may not read, including the extra grants some kinds need.
export function assertReportPermission(actor: ApplicationIdentity, kind: ReportKindCode) {
  const { permission, requires } = reportKindGrants[kind]
  const has = (grant: string) => hasAtomicPermission(actor.roles[0], actor.permissions, grant)
  // The beneficiary aggregate grants are refused by the report source with its own message.
  if (
    !has('reports.read') ||
    !has(permission) ||
    (kind !== 'BENEFICIARY_SUMMARY' && !requires.every(has))
  )
    throw new ForbiddenException('Current report permission required.')
}

// Report kinds the actor may list, each with its own permission and extra grants.
export const readableReportKinds = (actor: ApplicationIdentity) =>
  grantedReportKinds(actor.roles[0], actor.permissions)
