import type { ApiEnv } from '@pathways/config'
import type { RulesMachineOptions } from './rules-machine.module'

/** Server composition only. Readiness fields assert separately reviewed native
 * runtime/periodic-drain evidence; setting them does not create that evidence. */
export function rulesMachineOptions(env: ApiEnv): RulesMachineOptions {
  return {
    enabled: env.RULES_WORKER_ENABLED,
    drainToken: env.RULES_DRAIN_TOKEN,
    sweepToken: env.RULES_SWEEP_TOKEN,
    workerDatabaseUrl: env.RULES_WORKER_DATABASE_URL,
    sweeperDatabaseUrl: env.RULES_SWEEPER_DATABASE_URL,
  }
}
