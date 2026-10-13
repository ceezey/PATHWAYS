import { NotFoundException } from '@nestjs/common'
import type { ApplicationIdentity } from '../../common/authz/application-identity'
import type { Tx } from '../../common/prisma/transaction'
import { projectIdSchema } from './evaluations.helpers'
import {
  type EvaluationDetailRow,
  evaluationDetailSelect,
  mapEvaluationDetail,
  scoreDetailSelect,
} from './evaluations.mapper'

// Loads the workflow fields of one evaluation in the project, or answers 404.
export async function requireEvaluation(
  tx: Tx,
  actor: ApplicationIdentity,
  projectId: string,
  evaluationId: string,
) {
  const parsed = projectIdSchema.safeParse(evaluationId)
  if (!parsed.success) throw new NotFoundException('Evaluation unavailable.')
  const row = await tx.projectEvaluation.findFirst({
    where: { organizationId: actor.organizationId, projectId, id: parsed.data },
    select: {
      id: true,
      status: true,
      updatedAt: true,
      evaluatedById: true,
      periodStart: true,
      periodEnd: true,
    },
  })
  if (!row) throw new NotFoundException('Evaluation unavailable.')
  return row
}

// Reads every given evaluation's scores in one query and groups them in memory.
export async function withScores(
  tx: Tx,
  actor: ApplicationIdentity,
  projectId: string,
  rows: EvaluationDetailRow[],
) {
  if (rows.length === 0) return []
  const scores = await tx.projectEvaluationScore.findMany({
    where: {
      organizationId: actor.organizationId,
      projectId,
      evaluationId: { in: rows.map((row) => row.id) },
    },
    select: scoreDetailSelect,
    orderBy: [{ evaluationId: 'asc' }, { criterionId: 'asc' }],
    take: rows.length * 100,
  })
  return rows.map((row) =>
    mapEvaluationDetail(
      row,
      scores.filter((score) => score.evaluationId === row.id),
    ),
  )
}

// Reads one evaluation with its scores as the routes return it, or answers 404.
export async function readDetail(
  tx: Tx,
  actor: ApplicationIdentity,
  projectId: string,
  evaluationId: string,
) {
  const evaluation = await tx.projectEvaluation.findFirst({
    where: { organizationId: actor.organizationId, projectId, id: evaluationId },
    select: evaluationDetailSelect,
  })
  if (!evaluation) throw new NotFoundException('Evaluation unavailable.')
  const [detail] = await withScores(tx, actor, projectId, [evaluation])
  return detail as NonNullable<typeof detail>
}
