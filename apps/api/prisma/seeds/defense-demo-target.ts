import { assertGuardedTarget, hostedProjectRef } from './hosted-realistic-seed'
import { assertLocalDemoTarget } from './local-demo-target'

// Rule machine URLs may only point at the validated hosted project (direct or pooler host).
function assertHostedRulesUrl(label: string, value: string | undefined) {
  if (!value) return
  const ref = hostedProjectRef()
  const url = new URL(value)
  const host = url.hostname.toLowerCase()
  const direct = host === `db.${ref}.supabase.co`
  const pooler = host.endsWith('.pooler.supabase.com') && url.username.endsWith(`.${ref}`)
  if (!direct && !pooler) throw new Error(`${label} must point at the target project ${ref}.`)
}

/** Refuses any target other than loopback (--test-local) or the hosted project the launcher validated. */
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
