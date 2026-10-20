// Forwards to the moved entry point for callers that still use this path.
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const target = fileURLToPath(new URL('./hosted/seed.mjs', import.meta.url))
const { status } = spawnSync(process.execPath, [target, ...process.argv.slice(2)], {
  stdio: 'inherit',
})
process.exit(status ?? 1)
