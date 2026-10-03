import { spawn } from 'node:child_process'
// Local watch launcher: hosted devV2 runtime role from apps/api/.env, owner credentials blanked.
import fs from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRuntimeRedactor, forwardRedactedLines } from './runtime-output.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')
const api = path.join(root, 'apps/api')
const require = createRequire(path.join(api, 'package.json'))
const { parse } = require('dotenv')
const valueSets = [process.env]
for (const relative of ['apps/api/.env.local', 'apps/api/.env', '.env.local', '.env']) {
  const filename = path.join(root, relative)
  if (fs.existsSync(filename)) valueSets.push(parse(fs.readFileSync(filename)))
}
const redact = createRuntimeRedactor(valueSets)
// Empty values stop Nest's dotenv from reloading migration credentials into the runtime.
const child = spawn(
  process.execPath,
  [require.resolve('@nestjs/cli/bin/nest.js'), 'start', '--watch', '--entryFile', 'apps/api/src/main'],
  {
    cwd: api,
    env: { ...process.env, DIRECT_URL: '', SHADOW_DATABASE_URL: '', PGPASSWORD: '' },
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  },
)
Promise.all([
  forwardRedactedLines(child.stdout, process.stdout, redact),
  forwardRedactedLines(child.stderr, process.stderr, redact),
]).catch(() => {
  console.error('Watch output capture failed; sensitive details withheld.')
  process.exitCode = 1
})
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal))
child.on('close', (code) => {
  process.exitCode = process.exitCode || (code ?? 1)
})
