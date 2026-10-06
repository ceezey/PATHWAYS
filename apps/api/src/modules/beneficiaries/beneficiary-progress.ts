import type { Prisma } from '@prisma/client'

import { aggregateOnlyRoles, hasAtomicPermission } from '../auth/authorization-policy'
import type { ApplicationIdentity } from '../auth/developer-access'

export type BeneficiaryProgress =
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
  total_stages: number
}

/** Journey detail needs journeys.read on top of the records read the list already requires. */
export const canReadProgress = (actor: ApplicationIdentity) =>
  !aggregateOnlyRoles.includes(actor.roles[0]) &&
  hasAtomicPermission(actor.roles[0], actor.permissions, 'journeys.read')

/** One query per page: latest participation, latest staged event and reached stages per enrollment. */
export async function loadProgress(
  tx: Prisma.TransactionClient,
  actor: ApplicationIdentity,
  projectId: string,
  enrollmentIds: string[],
) {
  const progress = new Map<string, BeneficiaryProgress>()
  if (enrollmentIds.length === 0) return progress
  const rows = await tx.$queryRaw<ProgressRow[]>`
    SELECT i.id AS enrollment_id, p.activity_id, p.title AS activity_title, p.participation_date,
      s.stage_code_snapshot AS stage_code, s.stage_name_snapshot AS stage_name,
      coalesce(r.reached, 0)::int AS reached,
      (SELECT count(*) FROM pathways.journey_stages g
        WHERE g.organization_id = ${actor.organizationId}::uuid AND g.project_id = ${projectId}::uuid
          AND g.archived_at IS NULL)::int AS total_stages
    FROM unnest(${enrollmentIds}::uuid[]) AS i(id)
    LEFT JOIN LATERAL (
      SELECT x.activity_id, a.title, x.participation_date
      FROM pathways.beneficiary_activity_participations x
      JOIN pathways.project_activities a ON a.id = x.activity_id
      WHERE x.enrollment_id = i.id AND x.project_id = ${projectId}::uuid
      ORDER BY x.participation_date DESC, x.recorded_at DESC LIMIT 1) p ON true
    LEFT JOIN LATERAL (
      SELECT e.stage_code_snapshot, e.stage_name_snapshot
      FROM pathways.beneficiary_journey_events e
      WHERE e.enrollment_id = i.id AND e.project_id = ${projectId}::uuid
        AND e.stage_id IS NOT NULL AND e.corrects_event_id IS NULL
      ORDER BY e.event_date DESC, e.recorded_at DESC LIMIT 1) s ON true
    LEFT JOIN LATERAL (
      SELECT count(DISTINCT e.stage_id) AS reached
      FROM pathways.beneficiary_journey_events e
      WHERE e.enrollment_id = i.id AND e.project_id = ${projectId}::uuid
        AND e.stage_id IS NOT NULL AND e.corrects_event_id IS NULL) r ON true`
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
            progressPercent:
              row.total_stages > 0 ? Math.round((row.reached / row.total_stages) * 100) : 0,
          }
        : null,
    })
  return progress
}
