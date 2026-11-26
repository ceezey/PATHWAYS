import assert from 'node:assert/strict'
import { PrismaClient } from '@prisma/client'

// cr-pathways-audit-tamper-evidence (0096): 200 audit inserts from 8 concurrent connections into one organization leave
// one unbroken chain. Loopback disposable database only, which keeps the committed rows; never point this at a hosted
// or shared database. The Phase 6 replay (Verify-Forward.ps1) runs this on a throwaway clone it drops afterwards.
const database = process.env.PHASE2_RACE_DATABASE
assert.match(database ?? '', /^pathways_phase[24]_[a-z0-9_]+$/)
const ownerPassword = process.env.PHASE2_OWNER_PASSWORD
assert.ok(ownerPassword, 'Local owner password is required.')
const url = new URL('postgresql:' + '//127.0.0.1')
url.port = process.env.PHASE2_LOCAL_PORT ?? '54322'
url.username = 'prisma'
url.password = ownerPassword
url.pathname = `/${database}`
url.searchParams.set('connection_limit', '8')
const owner = new PrismaClient({ datasources: { db: { url: url.href } } })
const org = 'a9610000-0000-4000-8000-000000000001'

try {
  await owner.$executeRaw`INSERT INTO pathways.organizations(id,code,name) VALUES (${org}::uuid,'AT_RACE','Synthetic audit race organization')`
  const pids = new Set()
  await Promise.all(
    Array.from({ length: 200 }, (_, n) =>
      owner.$transaction(async (tx) => {
        pids.add((await tx.$queryRaw`SELECT pg_backend_pid() AS pid`)[0].pid)
        await tx.$executeRaw`INSERT INTO pathways.audit_logs(organization_id,action,entity_type,entity_id)
          VALUES (${org}::uuid,'AT_RACE','Probe',${String(n)})`
      }),
    ),
  )
  assert.ok(pids.size > 1, 'inserts did not run on more than one connection')
  const [chain] =
    await owner.$queryRaw`SELECT count(*)::int AS n, count(DISTINCT chain_seq)::int AS seqs,
    min(chain_seq)::int AS lo, max(chain_seq)::int AS hi FROM pathways.audit_logs WHERE organization_id=${org}::uuid`
  assert.deepEqual(chain, { n: 200, seqs: 200, lo: 1, hi: 200 })
  const [verdict] =
    await owner.$queryRaw`SELECT ok, broken_seq::text AS broken FROM pathways.p96_verify_audit_chain(${org}::uuid)`
  assert.deepEqual(verdict, { ok: true, broken: null })
  console.log(`AUDIT_TAMPER_CONCURRENCY=PASS (200 inserts over ${pids.size} connections)`)
} finally {
  await owner.$disconnect()
}
