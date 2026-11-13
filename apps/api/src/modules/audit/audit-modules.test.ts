import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { auditModuleOf } from '@pathways/shared'
import { describe, expect, it } from 'vitest'

const api = path.resolve(__dirname, '..', '..', '..')

// Production TypeScript files: no tests, harnesses or installed packages.
const sourceFiles = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) return sourceFiles(full)
    return /\.ts$/.test(entry.name) && !/\.(test|harness)\b|\.test\./.test(entry.name) ? [full] : []
  })

// Entity types written by the API in code and in migrations.
const writtenEntityTypes = () => {
  const found = new Set<string>()
  for (const file of sourceFiles(path.join(api, 'src'))) {
    for (const m of readFileSync(file, 'utf8').matchAll(/entityType:\s*'([A-Za-z]+)'/g))
      found.add(m[1])
  }
  const migrations = path.join(api, 'prisma', 'migrations')
  for (const dir of readdirSync(migrations, { withFileTypes: true })) {
    if (!dir.isDirectory()) continue
    const sql = readFileSync(path.join(migrations, dir.name, 'migration.sql'), 'utf8')
    for (const insert of sql.matchAll(/into\s+pathways\.audit_logs[^;]*/gi))
      for (const m of insert[0].matchAll(/'([A-Z][a-z]+(?:[A-Z][a-z]+)*)'/g)) found.add(m[1])
  }
  return found
}

describe('audit module list', () => {
  it('names a readable module for every entity type the API writes', () => {
    const found = writtenEntityTypes()
    expect(found.size).toBeGreaterThanOrEqual(36)
    for (const type of found) expect(auditModuleOf(type).key, type).not.toBe('other')
  })
})
