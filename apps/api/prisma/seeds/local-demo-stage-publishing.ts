import { createHash } from 'node:crypto'
import type { PublicView } from '@pathways/shared'
import { PRODUCTION_PROJECT_REF, hostedProjectRef } from './hosted-realistic-seed'
import type { DemoContext } from './local-demo-seed'
import { ensurePublicMedia } from './local-demo-stage-public-media'
import { projectOf, step } from './local-demo-util'

type State = 'FOR_REVIEW' | 'APPROVED' | 'PUBLISHED'

// The base lists leave out the map; viewsFor adds it on production only.
export const publications: Array<{
  project: 'EHK' | 'CRL' | 'ALS' | 'SSG'
  summary: string
  state: State
  views: PublicView[]
}> = [
  {
    project: 'EHK',
    state: 'PUBLISHED',
    views: ['kpi', 'timeline', 'participation'],
    summary:
      'Emergency Hygiene and Learning Kits reached 70 families in Sulangan, Salug and Bungtod in Guiuan, Eastern Samar, helping learners return to school within eight weeks of the typhoon.',
  },
  {
    project: 'CRL',
    state: 'PUBLISHED',
    views: ['saddd', 'timeline', 'kpi'],
    summary:
      'Community Resilience and Livelihoods supports households in coastal Catarman and Lavezares, Northern Samar, with livelihood grants, coaching and barangay disaster response team training.',
  },
  {
    project: 'ALS',
    state: 'PUBLISHED',
    views: ['kpi', 'saddd', 'participation'],
    summary:
      'Alternative Learning System Support has helped 30 out-of-school youth and adults in Lavezares enroll in community learning centers and prepare for the accreditation and equivalency assessment.',
  },
  {
    project: 'SSG',
    state: 'FOR_REVIEW',
    views: ['saddd', 'participation'],
    summary:
      'Safe Schools for Girls strengthens school protection committees and life skills sessions for adolescent girls in Borongan City, Guiuan and Llorente, Eastern Samar.',
  },
]

const productionMapProjects = new Set(['EHK', 'CRL'])

/** A project's planned views, plus the map for the EHK and CRL public pages on production. */
export const viewsFor = (plan: (typeof publications)[number]): PublicView[] =>
  hostedProjectRef() === PRODUCTION_PROJECT_REF && productionMapProjects.has(plan.project)
    ? [...plan.views, 'map']
    : plan.views

type Media = Array<{ id: string; caption: string }>

export type Draft = {
  revision: number
  state: State
  summary: string
  snapshot: { views?: unknown; media?: Media }
} | null

export type Wanted = { summary: string; state: State; selection: { media: Media; views: string[] } }

const order: State[] = ['FOR_REVIEW', 'APPROVED', 'PUBLISHED']

/** The next workflow step: resubmit when the draft differs from the plan, else walk it to the target state. */
export function nextPublicationStep(current: Draft, wanted: Wanted) {
  const same =
    current &&
    current.summary === wanted.summary &&
    JSON.stringify(current.snapshot.views) === JSON.stringify(wanted.selection.views) &&
    JSON.stringify((current.snapshot.media ?? []).map(({ id, caption }) => ({ id, caption }))) ===
      JSON.stringify(wanted.selection.media)
  if (!same) return 'SUBMIT'
  if (order.indexOf(current.state) >= order.indexOf(wanted.state)) return null
  return current.state === 'FOR_REVIEW' ? 'APPROVE' : 'PUBLISH'
}

/** Short content hash of the planned summary and selection, so a changed plan gets a new request key. */
export const selectionKey = (wanted: Wanted) =>
  createHash('sha256')
    .update(JSON.stringify([wanted.summary, wanted.selection]))
    .digest('hex')
    .slice(0, 16)

/** Public tracker publication workflow: a manager submits a plain-language summary with the project's
 * own views and approved media, a second role approves it and a third publishes it. A changed plan
 * submits a new revision; the live revision stays up until the new one is published. */
export async function stagePublishing(ctx: DemoContext) {
  const actors = {
    SUBMIT: ctx.staff.projectManager.identity,
    APPROVE: ctx.staff.programManager.identity,
    PUBLISH: ctx.staff.grantManager.identity,
  }
  const service = ctx.services.publication
  let changed = 0
  for (const plan of publications) {
    const projectId = projectOf(ctx, plan.project)
    const media = await ensurePublicMedia(ctx, plan.project)
    const wanted: Wanted = {
      summary: plan.summary,
      state: plan.state,
      selection: { media, views: viewsFor(plan) },
    }
    for (let guard = 0; guard < 4; guard += 1) {
      const current = (await service.get(actors.SUBMIT, projectId)) as Draft
      const operation = nextPublicationStep(current, wanted)
      if (!operation) break
      const revision = current?.revision ?? 0
      // Keys never repeat the old fixed ones (publication:EHK:submit) already on hosted targets.
      const key =
        operation === 'SUBMIT'
          ? `publication:${plan.project}:submit:${selectionKey(wanted)}:r${revision}`
          : `publication:${plan.project}:${operation.toLowerCase()}:r${revision}`
      await step(`${operation.toLowerCase()} ${plan.project}`, () =>
        service.transition(actors[operation], projectId, operation, {
          clientRequestId: ctx.stable(key),
          expectedRevision: revision,
          ...(operation === 'SUBMIT'
            ? { summary: wanted.summary, selection: wanted.selection }
            : {}),
        }),
      )
      changed += 1
    }
  }
  ctx.log(`  public tracker entries changed: ${changed}`)
}
