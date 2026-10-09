import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const packagesRoot = path.resolve(__dirname, '../..')
const sources = ['shared', 'imports', 'config'].map((name) => path.join(packagesRoot, name, 'src'))

// Every module specifier in a source text: static, type-only, side-effect, re-export and dynamic imports.
function specifiers(source: string): string[] {
  const pattern = /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)['"]([^'"]+)['"]/g
  return [...source.matchAll(pattern)].map((match) => match[1])
}

// True when a specifier in a package file names an app alias or leaves that package's src.
function leavesPackage(file: string, root: string, specifier: string): boolean {
  if (
    ['@/', '@app/', '@pathways/web', '@pathways/api'].some((alias) => specifier.startsWith(alias))
  )
    return true
  if (!specifier.startsWith('.')) return false
  const resolved = path.resolve(path.dirname(file), specifier)
  return resolved !== root && !resolved.startsWith(`${root}${path.sep}`)
}

// Non-test TypeScript files under a folder.
function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) return sourceFiles(full)
    return entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts') ? [full] : []
  })
}

describe('package import boundary', () => {
  it('detects app aliases and paths that leave the package', () => {
    const root = sources[0]
    const file = path.join(root, 'rbac', 'example.ts')
    expect(
      [
        '@/lib/rbac/policy',
        '@app/common/authz/application-identity',
        '../../../../apps/web/src/lib/env',
        '@pathways/web',
        '@pathways/api',
        './role-catalog',
        '../rules/rule-contract',
        'zod',
        '@pathways/imports',
      ].map((specifier) => leavesPackage(file, root, specifier)),
    ).toEqual([true, true, true, true, true, false, false, false, false])
  })

  it('keeps shared, imports and config free of app imports', () => {
    expect(sources.flatMap(sourceFiles).length).toBeGreaterThan(40)
    const violations = sources.flatMap((root) =>
      sourceFiles(root).flatMap((file) =>
        specifiers(readFileSync(file, 'utf8'))
          .filter((specifier) => leavesPackage(file, root, specifier))
          .map(
            (specifier) =>
              `${path.relative(packagesRoot, file).split(path.sep).join('/')} -> ${specifier}`,
          ),
      ),
    )
    expect(violations).toEqual([])
  })
})
