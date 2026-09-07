import { spawn } from 'node:child_process'
// Internal child of Start-DevRuntime.ps1; no credentials in command arguments.
import fs from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')
const api = path.join(root, 'apps/api')
const require = createRequire(path.join(api, 'package.json'))
const { parse } = require('dotenv')
const secrets = new Set()
function collect(values) {
  for (const [key, value] of Object.entries(values)) {
    if (!value) continue
    if (/KEY|SECRET|PASSWORD|DATABASE_URL|DIRECT_URL/i.test(key)) secrets.add(value)
    if (/DATABASE_URL|DIRECT_URL/.test(key)) {
      try {
        const parsed = new URL(value)
        if (parsed.password) {
          secrets.add(parsed.password)
          secrets.add(decodeURIComponent(parsed.password))
        }
      } catch {
        /* Never emit invalid configuration. */
      }
    }
  }
}
collect(process.env)
for (const relative of ['apps/api/.env.local', 'apps/api/.env', '.env.local', '.env']) {
  const filename = path.join(root, relative)
  if (fs.existsSync(filename)) collect(parse(fs.readFileSync(filename)))
}
function redact(text) {
  let safe = text.replace(/postgres(?:ql)?:\/\/\S+/g, '[connection URL withheld]')
  for (const secret of [...secrets].sort((a, b) => b.length - a.length)) {
    safe = safe.split(secret).join('[secret withheld]')
  }
  return safe.replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, '[JWT withheld]')
}
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
// Buffer complete lines so a credential split across output chunks is redacted.
for (const [stream, destination] of [
  [child.stdout, process.stdout],
  [child.stderr, process.stderr],
]) {
  let pending = ''
  stream.setEncoding('utf8')
  stream.on('data', (chunk) => {
    pending += chunk
    const lines = pending.split('\n')
    pending = lines.pop() ?? ''
    for (const line of lines) destination.write(`${redact(line)}\n`)
    if (pending.length > 1_000_000) pending = '[Oversized output withheld]'
  })
  stream.on('end', () => {
    if (pending) destination.write(redact(pending))
  })
}
child.on('error', () => {
  console.error('Runtime child could not start; sensitive details withheld.')
  process.exitCode = 1
})
child.on('exit', (code) => {
  process.exitCode = code ?? 1
})
