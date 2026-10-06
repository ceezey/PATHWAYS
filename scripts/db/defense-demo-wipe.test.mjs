import assert from 'node:assert/strict'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import { parseWipeTables } from './defense-snapshot-parse.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const sql = readFileSync(
  path.join(root, 'infra/supabase/phase6/hosted-defense-demo-wipe.sql'),
  'utf8',
)
const keep = [
  'pathways.organizations',
  'pathways.roles',
  'pathways.permissions',
  'pathways.role_permissions',
  'pathways.system_users',
  'pathways.user_step_up_pins',
  'pathways.signin_lockouts',
  'pathways_rules_internal.source_operation_catalog',
  'pathways_rules_internal.calendar_configuration',
  'pathways_rules_internal.sweep_cursor',
]
const code = sql.replace(/--.*$/gm, '')
const statements = code.match(/\bTRUNCATE\s+TABLE\b[^;]*;/gi) ?? []
const truncated = parseWipeTables(sql)

const migrations = path.join(root, 'apps/api/prisma/migrations')
const created = new Set()
for (const dir of readdirSync(migrations)) {
  const file = path.join(migrations, dir, 'migration.sql')
  if (!existsSync(file)) continue
  const text = readFileSync(file, 'utf8')
  for (const m of text.matchAll(
    /create table (?:if not exists )?(pathways(?:_rules_internal)?\.[a-z_]+)/gi,
  ))
    created.add(m[1].toLowerCase())
  for (const m of text.matchAll(
    /drop table (?:if exists )?(pathways(?:_rules_internal)?\.[a-z_]+)/gi,
  ))
    created.delete(m[1].toLowerCase())
}

test('wipe has exactly one TRUNCATE, RESTART IDENTITY and no CASCADE', () => {
  assert.equal((code.match(/\bTRUNCATE\b/gi) ?? []).length, 1)
  assert.match(statements[0], /RESTART\s+IDENTITY\s*;$/i)
  assert.doesNotMatch(code, /\bCASCADE\b/i)
})

test('kept tables are not truncated', () => {
  for (const t of keep) assert.ok(!truncated.includes(t), `${t} must be kept`)
})

test('truncate list equals every migration table minus the keep list', () => {
  for (const t of keep) assert.ok(created.has(t), `${t} missing from migrations`)
  const expected = [...created].filter((t) => !keep.includes(t)).sort()
  assert.equal(new Set(truncated).size, truncated.length, 'duplicate table in list')
  assert.deepEqual([...truncated].sort(), expected)
})
