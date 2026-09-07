import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig, env } from 'prisma/config'

const currentDir = path.dirname(fileURLToPath(import.meta.url))
const repositoryRoot = path.resolve(currentDir, '../../..')
const temporaryRoot = path.join(repositoryRoot, '.tmp')
const migrations = path.resolve(env('PATHWAYS_PHASE6_REPLAY_MIGRATIONS'))

if (!migrations.startsWith(`${temporaryRoot}${path.sep}`)) {
  throw new Error('Phase 6 replay migrations must be staged below the repository .tmp directory.')
}

export default defineConfig({
  schema: path.join(repositoryRoot, 'apps/api/prisma/schema.prisma'),
  migrations: { path: migrations },
  datasource: { url: env('DIRECT_URL') },
})
