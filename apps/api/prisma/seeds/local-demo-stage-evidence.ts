import { addDaysIso, demoMilestones } from './local-demo-data'
import type { DemoContext } from './local-demo-seed'
import { projectOf } from './local-demo-util'

/** Milestones have no application write path yet (no role holds milestones.manage), so they are
 * written on the owner connection with their creation audit row, like programs. */
export async function stageMilestones(ctx: DemoContext) {
  let created = 0
  for (const plan of demoMilestones) {
    const projectId = projectOf(ctx, plan.project)
    const existing = await ctx.owner.projectMilestone.findFirst({
      where: { organizationId: ctx.organizationId, projectId, title: plan.title },
      select: { id: true },
    })
    if (existing) continue
    const row = await ctx.owner.projectMilestone.create({
      data: {
        organizationId: ctx.organizationId,
        projectId,
        title: plan.title,
        description: plan.description,
        targetDate: new Date(`${addDaysIso(ctx.today, plan.targetOffset)}T00:00:00.000Z`),
        completionDate:
          plan.completedOffset === undefined
            ? null
            : new Date(`${addDaysIso(ctx.today, plan.completedOffset)}T00:00:00.000Z`),
        status: plan.completedOffset === undefined ? 'PENDING' : 'COMPLETED',
      },
    })
    await ctx.owner.auditLog.create({
      data: {
        organizationId: ctx.organizationId,
        actorUserId: ctx.staff.projectManager.userId,
        projectId,
        action: 'MILESTONE_CREATED',
        entityType: 'ProjectMilestone',
        entityId: row.id,
      },
    })
    created += 1
  }
  ctx.log(`  milestones created: ${created}`)
}
