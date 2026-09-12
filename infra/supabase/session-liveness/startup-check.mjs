// Offline configuration loading only. No Prisma CLI, credentials or database client.
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import { createRequire, syncBuiltinESMExports } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const file = fileURLToPath(import.meta.url)
const directory = path.dirname(file)
const root = path.resolve(directory, '../../..')
const writerNode = 'C:\\nvm4w\\nodejs\\node.exe'
const syntheticStage = path.join(root, '.tmp/pathways-session-liveness-Synthetic/migrations')
const syntheticUrl = new URL('postgresql://127.0.0.1:1/synthetic').href
const variants = ['complete', 'missing-stage', 'missing-url', 'outside-stage']

async function probe() {
  const require = createRequire(import.meta.url)
  let networkCalls = 0
  let childCalls = 0
  const denyNetwork = () => {
    networkCalls += 1
    throw new Error('OFFLINE_NETWORK_DENIED')
  }
  const denyChild = () => {
    childCalls += 1
    throw new Error('OFFLINE_CHILD_DENIED')
  }
  require('node:net').Socket.prototype.connect = denyNetwork
  require('node:tls').connect = denyNetwork
  require('node:http').request = denyNetwork
  require('node:http').get = denyNetwork
  require('node:https').request = denyNetwork
  require('node:https').get = denyNetwork
  require('node:dgram').createSocket = denyNetwork
  globalThis.fetch = denyNetwork
  const children = require('node:child_process')
  for (const name of [
    'spawn',
    'spawnSync',
    'exec',
    'execSync',
    'execFile',
    'execFileSync',
    'fork',
  ]) {
    children[name] = denyChild
  }
  syncBuiltinESMExports()
  let installedPrismaExact = false
  let configLoaded = false
  let engineClassic = false
  let datasourceOverrideExact = false
  let pathsExact = false
  let failure = 'CONFIG_LOAD_FAILED'
  try {
    const api = createRequire(path.join(root, 'apps/api/package.json'))
    installedPrismaExact = api('prisma/package.json').version === '6.19.2'
    if (!installedPrismaExact) throw new Error('VERSION_MISMATCH')
    const prisma = createRequire(api.resolve('prisma/config'))
    const { loadConfigFromFile } = prisma('@prisma/config')
    const loaded = await loadConfigFromFile({
      configFile: path.join(directory, 'prisma.deploy.config.ts'),
      configRoot: root,
    })
    if (loaded.error) {
      const error = loaded.error.error
      if (error?.code === 'MODULE_NOT_FOUND') failure = 'CONFIG_MODULE_NOT_FOUND'
      else if (error?.name === 'PrismaConfigEnvError') failure = 'CONFIG_ENV_MISSING'
      else if (
        error?.message === 'Session-liveness migrations must be staged below repository .tmp.'
      ) {
        failure = 'CONFIG_STAGE_REJECTED'
      }
    } else {
      configLoaded = true
      engineClassic = loaded.config.engine === 'classic'
      datasourceOverrideExact = loaded.config.datasource?.url === syntheticUrl
      pathsExact =
        loaded.config.schema === path.join(root, 'apps/api/prisma/schema.prisma') &&
        loaded.config.migrations?.path === syntheticStage
      failure = engineClassic && datasourceOverrideExact && pathsExact ? 'NONE' : 'CONFIG_CONTRACT'
    }
  } catch {
    // Never disclose loader diagnostics, paths, URLs or environment values.
  }
  return {
    status: failure === 'NONE' && networkCalls === 0 && childCalls === 0 ? 'PASS' : 'FAILED',
    failure,
    installedPrismaExact,
    configLoaded,
    engineClassic,
    datasourceOverrideExact,
    pathsExact,
    networkCalls,
    childCalls,
  }
}

export function checkStartup(variant = 'complete') {
  if (!variants.includes(variant)) throw new Error('STARTUP_VARIANT_REFUSED')
  const temporaryRoot = fs.realpathSync(path.join(root, '.tmp'))
  const temporary = fs.mkdtempSync(path.join(temporaryRoot, 'liveness-startup-'))
  let result = { status: 'FAILED', failure: 'STARTUP_CHILD', networkCalls: 0, childCalls: 0 }
  let localCleanup = false
  try {
    // Synthetic values belong to this child only; never inherit .env or credentials.
    const env = { SystemRoot: process.env.SystemRoot, TEMP: temporary, TMP: temporary }
    if (variant !== 'missing-stage') {
      env.PATHWAYS_SESSION_LIVENESS_STAGE =
        variant === 'outside-stage' ? path.join(root, 'not-staging') : syntheticStage
    }
    if (variant !== 'missing-url') env.PATHWAYS_SESSION_LIVENESS_URL = syntheticUrl
    const child = spawnSync(writerNode, [file, '--probe'], {
      cwd: root,
      env,
      windowsHide: true,
      encoding: 'utf8',
      timeout: 30_000,
      maxBuffer: 16_384,
    })
    if (!child.error && child.status === 0 && child.stdout.length <= 2048) {
      result = JSON.parse(child.stdout)
    }
  } catch {
    // Failure output remains bounded.
  } finally {
    const resolved = fs.realpathSync(temporary)
    if (
      path.dirname(resolved) === temporaryRoot &&
      /^liveness-startup-[A-Za-z0-9]+$/.test(path.basename(resolved)) &&
      !fs.lstatSync(temporary).isSymbolicLink()
    ) {
      fs.rmSync(resolved, { recursive: true })
      localCleanup = !fs.existsSync(resolved)
    }
  }
  return { ...result, localCleanup, status: localCleanup ? result.status : 'FAILED' }
}

if (process.argv[1] && path.resolve(process.argv[1]) === file) {
  const mode = process.argv.slice(2)
  if (JSON.stringify(mode) === '["--probe"]') {
    console.log(JSON.stringify(await probe()))
  } else if (JSON.stringify(mode) === '["--check"]') {
    const result = checkStartup()
    console.log(JSON.stringify(result))
    process.exitCode = result.status === 'PASS' ? 0 : 1
  } else {
    console.log('{"status":"FAILED","failure":"STARTUP_ARGUMENTS"}')
    process.exitCode = 1
  }
}
