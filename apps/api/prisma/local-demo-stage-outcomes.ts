import {
  type DemoProject,
  type ProjectKey,
  addDaysIso,
  demoProjects,
  planCohort,
} from './local-demo-data'
import type { DemoContext } from './local-demo-seed'
import { projectOf, step } from './local-demo-util'

export type Outcome = {
  project: ProjectKey
  /** Indexes into the project's planned cohort. */
  people: number[]
  eventType: 'COMPLETION' | 'FOLLOW_UP' | 'DROPOUT'
  description: string
  /** Code of the journey stage the outcome lands on, for projects that define one. */
  stage?: string
  /** Days before the run date; defaults to the run date. */
  daysAgo?: number
}

export const outcomes: Outcome[] = [
  {
    project: 'ALS',
    people: [0, 1, 2, 3, 4, 5],
    eventType: 'COMPLETION',
    stage: 'ASSESSED',
    description:
      'Completed the module set and is registered for the accreditation and equivalency assessment.',
  },
  {
    project: 'ALS',
    people: [6],
    eventType: 'DROPOUT',
    description: 'Left the learning center after moving to Manila for work.',
  },
  {
    project: 'SSG',
    people: [3],
    eventType: 'DROPOUT',
    description: 'The family relocated to another province and the girl stopped attending.',
  },
  {
    project: 'SSG',
    people: [5, 7, 9],
    eventType: 'FOLLOW_UP',
    description:
      'Referred to the school guidance counselor for a follow-up visit after repeated absences.',
  },
  {
    project: 'EHK',
    people: Array.from({ length: 62 }, (_, i) => i),
    eventType: 'COMPLETION',
    stage: 'COMPLETED',
    description: 'Received the hygiene and learning kit and returned to school.',
    daysAgo: 50,
  },
  {
    project: 'EHK',
    people: Array.from({ length: 8 }, (_, i) => 62 + i),
    eventType: 'DROPOUT',
    description: 'The family moved away from the municipality before the kit distribution ended.',
    daysAgo: 155,
  },
]

/** Journey outcomes for enrolled participants: completions, follow-ups and dropouts, recorded as
 * dated events on their journey history by the Project Officer. */
export async function stageEnrollmentOutcomes(ctx: DemoContext) {
  let recorded = 0
  for (const outcome of outcomes) {
    const project = demoProjects.find((p) => p.key === outcome.project) as DemoProject
    const projectId = projectOf(ctx, project.key)
    const row = await ctx.owner.project.findUniqueOrThrow({
      where: { id: projectId },
      select: { startDate: true },
    })
    const cohort = planCohort(
      project,
      ctx.today,
      (row.startDate as Date).toISOString().slice(0, 10),
    )
    const stages = outcome.stage
      ? await ctx.services.participants.listStages(
          ctx.staff[project.officers[0]].identity,
          projectId,
        )
      : []
    const stageId = stages.find((entry) => entry.code === outcome.stage)?.id
    if (outcome.stage && !stageId) throw new Error(`Journey stage ${outcome.stage} is missing.`)
    for (const index of outcome.people) {
      const person = cohort[index]
      const beneficiary = await ctx.owner.beneficiary.findFirst({
        where: { organizationId: ctx.organizationId, code: person.code },
        select: { id: true },
      })
      if (!beneficiary) throw new Error(`Beneficiary ${person.code} is missing.`)
      const active = await ctx.owner.beneficiaryProjectEnrollment.findFirst({
        where: { projectId, beneficiaryId: beneficiary.id, status: 'ACTIVE' },
        select: { id: true },
      })
      if (!active) continue
      // A follow-up keeps the enrollment active, so check the recorded event to stay idempotent.
      const already = await ctx.owner.beneficiaryJourneyEvent.findFirst({
        where: {
          enrollmentId: active.id,
          eventType: outcome.eventType,
          description: outcome.description,
        },
        select: { id: true },
      })
      if (already) continue
      await step(`enrollment outcome ${person.code}`, () =>
        ctx.services.participants.transitionEnrollment(
          ctx.staff[project.officers[0]].identity,
          projectId,
          beneficiary.id,
          {
            eventType: outcome.eventType,
            eventDate: addDaysIso(ctx.today, -(outcome.daysAgo ?? 0)),
            description: outcome.description,
            ...(stageId ? { stageId } : {}),
          },
        ),
      )
      recorded += 1
    }
  }
  ctx.log(`  journey outcomes recorded: ${recorded}`)
}
