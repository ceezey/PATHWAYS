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

/** One query per page: latest participation, latest staged event and reached stages per enrollment. */
export async function loadProgress(
  tx: Prisma.TransactionClient,
  actor: ApplicationIdentity,
  projectId: string,
  enrollmentIds: string[],
) {
  const progress = new Map<string, BeneficiaryProgress>()
  if (enrollmentIds.length === 0) return progress
  const org = actor.organizationId
  // The current stage follows the detail page: the stage mapped to the latest participation, else the first stage.
  const rows = await tx.$queryRaw<ProgressRow[]>`
    SELECT i.id AS enrollment_id, p.activity_id, p.title AS activity_title, p.participation_date,
      s.code AS stage_code, s.name AS stage_name,
      coalesce(r.reached, 0)::int AS reached, coalesce(r.at_terminal, false) AS at_terminal,
      t.path_length::int AS path_length
    FROM unnest(${enrollmentIds}::uuid[]) AS i(id)
    CROSS JOIN LATERAL (
      SELECT (count(*) FILTER (WHERE g.stage_type NOT IN ('BRANCH', 'FOLLOW_UP'))
        + count(DISTINCT g.parent_stage_id) FILTER (WHERE g.stage_type = 'BRANCH')) AS path_length
      FROM pathways.journey_stages g
      WHERE g.organization_id = ${org}::uuid AND g.project_id = ${projectId}::uuid
        AND g.archived_at IS NULL) t
    LEFT JOIN LATERAL (
      SELECT x.activity_id, a.title, x.participation_date
      FROM pathways.beneficiary_activity_participations x
      JOIN pathways.project_activities a ON a.id = x.activity_id
      WHERE x.organization_id = ${org}::uuid AND x.enrollment_id = i.id
        AND x.project_id = ${projectId}::uuid
      ORDER BY x.participation_date DESC, x.recorded_at DESC LIMIT 1) p ON true
    LEFT JOIN LATERAL (
      SELECT g.code, g.name FROM pathways.journey_stages g
      WHERE g.organization_id = ${org}::uuid AND g.project_id = ${projectId}::uuid
        AND g.archived_at IS NULL
      ORDER BY (EXISTS (SELECT 1 FROM pathways.activity_journey_stage_mappings m
        WHERE m.organization_id = ${org}::uuid AND m.project_id = ${projectId}::uuid
          AND m.stage_id = g.id AND m.activity_id = p.activity_id)) DESC, g.stage_order
      LIMIT 1) s ON true
    LEFT JOIN LATERAL (
      SELECT count(DISTINCT e.stage_id) FILTER (WHERE g.stage_type NOT IN ('ENTRY', 'FOLLOW_UP')) AS reached,
        coalesce(bool_or(g.is_terminal), false) AS at_terminal
      FROM pathways.beneficiary_journey_events e
      JOIN pathways.journey_stages g ON g.id = e.stage_id AND g.archived_at IS NULL
      WHERE e.organization_id = ${org}::uuid AND e.enrollment_id = i.id
        AND e.project_id = ${projectId}::uuid AND e.corrects_event_id IS NULL) r ON true`
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
