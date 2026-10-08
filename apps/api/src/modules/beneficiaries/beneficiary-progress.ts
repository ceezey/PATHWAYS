import type { Prisma } from '@prisma/client'

import { aggregateOnlyRoles, hasAtomicPermission } from '../auth/authorization-policy'
import type { ApplicationIdentity } from '../auth/developer-access'

type BeneficiaryProgress =
  | { restricted: true }
  | {
      restricted: false
      lastParticipation: { activityId: string; title: string; date: string } | null
      stage: { code: string; name: string; progressPercent: number } | null
    }

type ProgressRow = {
  enrollment_id: string
  activity_id: string | null
  activity_title: string | null
  participation_date: Date | null
  stage_code: string | null
  stage_name: string | null
  reached: number
  at_terminal: boolean
  path_length: number
}

/** Share of one person's own path done: ENTRY counts as reached, a branch counts once, a terminal stage is 100. */
export function progressPercent(row: Pick<ProgressRow, 'reached' | 'at_terminal' | 'path_length'>) {
  if (row.at_terminal) return 100
  if (row.path_length <= 0) return 0
  return Math.min(100, Math.round(((row.reached + 1) / row.path_length) * 100))
}

/** Journey detail needs journeys.read on top of the records read the list already requires. */
export const canReadProgress = (actor: ApplicationIdentity) =>
  !aggregateOnlyRoles.includes(actor.roles[0]) &&
  hasAtomicPermission(actor.roles[0], actor.permissions, 'journeys.read')

/** One call per page: the definer function checks scope once and returns latest participation, current stage and reached stages. */
export async function loadProgress(
  tx: Prisma.TransactionClient,
  actor: ApplicationIdentity,
  projectId: string,
  enrollmentIds: string[],
) {
  const progress = new Map<string, BeneficiaryProgress>()
  if (enrollmentIds.length === 0) return progress
  const rows = await tx.$queryRaw<ProgressRow[]>`
    SELECT * FROM pathways.p05_beneficiary_progress(
      ${actor.organizationId}::uuid, ${projectId}::uuid, ${enrollmentIds}::uuid[])`
  for (const row of rows)
    progress.set(row.enrollment_id, {
      restricted: false,
      lastParticipation:
        row.activity_id && row.participation_date
          ? {
              activityId: row.activity_id,
              title: row.activity_title ?? '',
              date: row.participation_date.toISOString().slice(0, 10),
            }
          : null,
      stage: row.stage_code
        ? {
            code: row.stage_code,
            name: row.stage_name ?? '',
            progressPercent: progressPercent(row),
          }
        : null,
    })
  return progress
}
