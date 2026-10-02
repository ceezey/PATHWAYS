import type { ProjectKey } from './local-demo-data'
import type { DemoContext } from './local-demo-seed'
import { projectOf, step } from './local-demo-util'

const criteriaByProject: Partial<
  Record<
    ProjectKey,
    Array<{
      code: string
      name: string
      description: string
      type: 'KPI' | 'TIMELINE_COMPLIANCE' | 'BUDGET_EFFICIENCY' | 'BENEFICIARY_REACH' | 'OTHER'
      weightPercentage: number
    }>
  >
> = {
  SSG: [
    {
      code: 'REACH',
      name: 'Girls reached against target',
      description: 'Share of the girls target reached by school protection activities.',
      type: 'BENEFICIARY_REACH',
      weightPercentage: 30,
    },
    {
      code: 'TIMELINE',
      name: 'Timeline compliance',
      description: 'Activities completed on or before their planned end dates.',
      type: 'TIMELINE_COMPLIANCE',
      weightPercentage: 25,
    },
    {
      code: 'BUDGET',
      name: 'Budget utilization',
      description: 'Approved expenses against the planned budget for the period.',
      type: 'BUDGET_EFFICIENCY',
      weightPercentage: 20,
    },
    {
      code: 'ATTENDANCE',
      name: 'Regular school attendance of girls',
      description: 'Attendance indicator progress against its target.',
      type: 'KPI',
      weightPercentage: 25,
    },
  ],
  ALS: [
    {
      code: 'ENROLMENT',
      name: 'Learner enrollment against target',
      description: 'Learners enrolled in community learning centers.',
      type: 'BENEFICIARY_REACH',
      weightPercentage: 40,
    },
    {
      code: 'COMPLETION',
      name: 'Module completion rate',
      description: 'Learners completing the module set.',
      type: 'KPI',
      weightPercentage: 35,
    },
    {
      code: 'TIMELINE',
      name: 'Timeline compliance',
      description: 'Activities completed on schedule.',
      type: 'TIMELINE_COMPLIANCE',
      weightPercentage: 25,
    },
  ],
}

/** Draft evaluation criteria with weights totalling 100 percent, initialized by the System
 * Administrator. */
export async function stageCriteria(ctx: DemoContext) {
  const admin = ctx.staff.admin.identity
  let count = 0
  for (const [key, criteria] of Object.entries(criteriaByProject) as Array<
    [ProjectKey, NonNullable<(typeof criteriaByProject)[ProjectKey]>]
  >) {
    const projectId = projectOf(ctx, key)
    const current = (await ctx.services.evaluations.get(admin, projectId)) as unknown as {
      criteria: unknown[]
    }
    if (current.criteria.length > 0) continue
    await step(`criteria ${key}`, () =>
      ctx.services.evaluations.initializeCriteria(admin, projectId, {
        clientRequestId: ctx.stable(`criteria:${key}`),
        criteria: criteria.map((row) => ({ ...row, maximumScore: 100 })),
      }),
    )
    count += 1
  }
  ctx.log(`  evaluation criteria sets initialized: ${count}`)
}
