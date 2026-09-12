import path from 'node:path'
import { defineConfig } from '../../../apps/api/node_modules/prisma/config.js'
import { requireCheck, root, validateLocalUrl, validateStaging, verifySources } from './config.mjs'

// Explicit config prevents loading apps/api/prisma.config.ts or its env files.
verifySources()
const localUrl = validateLocalUrl(process.env.PATHWAYS_RECONCILE_LOCAL_URL)
requireCheck(
  process.env.DIRECT_URL === localUrl && process.env.DATABASE_URL === localUrl,
  'LOCAL_ENV',
)
export default defineConfig({
  schema: path.join(root, 'apps/api/prisma/schema.prisma'),
  migrations: { path: validateStaging(process.env.PATHWAYS_RECONCILE_STAGE) },
  datasource: { url: localUrl },
})
