import {
  type DemoProject,
  type ProjectKey,
  addDaysIso,
  demoActivities,
  demoMilestones,
  demoProjects,
} from './local-demo-data'
import type { DemoContext } from './local-demo-seed'
import { activityCode } from './local-demo-stage-activities'
import { projectOf } from './local-demo-util'

const projectByKey = (key: ProjectKey) => demoProjects.find((p) => p.key === key) as DemoProject

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

type Pair = { pre: number; post: number }

const scorePairs: Record<string, Pair[]> = {
  // Life skills knowledge check, first activity group: mostly improved, one same, one declined.
  'SSG:lifeskills': [
    { pre: 42, post: 68 },
    { pre: 55, post: 74 },
    { pre: 38, post: 61 },
    { pre: 60, post: 60 },
    { pre: 47, post: 72 },
    { pre: 51, post: 77 },
    { pre: 66, post: 63 },
    { pre: 35, post: 58 },
  ],
  'SSG:returnedproof': [
    { pre: 49, post: 70 },
    { pre: 57, post: 79 },
    { pre: 44, post: 66 },
    { pre: 62, post: 81 },
    { pre: 53, post: 69 },
    { pre: 40, post: 40 },
  ],
  // ALS: a full group and a group of three, which the survey view withholds as a small cell.
  'ALS:sessions': [
    { pre: 45, post: 72 },
    { pre: 52, post: 80 },
    { pre: 38, post: 65 },
    { pre: 60, post: 78 },
    { pre: 48, post: 71 },
    { pre: 55, post: 55 },
    { pre: 41, post: 69 },
    { pre: 63, post: 84 },
    { pre: 50, post: 67 },
    { pre: 46, post: 74 },
    { pre: 58, post: 76 },
    { pre: 44, post: 70 },
  ],
  'ALS:reviewclass': [
    { pre: 61, post: 82 },
    { pre: 54, post: 73 },
    { pre: 49, post: 68 },
  ],
}

/** Pre and post test scores. There is no application write path for assessment results yet, so
 * they are written on the owner connection against real enrollments. Some learners have only a
 * pre-test, so unpaired records are also visible. */
export async function stageAssessments(ctx: DemoContext) {
  const existing = await ctx.owner.assessmentResult.count({
    where: { organizationId: ctx.organizationId },
  })
  if (existing > 0) {
    ctx.log('  assessments already present')
    return
  }
  let written = 0
  for (const projectKey of ['SSG', 'ALS'] as const) {
    const project = projectByKey(projectKey)
    const projectId = projectOf(ctx, projectKey)
    const enrollments = await ctx.owner.beneficiaryProjectEnrollment.findMany({
      where: { organizationId: ctx.organizationId, projectId, status: 'ACTIVE' },
      orderBy: { enrollmentDate: 'asc' },
      select: { id: true },
    })
    let cursor = 0
    for (const [groupKey, pairs] of Object.entries(scorePairs)) {
      const [key, activityKey] = groupKey.split(':')
      if (key !== projectKey) continue
      const index = demoActivities[project.key].findIndex((a) => a.key === activityKey)
      const activity = await ctx.owner.projectActivity.findFirstOrThrow({
        where: { projectId, code: activityCode(project, index) },
        select: { id: true },
      })
      for (const pair of pairs) {
        const enrollment = enrollments[cursor % enrollments.length]
        cursor += 1
        for (const [type, score, offset] of [
          ['PRE_TEST', pair.pre, -75],
          ['POST_TEST', pair.post, -12],
        ] as const) {
          await ctx.owner.assessmentResult.create({
            data: {
              organizationId: ctx.organizationId,
              projectId,
              activityId: activity.id,
              enrollmentId: enrollment.id,
              type,
              score,
              maximumScore: 100,
              assessmentDate: new Date(`${addDaysIso(ctx.today, offset)}T00:00:00.000Z`),
              recordedById: ctx.staff.me.userId,
            },
          })
          written += 1
        }
      }
    }
    // Learners assessed once only (no post-test yet).
    for (const enrollment of enrollments.slice(cursor, cursor + 3)) {
      await ctx.owner.assessmentResult.create({
        data: {
          organizationId: ctx.organizationId,
          projectId,
          enrollmentId: enrollment.id,
          type: 'PRE_TEST',
          score: 48,
          maximumScore: 100,
          assessmentDate: new Date(`${addDaysIso(ctx.today, -20)}T00:00:00.000Z`),
          recordedById: ctx.staff.me.userId,
        },
      })
      written += 1
    }
  }
  ctx.log(`  assessment results written: ${written}`)
}
