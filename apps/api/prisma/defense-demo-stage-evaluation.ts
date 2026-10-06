import { addDaysIso } from './local-demo-data'
import type { DemoContext } from './local-demo-seed'
import { projectOf, step } from './local-demo-util'

/** Evaluation lifecycle times, in days before the run date, inside the 45 days since EHK ended. */
const evaluatedDaysAgo = 42
const reviewedDaysAgo = 38
const signedOffDaysAgo = 35

/** Final evaluation of the completed kit project. Monitoring and Evaluation starts the round through
 * the application, which provisions the default OECD-DAC criteria and computes every score from the
 * project data; review and sign-off are then written in lifecycle order on the owner connection with
 * three distinct actors: evaluated by Monitoring and Evaluation, reviewed by the Project Manager and
 * signed off by the Program Manager. */
export async function stageProjectEvaluation(ctx: DemoContext) {
  const projectId = projectOf(ctx, 'EHK')
  const scope = { organizationId: ctx.organizationId, projectId }
  if (await ctx.owner.projectEvaluation.findFirst({ where: scope, select: { id: true } })) {
    ctx.log('  project evaluation already present')
    return
  }
  const project = await ctx.owner.project.findUniqueOrThrow({
    where: { id: projectId },
    select: { startDate: true, endDate: true },
  })
  const day = (value: Date | null) => (value as Date).toISOString().slice(0, 10)
  const started = await step('EHK evaluation', () =>
    ctx.services.evaluations.createEvaluation(ctx.staff.me.identity, projectId, {
      clientRequestId: ctx.stable('evaluation:EHK'),
      title: 'Final evaluation (OECD-DAC criteria)',
      periodLabel: 'Full project period',
      periodStart: day(project.startDate),
      periodEnd: day(project.endDate),
    }),
  )
  await step('EHK evaluation narrative', () =>
    ctx.services.evaluations.saveScores(ctx.staff.me.identity, projectId, started.id, {
      expectedUpdatedAt: started.updatedAt,
      commentary:
        'Scores are computed from the project record: beneficiary reach, indicator achievement, activity delivery, indicator linkage and assessment gain. Criteria without data score zero and are labeled.',
    }),
  )
  const evaluation = { id: started.id }
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
