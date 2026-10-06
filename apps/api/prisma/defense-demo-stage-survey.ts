import { type ProjectKey, addDaysIso, demoActivities, demoProjects } from './local-demo-data'
import type { DemoContext } from './local-demo-seed'
import { activityCode } from './local-demo-stage-activities'
import { projectOf, step } from './local-demo-util'

export type Pair = { pre: number; post: number }

/** Hygiene knowledge check of eight learners: every learner improves a little, so the mean gain
 * stays under 20 points and improved, same and declined counts are each zero or at least five. */
export const wshPairs: Pair[] = [
  { pre: 38, post: 50 },
  { pre: 45, post: 55 },
  { pre: 52, post: 66 },
  { pre: 41, post: 50 },
  { pre: 47, post: 62 },
  { pre: 55, post: 64 },
  { pre: 36, post: 49 },
  { pre: 50, post: 61 },
]

export const meanGain = (pairs: Pair[]) =>
  pairs.reduce((sum, pair) => sum + (pair.post - pair.pre), 0) / pairs.length

/** A cell count is released only when it is zero or at least five. */
export const releasable = (count: number) => count === 0 || count >= 5

export const gainCounts = (pairs: Pair[]) => ({
  improved: pairs.filter((pair) => pair.post > pair.pre).length,
  same: pairs.filter((pair) => pair.post === pair.pre).length,
  declined: pairs.filter((pair) => pair.post < pair.pre).length,
})

type SurveyPlan = {
  project: ProjectKey
  code: string
  name: string
  respondents: number
}

const surveys: SurveyPlan[] = [
  // Enough respondents for every aggregate to be released.
  {
    project: 'SSG',
    code: 'training_outcome_survey',
    name: 'Life Skills Session Feedback',
    respondents: 12,
  },
  // Only three respondents: the aggregate is suppressed, which the report shows honestly.
  {
    project: 'ALS',
    code: 'review_class_feedback',
    name: 'Review Class Learner Feedback',
    respondents: 3,
  },
]

const ratings = [5, 4, 4, 5, 3, 4, 5, 4, 3, 5, 4, 4]

/** Generates the form as the Monitoring and Evaluation Officer, then has the System Administrator
 * publish it, because an author cannot publish their own form. */
async function publishedSurvey(ctx: DemoContext, projectId: string, plan: SurveyPlan) {
  const existing = await ctx.owner.digitalForm.findFirst({
    where: { organizationId: ctx.organizationId, projectId, code: plan.code },
    select: { id: true },
  })
  if (existing) return { id: existing.id, created: false }
  const draft = (await step(`generate ${plan.code}`, () =>
    ctx.services.metadata.generateForm(ctx.staff.me.identity, projectId, {
      templateKey: 'training_survey',
      code: plan.code,
      name: plan.name,
    }),
  )) as { id: string; updatedAt: string }
  await ctx.services.metadata.publishForm(ctx.staff.admin.identity, projectId, draft.id, {
    expectedUpdatedAt: draft.updatedAt,
  })
  return { id: draft.id, created: true }
}

/** One validated submission per respondent, identified with an enrolled individual who gave both
 * consents, by the Project Officer who runs the sessions. */
async function submitSurvey(ctx: DemoContext, projectId: string, formId: string, plan: SurveyPlan) {
  const officer = ctx.staff.liza.identity
  const enrollments = await ctx.owner.beneficiaryProjectEnrollment.findMany({
    where: { organizationId: ctx.organizationId, projectId, status: 'ACTIVE', endedDate: null },
    orderBy: { enrollmentDate: 'asc' },
    take: plan.respondents,
    select: { beneficiaryId: true },
  })
  for (const [index, row] of enrollments.entries()) {
    const saved = (await step(`survey ${plan.code} ${index}`, () =>
      ctx.services.metadata.saveSubmission(officer, projectId, formId, {
        clientSubmissionId: ctx.stable(`survey:${plan.code}:${index}`),
        beneficiaryId: row.beneficiaryId,
        values: {
          session_date: addDaysIso(ctx.today, -3),
          overall_rating: ratings[index % ratings.length],
        },
      }),
    )) as { id: string; updatedAt: string; status: string }
    if (saved.status === 'DRAFT')
      await ctx.services.metadata.submitSubmission(officer, projectId, formId, saved.id, {
        expectedUpdatedAt: saved.updatedAt,
      })
  }
  return enrollments.length
}

/** Survey evidence the rules and reports read: a closed WSH assessment period with small gains,
 * a survey with released aggregates and a survey that stays suppressed. */
export async function stageSurvey(ctx: DemoContext) {
  let submissions = 0
  for (const plan of surveys) {
    const projectId = projectOf(ctx, plan.project)
    const form = await publishedSurvey(ctx, projectId, plan)
    if (form.created) submissions += await submitSurvey(ctx, projectId, form.id, plan)
  }
  ctx.log(`  survey submissions: ${submissions}`)
}
