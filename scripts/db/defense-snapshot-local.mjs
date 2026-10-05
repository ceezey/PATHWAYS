// Local-stack halves of the defense snapshot: mirror hosted identities in, dump the seeded stack out.
import { readFileSync } from 'node:fs'

import {
  assertLocalContainer,
  dumpLocal,
  parseJson,
  psqlLocal,
  psqlUrl,
  readJson,
  writeJson,
  writeText,
} from './defense-snapshot-io.mjs'
import {
  assertSameTables,
  countsOf,
  parseDump,
  parseWipeTables,
} from './defense-snapshot-parse.mjs'
import {
  dateColumnsSql,
  mirrorReadSql,
  mirrorWriteSql,
  seedInfoSql,
  storageObjectsSql,
} from './defense-snapshot-sql.mjs'
import {
  assertIdentities,
  assertSameMigration,
  latestMigrationSql,
  libpqUrl,
} from './defense-snapshot-target.mjs'
import { ALLOWED_PROJECT_REF } from './hosted-seed-target.mjs'

export async function mirror(args, files, hostedEnv) {
  if (Boolean(args.envFile) === Boolean(args.identities))
    throw new Error('mirror needs exactly one of --env-file or --identities.')
  const env = args.envFile ? hostedEnv(args.envFile) : null
  assertLocalContainer()
  if (env)
    assertSameMigration(
      psqlLocal(latestMigrationSql()),
      psqlUrl(libpqUrl(env.DIRECT_URL), latestMigrationSql()),
    )
  const identities = env
    ? {
        projectRef: ALLOWED_PROJECT_REF,
        capturedAt: new Date().toISOString(),
        ...parseJson(
          psqlUrl(libpqUrl(env.DIRECT_URL), mirrorReadSql()).trim(),
          'The devV2 identities query result',
        ),
      }
    : readJson(args.identities)
  assertIdentities(identities)
  if (env) writeJson(files.identities, identities)
  psqlLocal(readFileSync(files.wipe, 'utf8'))
  const count = psqlLocal(mirrorWriteSql(identities)).trim()
  console.info(
    `Mirrored 1 organization and ${count} staff accounts into the local stack; their local sign-in stays off until pnpm db:local:reset.`,
  )
}

export async function dump(args, files, readIdentities) {
  assertLocalContainer()
  const organizationId = readIdentities(args.identities).organization.id
  if (psqlLocal('SELECT id FROM pathways.organizations;').trim() !== organizationId)
    throw new Error(
      'The local organization is not the mirrored one; run mirror, then pnpm db:defense:local.',
    )
  const tables = parseWipeTables(readFileSync(files.wipe, 'utf8'))
  const seed = parseJson(psqlLocal(seedInfoSql()).trim(), 'The local query result')
  if (!seed.seedDay) throw new Error('No seeded audit rows; run pnpm db:defense:local first.')
  const dateColumns = parseJson(psqlLocal(dateColumnsSql(tables)).trim(), 'The local query result')
  const storage = parseJson(
    psqlLocal(storageObjectsSql(organizationId)).trim(),
    'The local query result',
  )
  const text = dumpLocal(tables)
  const { blocks } = parseDump(text)
  assertSameTables(tables, blocks)
  const counts = countsOf(blocks)
  writeText(files.data, text)
  writeJson(files.manifest, {
    version: 1,
    seedDay: seed.seedDay,
    migration: seed.migration,
    dumpedAt: new Date().toISOString(),
    organizationId,
    tables: counts,
    dateColumns,
    storage,
  })
  const rows = counts.reduce((sum, entry) => sum + entry.rows, 0)
  console.info(
    `Dumped ${counts.length} tables (${rows} rows) and ${storage.length} storage objects; seed day ${seed.seedDay}, migration ${seed.migration}.`,
  )
}
