// Measures dashboard endpoint latency against the local API only.
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'

const base = process.env.PATHWAYS_LOCAL_API_URL ?? 'http://127.0.0.1:4000'
if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(base)) throw new Error('local API only')
const runs = Number(process.env.PERF_RUNS ?? 50)
const project = process.env.PERF_PROJECT_ID
const defaults = ['/dashboards/home', '/dashboards/monitoring']
if (project) defaults.push(`/dashboards/saddd?projectId=${project}`)
const paths = process.env.PERF_PATHS ? process.env.PERF_PATHS.split(',') : defaults

// Reads the M&E Officer password from the newest local seed credentials file; never printed.
function credentials() {
  if (process.env.PERF_EMAIL && process.env.PERF_PASSWORD)
    return { email: process.env.PERF_EMAIL, password: process.env.PERF_PASSWORD }
  const dir = path.resolve('.tmp', 'local-seed')
  for (const file of readdirSync(dir).sort().reverse()) {
    const found = JSON.parse(readFileSync(path.join(dir, file), 'utf8')).accounts.find(
      (a) => a.role === 'MONITORING_AND_EVALUATION_OFFICER' && a.password,
    )
    if (found) return found
  }
  throw new Error('No M&E Officer credentials; set PERF_EMAIL and PERF_PASSWORD.')
}

async function signIn() {
  const { email, password } = credentials()
  const r = await fetch(`${base}/auth/sign-in`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  if (!r.ok) throw new Error(`sign-in ${r.status}`)
  const body = await r.json()
  return body.accessToken ?? body.access_token
}

const p = (xs, q) => xs.toSorted((a, b) => a - b)[Math.ceil(q * xs.length) - 1]

const token = await signIn()
for (const route of paths) {
  const times = []
  for (let i = 0; i < runs; i++) {
    const t = performance.now()
    const r = await fetch(base + route, { headers: { authorization: `Bearer ${token}` } })
    await r.arrayBuffer()
    if (!r.ok) throw new Error(`${route} ${r.status}`)
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
