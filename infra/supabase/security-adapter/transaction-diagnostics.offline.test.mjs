// Focused Vitest regressions without Vite/.env or generated Prisma env discovery.
// All DB methods are mocked here; the separate loopback suite tests the engine.
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')
const require = createRequire(path.join(root, 'package.json'))

test(
  'focused auth and transaction diagnostics stay offline with no env-file discovery',
  { timeout: 90_000 },
  async (t) => {
    const parent = path.join(root, '.tmp')
    assert.equal(fs.realpathSync(parent), parent)
    const directory = fs.mkdtempSync(path.join(parent, 'pathways-offline-diagnostics-'))
    let stopped = false
    try {
      const guard = path.join(directory, 'guard.cjs')
      fs.writeFileSync(
        guard,
        `
const fs = require('node:fs');
const forbidden = (file) => /(^|[\\\\/])\\.env(?:$|[.\\\\/])|dpapi|credential/i.test(String(file));
for (const name of ['readFileSync', 'readFile']) {
  const original = fs[name]; fs[name] = function(file, ...args) {
    if (forbidden(file)) throw new Error('OFFLINE_FILE_GUARD');
    return original.call(this, file, ...args);
  };
}
const original = fs.promises.readFile;
fs.promises.readFile = async function(file, ...args) {
  if (forbidden(file)) throw new Error('OFFLINE_FILE_GUARD');
  return original.call(this, file, ...args);
};
for (const name of ['node:net','node:tls']) {
  const module = require(name); module.connect = module.createConnection = () => { throw new Error('OFFLINE_NETWORK_GUARD'); };
}
globalThis.fetch = () => { throw new Error('OFFLINE_NETWORK_GUARD'); };
`,
      )
      const setup = path.join(directory, 'setup.mjs')
      fs.writeFileSync(
        setup,
        `import { vi } from 'vitest';
vi.mock('@prisma/client', () => ({
  PrismaClient: class {},
  Prisma: { TransactionIsolationLevel: { ReadCommitted: 'ReadCommitted' } },
}));
`,
      )
      const config = path.join(directory, 'vitest.config.mjs')
      fs.writeFileSync(
        config,
        `export default {
  root: ${JSON.stringify(path.join(root, 'apps/api'))}, envDir: false,
  test: { environment: 'node', pool: 'forks', maxWorkers: 1, fileParallelism: false,
    setupFiles: [${JSON.stringify(setup)}], include: [
      'src/prisma/transaction-diagnostic.test.ts',
      'src/modules/auth/session-liveness.service.test.ts',
      'src/modules/auth/application-profile.service.test.ts',
      'src/modules/auth/route-access.service.test.ts',
    ]
  }
};`,
      )
      const executable = path.join(
        path.dirname(require.resolve('vitest/package.json')),
        'vitest.mjs',
      )
      const reportFile = path.join(directory, 'vitest-result.json')
      const outcome = await new Promise((resolve, reject) => {
        const child = spawn(
          process.execPath,
          [executable, 'run', '--config', config, '--reporter=json', '--outputFile', reportFile],
          {
            cwd: directory,
            windowsHide: true,
            stdio: ['ignore', 'pipe', 'pipe'],
            env: {
              SystemRoot: process.env.SystemRoot,
              PATH: path.dirname(process.execPath),
              TEMP: directory,
              TMP: directory,
              NODE_ENV: 'test',
              NO_COLOR: '1',
              NODE_OPTIONS: `--require=${JSON.stringify(guard)}`,
            },
          },
        )
        let output = ''
        let stderr = ''
        let oversized = false
        const timer = setTimeout(() => child.kill(), 75_000)
        for (const [stream, destination] of [
          [child.stdout, 'stdout'],
          [child.stderr, 'stderr'],
        ]) {
          stream.on('data', (chunk) => {
            if (output.length + stderr.length + chunk.length > 2_000_000) {
              oversized = true
              child.kill()
            } else if (destination === 'stdout') output += chunk.toString()
            else stderr += chunk.toString()
          })
        }
        child.once('error', () => {
          clearTimeout(timer)
          reject(new Error('OFFLINE_CHILD_START_FAILED'))
        })
        child.once('close', (code) => {
          clearTimeout(timer)
          stopped = true
          if (oversized) {
            reject(new Error('OFFLINE_OUTPUT_EXCEEDED'))
            return
          }
          try {
            assert.ok(fs.statSync(reportFile).size <= 2_000_000)
            const report = JSON.parse(fs.readFileSync(reportFile, 'utf8'))
            const failedFiles = report.testResults
              .filter((suite) => suite.status === 'failed')
              .map((suite) => path.basename(suite.name))
            resolve({
              code,
              passed: report.numPassedTests,
              failed: report.numFailedTests,
              skipped: report.numPendingTests,
              total: report.numTotalTests,
              failedFiles,
              guardFailure: /OFFLINE_(?:FILE|NETWORK)_GUARD/.test(output + stderr),
            })
          } catch {
            t.diagnostic(
              JSON.stringify({
                outputBytes: output.length,
                errorBytes: stderr.length,
                exitCode: code,
                syntaxFailure: /SyntaxError/.test(output + stderr),
                configurationFailure: /config/i.test(stderr),
                envDirFailure: /envDir/.test(stderr),
                readonlyFailure: /read.only|Cannot set property|Cannot assign/.test(stderr),
                jsonStart: output.trimStart().startsWith('{'),
              }),
            )
            reject(
              new Error(
                /OFFLINE_(?:FILE|NETWORK)_GUARD/.test(output + stderr)
                  ? 'OFFLINE_BOUNDARY_REJECTED'
                  : /EPERM|EACCES/.test(output + stderr)
                    ? 'OFFLINE_CHILD_PERMISSION_DENIED'
                    : /Cannot find|ERR_MODULE_NOT_FOUND|MODULE_NOT_FOUND/.test(output + stderr)
                      ? 'OFFLINE_MODULE_UNAVAILABLE'
                      : 'OFFLINE_RESULT_UNAVAILABLE',
              ),
            )
          }
        })
      })
      t.diagnostic(JSON.stringify(outcome))
      assert.equal(outcome.code, 0)
      assert.equal(outcome.failed, 0)
      assert.equal(outcome.skipped, 0)
      assert.equal(outcome.guardFailure, false)
      assert.ok(outcome.passed > 0)
    } finally {
      // Uncertain child lifetime takes precedence: preserve rather than delete.
      assert.equal(stopped, true, 'OFFLINE_CHILD_UNCERTAIN_DIRECTORY_PRESERVED')
      assert.equal(fs.realpathSync(directory), directory)
      assert.equal(path.dirname(directory), parent)
      assert.ok(path.basename(directory).startsWith('pathways-offline-diagnostics-'))
      fs.rmSync(directory, { recursive: true })
      assert.equal(fs.existsSync(directory), false)
      t.diagnostic('offlineFixtureCleanup=PASS')
    }
  },
)
