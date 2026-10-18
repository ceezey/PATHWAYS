import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

import { tsconfigAliases } from './tsconfig-aliases.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const file = (...parts) => path.join(root, ...parts)
const json = (...parts) => JSON.parse(readFileSync(file(...parts), 'utf8'))

// The path a specifier becomes under an alias list: the first matching entry wins, as in Vite.
const apply = (aliases, specifier) => {
  const hit = aliases.find(({ find }) => find.test(specifier))
  return hit ? specifier.replace(hit.find, hit.replacement) : null
}

// What the tsconfig paths of one config name for a specifier, by the TypeScript rule of the longest matching prefix.
const typescriptTarget = (tsconfig, specifier) => {
  const { baseUrl = '.', paths } = json(tsconfig).compilerOptions
  const base = path.resolve(file(path.dirname(tsconfig)), baseUrl)
  const keys = Object.keys(paths).filter((key) =>
    key.endsWith('*') ? specifier.startsWith(key.slice(0, -1)) : key === specifier,
  )
  const key = keys.sort((a, b) => b.length - a.length)[0]
  if (!key) return null
  const rest = key.endsWith('*') ? specifier.slice(key.length - 1) : ''
  return path.resolve(base, paths[key][0].replace('*', rest))
}

const configs = {
  api: { tsconfig: 'apps/api/tsconfig.json', vitest: 'apps/api/vitest.config.ts' },
  web: { tsconfig: 'apps/web/tsconfig.json', vitest: 'apps/web/vitest.config.ts' },
  imports: {
    tsconfig: 'packages/imports/tsconfig.json',
    vitest: 'packages/imports/vitest.config.ts',
  },
}
const samples = {
  api: [
    '@app/common/prisma/transaction',
    '@pathways/shared',
    '@pathways/config',
    '@pathways/imports',
    '@pathways/imports/server',
    '@pathways/shared/rbac/role-catalog',
  ],
  web: [
    '@/lib/utils',
    '@pathways/shared',
    '@pathways/config',
    '@pathways/imports',
    '@pathways/shared/rbac/role-catalog',
  ],
  imports: ['@pathways/shared', '@pathways/shared/rbac/role-catalog'],
}

for (const [name, { tsconfig }] of Object.entries(configs)) {
  test(`${name}: the aliases resolve every sample as the tsconfig paths do`, () => {
    const aliases = tsconfigAliases(file(tsconfig))
    for (const specifier of samples[name]) {
      assert.equal(apply(aliases, specifier), typescriptTarget(tsconfig, specifier), specifier)
    }
  })

  test(`${name}: every path entry has an alias and nothing else is aliased`, () => {
    const { paths } = json(tsconfig).compilerOptions
    assert.equal(tsconfigAliases(file(tsconfig)).length, Object.keys(paths).length)
    const aliases = tsconfigAliases(file(tsconfig))
    for (const specifier of [
      '@pathways/sharedx',
      '@pathways/shared-x',
      '@appx/common',
      '@x/lib',
      'react',
    ]) {
      assert.equal(apply(aliases, specifier), null, specifier)
    }
  })

  test(`${name}: the vitest config builds its aliases from the tsconfig`, () => {
    const text = readFileSync(file(configs[name].vitest), 'utf8')
    assert.match(text, /tsconfigAliases\(/)
    assert.doesNotMatch(text, /packages\/(shared|config|imports)/)
  })
}

test('the package aliases of the base tsconfig are repeated unchanged by the api, web and imports tsconfigs', () => {
  const base = tsconfigAliases(file('tsconfig.base.json'))
  const baseTargets = new Map(base.map(({ find, replacement }) => [String(find), replacement]))
  assert.ok(baseTargets.size >= 6)
  for (const [name, { tsconfig }] of Object.entries(configs)) {
    const own = new Map(
      tsconfigAliases(file(tsconfig)).map(({ find, replacement }) => [String(find), replacement]),
    )
    const wanted =
      name === 'imports'
        ? [...baseTargets].filter(([key]) => key.includes('shared'))
        : [...baseTargets]
    assert.ok(wanted.length >= 2, name)
    for (const [key, target] of wanted) assert.equal(own.get(key), target, `${name}: ${key}`)
  }
})

test('the longest matching prefix wins and a path with two targets is refused', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'aliases-'))
  const write = (paths) => {
    writeFileSync(
      path.join(dir, 'tsconfig.json'),
      JSON.stringify({ compilerOptions: { baseUrl: '.', paths } }),
    )
    return path.join(dir, 'tsconfig.json')
  }
  const aliases = tsconfigAliases(
    write({ 'a/*': ['one/*'], 'a/b/*': ['two/*'], exact: ['three/index.ts'] }),
  )
  assert.equal(apply(aliases, 'a/b/c'), path.join(dir, 'two/c'))
  assert.equal(apply(aliases, 'a/x'), path.join(dir, 'one/x'))
  assert.equal(apply(aliases, 'exact'), path.join(dir, 'three/index.ts'))
  assert.throws(() => tsconfigAliases(write({ x: ['a', 'b'] })), /exactly one target/)
  assert.throws(() => tsconfigAliases(write({})), /no compilerOptions.paths/)
})
