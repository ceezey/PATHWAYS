import { spawn } from 'node:child_process'
// Internal child of Start-DevRuntime.ps1; no credentials in command arguments.
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
const mode = process.argv[2]
if (!['Check', 'Start'].includes(mode)) throw new Error('Protected launcher mode required.')
const args =
  mode === 'Check'
    ? ['-r', 'ts-node/register', '-r', 'tsconfig-paths/register', 'prisma/check-connection.ts']
    : ['dist/apps/api/src/main.js']
const child = spawn(process.execPath, args, {
  cwd: api,
  env: { ...process.env, DIRECT_URL: '', SHADOW_DATABASE_URL: '' },
  windowsHide: true,
  stdio: ['ignore', 'pipe', 'pipe'],
})
// Drain concurrently, with per-line bounds and destination backpressure. Only
// redacted text crosses the outer PowerShell transport.
const output = Promise.all([
  forwardRedactedLines(child.stdout, process.stdout, redact),
  forwardRedactedLines(child.stderr, process.stderr, redact),
])
let outputFailed = false
output.catch(() => {
  outputFailed = true
  console.error('Runtime output capture failed; sensitive details withheld.')
  process.exitCode = 1
})
child.on('error', () => {
  console.error('Runtime child could not start; sensitive details withheld.')
  process.exitCode = 1
})
child.on('close', (code) => {
  process.exitCode = outputFailed ? 1 : (code ?? 1)
})
