// Read-only PATHWAYS-dev probes. Print only status codes and inventory counts.
import fs from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')
const require = createRequire(path.join(root, 'apps/api/package.json'))
const { parse } = require('dotenv')
const values = { ...process.env }
for (const file of ['apps/api/.env.local', 'apps/api/.env', '.env.local', '.env']) {
  const filename = path.join(root, file)
  if (!fs.existsSync(filename)) continue
  for (const [key, value] of Object.entries(parse(fs.readFileSync(filename)))) {
    if (values[key] === undefined) values[key] = value
  }
}
const origin = 'https://pdqwsknbzkdtiwjjibqt.supabase.co'
const checks = {}
try {
  if (values.SUPABASE_URL?.replace(/\/$/, '') !== origin) throw new Error('Target mismatch')
  const publicKey =
    values.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    values.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY
  const serverKey = values.SUPABASE_SERVICE_ROLE_KEY
  if (!publicKey || !serverKey) throw new Error('Missing protected configuration')
  async function get(endpoint, key) {
    const response = await fetch(`${origin}${endpoint}`, {
      method: 'GET',
      headers: { apikey: key, Authorization: `Bearer ${key}` },
      redirect: 'error',
      signal: AbortSignal.timeout(15000),
    })
    const body = await response.text()
    let data
    try {
      data = JSON.parse(body)
    } catch {
      data = null
    }
    return { status: response.status, data }
  }
  const health = await get('/auth/v1/health', publicKey)
  checks.authHealth = health.status
  const users = await get('/auth/v1/admin/users?page=1&per_page=50', serverKey)
  checks.authAdminStatus = users.status
  checks.authUsers = Array.isArray(users.data?.users) ? users.data.users.length : -1
  const storage = await get('/storage/v1/status', publicKey)
  checks.storageHealth = storage.status
  const buckets = await get('/storage/v1/bucket', serverKey)
  checks.bucketStatus = buckets.status
  checks.buckets = Array.isArray(buckets.data) ? buckets.data.length : -1
  checks.onlyExpectedPrivateBucket =
    Array.isArray(buckets.data) &&
    buckets.data.length === 1 &&
    buckets.data[0].id === 'pathways-private' &&
    buckets.data[0].public === false
  const api = await get('/rest/v1/', publicKey)
  checks.publicDataApiStatus = api.status
  const serverApi = await get('/rest/v1/', serverKey)
  checks.serverDataApiStatus = serverApi.status
  // Compare to the captured disabled-project HTTP baseline; these HTTP errors
  // alone do not prove the dashboard setting. Saved/refreshed dashboard evidence
  // is a separate precondition. Never enable the API for a smoke test.
  checks.pass =
    checks.authHealth === 200 &&
    checks.authAdminStatus === 200 &&
    checks.authUsers === 2 &&
    checks.storageHealth === 200 &&
    checks.bucketStatus === 200 &&
    checks.onlyExpectedPrivateBucket &&
    checks.publicDataApiStatus === 401 &&
    checks.serverDataApiStatus === 503
} catch {
  checks.pass = false
  checks.error = 'Read-only service smoke failed; sensitive details withheld.'
}
console.log(JSON.stringify(checks))
process.exitCode = checks.pass ? 0 : 1
