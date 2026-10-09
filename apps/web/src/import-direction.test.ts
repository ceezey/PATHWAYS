import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const src = __dirname

// Top folders each folder may not import (CR section 3.1); '.' is a file directly under src.
const forbidden: Record<string, readonly string[]> = {
  '.': ['app', 'features'],
  components: ['app', 'features'],
  constants: ['app', 'features'],
  features: ['app'],
  hooks: ['app', 'features'],
  lib: ['app', 'features'],
  providers: ['app', 'features'],
  types: ['app', 'features'],
}

// Every module specifier in a source text: static, type-only, side-effect, re-export and dynamic imports.
function specifiers(source: string): string[] {
  const pattern = /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)['"]([^'"]+)['"]/g
  return [...source.matchAll(pattern)].map((match) => match[1])
}

// The top folder of a src-relative path, or '.' for a file directly under src.
const layer = (relative: string) => (relative.includes('/') ? relative.split('/')[0] : '.')

const relativeToSrc = (file: string) => path.relative(src, file).split(path.sep).join('/')

// The src-relative path a specifier names, or null for a package import.
function target(file: string, specifier: string): string | null {
  if (specifier.startsWith('@/')) return specifier.slice(2)
  if (!specifier.startsWith('.')) return null
  return relativeToSrc(path.resolve(path.dirname(file), specifier))
}

// The rule an import breaks, or null when the direction allows it.
function violation(file: string, specifier: string): string | null {
  const to = target(file, specifier)
  if (to === null) return null
  if (to.startsWith('../')) return 'outside apps/web/src'
  const from = layer(relativeToSrc(file))
  return forbidden[from]?.includes(layer(to)) ? `${from} must not import ${layer(to)}` : null
}

// Non-test TypeScript files under a folder; tests may import fixtures across layers.
function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) return sourceFiles(full)
    return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [full] : []
  })
}

describe('web import direction', () => {
  it('detects every import form that breaks the direction', () => {
    const file = path.join(src, 'lib', 'rbac', 'example.ts')
    const source = [
      "import { a } from '@/features/auth/a'",
      "import type { B } from '../../features/profile/b'",
      "import '@/app/layout'",
      "export { d } from '../../../../api/src/modules/d'",
      "const e = await import('@/features/reports/e')",
      "import { f } from '@/lib/utils'",
      "import { g } from '@pathways/shared'",
      "import { h } from './policy'",
    ].join('\n')
    expect(specifiers(source).map((specifier) => violation(file, specifier))).toEqual([
      'lib must not import features',
      'lib must not import features',
      'lib must not import app',
      'outside apps/web/src',
      'lib must not import features',
      null,
      null,
      null,
    ])
  })

  it('keeps lower layers off features and app, and features off app', () => {
    const files = sourceFiles(src)
    expect(files.length).toBeGreaterThan(300)
    const violations = files.flatMap((file) =>
      specifiers(readFileSync(file, 'utf8')).flatMap((specifier) => {
        const rule = violation(file, specifier)
        return rule ? [`${relativeToSrc(file)} -> ${specifier} (${rule})`] : []
      }),
    )
    expect(violations).toEqual([])
  })
})
