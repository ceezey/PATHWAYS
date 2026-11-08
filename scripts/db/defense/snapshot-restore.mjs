// The restore and storage commands of the defense snapshot: storage copy first, then one DB transaction.
import { readFileSync } from 'node:fs'

import { PRODUCTION_PROJECT_REF } from '../hosted/seed-target.mjs'
import { localSupabase } from '../local/target.mjs'
import { dayDelta, manilaDay, restoreWarnings } from './snapshot-dates.mjs'
import { assertLocalContainer, psqlLocal, psqlUrl, readJson } from './snapshot-io.mjs'
import {
  assertSameTables,
  compareCounts,
  countsOf,
  parseDump,
  parseWipeTables,
} from './snapshot-parse.mjs'
import { assertShiftAllowed, guardRun, summaryLines } from './snapshot-plan.mjs'
import { buildRestoreSql } from './snapshot-sql.mjs'
import { assertDistinctStorage, copyObjects } from './snapshot-storage.mjs'
import { assertIdentitiesProject, assertRestoreTarget, libpqUrl } from './snapshot-target.mjs'

function localStorageApi() {
  const local = localSupabase()
  return { url: local.apiUrl, key: local.serviceRoleKey }
}

function restoreTarget(args, hostedEnv) {
  if (args.testLocal === Boolean(args.envFile))
    throw new Error('Pass exactly one of --env-file or --test-local.')
  if (args.today && !args.testLocal) throw new Error('--today is only allowed with --test-local.')
  if (args.testLocal) {
    assertLocalContainer()
    return {
      label: 'the local stack',
      verify: 'node scripts/db/defense/demo.mjs --test-local --verify',
      run: (sql) => psqlLocal(sql, { capture: false }),
    }
  }
  const env = hostedEnv(args.envFile)
  const needStorage = args.command === 'storage' || !(args.skipStorage || args.dryRun)
  if (needStorage && !env.SUPABASE_SERVICE_ROLE_KEY)
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is required in the env file for the storage copy.')
  const { projectRef } = args
  const production = projectRef === PRODUCTION_PROJECT_REF
  const url = libpqUrl(assertRestoreTarget(env, projectRef))
  const target = { url: env.SUPABASE_URL, key: env.SUPABASE_SERVICE_ROLE_KEY }
  const source = needStorage ? localStorageApi() : null
  if (source) assertDistinctStorage(source, target)
  assertLocalContainer()
  return {
    projectRef,
    label: `hosted project ${projectRef} (${production ? 'PATHWAYS' : 'PATHWAYS-devV2'})`,
    // The seed's own --verify accepts devV2 only; production relies on the restore row-count check.
    verify: production
      ? 'sign in once per role'
      : `node scripts/db/defense/demo.mjs --env-file ${args.envFile} --verify`,
    run: guardRun((sql) => psqlUrl(url, sql, { capture: false })),
    storage: source && { source, target },
  }
}

async function copyStorage(manifest, target, args) {
  try {
    await copyObjects(manifest.storage, target.storage.source, target.storage.target)
  } catch (error) {
    console.error(
      `Storage copy failed; rerun: node scripts/db/defense/snapshot.mjs storage --env-file ${args.envFile}`,
    )
    throw error
  }
}

// Every hosted write (storage copy or restore) first proves the snapshot was mirrored from its target.
function checkedSnapshot(args, files, target, readIdentities) {
  const manifest = readJson(files.manifest)
  const identities = readIdentities(args.identities)
  if (target.projectRef) assertIdentitiesProject(identities, target.projectRef)
  if (identities.organization.id !== manifest.organizationId)
    throw new Error('The snapshot organization differs from the identities file.')
  return { manifest, identities }
}

export async function restore(args, files, hostedEnv, readIdentities) {
  const target = restoreTarget(args, hostedEnv)
  const { manifest, identities } = checkedSnapshot(args, files, target, readIdentities)
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
  for (const line of summaryLines({ manifest, restoreDay, delta, identities })) console.info(line)
  for (const warning of warnings) console.warn(`Warning: ${warning}`)
  assertShiftAllowed({ warnings, delta, allowShift: args.allowShift })
  console.info('Keep the GitHub variable RULES_DISPATCH_ENABLED=false until --verify passes.')
  if (args.testLocal) console.info('Storage copy skipped: the local stack is already the source.')
  else if (args.dryRun) console.info('Storage copy skipped: dry run.')
  else if (!args.skipStorage) await copyStorage(manifest, target, args)
  console.info(`Restoring ${blocks.length} tables onto ${target.label}.`)
  target.run(
    buildRestoreSql({
      wipeSql,
      migration: manifest.migration,
      users: identities.users,
      blocks,
      dateColumns: manifest.dateColumns,
      tables: manifest.tables,
      delta,
      dryRun: args.dryRun,
    }),
  )
  if (args.dryRun) return console.info(`Dry run rolled back; ${target.label} unchanged.`)
  console.info('Database restore committed.')
  console.info(`Next: ${target.verify}`)
}

export async function storage(args, files, hostedEnv, readIdentities) {
  if (args.testLocal)
    throw new Error(
      'Storage source and target are the same project; --test-local has nothing to copy.',
    )
  const target = restoreTarget(args, hostedEnv)
  await copyStorage(checkedSnapshot(args, files, target, readIdentities).manifest, target, args)
}
