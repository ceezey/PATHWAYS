import path from 'node:path'

import { PrismaClient } from '@prisma/client'
import { config as loadEnv } from 'dotenv'

import { readApiEnv } from '@pathways/config'
import { APP_ROLES, AppRole } from '@pathways/shared'

for (const envFile of [
  path.resolve(__dirname, '..', '.env.local'),
  path.resolve(__dirname, '..', '.env'),
  path.resolve(__dirname, '..', '..', '.env.local'),
  path.resolve(__dirname, '..', '..', '.env'),
]) {
  loadEnv({ path: envFile, override: false })
}

const prisma = new PrismaClient()

async function main() {
  const env = readApiEnv(process.env)

  for (const role of APP_ROLES) {
    await prisma.role.upsert({
      where: { name: role },
      update: {
        description: `${role} seed role`,
      },
      create: {
        name: role,
        description: `${role} seed role`,
      },
    })
  }

  const adminUser = await prisma.user.upsert({
    where: { email: env.DEV_ADMIN_EMAIL },
    update: {
      supabaseUserId: env.DEV_ADMIN_SUPABASE_ID,
      fullName: 'Development Admin',
    },
    create: {
      email: env.DEV_ADMIN_EMAIL,
      supabaseUserId: env.DEV_ADMIN_SUPABASE_ID,
      fullName: 'Development Admin',
    },
  })

  const adminRole = await prisma.role.findUniqueOrThrow({
    where: { name: AppRole.ADMIN },
  })

  await prisma.userRole.upsert({
    where: {
      userId_roleId: {
        userId: adminUser.id,
        roleId: adminRole.id,
      },
    },
    update: {},
    create: {
      userId: adminUser.id,
      roleId: adminRole.id,
    },
  })

  const program = await prisma.program.upsert({
    where: { code: 'PATHWAYS-CORE' },
    update: {},
    create: {
      code: 'PATHWAYS-CORE',
      name: 'PATHWAYS Core Program',
      description: 'Seed placeholder program for the development scaffold.',
    },
  })

  await prisma.project.upsert({
    where: { code: 'PATHWAYS-PILOT' },
    update: {
      programId: program.id,
    },
    create: {
      code: 'PATHWAYS-PILOT',
      name: 'PATHWAYS Pilot Project',
      description: 'Seed placeholder project for local development.',
      programId: program.id,
    },
  })
}

main()
  .then(async () => {
    await prisma.$disconnect()
  })
  .catch(async (error) => {
    console.error(error)
    await prisma.$disconnect()
    process.exit(1)
  })
