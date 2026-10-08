// Guards and env handling for scripts/db/hosted-build.mjs. Kept separate from
// the orchestrator so the validation logic can be unit tested without ever
// touching a network connection or spawning a process.
import { readFileSync } from 'node:fs'
import path from 'node:path'

// Exactly one allowed hosted target: PATHWAYS-devV2.
const ALLOWED_TARGET_REFS = Object.freeze(['klbtoqdalmcsfjqophty'])

const MIN_PASSWORD_LENGTH = 24

export class HostedEnvError extends Error {
  constructor(problems) {
    super(`Invalid hosted build environment:\n- ${problems.join('\n- ')}`)
    this.name = 'HostedEnvError'
    this.problems = problems
  }
}

// Minimal KEY=VALUE parser. Deliberately does not support shell expansion or
// multi-line values; the env file is a flat list of the five required vars.
export function parseEnvFile(filePath) {
  const text = readFileSync(filePath, 'utf8')
  const env = {}
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq === -1) continue
    const key = line.slice(0, eq).trim()
    let value = line.slice(eq + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"') && value.length >= 2) ||
      (value.startsWith("'") && value.endsWith("'") && value.length >= 2)
    ) {
      value = value.slice(1, -1)
    }
    env[key] = value
  }
  return env
}

// Refuses an env file path inside the tracked repository tree, unless it is
// under the repo's gitignored .tmp/ directory. A path outside the repo
// entirely is always accepted.
export function assertEnvFileLocation(filePath, repoRoot) {
  const resolved = path.resolve(filePath)
  const resolvedRoot = path.resolve(repoRoot)
  const rootWithSep = resolvedRoot.endsWith(path.sep) ? resolvedRoot : resolvedRoot + path.sep
  const insideRepo = resolved === resolvedRoot || resolved.startsWith(rootWithSep)
  if (!insideRepo) return
  const tmpDir = path.join(resolvedRoot, '.tmp')
  const tmpWithSep = tmpDir.endsWith(path.sep) ? tmpDir : tmpDir + path.sep
  const insideTmp = resolved === tmpDir || resolved.startsWith(tmpWithSep)
  if (!insideTmp) {
    throw new HostedEnvError([
      `Env file ${resolved} is inside the tracked repository tree. It must live under ` +
        `${tmpDir} (gitignored) or outside the repository entirely.`,
    ])
  }
}

export function redactUrl(urlString) {
  try {
    const url = new URL(urlString)
    if (url.password) url.password = 'REDACTED'
    return url.toString()
  } catch {
    return '[unparseable URL, redacted]'
  }
}

function safeUser(url) {
  try {
    return decodeURIComponent(url.username || '')
  } catch {
    return url.username || ''
  }
}

export function isLoopbackHostname(hostname) {
  const host = (hostname || '').toLowerCase()
  return host === '127.0.0.1' || host === '::1' || host === 'localhost' || host === '[::1]'
}

// Validates the five required env vars and returns a parsed, redaction-safe
// config object. Throws HostedEnvError (with every problem, not just the
// first) on any failure. `allowLoopback` is only ever set by the test-only
// local integration path; see hosted-build.mjs for why it cannot combine
// with a non-loopback URL.
export function validateHostedEnv(env, { allowLoopback = false } = {}) {
  const problems = []
  const ref = env.HOSTED_TARGET_REF
  if (!ALLOWED_TARGET_REFS.includes(ref)) {
    problems.push(
      `HOSTED_TARGET_REF must be exactly one of: ${ALLOWED_TARGET_REFS.join(', ')} (got ${JSON.stringify(ref)})`,
    )
  }

  let adminUrl
  try {
    adminUrl = new URL(env.HOSTED_ADMIN_URL)
  } catch {
    problems.push('HOSTED_ADMIN_URL is missing or not a valid URL')
  }
  let directUrl
  try {
    directUrl = new URL(env.HOSTED_DIRECT_URL)
  } catch {
    problems.push('HOSTED_DIRECT_URL is missing or not a valid URL')
  }

  // A hosted URL is accepted only on the project's own direct host with the bare
  // role name, or on a Supabase pooler host with the role name bound to the ref.
  const hostedUrlProblem = (name, url, role) => {
    const user = safeUser(url)
    const host = (url.hostname || '').toLowerCase()
    if (host === `db.${ref}.supabase.co`) {
      return user === role ? null : `${name} user must be "${role}" on the direct host`
    }
    if (host.endsWith('.pooler.supabase.com')) {
      return user === `${role}.${ref}`
        ? null
        : `${name} user must be "${role}.${ref}" on the pooler`
    }
    return `${name} host must be db.${ref}.supabase.co or a *.pooler.supabase.com host`
  }
  if (ref && adminUrl && !allowLoopback) {
    const problem = hostedUrlProblem('HOSTED_ADMIN_URL', adminUrl, 'postgres')
    if (problem) problems.push(problem)
  }
  if (ref && directUrl && !allowLoopback) {
    const problem = hostedUrlProblem('HOSTED_DIRECT_URL', directUrl, 'prisma')
    if (problem) problems.push(problem)
  }
  // Loopback mode is test-only, but it must never be usable to point this
  // script at a real network target. Both URLs are always required to
  // resolve to a loopback hostname regardless of the flag's own intent.
  if (allowLoopback) {
    for (const [name, url] of [
      ['HOSTED_ADMIN_URL', adminUrl],
      ['HOSTED_DIRECT_URL', directUrl],
    ]) {
      if (url && !isLoopbackHostname(url.hostname)) {
        problems.push(`${name} must be a loopback address when the test-only loopback flag is set`)
      }
    }
  }

  for (const key of ['PRISMA_ROLE_PASSWORD', 'RUNTIME_ROLE_PASSWORD']) {
    if (!env[key] || env[key].length < MIN_PASSWORD_LENGTH) {
      problems.push(`${key} must be at least ${MIN_PASSWORD_LENGTH} characters`)
    }
  }

  if (problems.length) throw new HostedEnvError(problems)

  return {
    ref,
    adminUrl,
    directUrl,
    prismaPassword: env.PRISMA_ROLE_PASSWORD,
    runtimePassword: env.RUNTIME_ROLE_PASSWORD,
  }
}
