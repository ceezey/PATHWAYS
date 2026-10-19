import { addDaysIso } from './local-demo-data'
import type { DemoContext } from './local-demo-seed'
import { projectOf, step } from './local-demo-util'

/** Projects that get an evaluation round in progress; criteria are provisioned by the application. */
const evaluatedProjects = ['SSG', 'ALS'] as const

/** One draft mid-term round per project, started by Monitoring and Evaluation so the default
 * criteria are provisioned and every score is computed from the project data. */
export async function stageCriteria(ctx: DemoContext) {
  let count = 0
  for (const key of evaluatedProjects) {
    const projectId = projectOf(ctx, key)
    const current = await ctx.owner.projectEvaluation.count({
      where: { organizationId: ctx.organizationId, projectId },
    })
    if (current > 0) continue
    const project = await ctx.owner.project.findUniqueOrThrow({
      where: { id: projectId },
      select: { startDate: true, endDate: true },
    })
    const start = project.startDate?.toISOString().slice(0, 10) ?? addDaysIso(ctx.today, -180)
    const end = project.endDate?.toISOString().slice(0, 10)
    await step(`evaluation ${key}`, () =>
      ctx.services.evaluations.createEvaluation(ctx.staff.me.identity, projectId, {
        clientRequestId: ctx.stable(`evaluation:${key}`),
        title: 'Mid-term evaluation',
        periodStart: start,
        periodEnd: end && end < ctx.today ? end : ctx.today,
      }),
    )
    count += 1
  }
  ctx.log(`  evaluation rounds started: ${count}`)
}
