import { addDaysIso } from './local-demo-data'
import type { DemoContext } from './local-demo-seed'
import { projectOf, step } from './local-demo-util'

/** OECD-DAC criteria; PATHWAYS supplies the evidence and the evaluator supplies the score. */
const criteria = [
  {
    code: 'RELEVANCE',
    name: 'Relevance',
    description:
      'Kits matched the needs recorded in beneficiary profiles; evaluator judgment on fit to the post-disaster context.',
    type: 'OTHER',
    weightPercentage: 15,
    score: 92,
  },
  {
    code: 'COHERENCE',
    name: 'Coherence',
    description:
      'Distribution aligned with partner and school activities on the project timeline; evaluator judgment.',
    type: 'OTHER',
    weightPercentage: 10,
    score: 85,
  },
  {
    code: 'EFFECTIVENESS',
    name: 'Effectiveness',
    description:
      'Families reached against the EHK-FAMILIES target from indicator readings; evaluator judgment on results.',
    type: 'BENEFICIARY_REACH',
    weightPercentage: 25,
    score: 99,
  },
  {
    code: 'EFFICIENCY',
    name: 'Efficiency',
    description:
      'Approved expenses against the planned budget and activities completed on schedule; evaluator judgment.',
    type: 'BUDGET_EFFICIENCY',
    weightPercentage: 20,
    score: 90,
  },
  {
    code: 'IMPACT',
    name: 'Impact',
    description:
      'Participation and SADDD results after project end; evaluator judgment on wider effects for families.',
    type: 'OTHER',
    weightPercentage: 15,
    score: 80,
  },
  {
    code: 'SUSTAINABILITY',
    name: 'Sustainability',
    description:
      'Hand-over of hygiene practice to schools after close; evaluator judgment, not measured by the system.',
    type: 'OTHER',
    weightPercentage: 15,
    score: 70,
  },
] as const

/** Evaluation lifecycle times, in days before the run date, inside the 45 days since EHK ended. */
const evaluatedDaysAgo = 42
const reviewedDaysAgo = 38
const signedOffDaysAgo = 35

/** Final evaluation of the completed kit project. There is no application write path for
 * evaluation records yet, so they are written on the owner connection, in lifecycle order with
 * three distinct actors: evaluated by Monitoring and Evaluation, reviewed by the Project Manager
 * and signed off by the Program Manager. */
export async function stageProjectEvaluation(ctx: DemoContext) {
  const projectId = projectOf(ctx, 'EHK')
  const scope = { organizationId: ctx.organizationId, projectId }
  if (await ctx.owner.projectEvaluation.findFirst({ where: scope, select: { id: true } })) {
    ctx.log('  project evaluation already present')
    return
  }
  const admin = ctx.staff.admin
  const existing = await ctx.owner.projectEvaluationCriterion.count({ where: scope })
  if (existing === 0)
    await step('EHK criteria', () =>
      ctx.services.evaluations.initializeCriteria(admin.identity, projectId, {
        clientRequestId: ctx.stable('criteria:EHK'),
        criteria: criteria.map((row) => ({
          code: row.code,
          name: row.name,
          description: row.description,
          type: row.type,
          weightPercentage: row.weightPercentage,
          maximumScore: 100,
        })),
      }),
    )
  // A draft criterion may be published once, after which its definition is immutable.
  await ctx.owner.projectEvaluationCriterion.updateMany({
    where: { ...scope, status: 'DRAFT' },
    data: {
      status: 'PUBLISHED',
      publishedById: admin.userId,
      publishedAt: new Date(`${addDaysIso(ctx.today, -evaluatedDaysAgo - 1)}T02:00:00.000Z`),
    },
  })
  const project = await ctx.owner.project.findUniqueOrThrow({
    where: { id: projectId },
    select: { startDate: true, endDate: true },
  })
  const evaluation = await ctx.owner.projectEvaluation.create({
    data: {
      ...scope,
      title: 'Final evaluation (OECD-DAC criteria)',
      periodLabel: 'Full project period',
      periodStart: project.startDate as Date,
      periodEnd: project.endDate as Date,
      commentary:
        'Strong relevance, effectiveness and efficiency: kits reached nearly every targeted family on schedule and spending closed under budget. Sustainability rests on school hand-over and needs follow-up.',
      evaluatedById: ctx.staff.me.userId,
    },
  })
  const published = await ctx.owner.projectEvaluationCriterion.findMany({
    where: { ...scope, status: 'PUBLISHED' },
    select: { id: true, code: true },
  })
  for (const row of criteria) {
    const criterion = published.find((entry) => entry.code === row.code)
    if (!criterion) throw new Error(`Criterion ${row.code} is not published.`)
    // Maximum, weighted score and the criterion snapshot are filled in by the database guard.
    await ctx.owner.projectEvaluationScore.create({
      data: {
        ...scope,
        evaluationId: evaluation.id,
        criterionId: criterion.id,
        score: row.score,
        maximumScore: 100,
        weightedScore: 0,
        criterionSnapshot: {},
      },
    })
  }
  const at = (daysAgo: number) => new Date(`${addDaysIso(ctx.today, -daysAgo)}T02:00:00.000Z`)
  await ctx.owner.projectEvaluation.update({
    where: { id: evaluation.id },
    data: { status: 'SUBMITTED', evaluatedAt: at(evaluatedDaysAgo) },
  })
  await ctx.owner.projectEvaluation.update({
    where: { id: evaluation.id },
    data: {
      status: 'REVIEWED',
      reviewedById: ctx.staff.projectManager.userId,
      reviewedAt: at(reviewedDaysAgo),
      reviewFeedback: 'Scores agree with the distribution records and the cleared expenses.',
    },
  })
  await ctx.owner.projectEvaluation.update({
    where: { id: evaluation.id },
    data: {
      status: 'SIGNED_OFF',
      signedOffById: ctx.staff.programManager.userId,
      signedOffAt: at(signedOffDaysAgo),
    },
  })
  ctx.log('  EHK evaluation signed off')
}
