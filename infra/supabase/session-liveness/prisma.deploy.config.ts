import path from 'node:path'
import { fileURLToPath } from 'node:url'
// Prisma is owned by the API workspace; resolve that exact installed package.
import { defineConfig, env } from '../../../apps/api/node_modules/prisma/config.js'

const directory = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(directory, '../../..')
const temporaryRoot = path.join(root, '.tmp')
const migrations = path.resolve(env('PATHWAYS_SESSION_LIVENESS_STAGE'))

if (!migrations.startsWith(`${temporaryRoot}${path.sep}`)) {
  throw new Error('Session-liveness migrations must be staged below repository .tmp.')
}

export default defineConfig({
  engine: 'classic',
  schema: path.join(root, 'apps/api/prisma/schema.prisma'),
  migrations: { path: migrations },
  datasource: { url: env('PATHWAYS_SESSION_LIVENESS_URL') },
})
