import type { ProjectKey } from './local-demo-data'
import type { DemoContext } from './local-demo-seed'
import { projectOf, step } from './local-demo-util'

const publications: Array<{
  project: ProjectKey
  summary: string
  state: 'PUBLISHED' | 'APPROVED' | 'FOR_REVIEW'
}> = [
  {
    project: 'EHK',
    state: 'PUBLISHED',
    summary:
      'Emergency Hygiene and Learning Kits reached 70 families in Sulangan, Salug and Bungtod in Guiuan, Eastern Samar, helping learners return to school within eight weeks of the typhoon.',
  },
  {
    project: 'CRL',
    state: 'PUBLISHED',
    summary:
      'Community Resilience and Livelihoods supports households in coastal Catarman and Lavezares, Northern Samar, with livelihood grants, coaching and barangay disaster response team training.',
  },
  {
    project: 'ALS',
    state: 'PUBLISHED',
    summary:
      'Alternative Learning System Support has helped 30 out-of-school youth and adults in Lavezares enroll in community learning centers and prepare for the accreditation and equivalency assessment.',
  },
  {
    project: 'SSG',
    state: 'FOR_REVIEW',
    summary:
      'Safe Schools for Girls strengthens school protection committees and life skills sessions for adolescent girls in Borongan City, Guiuan and Llorente, Eastern Samar.',
  },
]

type Publication = { revision: number; state: string } | null

/** Public tracker publication workflow: a manager submits a plain-language summary, a second
 * role approves it and a third publishes it. Nothing else leaves the private workspace. */
export async function stagePublishing(ctx: DemoContext) {
  const submitter = ctx.staff.projectManager.identity
  const approver = ctx.staff.programManager.identity
  const publisher = ctx.staff.grantManager.identity
  const service = ctx.services.publication
  let changed = 0
  const order = ['FOR_REVIEW', 'APPROVED', 'PUBLISHED']
  for (const plan of publications) {
    const projectId = projectOf(ctx, plan.project)
    const request = (operation: string) => ctx.stable(`publication:${plan.project}:${operation}`)
    // Resume from whatever state the project is already in, so reruns finish the workflow.
    for (let guard = 0; guard < 4; guard += 1) {
      const current = (await service.get(submitter, projectId)) as Publication
      const reached = current ? order.indexOf(current.state) : -1
      if (reached >= order.indexOf(plan.state)) break
      const revision = current?.revision ?? 0
      if (reached < 0) {
        await step(`submit ${plan.project}`, () =>
          service.transition(submitter, projectId, 'SUBMIT', {
            clientRequestId: request('submit'),
            expectedRevision: revision,
            summary: plan.summary,
          }),
        )
      } else if (current?.state === 'FOR_REVIEW') {
        await step(`approve ${plan.project}`, () =>
          service.transition(approver, projectId, 'APPROVE', {
            clientRequestId: request('approve'),
            expectedRevision: revision,
          }),
        )
      } else {
        await step(`publish ${plan.project}`, () =>
          service.transition(publisher, projectId, 'PUBLISH', {
            clientRequestId: request('publish'),
            expectedRevision: revision,
          }),
        )
      }
      changed += 1
    }
  }
  ctx.log(`  public tracker entries changed: ${changed}`)
}
