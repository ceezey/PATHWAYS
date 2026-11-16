import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

// Production TypeScript files: no tests or harnesses.
const sourceFiles = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) return sourceFiles(full)
    return /\.ts$/.test(entry.name) && !/\.(test|harness)\b|\.test\./.test(entry.name) ? [full] : []
  })

describe('runtime imports', () => {
  it('never use the @app alias, which the Vercel build leaves unresolved', () => {
    const aliased = sourceFiles(__dirname)
      .filter((file) => /from '@app\//.test(readFileSync(file, 'utf8')))
      .map((file) => path.relative(__dirname, file))
    expect(aliased).toEqual([])
  })
})
