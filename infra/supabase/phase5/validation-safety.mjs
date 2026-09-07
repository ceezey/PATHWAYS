import { execFileSync } from 'node:child_process'
// Prints counts/booleans only. No file contents, values, lines, errors or URLs.
import fs from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')
const require = createRequire(path.join(root, 'apps/api/package.json'))
const { parse } = require('dotenv')
try {
  const secrets = new Set()
  for (const filename of ['.env', '.env.local', 'apps/api/.env', 'apps/api/.env.local']) {
    const absolute = path.join(root, filename)
    if (!fs.existsSync(absolute)) continue
    const values = parse(fs.readFileSync(absolute))
    for (const [key, value] of Object.entries(values)) {
      if (
        !value ||
        value.length < 8 ||
        key.startsWith('NEXT_PUBLIC_') ||
        /PUBLISHABLE|ANON/.test(key)
      )
        continue
      if (/SECRET|PASSWORD|SERVICE_ROLE_KEY|DATABASE_URL|DIRECT_URL/.test(key)) secrets.add(value)
      if (/DATABASE_URL|DIRECT_URL/.test(key)) {
        try {
          const url = new URL(value)
          if (url.password.length >= 8) {
            secrets.add(url.password)
            secrets.add(decodeURIComponent(url.password))
          }
        } catch {
          /* Invalid values are never displayed. */
        }
      }
    }
  }
  const listed = execFileSync(
    'git',
    ['ls-files', '-z', '--cached', '--others', '--exclude-standard'],
    { cwd: root, encoding: 'utf8' },
  )
    .split('\0')
    .filter(Boolean)
  let sourceFiles = 0
  let sourceSensitiveMatches = 0
  let sourceCredentialPatternMatches = 0
  let generatedFiles = 0
  let generatedSensitiveMatches = 0
  let generatedPreviewManifests = 0
  for (const relative of new Set(listed)) {
    if (
      /(^|\/)(?:node_modules|\.next(?:-dev)?|dist|\.tmp|coverage)(\/|$)/.test(relative) ||
      /(^|\/)\.env(?:\.(?!example)[^/]*)?$/.test(relative)
    )
      continue
    if (!/\.(?:[cm]?[jt]sx?|json|md|ps1|sql|yml|yaml|toml|example)$/.test(relative)) continue
    const absolute = path.join(root, relative)
    if (!fs.existsSync(absolute) || !fs.lstatSync(absolute).isFile()) continue
    const content = fs.readFileSync(absolute, 'utf8')
    sourceFiles++
    if ([...secrets].some((secret) => content.includes(secret))) sourceSensitiveMatches++
    const privilegedJwt = [
      ...content.matchAll(/\beyJ[A-Za-z0-9_-]+\.([A-Za-z0-9_-]+)\.[A-Za-z0-9_-]+\b/g),
    ].some((match) => {
      try {
        return JSON.parse(Buffer.from(match[1], 'base64url').toString()).role === 'service_role'
      } catch {
        return false
      }
    })
    if (
      privilegedJwt ||
      /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|\bsb_secret_[A-Za-z0-9_-]{20,}/.test(
        content,
      )
    )
      sourceCredentialPatternMatches++
  }
  // Dedicated containment audit, separate from normal source validation. Never
  // traverses symlinks or emits the generated material that caused the prior stop.
  function audit(directory) {
    if (!fs.existsSync(directory)) return
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name)
      if (entry.isDirectory()) audit(absolute)
      else if (entry.isFile() && /\.(?:json|js|map|html|txt)$/.test(entry.name)) {
        const content = fs.readFileSync(absolute, 'utf8')
        generatedFiles++
        if ([...secrets].some((secret) => content.includes(secret))) generatedSensitiveMatches++
        if (entry.name === 'prerender-manifest.json' && /previewModeEncryptionKey/.test(content))
          generatedPreviewManifests++
      }
    }
  }
  if (process.argv.includes('--audit-generated')) {
    audit(path.join(root, 'apps/web/.next'))
    audit(path.join(root, 'apps/web/.next-dev'))
  }
  const passed =
    sourceSensitiveMatches === 0 &&
    sourceCredentialPatternMatches === 0 &&
    generatedSensitiveMatches === 0
  console.info(
    JSON.stringify({
      sourceFiles,
      sourceSensitiveMatches,
      sourceCredentialPatternMatches,
      generatedFiles,
      generatedSensitiveMatches,
      generatedPreviewManifests,
      passed,
    }),
  )
  process.exitCode = passed ? 0 : 1
} catch {
  console.info(JSON.stringify({ passed: false, reason: 'SCAN_UNAVAILABLE_DETAILS_WITHHELD' }))
  process.exitCode = 1
}
