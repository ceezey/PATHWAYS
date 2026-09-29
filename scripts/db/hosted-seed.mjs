// Launches apps/api/prisma/hosted-realistic-seed.ts against the hosted PATHWAYS-role-staging
// project. Never connects to anything itself: it only validates the env file the developer
// points at, then hands the resulting env vars to the seed process.
//
// Usage:
//   node scripts/db/hosted-seed.mjs --env-file <path under .tmp/ or outside the repo>
//   node scripts/db/hosted-seed.mjs --env-file <path> --test-local   (loopback only, for local testing)
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { assertSeedTarget, loadEnvFile, resolveEnvFilePath } from './hosted-seed-target.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')

function parseArgs(argv) {
  let envFile
  let testLocal = false
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--env-file') envFile = argv[i + 1]
    else if (argv[i] === '--test-local') testLocal = true
  }
  return { envFile, testLocal }
}

function main() {
  const { envFile, testLocal } = parseArgs(process.argv.slice(2))
  const resolvedPath = resolveEnvFilePath(envFile)
  const env = loadEnvFile(resolvedPath)
  const target = assertSeedTarget(env, { testLocal })

  console.info(
    target.mode === 'hosted'
      ? `Seeding hosted project ${target.projectRef} (PATHWAYS-role-staging).`
      : 'Running against a loopback target (--test-local).',
  )

  const result = spawnSync(
    'pnpm',
    [
      '--filter',
      '@pathways/api',
      'exec',
      'node',
      '-r',
      'ts-node/register',
      '-r',
      'tsconfig-paths/register',
      'prisma/hosted-realistic-seed.ts',
    ],
    {
      cwd: root,
      stdio: 'inherit',
      shell: process.platform === 'win32',
      env: {
        ...process.env,
        ...env,
        PATHWAYS_HOSTED_SEED_MODE: target.mode,
      },
    },
  )
  process.exit(result.status ?? 1)
}

main()
