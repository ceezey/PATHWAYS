// Defense demo snapshot: mirror hosted identities locally, dump the local seed, restore it onto the
// hosted project (devV2, or production with --production). Hosted runs belong to the developer;
// implementers use --test-local and an identities fixture only.
//
// Usage:
//   node scripts/db/defense/snapshot.mjs mirror (--env-file <path> [--production] | --identities <file>)
//   node scripts/db/defense/snapshot.mjs dump [--identities <file>]
//   node scripts/db/defense/snapshot.mjs restore (--env-file <path> [--production] | --test-local)
//     [--identities <file>] [--today YYYY-MM-DD, test-local only] [--skip-storage] [--allow-shift] [--dry-run]
//   node scripts/db/defense/snapshot.mjs storage (--env-file <path> [--production] | --test-local)
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  ALLOWED_PROJECT_REF,
  PRODUCTION_PROJECT_REF,
  assertSeedTarget,
  loadEnvFile,
  resolveEnvFilePath,
} from '../hosted/seed-target.mjs'
import { readJson } from './snapshot-io.mjs'
import { dump, mirror } from './snapshot-local.mjs'
import { restore, storage } from './snapshot-restore.mjs'
import { assertIdentities } from './snapshot-target.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const files = {
  identities: path.join(root, '.tmp', 'defense-identities.json'),
  data: path.join(root, '.tmp', 'defense-snapshot', 'data.sql'),
  manifest: path.join(root, '.tmp', 'defense-snapshot', 'manifest.json'),
  wipe: path.join(root, 'infra', 'supabase', 'replay', 'hosted-defense-demo-wipe.sql'),
}

function parseArgs(argv) {
  const value = (name) => {
    const index = argv.indexOf(name)
    if (index === -1) return undefined
    const next = argv[index + 1]
    if (next === undefined || next.startsWith('--')) throw new Error(`${name} needs a value.`)
    return next
  }
  return {
    command: argv[0],
    envFile: value('--env-file'),
    identities: value('--identities'),
    today: value('--today'),
    testLocal: argv.includes('--test-local'),
    skipStorage: argv.includes('--skip-storage'),
    allowShift: argv.includes('--allow-shift'),
    dryRun: argv.includes('--dry-run'),
    projectRef: argv.includes('--production') ? PRODUCTION_PROJECT_REF : ALLOWED_PROJECT_REF,
  }
}

function hostedEnv(envFile, projectRef) {
  const env = loadEnvFile(resolveEnvFilePath(envFile))
  assertSeedTarget(env, { testLocal: false, projectRef })
  return env
}

const readIdentities = (file) => assertIdentities(readJson(file ?? files.identities))

const commands = {
  mirror: (args) => mirror(args, files, (file) => hostedEnv(file, args.projectRef)),
  dump: (args) => dump(args, files, readIdentities),
  restore: (args) =>
    restore(args, files, (file) => hostedEnv(file, args.projectRef), readIdentities),
  storage: (args) => storage(args, files, (file) => hostedEnv(file, args.projectRef)),
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (!Object.hasOwn(commands, args.command ?? '')) {
    console.error(
      'Usage: node scripts/db/defense/snapshot.mjs mirror|dump|restore|storage [options]',
    )
    process.exit(2)
  }
  await commands[args.command](args)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
