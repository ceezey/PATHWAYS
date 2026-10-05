// Defense demo snapshot: mirror devV2 identities locally, dump the local seed, restore it onto devV2.
// Hosted runs belong to the developer; implementers use --test-local and an identities fixture only.
//
// Usage:
//   node scripts/db/defense-snapshot.mjs mirror (--env-file <path> | --identities <file>)
//   node scripts/db/defense-snapshot.mjs dump [--identities <file>]
//   node scripts/db/defense-snapshot.mjs restore (--env-file <path> | --test-local) [--identities <file>]
//     [--today YYYY-MM-DD, test-local only] [--skip-storage] [--allow-shift] [--dry-run]
//   node scripts/db/defense-snapshot.mjs storage (--env-file <path> | --test-local)
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { readJson } from './defense-snapshot-io.mjs'
import { dump, mirror } from './defense-snapshot-local.mjs'
import { restore, storage } from './defense-snapshot-restore.mjs'
import { assertIdentities } from './defense-snapshot-target.mjs'
import { assertSeedTarget, loadEnvFile, resolveEnvFilePath } from './hosted-seed-target.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const files = {
  identities: path.join(root, '.tmp', 'defense-identities.json'),
  data: path.join(root, '.tmp', 'defense-snapshot', 'data.sql'),
  manifest: path.join(root, '.tmp', 'defense-snapshot', 'manifest.json'),
  wipe: path.join(root, 'infra', 'supabase', 'phase6', 'hosted-defense-demo-wipe.sql'),
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
  }
}

function hostedEnv(envFile) {
  const env = loadEnvFile(resolveEnvFilePath(envFile))
  assertSeedTarget(env, { testLocal: false })
  return env
}

const readIdentities = (file) => assertIdentities(readJson(file ?? files.identities))

const commands = {
  mirror: (args) => mirror(args, files, hostedEnv),
  dump: (args) => dump(args, files, readIdentities),
  restore: (args) => restore(args, files, hostedEnv, readIdentities),
  storage: (args) => storage(args, files, hostedEnv),
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (!Object.hasOwn(commands, args.command ?? '')) {
    console.error(
      'Usage: node scripts/db/defense-snapshot.mjs mirror|dump|restore|storage [options]',
    )
    process.exit(2)
  }
  await commands[args.command](args)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
