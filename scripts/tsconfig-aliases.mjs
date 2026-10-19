// Builds Vite resolve.alias entries from the paths of a tsconfig file, so tests resolve imports the way the typecheck does.
import { readFileSync } from 'node:fs'
import path from 'node:path'

const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')

export function tsconfigAliases(tsconfigFile) {
  const { compilerOptions = {} } = JSON.parse(readFileSync(tsconfigFile, 'utf8'))
  const base = path.resolve(path.dirname(tsconfigFile), compilerOptions.baseUrl ?? '.')
  const entries = Object.entries(compilerOptions.paths ?? {})
  if (!entries.length) throw new Error(`${tsconfigFile}: no compilerOptions.paths`)
  return entries
    .map(([pattern, targets]) => {
      if (targets.length !== 1)
        throw new Error(`${tsconfigFile}: ${pattern} needs exactly one target`)
      const [prefix, wildcard] = pattern.split('*')
      const target = path.resolve(base, targets[0].replace('*', ''))
      return wildcard === undefined
        ? {
            find: new RegExp(`^${escapeRegex(pattern)}$`),
            replacement: target,
            length: pattern.length,
          }
        : {
            find: new RegExp(`^${escapeRegex(prefix)}(.*)$`),
            replacement: `${target}/$1`,
            length: prefix.length,
          }
    })
    .sort((a, b) => b.length - a.length)
    .map(({ find, replacement }) => ({ find, replacement }))
}
