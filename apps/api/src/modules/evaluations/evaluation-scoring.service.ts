import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common'
import type { ApplicationIdentity } from '../../common/authz/application-identity'
import type { Tx } from '../../common/prisma/transaction'
import type { EvaluationMetricsService } from './evaluation-metrics.service'
import { day } from './evaluations.helpers'

// Computes and stores one score per published criterion from the project's own data; the
// database fills the snapshot, maximum and weighted score. Shared by start, recompute and submit.
export async function scoreRound(
  metrics: EvaluationMetricsService,
  tx: Tx,
  actor: ApplicationIdentity,
  projectId: string,
  evaluationId: string,
  period: { start: Date; end: Date },
) {
  const scope = { organizationId: actor.organizationId, projectId }
  const project = await tx.project.findFirst({
    where: { organizationId: actor.organizationId, id: projectId },
    select: { id: true, targetBeneficiaries: true },
  })
  if (!project) throw new NotFoundException('Project unavailable.')
  const criteria = await tx.projectEvaluationCriterion.findMany({
    where: { ...scope, status: 'PUBLISHED' },
    select: { id: true, type: true, maximumScore: true },
  })
  if (criteria.length === 0)
    throw new ConflictException('The evaluation criteria are not ready for this project.')
  const computed = await metrics.computeMany(
    tx,
    actor,
    project,
    { start: day(period.start), end: day(period.end) },
    criteria.map((row) => ({ ...row, maximumScore: row.maximumScore.toString() })),
  )
  for (const row of criteria) {
    const result = computed.get(row.id)
    if (!result) throw new BadRequestException('Criterion is unavailable.')
    await tx.projectEvaluationScore.upsert({
      where: {
        organizationId_projectId_evaluationId_criterionId: {
          ...scope,
          evaluationId,
          criterionId: row.id,
        },
      },
      update: { score: result.score, commentary: result.commentary },
      create: {
        ...scope,
        evaluationId,
        criterionId: row.id,
        score: result.score,
        maximumScore: row.maximumScore,
        weightedScore: 0,
        criterionSnapshot: {},
        commentary: result.commentary,
      },
    })
  }
  return criteria.length
}
