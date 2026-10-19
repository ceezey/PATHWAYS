import { existsSync, readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { PHASE_PRODUCTION_BUILD } from 'next/constants'
import { describe, expect, it } from 'vitest'

import createNextConfig from '../next.config'

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
const layer = (relative: string) => {
  const first = relative.split('/')[0]
  return relative.includes('/') ||
    first === 'app' ||
    (first !== '.' && Object.hasOwn(forbidden, first))
    ? first
    : '.'
}

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

// Features whose index.ts is their only surface for files outside them (CR section 3.3).
const indexedFeatures: readonly string[] = [
  'auth',
  'profile',
  'public',
  'settings',
  'analytics',
  'dashboard',
  'projects',
  'beneficiaries',
  'reports',
  'collection',
  'rules',
]

// The rule an import of an indexed feature breaks, or null when it names the feature index.
function surfaceViolation(file: string, specifier: string): string | null {
  const to = target(file, specifier)
  if (to === null || !to.startsWith('features/')) return null
  const [, feature, ...rest] = to.split('/')
  if (!indexedFeatures.includes(feature) || relativeToSrc(file).startsWith(`features/${feature}/`))
    return null
  return rest.length === 0 || rest.join('/') === 'index'
    ? null
    : `import features/${feature} only through its index`
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
      "import { i } from '@/features'",
      "import { j } from '../../app'",
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
      'lib must not import features',
      'lib must not import app',
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

describe('feature public surfaces', () => {
  it('detects an import that bypasses an indexed feature', () => {
    const file = path.join(src, 'features', 'analytics', 'example.tsx')
    const source = [
      "import { a } from '@/features/projects/components/project-directory'",
      "import { b } from '../projects/projects.utils'",
      "const c = await import('@/features/projects/team/project-team-selectors')",
      "import { d } from '@/features/projects'",
      "import { e } from '@/features/projects/index'",
      "import { f } from '@/features/unlisted/example'",
      "import { g } from './analytics-utils'",
    ].join('\n')
    expect(specifiers(source).map((specifier) => surfaceViolation(file, specifier))).toEqual([
      'import features/projects only through its index',
      'import features/projects only through its index',
      'import features/projects only through its index',
      null,
      null,
      null,
      null,
    ])
    const page = path.join(src, 'app', '(dashboard)', 'projects', 'page.tsx')
    expect(surfaceViolation(page, '@/features/projects/components/project-directory')).toBe(
      'import features/projects only through its index',
    )
    expect(surfaceViolation(page, '@/features/projects')).toBeNull()
    const inside = path.join(src, 'features', 'projects', 'components', 'example.tsx')
    expect(surfaceViolation(inside, '../projects.utils')).toBeNull()
  })

  it('keeps every other file on the index of each indexed feature', () => {
    const violations = sourceFiles(src).flatMap((file) =>
      specifiers(readFileSync(file, 'utf8')).flatMap((specifier) => {
        const rule = surfaceViolation(file, specifier)
        return rule ? [`${relativeToSrc(file)} -> ${specifier} (${rule})`] : []
      }),
    )
    expect(violations).toEqual([])
  })

  it('lists every feature that has an index.ts as indexed', () => {
    const features = path.join(src, 'features')
    const withIndex = readdirSync(features).filter((name) =>
      existsSync(path.join(features, name, 'index.ts')),
    )
    expect([...indexedFeatures].sort()).toEqual(withIndex.sort())
  })

  it('has Next optimize the barrel of each indexed feature so route bundles keep their size', () => {
    const optimized = createNextConfig(PHASE_PRODUCTION_BUILD).experimental?.optimizePackageImports
    expect(optimized).toEqual(
      expect.arrayContaining(indexedFeatures.map((feature) => `@/features/${feature}`)),
    )
  })
})
