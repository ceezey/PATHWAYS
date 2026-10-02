import { assertLoopback } from './local-synthetic-seed'

const LOCAL_DB_PORT = '54322'

/**
 * The local presentation workspace writes only to the loopback Supabase stack. Every URL must be
 * a loopback host, both database URLs must use the fixed local database port, and the optional
 * rule-machine URLs (opened only by scripts/db/local-demo.mjs) must be loopback as well. Anything
 * else, including any production or hosted address, is refused before a connection is made.
 */
export function assertLocalDemoTarget(env: NodeJS.ProcessEnv) {
  if (env.NODE_ENV === 'production')
    throw new Error('The local demo workspace never runs in production.')
  assertLoopback('DIRECT_URL', env.DIRECT_URL)
  assertLoopback('DATABASE_URL', env.DATABASE_URL)
  assertLoopback('SUPABASE_URL', env.SUPABASE_URL)
  for (const label of ['DIRECT_URL', 'DATABASE_URL'] as const) {
    if (new URL(env[label] as string).port !== LOCAL_DB_PORT)
      throw new Error(`${label} must use the local database port ${LOCAL_DB_PORT}.`)
  }
  for (const label of ['RULES_WORKER_DATABASE_URL', 'RULES_SWEEPER_DATABASE_URL'] as const) {
    if (env[label]) {
      assertLoopback(label, env[label])
      if (new URL(env[label] as string).port !== LOCAL_DB_PORT)
        throw new Error(`${label} must use the local database port ${LOCAL_DB_PORT}.`)
    }
  }
}
