import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const src = path.resolve(__dirname, '..')
const common = path.join(src, 'common')
const modules = path.join(src, 'modules')

// Every module specifier in a source text: static, type-only, side-effect, re-export and dynamic imports.
function specifiers(source: string): string[] {
  const pattern = /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)['"]([^'"]+)['"]/g
  return [...source.matchAll(pattern)].map((match) => match[1])
}

// True when a specifier written in `file` points into src/modules.
function reachesModules(file: string, specifier: string): boolean {
  if (specifier === '@app/modules' || specifier.startsWith('@app/modules/')) return true
  if (!specifier.startsWith('.')) return false
  const target = path.resolve(path.dirname(file), specifier)
  return target === modules || target.startsWith(`${modules}${path.sep}`)
}

// Non-test TypeScript files under a folder; tests under common are integration fixtures and exempt.
function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) return sourceFiles(full)
    return entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts') ? [full] : []
  })
}

// Every TypeScript file under a folder, tests included, skipping installed packages.
function allFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) return entry.name === 'node_modules' ? [] : allFiles(full)
    return entry.name.endsWith('.ts') ? [full] : []
  })
}

const web = path.resolve(src, '../../web')

// True when a relative specifier written in `file` points into apps/web.
function reachesWeb(file: string, specifier: string): boolean {
  return (
    specifier.startsWith('.') &&
    path.resolve(path.dirname(file), specifier).startsWith(`${web}${path.sep}`)
  )
}

describe('api common import boundary', () => {
  it('detects every import form that reaches modules', () => {
    const file = path.join(common, 'authz', 'example.ts')
    const source = [
      "import { a } from '../../modules/auth/a'",
      "import type { B } from '@app/modules/rules/b'",
      "import '../../modules/storage/c'",
      "export { d } from '../../modules/users/d'",
      "const e = await import('../../modules/reports/e')",
      "import { f } from '../prisma/transaction'",
      "import { g } from '@pathways/shared'",
    ].join('\n')
    expect(specifiers(source).filter((specifier) => reachesModules(file, specifier))).toEqual([
      '../../modules/auth/a',
      '@app/modules/rules/b',
      '../../modules/storage/c',
      '../../modules/users/d',
      '../../modules/reports/e',
    ])
  })

  it('keeps common free of imports from modules', () => {
    const files = sourceFiles(common)
    expect(files.length).toBeGreaterThan(5)
    const violations = files.flatMap((file) =>
      specifiers(readFileSync(file, 'utf8'))
        .filter((specifier) => reachesModules(file, specifier))
        .map(
          (specifier) => `${path.relative(src, file).split(path.sep).join('/')} -> ${specifier}`,
        ),
    )
    expect(violations).toEqual([])
  })
})

describe('api to web boundary', () => {
  it('detects a relative import that reaches apps/web', () => {
    const file = path.join(src, 'modules', 'auth', 'example.ts')
    // The control path is built at runtime so the scanned source holds no literal web import.
    const webImport = ['..', '..', '..', '..', 'web', 'src', 'lib', 'rbac', 'route-access'].join(
      '/',
    )
    const source = [
      `import { a } from '${webImport}'`,
      "import { b } from '../../common/authz/b'",
      "import { c } from '@pathways/shared'",
    ].join('\n')
    expect(specifiers(source).filter((specifier) => reachesWeb(file, specifier))).toEqual([
      webImport,
    ])
  })

  it('keeps api source, tests and seeds free of imports from apps/web', () => {
    const files = [...allFiles(src), ...allFiles(path.resolve(src, '../prisma'))]
    expect(files.length).toBeGreaterThan(100)
    const violations = files.flatMap((file) =>
      specifiers(readFileSync(file, 'utf8'))
        .filter((specifier) => reachesWeb(file, specifier))
        .map(
          (specifier) => `${path.relative(src, file).split(path.sep).join('/')} -> ${specifier}`,
        ),
    )
    expect(violations).toEqual([])
  })
})

// The api module a file belongs to, or null outside src/modules.
function moduleOf(file: string): string | null {
  const relative = path.relative(modules, file)
  return relative.startsWith('..') || !relative.includes(path.sep)
    ? null
    : relative.split(path.sep)[0]
}

// Pairs of api modules whose non-test files import each other, as sorted "a <-> b" labels.
function mutualModulePairs(files: string[], read: (file: string) => string): string[] {
  const edges = new Set<string>()
  for (const file of files) {
    const from = moduleOf(file)
    for (const specifier of specifiers(read(file))) {
      if (!from || !specifier.startsWith('.')) continue
      const to = moduleOf(path.resolve(path.dirname(file), specifier))
      if (to && to !== from) edges.add(`${from}>${to}`)
    }
  }
  return [...edges]
    .map((edge) => edge.split('>'))
    .filter(([from, to]) => from < to && edges.has(`${to}>${from}`))
    .map(([from, to]) => `${from} <-> ${to}`)
    .sort()
}

describe('api module import pairs', () => {
  it('detects two modules that import each other', () => {
    const sources: Record<string, string> = {
      [path.join(modules, 'alpha', 'alpha.service.ts')]: "import { b } from '../beta/beta.service'",
      [path.join(modules, 'beta', 'beta.service.ts')]:
        "import { a } from '../alpha/alpha.helpers'\nimport { c } from '../gamma/gamma.service'",
      [path.join(modules, 'gamma', 'gamma.service.ts')]:
        "import { t } from '../../common/prisma/transaction'",
    }
    expect(mutualModulePairs(Object.keys(sources), (file) => sources[file])).toEqual([
      'alpha <-> beta',
    ])
  })

  it('allows no pair of modules that import each other', () => {
    const files = sourceFiles(modules)
    expect(files.length).toBeGreaterThan(100)
    expect(mutualModulePairs(files, (file) => readFileSync(file, 'utf8'))).toEqual([])
  })
})
