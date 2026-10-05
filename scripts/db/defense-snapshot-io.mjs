// Side effects for defense-snapshot.mjs: psql and pg_dump inside the local container, and .tmp files.
import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

import { localDatabase } from './local-target.mjs'

const PSQL_FLAGS = ['-v', 'ON_ERROR_STOP=1', '-X', '-q', '-At']

function docker(args, { input, capture = true, env = {} } = {}) {
  const output = execFileSync('docker', args, {
    input,
    encoding: 'utf8',
    maxBuffer: 1024 * 1024 * 1024,
    stdio: [input === undefined ? 'ignore' : 'pipe', capture ? 'pipe' : 'inherit', 'inherit'],
    env: { ...process.env, MSYS_NO_PATHCONV: '1', ...env },
  })
  return output ?? ''
}

/** Refuses to run unless the fixed local container publishes the fixed local port. */
export function assertLocalContainer() {
  const published = docker(['port', localDatabase.container, '5432/tcp'])
  if (!published.split(/\r?\n/).some((line) => line.trim().endsWith(`:${localDatabase.port}`)))
    throw new Error(
      `${localDatabase.container} is not published on ${localDatabase.port}. Run pnpm db:local:start.`,
    )
}

/** Runs SQL on the local stack as postgres. */
export const psqlLocal = (sql, options = {}) =>
  docker(
    [
      'exec',
      '-i',
      localDatabase.container,
      'psql',
      ...PSQL_FLAGS,
      '-U',
      'postgres',
      '-d',
      'postgres',
    ],
    { input: sql, ...options },
  )

/** Runs SQL against a URL with the container's psql; the URL travels by environment, never argv. */
export const psqlUrl = (url, sql, options = {}) =>
  docker(
    [
      'exec',
      '-i',
      '-e',
      'PATHWAYS_SNAPSHOT_PGURL',
      localDatabase.container,
      'sh',
      '-c',
      `exec psql "$PATHWAYS_SNAPSHOT_PGURL" ${PSQL_FLAGS.join(' ')}`,
    ],
    { input: sql, env: { PATHWAYS_SNAPSHOT_PGURL: url }, ...options },
  )

/** Data-only dump of exactly the given tables from the local stack. */
export const dumpLocal = (tables) =>
  docker([
    'exec',
    localDatabase.container,
    'pg_dump',
    '-U',
    'postgres',
    '-d',
    'postgres',
    '--data-only',
    '--no-owner',
    '--no-privileges',
    '--strict-names',
    '--encoding=UTF8',
    ...tables.map((table) => `--table=${table}`),
  ])

export const readJson = (file) => JSON.parse(readFileSync(file, 'utf8'))

/** Writes a private file, creating its directory. */
export function writeText(file, text) {
  mkdirSync(path.dirname(file), { recursive: true })
  writeFileSync(file, text, { mode: 0o600 })
}

export const writeJson = (file, value) => writeText(file, `${JSON.stringify(value, null, 2)}\n`)
