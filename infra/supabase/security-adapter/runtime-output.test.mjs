import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { PassThrough, Readable, Writable } from 'node:stream'
import { after, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import {
  MAX_RUNTIME_LINE,
  OVERSIZED_OUTPUT,
  createRuntimeRedactor,
  forwardRedactedLines,
} from './runtime-output.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const repository = path.resolve(here, '../../..')
const password = 'SYNTHETIC password/+canary'
const fakeUrl = `postgresql://fixture:${encodeURIComponent(password)}@invalid.invalid/fixture`
const jwt = 'eyJTeW50aGV0aWM.SYNTHETIC_PAYLOAD.SYNTHETIC_SIGNATURE'
const marker = 'PATHWAYS_ROUTE_CHECK_UNAVAILABLE'
const valueSets = [{ DATABASE_URL: fakeUrl, SYNTHETIC_SECRET: 'SYNTHETIC_SECRET_CANARY' }]
const redact = createRuntimeRedactor(valueSets)

async function capture(chunks, filter = redact) {
  let text = ''
  const destination = new Writable({
    write(chunk, _encoding, callback) {
      text += chunk.toString()
      callback()
    },
  })
  await forwardRedactedLines(Readable.from(chunks), destination, filter)
  return text
}

test('configured secrets, encoded/decoded passwords, URLs and JWTs are redacted', () => {
  const canaries = [fakeUrl, password, encodeURIComponent(password), jwt, 'SYNTHETIC_SECRET_CANARY']
  const safe = redact(canaries.join(' '))
  for (const canary of canaries) assert.equal(safe.includes(canary), false)
  assert.ok(safe.includes('[connection URL withheld]'))
  assert.ok(safe.includes('[JWT withheld]'))
})

test('safe operation marker/stage/reason remain intact', async () => {
  const line = JSON.stringify({ event: marker, stage: 'PROFILE_READ', reason: 'P2024' })
  assert.equal(await capture([`${line}\n`]), `${line}\n`)
})

test('every secret chunk boundary is redacted before output, including EOF', async () => {
  for (const secret of [fakeUrl, password, encodeURIComponent(password), jwt]) {
    for (let split = 1; split < secret.length; split++) {
      assert.equal(await capture([secret.slice(0, split), secret.slice(split)]), redact(secret))
    }
  }
})

test('split UTF-8, CRLF, blank lines and trailing partial line are preserved', async () => {
  const text = 'synthetic ✓\r\n\nlast ✓'
  assert.equal(await capture([...Buffer.from(text)].map((byte) => Buffer.from([byte]))), text)
})

test('unterminated input emits nothing before redaction can see the complete line', async () => {
  const source = new PassThrough()
  let output = ''
  const sink = new Writable({
    write(chunk, _encoding, callback) {
      output += chunk.toString()
      callback()
    },
  })
  const finished = forwardRedactedLines(source, sink, redact)
  source.write('SYNTHETIC_SECRET_')
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(output, '')
  source.end('CANARY\n')
  await finished
  assert.equal(output, '[secret withheld]\n')
})

test('oversized complete line is replaced, then next marker survives', async () => {
  const output = await capture([`${'x'.repeat(MAX_RUNTIME_LINE + 1)}\n${marker}\n`])
  assert.equal(output, `${OVERSIZED_OUTPUT}\n${marker}\n`)
})

test('oversized split line discards its entire tail through newline or EOF', async () => {
  for (const ending of ['', '\n']) {
    const output = await capture([
      'x'.repeat(MAX_RUNTIME_LINE),
      'SYNTHETIC_SECRET_',
      `CANARY${ending}`,
    ])
    assert.equal(output, OVERSIZED_OUTPUT + ending)
  }
})

test('legacy buffer-reset algorithm reproduces a disclosed oversized-line tail', () => {
  // Exact former reset behavior, with synthetic input only.
  let pending = `${'x'.repeat(MAX_RUNTIME_LINE)}SYNTHETIC_SECRET_`
  if (pending.length > 1_000_000) pending = '[Oversized output withheld]'
  pending += 'CANARY'
  assert.equal(redact(pending), '[Oversized output withheld]CANARY')
})

test('exact line limit is accepted without truncation', async () => {
  const text = 'x'.repeat(MAX_RUNTIME_LINE)
  assert.equal(await capture([text]), text)
})

test('destination backpressure bounds queued output', async () => {
  let lines = 0
  const sink = new Writable({
    highWaterMark: 8,
    write(_chunk, _encoding, callback) {
      lines++
      setImmediate(callback)
    },
  })
  await forwardRedactedLines(Readable.from([`${marker}\n`.repeat(1000)]), sink, redact)
  assert.equal(lines, 1000)
  assert.ok(sink.writableLength <= marker.length + 1)
})

test('malformed configured URL remains withheld and longer secrets redact first', () => {
  const filter = createRuntimeRedactor([
    { DATABASE_URL: 'synthetic-invalid-url', SHORT_KEY: 'fixture', LONG_KEY: 'fixture-long' },
  ])
  assert.equal(filter('synthetic-invalid-url fixture-long'), '[secret withheld] [secret withheld]')
})

// Full Windows PowerShell -> actual Node redactor -> fake API entry point.
// The production credential-loading block is NEVER executed or copied here.
// Only installed source files and synthetic values are put in a fresh fixture.
const windows = process.platform === 'win32'
const syntheticRoots = new Map()
const psSource = fs.readFileSync(path.join(here, 'Start-DevRuntime.ps1'), 'utf8')
const queryAssignments = [...psSource.matchAll(/^\s*\$phase4Uri\.Query = '([^'\r\n]+)'\s*$/gm)]
assert.equal(queryAssignments.length, 1)
assert.equal(queryAssignments[0][1], 'sslmode=require&connect_timeout=30&connection_limit=2')
const tailStart = psSource.indexOf('  $phase4Info = [Diagnostics.ProcessStartInfo]::new()')
assert.ok(tailStart > 0)
const launchTail = psSource.slice(tailStart)
assert.equal(/Import-Clixml|LOCALAPPDATA|GetNetworkCredential/.test(launchTail), false)

function psQuote(value) {
  return `'${value.replaceAll("'", "''")}'`
}

function makeFixture(
  mode,
  { legacy = false, startFailure = false, action = 'Start', captureFailure = false } = {},
) {
  assert.ok(['Start', 'Check'].includes(action))
  fs.mkdirSync(path.join(repository, '.tmp'), { recursive: true })
  const root = fs.mkdtempSync(path.join(repository, '.tmp/pathways-synthetic-capture-'))
  syntheticRoots.set(root, true)
  const adapter = path.join(root, 'infra/supabase/security-adapter')
  const api = path.join(root, 'apps/api')
  fs.mkdirSync(adapter, { recursive: true })
  fs.mkdirSync(path.join(api, 'dist/apps/api/src'), { recursive: true })
  fs.mkdirSync(path.join(api, 'prisma'), { recursive: true })
  for (const file of ['runtime-launch.mjs', 'runtime-output.mjs', 'Runtime-Output.ps1']) {
    fs.copyFileSync(path.join(here, file), path.join(adapter, file))
  }
  // Copy dotenv's installed source, never any repository .env or credential.
  const require = createRequire(path.join(repository, 'apps/api/package.json'))
  fs.cpSync(
    path.dirname(require.resolve('dotenv/package.json')),
    path.join(api, 'node_modules/dotenv'),
    {
      recursive: true,
    },
  )
  fs.writeFileSync(path.join(api, 'package.json'), '{"private":true}')
  for (const [index, relative] of [
    '.env',
    '.env.local',
    'apps/api/.env',
    'apps/api/.env.local',
  ].entries()) {
    fs.writeFileSync(
      path.join(root, relative),
      `FIXTURE_${index}_SECRET=SYNTHETIC_FILE_${index}_CANARY\n`,
    )
  }
  fs.writeFileSync(
    path.join(api, 'dist/apps/api/src/main.js'),
    `const fs = require('node:fs');
const mode = process.env.SYNTHETIC_MODE;
fs.writeFileSync('synthetic-process.json', JSON.stringify({ pid: process.pid }));
// Even on test failure, this fake child is finite and never opens a socket.
setTimeout(() => process.exit(91), 4000).unref();
async function run() {
  if (mode === 'throw') throw new Error(process.env.DATABASE_URL + ' ' + ${JSON.stringify(jwt)});
  if (mode === 'burst') {
    const { once } = require('node:events');
    await Promise.all([process.stdout, process.stderr].map(async (stream) => {
      for (let i = 0; i < 4096; i++) {
        if (!stream.write('SYNTHETIC_BURST_LINE\\n')) await once(stream, 'drain');
      }
    }));
  } else if (mode === 'oversized') {
    process.stderr.write('x'.repeat(${MAX_RUNTIME_LINE}) + 'SYNTHETIC_SECRET_');
    await new Promise((resolve) => setTimeout(resolve, 40));
    process.stderr.write('CANARY\\n');
  } else if (mode === 'canaries') {
    for (const stream of [process.stdout, process.stderr]) {
      const line = [process.env.DATABASE_URL, ${JSON.stringify(password)},
        ${JSON.stringify(encodeURIComponent(password))}, ${JSON.stringify(jwt)},
        ...Array.from({length: 4}, (_, i) => 'SYNTHETIC_FILE_' + i + '_CANARY')].join(' ');
      stream.write(line.slice(0, 27));
      await new Promise((resolve) => setTimeout(resolve, 30));
      stream.write(line.slice(27) + '\\n');
    }
  } else if (mode === 'scope') {
    if (process.env.DIRECT_URL !== '' || process.env.SHADOW_DATABASE_URL !== '' ||
        process.env.PGPASSWORD !== undefined) throw new Error('SYNTHETIC_SCOPE_FAILURE');
  } else if (mode === 'cap') {
    const query = new URL(process.env.DATABASE_URL).searchParams;
    if (query.size !== 3 || query.get('connection_limit') !== '2' || query.get('sslmode') !== 'require' || query.get('connect_timeout') !== '30') throw new Error('SYNTHETIC_CAP_FAILURE');
    process.stdout.write(JSON.stringify({event:'PATHWAYS_SESSION_LIVENESS_UNAVAILABLE',stage:'TRANSACTION_START',reason:'P2028',transactionFailure:'ACQUISITION_TIMEOUT'}) + '\\n');
  }
  process.stdout.write('${marker} PROFILE_READ P2024\\n');
  process.stderr.write('SYNTHETIC_STDERR_MARKER\\n');
  if (mode === 'streaming') await new Promise((resolve) => setTimeout(resolve, 500));
  process.stdout.write('SYNTHETIC_EOF');
  process.exitCode = mode === 'nonzero' ? 17 : 0;
}
run().catch((error) => { process.stderr.write(String(error) + '\\n'); process.exitCode = 1; });`,
  )
  // Check still uses the exact production command; only its TS preload and
  // DB-check entry point are synthetic. No database client is installed here.
  for (const name of ['ts-node', 'tsconfig-paths']) {
    fs.mkdirSync(path.join(api, 'node_modules', name), { recursive: true })
    fs.writeFileSync(
      path.join(api, 'node_modules', name, 'register.js'),
      "require.extensions['.ts'] = require.extensions['.js'];",
    )
  }
  fs.copyFileSync(
    path.join(api, 'dist/apps/api/src/main.js'),
    path.join(api, 'prisma/check-connection.ts'),
  )
  // Use the known installed executable directly in the isolated fixture: an
  // empty/minimal environment must not trigger PowerShell profile discovery.
  let tail = launchTail.replace(
    '(Get-Command node.exe -ErrorAction Stop).Source',
    psQuote(process.execPath),
  )
  if (legacy) {
    tail = tail
      .replace(
        /^.*\$phase4Info\.(?:RedirectStandardOutput|RedirectStandardError|StandardOutputEncoding|StandardErrorEncoding) = .*\r?\n/gm,
        '',
      )
      .replace(
        '$phase4Exit = Receive-ProtectedRuntimeOutput -Process $phase4Process',
        '$phase4Process.WaitForExit()\n  $phase4Exit = $phase4Process.ExitCode',
      )
  }
  if (startFailure) {
    tail = tail.replace(psQuote(process.execPath), "'SYNTHETIC_SECRET_CANARY-missing.exe'")
  }
  if (captureFailure) {
    // Consume one already-sanitized line to know the finite fake API is alive,
    // then simulate a broken outer pipe. Never terminate an application.
    tail = tail.replace(
      '$phase4Exit = Receive-ProtectedRuntimeOutput',
      '$null = $phase4Process.StandardOutput.ReadLine()\n  $phase4Process.StandardOutput.Dispose()\n  $phase4Exit = Receive-ProtectedRuntimeOutput',
    )
  }
  const script = path.join(root, 'synthetic-launch.ps1')
  fs.writeFileSync(
    script,
    `$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
$phase4Root = ${psQuote(root)}
$Action = '${action}'
$phase4Uri = [UriBuilder]::new(${psQuote(fakeUrl)})
${queryAssignments[0][0]}
$phase4Credential = $null
$phase4Process = $null
. ${psQuote(path.join(adapter, 'Runtime-Output.ps1'))}
try {
${tail}`,
  )
  return { root, api, script, mode }
}

async function runFixture(mode, options) {
  const fixture = makeFixture(mode, options)
  syntheticRoots.set(fixture.root, false)
  const ps = path.join(process.env.SystemRoot, 'System32/WindowsPowerShell/v1.0/powershell.exe')
  const child = spawn(ps, ['-NoProfile', '-NonInteractive', '-File', fixture.script], {
    cwd: fixture.root,
    // A small explicit synthetic environment, NOT inherited host secrets.
    env: {
      SystemRoot: process.env.SystemRoot,
      PSModulePath: path.join(process.env.SystemRoot, 'System32/WindowsPowerShell/v1.0/Modules'),
      PATH: path.dirname(process.execPath),
      TEMP: fixture.root,
      TMP: fixture.root,
      SYNTHETIC_MODE: mode,
      SYNTHETIC_SECRET: 'SYNTHETIC_SECRET_CANARY',
      DIRECT_URL: 'SYNTHETIC_ADMIN_CANARY',
      SHADOW_DATABASE_URL: 'SYNTHETIC_SHADOW_CANARY',
      PGPASSWORD: 'SYNTHETIC_PGPASSWORD_CANARY',
    },
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let stdout = ''
  let stderr = ''
  let markerBeforeExit = false
  let excessive = false
  for (const [stream, isStdout] of [
    [child.stdout, true],
    [child.stderr, false],
  ]) {
    stream.setEncoding('utf8')
    stream.on('data', (chunk) => {
      if (stdout.length + stderr.length + chunk.length > 2_000_000) {
        excessive = true
        return
      }
      if (isStdout) stdout += chunk
      else stderr += chunk
      if (stdout.includes(marker) && child.exitCode === null) markerBeforeExit = true
    })
  }
  const code = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      child.kill() // Only the synthetic PowerShell process created above.
      reject(new Error('Synthetic capture timed out; output withheld.'))
    }, 15_000)
    child.once('error', () => {
      clearTimeout(timer)
      reject(new Error('Synthetic capture could not start; details withheld.'))
    })
    child.once('close', (exitCode) => {
      clearTimeout(timer)
      resolve(exitCode)
    })
  })
  assert.equal(excessive, false, 'synthetic capture exceeded bounded output')
  const pidFile = path.join(fixture.api, 'synthetic-process.json')
  if (fs.existsSync(pidFile)) {
    const { pid } = JSON.parse(fs.readFileSync(pidFile, 'utf8'))
    // The synthetic child has its own finite deadline even if transport fails.
    // Wait only for that exact known fake PID; never enumerate/stop live apps.
    for (let attempt = 0; attempt < 60; attempt++) {
      try {
        process.kill(pid, 0)
      } catch (error) {
        assert.equal(error.code, 'ESRCH', 'synthetic child exit must be certain')
        break
      }
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
    assert.throws(() => process.kill(pid, 0), { code: 'ESRCH' }, 'synthetic child must have exited')
  }
  syntheticRoots.set(fixture.root, true)
  return { code, stdout, stderr, markerBeforeExit }
}

test(
  'original hidden/no-redirection full launcher chain loses both output markers',
  { skip: !windows },
  async () => {
    const result = await runFixture('markers', { legacy: true })
    assert.equal(result.code, 0)
    assert.equal(result.stdout, '')
    assert.equal(result.stderr, '')
  },
)

test(
  'corrected full chain captures both streams and EOF before launcher exits',
  { skip: !windows },
  async () => {
    const result = await runFixture('streaming')
    assert.equal(result.code, 0)
    assert.equal(result.stdout, `${marker} PROFILE_READ P2024\nSYNTHETIC_EOF`)
    assert.equal(result.stderr, 'SYNTHETIC_STDERR_MARKER\n')
    assert.equal(result.markerBeforeExit, true)
  },
)

test(
  'full chain redacts fake env/file/URL/password/JWT canaries on both streams',
  { skip: !windows },
  async () => {
    const result = await runFixture('canaries')
    assert.equal(result.code, 0)
    for (const output of [result.stdout, result.stderr]) {
      for (const canary of [
        fakeUrl,
        password,
        encodeURIComponent(password),
        jwt,
        ...Array.from({ length: 4 }, (_, i) => `SYNTHETIC_FILE_${i}_CANARY`),
      ]) {
        assert.equal(output.includes(canary), false)
      }
      assert.ok(output.includes('[secret withheld]'))
    }
    assert.ok(result.stdout.includes(marker))
  },
)

test(
  'both pipes drain beyond OS buffer capacity without deadlock or loss',
  { skip: !windows },
  async () => {
    const result = await runFixture('burst')
    assert.equal(result.code, 0)
    for (const output of [result.stdout, result.stderr]) {
      assert.equal(output.split('SYNTHETIC_BURST_LINE').length - 1, 4096)
    }
  },
)

test(
  'full chain oversized failure is bounded and subsequent marker is captured',
  { skip: !windows },
  async () => {
    const result = await runFixture('oversized')
    assert.equal(result.code, 0)
    assert.equal(result.stderr, `${OVERSIZED_OUTPUT}\nSYNTHETIC_STDERR_MARKER\n`)
    assert.ok(result.stdout.includes(marker))
  },
)

test('nonzero child exit and sanitized diagnostics are retained', { skip: !windows }, async () => {
  const result = await runFixture('nonzero')
  assert.equal(result.code, 17)
  assert.ok(result.stdout.includes(marker))
})

test(
  'Check command captures the finite fake check result without DB access',
  { skip: !windows },
  async () => {
    const result = await runFixture('markers', { action: 'Check' })
    assert.equal(result.code, 0)
    assert.ok(result.stdout.includes(marker))
  },
)

test(
  'synthetic thrown error is redacted and bounded through the full chain',
  { skip: !windows },
  async () => {
    const result = await runFixture('throw')
    assert.equal(result.code, 1)
    assert.equal(result.stderr, 'Error: [connection URL withheld] [JWT withheld]\n')
  },
)

test(
  'broken outer capture reports uncertainty without retrying the fake child',
  { skip: !windows },
  async () => {
    const result = await runFixture('streaming', { captureFailure: true })
    assert.equal(result.code, 1)
    assert.equal(result.stdout, '')
    assert.equal(
      result.stderr.trim(),
      'Protected runtime output capture failed. Runtime state is uncertain; do not start another instance. Details withheld.',
    )
  },
)

test(
  'native child launch failure prints only the bounded fixed message',
  { skip: !windows },
  async () => {
    const result = await runFixture('unused', { startFailure: true })
    assert.equal(result.code, 1)
    assert.equal(result.stdout, '')
    assert.equal(
      result.stderr.trim(),
      'Protected runtime launch failed. Verify the current Windows-user DPAPI credential and dedicated runtime role; details withheld.',
    )
    assert.equal(result.stderr.includes('SYNTHETIC_SECRET_CANARY'), false)
  },
)

test(
  'child-only runtime environment keeps migration/admin variables blocked',
  { skip: !windows },
  async () => {
    const result = await runFixture('scope')
    assert.equal(result.code, 0)
    assert.equal(result.stderr, 'SYNTHETIC_STDERR_MARKER\n')
  },
)

test('production entrypoint retains fixed commands, private URL cleanup and redaction boundary', () => {
  assert.match(psSource, /ValidateSet\('Check', 'Start'\)/)
  assert.match(psSource, /EnvironmentVariables\.Remove\('DATABASE_URL'\)/)
  assert.match(psSource, /\$phase4Uri\.Password = ''/)
  assert.match(psSource, /\$phase4Credential = \$null/)
  assert.ok(
    psSource.indexOf("EnvironmentVariables.Remove('DATABASE_URL')") <
      psSource.indexOf('$phase4Exit = Receive-'),
  )
  assert.match(psSource, /runtime-launch\.mjs ' \+ \$Action/)
  assert.equal(
    /ReadToEnd|BeginOutputReadLine/.test(
      fs.readFileSync(path.join(here, 'Runtime-Output.ps1'), 'utf8'),
    ),
    false,
  )
})

test(
  'prepared two-connection query and bounded transaction subtype survive the protected synthetic chain',
  { skip: !windows },
  async () => {
    const result = await runFixture('cap')
    assert.equal(result.code, 0)
    assert.ok(result.stdout.includes('"transactionFailure":"ACQUISITION_TIMEOUT"'))
    assert.ok(result.stdout.includes('"reason":"P2028"'))
    assert.equal(result.stdout.includes('postgresql://'), false)
  },
)

after(() => {
  let preserved = 0
  for (const [root, stopped] of syntheticRoots) {
    if (!stopped) {
      preserved++
      continue
    }
    const absolute = path.resolve(root)
    assert.equal(path.dirname(absolute), path.join(repository, '.tmp'))
    assert.ok(path.basename(absolute).startsWith('pathways-synthetic-capture-'))
    fs.rmSync(absolute, { recursive: true })
    assert.equal(fs.existsSync(absolute), false)
  }
  assert.equal(preserved, 0, 'uncertain synthetic cleanup: fixture preserved, do not retry')
})
