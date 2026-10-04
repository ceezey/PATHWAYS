import type { ProjectKey } from './local-demo-data'
import type { DemoContext, StaffKey } from './local-demo-seed'
import { projectOf, step } from './local-demo-util'

type ReportPlan = {
  project: ProjectKey
  by: StaffKey
  kind: 'PROJECT_SUMMARY' | 'INDICATOR_SUMMARY' | 'BENEFICIARY_SUMMARY' | 'SURVEY_FORM_RESULTS'
  format: 'CSV' | 'XLSX' | 'PDF'
  name: string
  formCode?: string
}

const reportPlans: ReportPlan[] = [
  {
    project: 'SSG',
    by: 'projectManager',
    kind: 'PROJECT_SUMMARY',
    format: 'PDF',
    name: 'Safe Schools for Girls project summary, September 2026',
  },
  {
    project: 'SSG',
    by: 'me',
    kind: 'INDICATOR_SUMMARY',
    format: 'XLSX',
    name: 'Safe Schools for Girls indicator progress',
  },
  {
    project: 'SSG',
    by: 'me',
    kind: 'SURVEY_FORM_RESULTS',
    format: 'XLSX',
    name: 'Committee training feedback results',
    formCode: 'committee_training_feedback',
  },
  {
    project: 'CRL',
    by: 'programManager',
    kind: 'PROJECT_SUMMARY',
    format: 'XLSX',
    name: 'Community Resilience and Livelihoods quarterly summary',
  },
  {
    project: 'WSH',
    by: 'grantManager',
    kind: 'PROJECT_SUMMARY',
    format: 'PDF',
    name: 'School WASH Rehabilitation delay review',
  },
  {
    project: 'ALS',
    by: 'me',
    kind: 'INDICATOR_SUMMARY',
    format: 'XLSX',
    name: 'Alternative Learning System indicator results',
  },
  {
    project: 'ECD',
    by: 'projectManager',
    kind: 'PROJECT_SUMMARY',
    format: 'CSV',
    name: 'Masbate early childhood pilot plan summary',
  },
  // Survey results come last because one form is small enough to be suppressed.
  {
    project: 'SSG',
    by: 'me',
    kind: 'SURVEY_FORM_RESULTS',
    format: 'XLSX',
    name: 'Life skills session feedback results',
    formCode: 'training_outcome_survey',
  },
  {
    project: 'ALS',
    by: 'me',
    kind: 'SURVEY_FORM_RESULTS',
    format: 'XLSX',
    name: 'Review class learner feedback results',
    formCode: 'review_class_feedback',
  },
]

/** Generated report artifacts, each produced by a role that holds the matching report permission.
 * Files are written to private storage; nothing depends on beneficiary detail beyond aggregates. */
export async function stageReports(ctx: DemoContext) {
  let generated = 0
  for (const plan of reportPlans) {
    const projectId = projectOf(ctx, plan.project)
    const identity = ctx.staff[plan.by].identity
    let formId: string | undefined
    if (plan.formCode) {
      const form = await ctx.owner.digitalForm.findFirstOrThrow({
        where: { projectId, code: plan.formCode },
        select: { id: true },
      })
      formId = form.id
    }
    await step(`report ${plan.name}`, () =>
      ctx.services.reports.generate(identity, projectId, {
        clientRequestId: ctx.stable(
          `report:${plan.project}:${plan.kind}:${plan.format}:${plan.name}`,
        ),
        kind: plan.kind,
        format: plan.format,
        name: plan.name,
        ...(formId ? { formId } : {}),
      }),
    )
    generated += 1
  }
  ctx.log(`  reports generated: ${generated}`)
}
