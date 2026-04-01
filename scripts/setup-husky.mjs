import { spawnSync } from 'node:child_process'
import { existsSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const ensureJitiCompat = () => {
  const pnpmDirectory = join('node_modules', '.pnpm')

  if (!existsSync(pnpmDirectory)) {
    return
  }

  for (const entry of readdirSync(pnpmDirectory)) {
    if (!entry.startsWith('c12@')) {
      continue
    }

    const jitiDirectory = join(pnpmDirectory, entry, 'node_modules', 'jiti')
    const shimPath = join(jitiDirectory, 'index.js')

    if (!existsSync(jitiDirectory) || existsSync(shimPath)) {
      continue
    }

    writeFileSync(
      shimPath,
      "export { default } from './lib/jiti.mjs'\nexport * from './lib/jiti.mjs'\n",
    )
  }
}

ensureJitiCompat()

if (!existsSync('.git') || process.env.CI === 'true') {
  process.exit(0)
}

const command = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm'
const result = spawnSync(command, ['exec', 'husky'], {
  stdio: 'inherit',
})

if (result.error) {
  console.warn(`[husky] skipped: ${result.error.message}`)
  process.exit(0)
}

process.exit(result.status ?? 0)
