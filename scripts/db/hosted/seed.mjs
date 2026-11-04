// Launches apps/api/prisma/seeds/hosted-realistic-seed.ts against the hosted PATHWAYS-devV2
// project, or with --production the demo-free production-bootstrap.ts against PATHWAYS. Never
// connects to anything itself: it only validates the env file the developer points at, then
// hands the resulting env vars to the seed process.
//
// Usage:
//   node scripts/db/hosted/seed.mjs --env-file <path under .tmp/ or outside the repo>
//   node scripts/db/hosted/seed.mjs --env-file <path> --production   (PATHWAYS, no demo data)
//   node scripts/db/hosted/seed.mjs --env-file <path> --test-local   (loopback only, for local testing)
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  ALLOWED_PROJECT_REF,
  PRODUCTION_PROJECT_REF,
  assertSeedTarget,
  loadEnvFile,
  resolveEnvFilePath,
} from './seed-target.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..')

function parseArgs(argv) {
  let envFile
  let testLocal = false
  let production = false
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--env-file') envFile = argv[i + 1]
    else if (argv[i] === '--test-local') testLocal = true
    else if (argv[i] === '--production') production = true
  }
  return { envFile, testLocal, production }
}

function main() {
  const { envFile, testLocal, production } = parseArgs(process.argv.slice(2))
  const resolvedPath = resolveEnvFilePath(envFile)
  const env = loadEnvFile(resolvedPath)
  const projectRef = production ? PRODUCTION_PROJECT_REF : ALLOWED_PROJECT_REF
  const target = assertSeedTarget(env, { testLocal, projectRef })
  const seed = production ? 'production-bootstrap.ts' : 'hosted-realistic-seed.ts'

  console.info(
    target.mode === 'hosted'
      ? `Running ${seed} on hosted project ${target.projectRef} (${production ? 'PATHWAYS' : 'PATHWAYS-devV2'}).`
      : `Running ${seed} against a loopback target (--test-local).`,
  )

  const result = spawnSync(
    'pnpm',
    ['--filter', '@pathways/api', 'exec', 'tsx', `prisma/seeds/${seed}`],
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
