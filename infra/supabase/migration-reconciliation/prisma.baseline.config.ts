import path from 'node:path'
import { defineConfig } from '../../../apps/api/node_modules/prisma/config.js'
import { validateBaselineStaging, validateBaselineUrl } from './baseline-config.mjs'
import { requireCheck, root, verifySources } from './config.mjs'

// This config is intentionally independent of apps/api/prisma.config.ts and
// all application env files. The guarded runner supplies only these values.
verifySources()
const mode = process.env.PATHWAYS_BASELINE_MODE
requireCheck(mode === 'local' || mode === 'hosted', 'BASELINE_MODE')
const url = validateBaselineUrl(process.env.PATHWAYS_BASELINE_URL, mode)
requireCheck(process.env.DIRECT_URL === url && process.env.DATABASE_URL === url, 'BASELINE_ENV')

export default defineConfig({
  schema: path.join(root, 'apps/api/prisma/schema.prisma'),
  migrations: {
    path: validateBaselineStaging(process.env.PATHWAYS_BASELINE_STAGE),
  },
  datasource: { url },
})
