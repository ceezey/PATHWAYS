import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')

// Immutable archive access only. This never connects to a database or relaxes
// the historical runners' branch, identity, ledger, or target guards.
export function historicalMigration(name, encoding) {
  if (!/^00[0-2][0-9]_[a-z0-9_]+$/.test(name)) throw new Error('HISTORICAL_NAME')
  const value = execFileSync(
    'python',
    [path.join(root, 'scripts/migrations/history.py'), '--read', `${name}/migration.sql`],
    {
      cwd: root,
      encoding: 'utf8',
      windowsHide: true,
      timeout: 30000,
      maxBuffer: 2 * 1024 * 1024,
    },
  )
  const bytes = Buffer.from(value.trim(), 'base64')
  return encoding ? bytes.toString(encoding) : bytes
}

export function stageHistoricalMigration(destination, name) {
  const target = path.resolve(destination, name)
  const temporary = path.join(root, '.tmp')
  if (!target.startsWith(`${temporary}${path.sep}`) || fs.existsSync(target))
    throw new Error('HISTORICAL_STAGE')
  const bytes = historicalMigration(name)
  fs.mkdirSync(target, { recursive: true })
  fs.writeFileSync(path.join(target, 'migration.sql'), bytes)
}
