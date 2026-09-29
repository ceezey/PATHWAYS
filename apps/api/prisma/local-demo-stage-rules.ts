import type { MachineInvocation } from '../src/modules/rules/rules-machine-boundary'
import { RulesMachineSqlClient } from '../src/modules/rules/rules-machine-sql'
import { RulesMachineWorker } from '../src/modules/rules/rules-machine-worker'
import { demoRules } from './local-demo-data'
import type { DemoContext } from './local-demo-seed'
import { projectOf, step } from './local-demo-util'

type RuleRow = { id: string; code: string; version: number; status: string; projectId: string | null }

function invocation(purpose: 'DRAIN' | 'SWEEP', budgetMs = 24_000): MachineInvocation {
  const enteredAt = performance.now()
  const deadlineAt = enteredAt + budgetMs
  const remainingMs = () => Math.max(0, Math.floor(deadlineAt - performance.now()))
  return {
    purpose,
    origin: 'SYSTEM',
    actorId: null,
    enteredAt,
    deadlineAt,
    remainingMs,
    assertRemaining: () => {
      if (remainingMs() <= 0) throw new Error('Rule processing budget exhausted.')
    },
  }
}

/** Runs the same worker the API's drain endpoint runs, against the dedicated machine roles that
 * scripts/db/local-demo.mjs opens for the length of this seed. It evaluates every active rule
 * against the trusted project metrics and commits alerts with their predefined recommendations. */
export async function stageEvaluation(ctx: DemoContext) {
  const workerUrl = process.env.RULES_WORKER_DATABASE_URL
  const sweeperUrl = process.env.RULES_SWEEPER_DATABASE_URL
  if (!workerUrl || !sweeperUrl) {
    ctx.log('  rule evaluation skipped: run through pnpm db:local:demo to open the machine roles')
    return
  }
  const sql = new RulesMachineSqlClient({
    workerDatabaseUrl: workerUrl,
    sweeperDatabaseUrl: sweeperUrl,
  })
  const worker = new RulesMachineWorker(sql)
  for (let round = 0; round < 4; round += 1) await worker.drain(invocation('DRAIN'))
  const alerts = await ctx.owner.ruleBasedAlert.count({
    where: { organizationId: ctx.organizationId },
  })
  ctx.log(`  alerts present after evaluation: ${alerts}`)
}

/** Rules are authored and activated by the System Administrator (rules.create, rules.activate)
 * through the human rules API: structured conditions only, no free-form code. */
export async function stageRules(ctx: DemoContext) {
  const admin = ctx.staff.admin.identity
  let created = 0
  for (const plan of demoRules) {
    const projectId = projectOf(ctx, plan.project)
    const listed = (await ctx.services.rules.listRules(admin, { projectId, kind: 'PROJECT', limit: '100' })) as unknown as {
      items: RuleRow[]
    }
    if (listed.items.some((row) => row.code === plan.code)) continue
    const rule = (await step(`create rule ${plan.code}`, () =>
      ctx.services.rules.createRule(admin, {
        code: plan.code,
        name: plan.name,
        severity: plan.severity,
        projectId,
        conditions: {
          kind: 'GROUP',
          mode: plan.mode,
          children: plan.conditions.map((condition, index) => ({
            kind: 'CONDITION',
            id: `c${index + 1}`,
            metric: condition.metric,
            operator: condition.operator,
            threshold: condition.threshold,
          })),
        },
        recommendations: plan.recommendations.map((item, index) => ({
          id: ctx.stable(`recommendation:${plan.code}:${index}`),
          title: item.title,
          text: item.text,
        })),
        clientOperationId: ctx.stable(`rule-create:${plan.code}`),
      }),
    )) as unknown as RuleRow
    await step(`activate rule ${plan.code}`, () =>
      ctx.services.rules.activateRule(admin, rule.id, {
        expectedVersion: rule.version,
        clientOperationId: ctx.stable(`rule-activate:${plan.code}`),
      }),
    )
    created += 1
  }
  ctx.log(`  rules created and activated: ${created}`)
}
