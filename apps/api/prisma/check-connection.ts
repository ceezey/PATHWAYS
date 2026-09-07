import path from 'node:path'

import { config as loadEnv } from 'dotenv'

import { PrismaService } from '../src/prisma/prisma.service'

const apiDir = path.resolve(__dirname, '..')

for (const envFile of [
  path.join(apiDir, '.env.local'),
  path.join(apiDir, '.env'),
  path.join(apiDir, '..', '..', '.env.local'),
  path.join(apiDir, '..', '..', '.env'),
]) {
  loadEnv({ path: envFile, override: false })
}

async function checkConnection() {
  const prisma = new PrismaService()

  try {
    await prisma.onModuleInit()

    const rows = await prisma.$queryRaw<Array<{ connectionCheck: number }>>`
      SELECT 1 AS "connectionCheck"
    `

    if (rows[0]?.connectionCheck !== 1) {
      throw new Error('PostgreSQL returned an unexpected connection-check result.')
    }

    console.info('Database connection check succeeded (SELECT 1).')
  } finally {
    await prisma.onModuleDestroy()
  }
}

void checkConnection().catch(() => {
  console.error(
    'Database connection check failed. Verify DATABASE_URL and Supabase network access.',
  )
  process.exitCode = 1
})
