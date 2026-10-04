import { assertGuardedTarget } from './hosted-realistic-seed'
import { assertLocalDemoTarget } from './local-demo-target'

const PROJECT_REF = 'klbtoqdalmcsfjqophty'

// Rule machine URLs may only point at the one allowed hosted project (direct or pooler host).
function assertHostedRulesUrl(label: string, value: string | undefined) {
  if (!value) return
  const url = new URL(value)
  const host = url.hostname.toLowerCase()
  const direct = host === `db.${PROJECT_REF}.supabase.co`
  const pooler = host.endsWith('.pooler.supabase.com') && url.username.endsWith(`.${PROJECT_REF}`)
  if (!direct && !pooler) throw new Error(`${label} must point at the PATHWAYS-devV2 project.`)
}

/** Refuses any target other than loopback (--test-local) or exactly PATHWAYS-devV2 (hosted). */
export function assertDefenseTarget(testLocal: boolean, env: NodeJS.ProcessEnv = process.env) {
  if (testLocal) {
    assertLocalDemoTarget(env)
    return
  }
  if (!env.SUPABASE_SERVICE_ROLE_KEY) throw new Error('SUPABASE_SERVICE_ROLE_KEY is required.')
  // The hosted guard reads process.env directly.
  process.env.PATHWAYS_HOSTED_SEED_MODE = 'hosted'
  assertGuardedTarget()
  assertHostedRulesUrl('RULES_WORKER_DATABASE_URL', env.RULES_WORKER_DATABASE_URL)
  assertHostedRulesUrl('RULES_SWEEPER_DATABASE_URL', env.RULES_SWEEPER_DATABASE_URL)
}
