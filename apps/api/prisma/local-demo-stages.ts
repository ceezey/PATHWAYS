import type { CreateProjectDto } from '../src/modules/projects/projects.dto'
import { stageAutoResolve } from './defense-demo-stage-autoresolve'
import { stageBackdate } from './defense-demo-stage-backdate'
import { stageProjectEvaluation } from './defense-demo-stage-evaluation'
import { stageMonitoring } from './defense-demo-stage-monitoring'
import { stageDefenseParticipation } from './defense-demo-stage-participation'
import { stageSurvey } from './defense-demo-stage-survey'
import { type DemoProject, addDaysIso, demoPrograms, demoProjects } from './local-demo-data'
import type { DemoContext } from './local-demo-seed'
import { stageActivities } from './local-demo-stage-activities'
import { stageCriteria } from './local-demo-stage-criteria'
import { stageDecisions } from './local-demo-stage-decisions'
import { stageAssessments, stageMilestones } from './local-demo-stage-evidence'
import { stageBudgets, stageExpenses } from './local-demo-stage-finance'
import { stageJourneysAndForms, stageParticipation } from './local-demo-stage-forms'
import { stageImports } from './local-demo-stage-imports'
import { stageJourneyRecords } from './local-demo-stage-journeys'
import { stageEnrollmentOutcomes } from './local-demo-stage-outcomes'
import { stageBeneficiaries, stageIndicators } from './local-demo-stage-people'
import { stagePublishing } from './local-demo-stage-publishing'
import { stageReports } from './local-demo-stage-reports'
import { stageEvaluation, stageRules } from './local-demo-stage-rules'
import { message, projectOf, slowLinkTx } from './local-demo-util'

type Stage = { name: string; run: (ctx: DemoContext) => Promise<void> }

async function stagePrograms(ctx: DemoContext) {
  const managerId = ctx.staff.programManager.userId
  for (const plan of demoPrograms) {
    const existing = await ctx.owner.program.findFirst({
      where: { organizationId: ctx.organizationId, code: plan.code },
    })
    const row =
      existing ??
      (await ctx.owner.program.create({
        data: {
          organizationId: ctx.organizationId,
          code: plan.code,
          name: plan.name,
          description: plan.description,
          managerUserId: managerId,
          startDate: new Date('2026-01-01T00:00:00.000Z'),
          endDate: new Date('2028-12-31T00:00:00.000Z'),
          status: 'ONGOING',
        },
      }))
    ctx.programIds.set(plan.code, row.id)
  }
  const base = await ctx.owner.program.findFirstOrThrow({
    where: { organizationId: ctx.organizationId, code: 'EDU-2026' },
  })
  ctx.programIds.set('EDU-2026', base.id)
}

function projectDto(ctx: DemoContext, plan: DemoProject): CreateProjectDto {
  const officers = plan.officers.map((name) => ctx.staff[name].userId)
  return {
    code: plan.code,
    title: plan.title,
    description: plan.description,
    objectives: plan.objectives,
    implementationArea: plan.implementationArea,
    implementingPartnerNames: plan.partners,
    sector: plan.sector,
    targetBeneficiaries: plan.targetBeneficiaries,
    projectBudget: plan.projectBudget,
    programManagerId: ctx.staff.programManager.userId,
    projectManagerId: ctx.staff.projectManager.userId,
    monitoringOfficerId: ctx.staff.me.userId,
    projectOfficerIds: officers,
    startDate: addDaysIso(ctx.today, plan.startOffset),
    endDate: addDaysIso(ctx.today, plan.endOffset),
    status: plan.status,
    programId: ctx.programIds.get(plan.programCode),
  } as CreateProjectDto
}

async function stageProjects(ctx: DemoContext) {
  for (const plan of demoProjects) {
    const existing = await ctx.owner.project.findFirst({
      where: { organizationId: ctx.organizationId, code: plan.code },
      select: { id: true },
    })
    if (existing) {
      ctx.projectIds.set(plan.key, existing.id)
      continue
    }
    if (plan.key === 'SSG')
      throw new Error('The base project SSG-ES-2026 is missing. Run pnpm db:local:reset.')
    const created = (await ctx.services.projects.create(
      ctx.staff.projectManager.identity,
      projectDto(ctx, plan),
    )) as { id: string }
    ctx.projectIds.set(plan.key, created.id)
  }
  ctx.log(`  projects: ${ctx.projectIds.size}`)
}

/** Team assignments that the project form does not cover: the Grant Manager and a second
 * Project Officer on the base project. Administrator authority (assignments.manage), written on
 * the runtime role with the verified identity, like the base seed. */
async function stageTeam(ctx: DemoContext) {
  const admin = ctx.staff.admin
  await ctx.runtime.$transaction(async (tx) => {
    await tx.$queryRaw`
      SELECT set_config('request.jwt.claim.sub', ${admin.authUserId}, true),
        set_config('request.jwt.claims', '', true),
        set_config('app.organization_id', ${ctx.organizationId}, true),
        set_config('app.user_id', ${admin.userId}, true)`
    for (const plan of demoProjects) {
      const projectId = projectOf(ctx, plan.key)
      const wanted = [ctx.staff.grantManager.userId]
      if (plan.key === 'SSG') wanted.push(ctx.staff.emmanuel.userId)
      for (const userId of wanted) {
        const current = await tx.userProjectAssignment.findFirst({
          where: { projectId, userId, status: 'ACTIVE' },
        })
        if (!current)
          await tx.userProjectAssignment.create({
            data: {
              organizationId: ctx.organizationId,
              projectId,
              userId,
              assignedById: admin.userId,
            },
          })
      }
    }
  }, slowLinkTx)
}

const stages: Stage[] = [
  { name: 'programs', run: stagePrograms },
  { name: 'projects', run: stageProjects },
  { name: 'team', run: stageTeam },
  { name: 'activities', run: stageActivities },
  { name: 'indicators', run: stageIndicators },
  { name: 'monitoring', run: stageMonitoring },
  { name: 'beneficiaries', run: stageBeneficiaries },
  { name: 'journeys and forms', run: stageJourneysAndForms },
  { name: 'participation', run: stageParticipation },
  { name: 'imports', run: stageImports },
  { name: 'budgets', run: stageBudgets },
  { name: 'expenses', run: stageExpenses },
  { name: 'milestones', run: stageMilestones },
  { name: 'journey outcomes', run: stageEnrollmentOutcomes },
  { name: 'assessments', run: stageAssessments },
  { name: 'survey', run: stageSurvey },
  { name: 'follow-up participation', run: stageDefenseParticipation },
  { name: 'journey records', run: stageJourneyRecords },
  { name: 'rules', run: stageRules },
  { name: 'evaluation', run: stageEvaluation },
  { name: 'decisions', run: stageDecisions },
  { name: 'auto-resolve', run: stageAutoResolve },
  { name: 'public tracker', run: stagePublishing },
  { name: 'project evaluation', run: stageProjectEvaluation },
  { name: 'reports', run: stageReports },
  { name: 'evaluation criteria', run: stageCriteria },
  { name: 'backdate', run: stageBackdate },
]

const foundation = new Set(['programs', 'projects', 'team'])

export async function runDemoStages(ctx: DemoContext) {
  const failures: string[] = []
  // Development aid: PATHWAYS_DEMO_ONLY="indicators,rules" reruns just those stages after the
  // three foundation stages. Normal runs execute every stage.
  const only = process.env.PATHWAYS_DEMO_ONLY?.split(',').map((name) => name.trim())
  for (const stage of stages) {
    if (only && !foundation.has(stage.name) && !only.includes(stage.name)) continue
    ctx.log(`> ${stage.name}`)
    for (let attempt = 1; ; attempt += 1) {
      try {
        await stage.run(ctx)
        break
      } catch (error) {
        // Stages skip rows that already exist, so a transient 503 (timeout) is retried twice.
        if (isTransient(error) && attempt < 3) {
          ctx.log(`  ${stage.name} hit a transient 503, retrying (${attempt}/2)`)
          continue
        }
        failures.push(`${stage.name}: ${message(error)}`)
        console.error(`  ${stage.name} failed: ${message(error)}`)
        if (foundation.has(stage.name)) return failures
        break
      }
    }
  }
  return failures
}

function isTransient(error: unknown) {
  return /"statusCode":503|Service Unavailable/.test(message(error))
}
