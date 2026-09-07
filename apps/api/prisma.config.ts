import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { config as loadEnv } from 'dotenv'
import { defineConfig, env } from 'prisma/config'

const currentDir = path.dirname(fileURLToPath(import.meta.url))

for (const envFile of [
  path.join(currentDir, '.env.local'),
  path.join(currentDir, '.env'),
  path.join(currentDir, '..', '..', '.env.local'),
  path.join(currentDir, '..', '..', '.env'),
]) {
  loadEnv({ path: envFile, override: false })
}

export default defineConfig({
  schema: path.join(currentDir, 'prisma', 'schema.prisma'),
  migrations: {
    path: path.join(currentDir, 'prisma', 'migrations'),
    seed: 'node -r ts-node/register -r tsconfig-paths/register prisma/seed.ts',
  },
  datasource: {
    url: env('DIRECT_URL'),
  },
  // datasource: {
  //   provider: 'postgresql',
  //   url: process.env.DATABASE_URL,
  //   directUrl: process.env.DIRECT_URL
  // },
})
