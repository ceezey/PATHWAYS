import { Prisma } from '@prisma/client'
import type { ApplicationIdentity } from '../auth/developer-access'
import type { CriterionType } from './evaluation-metrics'

type Tx = Prisma.TransactionClient

/** Fixed default OECD-DAC set every project is evaluated against; weights total 100. */
export const defaultCriteria: ReadonlyArray<{
  code: string
  name: string
  description: string
  type: CriterionType
  weight: number
}> = [
  {
    code: 'RELEVANCE',
    name: 'Relevance',
    description: 'Beneficiaries reached against the project target.',
    type: 'BENEFICIARY_REACH',
    weight: 15,
  },
  {
    code: 'COHERENCE',
    name: 'Coherence',
    description: 'Share of activities linked to at least one indicator.',
    type: 'INDICATOR_LINKAGE',
    weight: 10,
  },
  {
    code: 'EFFECTIVENESS',
    name: 'Effectiveness',
    description: 'Mean indicator achievement against target.',
    type: 'KPI',
    weight: 25,
  },
  {
    code: 'EFFICIENCY',
    name: 'Efficiency',
    description: 'Activities due by the period end that are completed.',
    type: 'TIMELINE_COMPLIANCE',
    weight: 20,
  },
  {
    code: 'IMPACT',
    name: 'Impact',
    description: 'Share of paired pre/post assessments that improved.',
    type: 'ASSESSMENT_GAIN',
    weight: 15,
  },
  {
    code: 'SUSTAINABILITY',
    name: 'Sustainability',
    description: 'Mean indicator achievement against target.',
    type: 'KPI',
    weight: 15,
  },
]
const maximumScore = 100

/**
 * Makes the project's live criteria exactly the default set, published. Idempotent and safe for any
 * evaluations.weights.configure holder: a matching set is left alone, anything else (a legacy
 * draft or published set) is archived and replaced under a per-project lock. Callers must have
 * confirmed that no evaluation round is open, because closed rounds keep their own snapshot.
 */
export async function provisionCriteria(
  tx: Tx,
  actor: ApplicationIdentity,
  projectId: string,
): Promise<void> {
  const scope = { organizationId: actor.organizationId, projectId }
  await tx.$queryRaw`SELECT 1::integer AS locked FROM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(${`pathways:criterion-initialize:${actor.organizationId}:${projectId}`},0))`
  const rows = await tx.projectEvaluationCriterion.findMany({
    where: scope,
    select: {
      id: true,
      code: true,
      version: true,
      type: true,
      status: true,
      archivedAt: true,
      weightPercentage: true,
      maximumScore: true,
    },
    take: 1000,
  })
  const live = rows.filter((row) => !row.archivedAt)
  const matches =
    live.length === defaultCriteria.length &&
    defaultCriteria.every((want) =>
      live.some(
        (row) =>
          row.status === 'PUBLISHED' &&
          row.code === want.code &&
          row.type === want.type &&
          row.weightPercentage.equals(want.weight) &&
          row.maximumScore.equals(maximumScore),
      ),
    )
  if (matches) return
  const now = new Date()
  // A draft cannot be archived directly (draft -> published -> archived is the only guarded path).
  for (const row of live) {
    if (row.status === 'DRAFT')
      await tx.projectEvaluationCriterion.update({
        where: { id: row.id },
        data: { status: 'PUBLISHED', publishedById: actor.userId, publishedAt: now },
      })
    await tx.projectEvaluationCriterion.update({
      where: { id: row.id },
      data: { status: 'ARCHIVED', archivedAt: new Date() },
    })
  }
  const created: string[] = []
  for (const want of defaultCriteria) {
    const version =
      Math.max(0, ...rows.filter((row) => row.code === want.code).map((r) => r.version)) + 1
    const { id } = await tx.projectEvaluationCriterion.create({
      data: {
        ...scope,
        createdById: actor.userId,
        code: want.code,
        name: want.name,
        description: want.description,
        type: want.type,
        version,
        status: 'DRAFT',
        weightPercentage: new Prisma.Decimal(want.weight),
        maximumScore: new Prisma.Decimal(maximumScore),
      },
      select: { id: true },
    })
    // Published in the same transaction: the guard only lets a criterion begin as a draft.
    await tx.projectEvaluationCriterion.update({
      where: { id },
      data: { status: 'PUBLISHED', publishedById: actor.userId, publishedAt: new Date() },
    })
    created.push(id)
  }
  await tx.auditLog.create({
    data: {
      organizationId: actor.organizationId,
      projectId,
      actorUserId: actor.userId,
      action: 'EVALUATION_CRITERIA_PROVISIONED',
      entityType: 'ProjectEvaluationCriterion',
      entityId: projectId,
      changes: { retired: live.map((row) => row.id), criterionIds: created },
    },
  })
}
