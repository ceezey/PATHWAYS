// Guard rails for the hosted PATHWAYS-role-staging seed. Never connects to any database or
// Supabase project itself; only validates the target described by an env file the caller supplies.
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// The one hosted project this tool is allowed to seed.
export const ALLOWED_PROJECT_REF = 'klbtoqdalmcsfjqophty'
export const ALLOWED_SUPABASE_URL = `https://${ALLOWED_PROJECT_REF}.supabase.co`

const LOOPBACK_HOSTNAMES = new Set(['127.0.0.1', 'localhost', '[::1]', '::1'])

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')

/** Resolves and validates the --env-file path: it must live under a repo-root `.tmp/`
 * directory, or entirely outside the repository tree. It must never be a tracked file.
 */
export function resolveEnvFilePath(envFileArg) {
  if (!envFileArg) {
    throw new Error(
      '--env-file <path> is required. It must point at a file under .tmp/ or outside the repository.',
    )
  }
  const resolved = path.resolve(process.cwd(), envFileArg)
  const relativeToRoot = path.relative(repoRoot, resolved)
  const isInsideRepo =
    relativeToRoot !== '' && !relativeToRoot.startsWith('..') && !path.isAbsolute(relativeToRoot)
  if (isInsideRepo) {
    const segments = relativeToRoot.split(path.sep)
    if (segments[0] !== '.tmp') {
      throw new Error('--env-file must be under .tmp/ (repo-relative) or outside the repository.')
    }
  }
  if (!existsSync(resolved)) {
    throw new Error(`Env file not found: ${resolved}`)
  }
  return resolved
}

/** Minimal dependency-free .env parser: KEY=VALUE lines, `#` comments, blank lines skipped,
 * optional single/double-quoted values. Parses without mutating process.env, so guard checks
 * run on an isolated map. Deliberately has no external dependency: this file may run from a
 * bare `node scripts/db/hosted-seed.mjs`, outside any package's own node_modules resolution.
 */
export function loadEnvFile(resolvedPath) {
  const text = readFileSync(resolvedPath, 'utf8')
  const result = {}
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const match = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line)
    if (!match) continue
    const [, key, rawValue] = match
    let value = rawValue.trim()
    if (
      (value.startsWith('"') && value.endsWith('"') && value.length >= 2) ||
      (value.startsWith("'") && value.endsWith("'") && value.length >= 2)
    ) {
      value = value.slice(1, -1)
    }
    result[key] = value
  }
  return result
}

function hostnameOf(url) {
  try {
    return new URL(url).hostname
  } catch {
    return null
  }
}

/**
 * Validates that the supplied env describes exactly the allowed hosted project, or, only when
 * `testLocal` is explicitly true, a loopback target. `testLocal` can never make a hosted-looking
 * URL pass: any non-loopback hostname fails closed regardless of the flag.
 */
export function assertSeedTarget(env, { testLocal }) {
  const supabaseUrl = env.SUPABASE_URL
  const databaseUrl = env.DATABASE_URL
  const directUrl = env.DIRECT_URL
  if (!supabaseUrl) throw new Error('SUPABASE_URL is required in the env file.')
  if (!databaseUrl) throw new Error('DATABASE_URL is required in the env file.')
  if (!directUrl) throw new Error('DIRECT_URL is required in the env file.')

  const supabaseHost = hostnameOf(supabaseUrl)
  const databaseHost = hostnameOf(`postgresql://${databaseUrl.split('@').pop()}`)
  const directHost = hostnameOf(`postgresql://${directUrl.split('@').pop()}`)

  if (testLocal) {
    const loopback = (host) => host && LOOPBACK_HOSTNAMES.has(host)
    if (!loopback(supabaseHost) || !loopback(databaseHost) || !loopback(directHost)) {
      throw new Error(
        '--test-local requires every URL (SUPABASE_URL, DATABASE_URL, DIRECT_URL) to be loopback. ' +
          'It can never be combined with a hosted target.',
      )
    }
    return { mode: 'test-local' }
  }

  if (supabaseUrl !== ALLOWED_SUPABASE_URL) {
    throw new Error(
      `SUPABASE_URL must equal exactly ${ALLOWED_SUPABASE_URL}. Refusing to seed any other project.`,
    )
  }
  if (!databaseUrl.includes(ALLOWED_PROJECT_REF)) {
    throw new Error('DATABASE_URL must reference the allowed project ref.')
  }
  if (!directUrl.includes(ALLOWED_PROJECT_REF)) {
    throw new Error('DIRECT_URL must reference the allowed project ref.')
  }
  if (LOOPBACK_HOSTNAMES.has(supabaseHost) || LOOPBACK_HOSTNAMES.has(databaseHost)) {
    throw new Error('A hosted run cannot target a loopback host.')
  }
  return { mode: 'hosted', projectRef: ALLOWED_PROJECT_REF }
}
