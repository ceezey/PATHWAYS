// Defense demo snapshot: mirror devV2 identities locally, dump the local seed, restore it onto devV2.
// Hosted runs belong to the developer; implementers use --test-local and an identities fixture only.
//
// Usage:
//   node scripts/db/defense-snapshot.mjs mirror (--env-file <path> | --identities <file>)
//   node scripts/db/defense-snapshot.mjs dump [--identities <file>]
//   node scripts/db/defense-snapshot.mjs restore (--env-file <path> | --test-local) [--identities <file>]
//     [--today YYYY-MM-DD, test-local only] [--skip-storage]
//   node scripts/db/defense-snapshot.mjs storage (--env-file <path> | --test-local)
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { dayDelta, manilaDay, restoreWarnings } from './defense-snapshot-dates.mjs'
import { assertLocalContainer, psqlLocal, psqlUrl, readJson } from './defense-snapshot-io.mjs'
import { dump, mirror } from './defense-snapshot-local.mjs'
import {
  assertSameTables,
  compareCounts,
  countsOf,
  parseDump,
  parseWipeTables,
} from './defense-snapshot-parse.mjs'
import { buildRestoreSql } from './defense-snapshot-sql.mjs'
import { assertDistinctStorage, copyObjects } from './defense-snapshot-storage.mjs'
import { assertIdentities, assertRestoreTarget, libpqUrl } from './defense-snapshot-target.mjs'
import {
  ALLOWED_PROJECT_REF,
  assertSeedTarget,
  loadEnvFile,
  resolveEnvFilePath,
} from './hosted-seed-target.mjs'
import { localSupabase } from './local-target.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const files = {
  identities: path.join(root, '.tmp', 'defense-identities.json'),
  data: path.join(root, '.tmp', 'defense-snapshot', 'data.sql'),
  manifest: path.join(root, '.tmp', 'defense-snapshot', 'manifest.json'),
  wipe: path.join(root, 'infra', 'supabase', 'phase6', 'hosted-defense-demo-wipe.sql'),
}

function parseArgs(argv) {
  const value = (name) => {
    const index = argv.indexOf(name)
    if (index === -1) return undefined
    const next = argv[index + 1]
    if (next === undefined || next.startsWith('--')) throw new Error(`${name} needs a value.`)
    return next
  }
  return {
    command: argv[0],
    envFile: value('--env-file'),
    identities: value('--identities'),
    today: value('--today'),
    testLocal: argv.includes('--test-local'),
    skipStorage: argv.includes('--skip-storage'),
  }
}

function hostedEnv(envFile) {
  const env = loadEnvFile(resolveEnvFilePath(envFile))
  assertSeedTarget(env, { testLocal: false })
  return env
}

const readIdentities = (file) => assertIdentities(readJson(file ?? files.identities))

function localStorageApi() {
  const local = localSupabase()
  return { url: local.apiUrl, key: local.serviceRoleKey }
}

function restoreTarget(args) {
  if (args.testLocal === Boolean(args.envFile))
    throw new Error('Pass exactly one of --env-file or --test-local.')
  if (args.today && !args.testLocal) throw new Error('--today is only allowed with --test-local.')
  if (args.testLocal) {
    assertLocalContainer()
    return {
      label: 'the local stack',
      verify: 'node scripts/db/defense-demo.mjs --test-local --verify',
      run: (sql) => psqlLocal(sql, { capture: false }),
    }
  }
  const env = hostedEnv(args.envFile)
  const needStorage = args.command === 'storage' || !args.skipStorage
  if (needStorage && !env.SUPABASE_SERVICE_ROLE_KEY)
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is required in the env file for the storage copy.')
  const url = libpqUrl(assertRestoreTarget(env))
  const target = { url: env.SUPABASE_URL, key: env.SUPABASE_SERVICE_ROLE_KEY }
  const source = needStorage ? localStorageApi() : null
  if (source) assertDistinctStorage(source, target)
  assertLocalContainer()
  return {
    label: `hosted project ${ALLOWED_PROJECT_REF} (PATHWAYS-devV2)`,
    verify: `node scripts/db/defense-demo.mjs --env-file ${args.envFile} --verify`,
    run: (sql) => psqlUrl(url, sql, { capture: false }),
    storage: source && { source, target },
  }
}

async function copyStorage(manifest, target, args) {
  try {
    await copyObjects(manifest.storage, target.storage.source, target.storage.target)
  } catch (error) {
    console.error(
      `Storage copy failed; rerun: node scripts/db/defense-snapshot.mjs storage --env-file ${args.envFile}`,
    )
    throw error
  }
}

async function restore(args) {
  const target = restoreTarget(args)
  const manifest = readJson(files.manifest)
  const identities = readIdentities(args.identities)
  if (identities.organization.id !== manifest.organizationId)
    throw new Error('The snapshot organization differs from the identities file.')
  const wipeSql = readFileSync(files.wipe, 'utf8')
  const { blocks } = parseDump(readFileSync(files.data, 'utf8'))
  assertSameTables(parseWipeTables(wipeSql), blocks)
  const mismatches = compareCounts(manifest.tables, countsOf(blocks))
  if (mismatches.length)
    throw new Error(`data.sql does not match manifest.json: ${mismatches.join('; ')}`)
  const restoreDay = args.today ?? manilaDay()
  const delta = dayDelta(manifest.seedDay, restoreDay)
  const warnings = restoreWarnings({
    seedDay: manifest.seedDay,
    restoreDay,
    dumpedAt: manifest.dumpedAt,
  })
  for (const warning of warnings) console.warn(`Warning: ${warning}`)
  console.info('Keep the GitHub variable RULES_DISPATCH_ENABLED=false until --verify passes.')
  console.info(
    `Restoring ${blocks.length} tables onto ${target.label}; dates shift by ${delta} day(s).`,
  )
  target.run(
    buildRestoreSql({
      wipeSql,
      migration: manifest.migration,
      users: identities.users,
      blocks,
      dateColumns: manifest.dateColumns,
      tables: manifest.tables,
      delta,
    }),
  )
  console.info('Database restore committed.')
  if (args.testLocal) console.info('Storage copy skipped: the local stack is already the source.')
  else if (!args.skipStorage) await copyStorage(manifest, target, args)
  console.info(`Next: ${target.verify}`)
}

async function storage(args) {
  if (args.testLocal)
    throw new Error(
      'Storage source and target are the same project; --test-local has nothing to copy.',
    )
  const target = restoreTarget(args)
  await copyStorage(readJson(files.manifest), target, args)
}

const commands = {
  mirror: (args) => mirror(args, files, hostedEnv),
  dump: (args) => dump(args, files, readIdentities),
  restore,
  storage,
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (!Object.hasOwn(commands, args.command ?? '')) {
    console.error(
      'Usage: node scripts/db/defense-snapshot.mjs mirror|dump|restore|storage [options]',
    )
    process.exit(2)
  }
  await commands[args.command](args)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
