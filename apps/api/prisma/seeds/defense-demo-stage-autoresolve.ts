import { demoActivities, demoProjects } from './local-demo-data'
import type { DemoContext } from './local-demo-seed'
import { activityCode, applyOutcome } from './local-demo-stage-activities'
import { projectOf, step } from './local-demo-util'

type RuleRow = { id: string; code: string }
type AlertRow = { id: string; ruleId: string; lifecycle: string }

const openStates = ['NEW', 'REVIEWED', 'ACTIONED']

/** Completes the one overdue Northern Samar activity late, through the real services, so the
 * open "activity past its end date" alert closes itself on the next rule evaluation. The two
 * overdue Eastern Samar activities stay open, so the delays alert there remains valid. */
export async function stageAutoResolve(ctx: DemoContext) {
  const rules = ctx.services.rules
  const admin = ctx.staff.admin.identity
  const project = demoProjects.find((p) => p.key === 'CRL') as (typeof demoProjects)[number]
  const projectId = projectOf(ctx, 'CRL')
  const listed = (await rules.listRules(admin, {
    projectId,
    kind: 'PROJECT',
    limit: '100',
  })) as unknown as { items: RuleRow[] }
  const rule = listed.items.find((row) => row.code === 'ACTIVITY_OVERDUE_ANY')
  const alertOf = async () =>
    (
      (await rules.listAlerts(admin, { limit: '100' })) as unknown as { items: AlertRow[] }
    ).items.find((row) => row.ruleId === rule?.id)
  const alert = await alertOf()
  if (!alert || !openStates.includes(alert.lifecycle)) {
    ctx.log('  auto-resolve skipped: no open overdue alert (rule evaluation did not run)')
    return
  }
  const plan = demoActivities.CRL.find((entry) => entry.key === 'coordination')
  if (!plan) throw new Error('The CRL coordination activity is missing from the dataset.')
  const code = activityCode(project, demoActivities.CRL.indexOf(plan))
  const activity = await ctx.owner.projectActivity.findFirstOrThrow({
    where: { projectId, code },
    select: { id: true, status: true },
  })
  if (activity.status !== 'COMPLETED')
    await step('late completion', () =>
      applyOutcome(
        ctx,
        project,
        {
          ...plan,
          outcome: 'COMPLETED_LATE',
          progress: 100,
          category: 'COMMUNITY',
          explanation:
            'The provincial agriculture office moved the meeting twice because of the harvest season; it was held after the planned date.',
          note: 'Meeting held with the provincial agriculture office; technical support and market linkages agreed.',
          reviewNote: 'Signed minutes and the attendance sheet match the agreed meeting.',
          reached: 2,
        },
        code,
        projectId,
        activity.id,
        7,
      ),
    )
  await ctx.drainRules()
  const after = await alertOf()
  ctx.log(`  overdue alert is now ${after?.lifecycle ?? 'missing'}`)
}
