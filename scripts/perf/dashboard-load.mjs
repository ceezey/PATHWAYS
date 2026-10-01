// Measures dashboard endpoint latency against the local API only.
import { createHmac } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'

import { localDatabase, localSupabase } from '../db/local-target.mjs'

const base = process.env.PATHWAYS_LOCAL_API_URL ?? 'http://127.0.0.1:4000/api'
if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?(\/api)?$/.test(base))
  throw new Error('local API only')
const runs = Number(process.env.PERF_RUNS ?? 50)
const project = process.env.PERF_PROJECT_ID
const defaults = ['/dashboards/home', '/dashboards/monitoring']
if (project) defaults.push(`/dashboards/saddd?projectId=${project}`)
const paths = process.env.PERF_PATHS ? process.env.PERF_PATHS.split(',') : defaults

// Reads the M&E Officer password from the newest local seed credentials file; never printed.
function credentials() {
  if (process.env.PERF_EMAIL && process.env.PERF_PASSWORD)
    return {
      email: process.env.PERF_EMAIL,
      password: process.env.PERF_PASSWORD,
    }
  const dir = path.resolve('.tmp', 'local-seed')
  for (const file of readdirSync(dir).sort().reverse()) {
    const found = JSON.parse(readFileSync(path.join(dir, file), 'utf8')).accounts.find(
      (a) => a.role === 'MONITORING_AND_EVALUATION_OFFICER' && a.password,
    )
    if (found) return found
  }
  throw new Error('No M&E Officer credentials; set PERF_EMAIL and PERF_PASSWORD.')
}

// Runs SQL in the fixed local container only.
const psql = (sql) =>
  execFileSync(
    'docker',
    [
      'exec',
      localDatabase.container,
      'psql',
      '-tA',
      '-F',
      ' ',
      '-U',
      'postgres',
      '-d',
      'postgres',
      '-c',
      sql,
    ],
    { encoding: 'utf8', env: { ...process.env, MSYS_NO_PATHCONV: '1' } },
  ).trim()

const b32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

// Computes the current RFC 6238 TOTP code from a base32 secret.
function totp(secret) {
  let bits = ''
  for (const c of secret.toUpperCase().replace(/=+$/, ''))
    bits += b32.indexOf(c).toString(2).padStart(5, '0')
  const key = Buffer.from(bits.match(/.{8}/g).map((x) => parseInt(x, 2)))
  const counter = Buffer.alloc(8)
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)))
  const h = createHmac('sha1', key).update(counter).digest()
  const o = h[h.length - 1] & 15
  return String((h.readUInt32BE(o) & 0x7fffffff) % 1e6).padStart(6, '0')
}

// Signs in against the local identity provider directly and raises the session to aal2 with a fresh TOTP factor.
async function signIn() {
  const { email, password } = credentials()
  const supabase = localSupabase()
  const call = async (route, token, body) => {
    const r = await fetch(`${supabase.apiUrl}/auth/v1/${route}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        apikey: supabase.anonKey,
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    })
    if (!r.ok) throw new Error(`${route} ${r.status} ${(await r.text()).slice(0, 160)}`)
    return r.json()
  }
  psql("DELETE FROM auth.mfa_factors WHERE friendly_name LIKE 'perf-%'")
  const first = await call('token?grant_type=password', supabase.anonKey, {
    email,
    password,
  })
  const factor = await call('factors', first.access_token, {
    factor_type: 'totp',
    friendly_name: `perf-${Date.now()}`,
  })
  const challenge = await call(`factors/${factor.id}/challenge`, first.access_token, {})
  const done = await call(`factors/${factor.id}/verify`, first.access_token, {
    challenge_id: challenge.id,
    code: totp(factor.totp.secret),
  })
  return done.access_token
}

const p = (xs, q) => xs.toSorted((a, b) => a - b)[Math.ceil(q * xs.length) - 1]

const token = await signIn()

// Looks up the workspace selector headers in the fixed local container.
const [orgId, userId] = psql(
  `SELECT organization_id, id FROM pathways.system_users WHERE email = '${credentials().email}'`,
).split(' ')
const headers = {
  authorization: `Bearer ${token}`,
  'x-pathways-organization-id': orgId,
  'x-pathways-user-id': userId,
}
for (const route of paths) {
  const times = []
  for (let i = 0; i < runs; i++) {
    const t = performance.now()
    const r = await fetch(base + route, { headers })
    const body = await r.text()
    if (process.env.PERF_TIMING && i === runs - 1) console.error(route.split('?')[0], r.headers.get('server-timing'))
    if (!r.ok) throw new Error(`${route} ${r.status} ${body.slice(0, 160)}`)
    times.push(performance.now() - t)
  }
  console.log(
    JSON.stringify({
      path: route.split('?')[0],
      runs,
      cold: Math.round(times[0]),
      p50: Math.round(p(times, 0.5)),
      p95: Math.round(p(times, 0.95)),
      pass: p(times, 0.95) < 800,
    }),
  )
}
