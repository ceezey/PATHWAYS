import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { config as loadEnv } from 'dotenv'
import { defineConfig, env } from 'prisma/config'
import { validatePhase6MigrationUrl } from '../../../apps/api/prisma/legacy-retirement-target'

const currentDir = path.dirname(fileURLToPath(import.meta.url))
const repositoryRoot = path.resolve(currentDir, '../../..')
const apiRoot = path.join(repositoryRoot, 'apps/api')

for (const envFile of [
  path.join(apiRoot, '.env.local'),
  path.join(apiRoot, '.env'),
  path.join(repositoryRoot, '.env.local'),
  path.join(repositoryRoot, '.env'),
]) {
  loadEnv({ path: envFile, override: false })
}

export default defineConfig({
  schema: path.join(apiRoot, 'prisma/schema.prisma'),
  migrations: { path: path.join(apiRoot, 'prisma/migrations') },
  datasource: { url: validatePhase6MigrationUrl(env('DIRECT_URL')) },
})
