import { demoRules } from './local-demo-data'
import type { DemoContext } from './local-demo-seed'
import { projectOf, step } from './local-demo-util'

type RuleRow = { id: string; code: string }
type AlertRow = {
  id: string
  ruleId: string
  title: string
  revision: string
  lifecycle: string
  projectId: string
}
type RecommendationRow = { id: string; title: string; revision: string; status: string }
type Identity = DemoContext['staff']['me']['identity']
type Outcome = 'ACCEPT' | 'PARTIALLY_ACCEPT' | 'DECLINE' | 'ESCALATE'

/** Human decisions on the alerts the evaluation produced: reviews, accepted, partly accepted and
 * declined recommendations, one resolved alert and one left new. Every step uses the preview and
 * confirm flow of the human rules API. */
export async function stageDecisions(ctx: DemoContext) {
  const rules = ctx.services.rules
  const pm = ctx.staff.projectManager.identity
  const me = ctx.staff.me.identity
  const programManager = ctx.staff.programManager.identity
  const admin = ctx.staff.admin.identity

  const ruleCodes = new Map<string, string>()
  for (const plan of demoRules) {
    const projectId = projectOf(ctx, plan.project)
    const listed = (await rules.listRules(admin, {
      projectId,
      kind: 'PROJECT',
      limit: '100',
    })) as unknown as { items: RuleRow[] }
    for (const row of listed.items) ruleCodes.set(row.id, row.code)
  }
  const found = (await rules.listAlerts(admin, { limit: '100' })) as unknown as {
    items: AlertRow[]
  }
  if (found.items.length === 0) {
    ctx.log('  no alerts to decide on (rule evaluation did not run)')
    return
  }
  const alertFor = (code: string) => {
    const alert = found.items.find((row) => ruleCodes.get(row.ruleId) === code)
    if (!alert) throw new Error(`No alert was produced for rule ${code}.`)
    return alert
  }
  const key = (seed: string) => ctx.stable(`decision:${seed}`)
  const recommendationsOf = async (identity: Identity, alertId: string) =>
    (
      (await rules.listRecommendations(identity, { alertId, limit: '20' })) as unknown as {
        items: RecommendationRow[]
      }
    ).items
  const reload = async (identity: Identity, alertId: string) =>
    (await rules.getAlert(identity, alertId)) as unknown as AlertRow

  async function decide(
    identity: Identity,
    alert: AlertRow,
    recommendation: RecommendationRow,
    outcome: Outcome,
    note: string,
    seed: string,
  ) {
    const current = await reload(identity, alert.id)
    const preview = (await rules.previewRecommendation(identity, recommendation.id, {
      expectedRevision: recommendation.revision,
      note,
      clientOperationId: key(`${seed}:preview`),
      outcome,
      ...(['ACCEPT', 'PARTIALLY_ACCEPT'].includes(outcome)
        ? { expectedAlertRevision: current.revision }
        : {}),
    })) as unknown as { previewId: string }
    await rules.confirmRecommendation(identity, recommendation.id, {
      previewId: preview.previewId,
      clientOperationId: key(`${seed}:confirm`),
    })
  }

  // Operations Bottleneck (water, sanitation and hygiene project): reviewed, first action accepted.
  const bottleneck = alertFor('OPERATIONS_BOTTLENECK')
  if (bottleneck.lifecycle === 'NEW') {
    await step('review bottleneck alert', () =>
      rules.reviewAlert(pm, bottleneck.id, {
        expectedRevision: bottleneck.revision,
        note: 'Reviewed with the field team; the delay is confirmed and the partners have been informed.',
        clientOperationId: key('bottleneck:review'),
      }),
    )
    const [first, second] = await recommendationsOf(pm, bottleneck.id)
    await step('accept bottleneck recommendation', () =>
      decide(
        pm,
        bottleneck,
        first,
        'ACCEPT',
        'A recovery planning meeting is scheduled for next week.',
        'bottleneck:first',
      ),
    )
    const reviewed = (await recommendationsOf(me, bottleneck.id)).find(
      (row) => row.id === second.id,
    )
    if (reviewed)
      await step('review second bottleneck recommendation', () =>
        rules.reviewRecommendation(me, second.id, {
          expectedRevision: reviewed.revision,
          note: 'The extension request needs donor guidance first; keeping this for the next review.',
          clientOperationId: key('bottleneck:second-review'),
        }),
      )
  }

  // Multiple activities behind schedule (Eastern Samar): partly accepted, second option declined.
  const delays = alertFor('ACTIVITY_DELAYS')
  if (delays.lifecycle === 'NEW') {
    await step('review delays alert', () =>
      rules.reviewAlert(programManager, delays.id, {
        expectedRevision: delays.revision,
        note: 'Discussed with the project manager during the weekly coordination call.',
        clientOperationId: key('delays:review'),
      }),
    )
    const [first, second] = await recommendationsOf(programManager, delays.id)
    await step('partly accept delays recommendation', () =>
      decide(
        programManager,
        delays,
        first,
        'PARTIALLY_ACCEPT',
        'Revised dates were requested for the distribution only; mapping stays as planned.',
        'delays:first',
      ),
    )
    const fresh = (await recommendationsOf(programManager, delays.id)).find(
      (row) => row.id === second.id,
    ) as RecommendationRow
    await step('decline delays recommendation', () =>
      decide(
        programManager,
        delays,
        fresh,
        'DECLINE',
        'The Northern Samar team is fully committed until the end of the quarter.',
        'delays:second',
      ),
    )
  }

  // Closing within 30 days (Lavezares): reviewed by Monitoring and Evaluation, then resolved.
  const closing = alertFor('CLOSING_SOON')
  if (closing.lifecycle === 'NEW') {
    const reviewed = (await step('review closing alert', () =>
      rules.reviewAlert(me, closing.id, {
        expectedRevision: closing.revision,
        note: 'Close-out checklist shared with the partners.',
        clientOperationId: key('closing:review'),
      }),
    )) as unknown as AlertRow
    await step('resolve closing alert', () =>
      rules.dispositionAlert(me, closing.id, {
        expectedRevision: reviewed.revision,
        action: 'RESOLVE',
        note: 'Close-out checklist started and the learning review workshop is scheduled.',
        clientOperationId: key('closing:resolve'),
      }),
    )
  }
  // Budget and beneficiary alerts are hidden from the System Administrator, so the Project Manager
  // and the Monitoring and Evaluation Officer decide them. The survey, past-end and overdue
  // alerts are deliberately left new.
  const visible = async (identity: Identity) =>
    (
      (await rules.listAlerts(identity, { limit: '100' })) as unknown as {
        items: AlertRow[]
      }
    ).items
  const budgetAlert = (await visible(pm)).find(
    (row) => ruleCodes.get(row.ruleId) === 'BUDGET_NEAR_EXHAUSTED',
  )
  if (budgetAlert?.lifecycle === 'NEW') {
    await step('review budget alert', () =>
      rules.reviewAlert(pm, budgetAlert.id, {
        expectedRevision: budgetAlert.revision,
        note: 'Spending is close to the planned budget; the Grant Manager has been informed.',
        clientOperationId: key('budget:review'),
      }),
    )
    const [first] = await recommendationsOf(pm, budgetAlert.id)
    await step('escalate budget recommendation', () =>
      decide(
        pm,
        budgetAlert,
        first,
        'ESCALATE',
        'The remaining budget needs a decision from the Grant Manager before further tranches.',
        'budget:first',
      ),
    )
  }
  const followUpAlert = (await visible(me)).find(
    (row) => ruleCodes.get(row.ruleId) === 'FOLLOW_UP_GAP',
  )
  if (followUpAlert?.lifecycle === 'NEW') {
    await step('review follow-up alert', () =>
      rules.reviewAlert(me, followUpAlert.id, {
        expectedRevision: followUpAlert.revision,
        note: 'Six participants are marked for follow-up after the fourth coaching session.',
        clientOperationId: key('followup:review'),
      }),
    )
    const [first] = await recommendationsOf(me, followUpAlert.id)
    await step('accept follow-up recommendation', () =>
      decide(
        me,
        followUpAlert,
        first,
        'ACCEPT',
        'Household visits are scheduled for the coming week.',
        'followup:first',
      ),
    )
  }
  ctx.log('  alert decisions recorded')
}
