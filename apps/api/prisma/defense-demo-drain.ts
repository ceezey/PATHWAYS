import { createInterface } from 'node:readline/promises'
import type { PrismaClient } from '@prisma/client'
import type { MachineInvocation } from '../src/modules/rules/rules-machine-boundary'
import { RulesMachineSqlClient } from '../src/modules/rules/rules-machine-sql'
import { RulesMachineWorker } from '../src/modules/rules/rules-machine-worker'

const POLL_MS = 15_000
const TIMEOUT_MS = 15 * 60_000
const command = 'gh workflow run rules-dispatch.yml -f purpose=drain'

function invocation(budgetMs = 24_000): MachineInvocation {
  const enteredAt = performance.now()
  const deadlineAt = enteredAt + budgetMs
  const remainingMs = () => Math.max(0, Math.floor(deadlineAt - performance.now()))
  return {
    purpose: 'DRAIN',
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

/** Drains rules in this process through the machine roles named by the two RULES_* URLs. */
export function localWorkerDrain(env: NodeJS.ProcessEnv) {
  const workerDatabaseUrl = env.RULES_WORKER_DATABASE_URL
  const sweeperDatabaseUrl = env.RULES_SWEEPER_DATABASE_URL
  if (!workerDatabaseUrl || !sweeperDatabaseUrl) return undefined
  const worker = new RulesMachineWorker(
    new RulesMachineSqlClient({ workerDatabaseUrl, sweeperDatabaseUrl }),
  )
  return async () => {
    for (let round = 0; round < 4; round += 1) await worker.drain(invocation())
  }
}

type SchedulerDeps = {
  snapshot: () => Promise<string>
  isTty: boolean
  prompt: () => Promise<void>
  sleep: (ms: number) => Promise<void>
  log: (line: string) => void
  pollMs?: number
  timeoutMs?: number
}

/** Waits for the hosted scheduler: a TTY confirms by Enter, otherwise alert changes are polled. */
export function schedulerDrain(deps: SchedulerDeps) {
  return async () => {
    deps.log(
      `Waiting for the hosted rules scheduler: run \`${command}\` or wait for the 5-minute cron.`,
    )
    if (deps.isTty) return deps.prompt()
    const before = await deps.snapshot()
    const pollMs = deps.pollMs ?? POLL_MS
    for (let waited = 0; waited < (deps.timeoutMs ?? TIMEOUT_MS); waited += pollMs) {
      await deps.sleep(pollMs)
      if ((await deps.snapshot()) !== before) return
    }
    throw new Error(`No rule alert change seen within 15 minutes. Run \`${command}\` and rerun.`)
  }
}

/** Alert count and latest change times, readable by the owner role after a drain. */
export const alertSnapshot = (owner: PrismaClient, organizationId: string) => async () =>
  JSON.stringify(
    await owner.ruleBasedAlert.aggregate({
      where: { organizationId },
      _count: true,
      _max: { updatedAt: true, evaluatedAt: true },
    }),
  )

export async function enterPrompt() {
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  await rl.question('Press Enter after the drain workflow run succeeds ')
  rl.close()
}
