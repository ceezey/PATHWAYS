import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

import { tsconfigAliases } from '../../scripts/tsconfig-aliases.mjs'

const currentDir = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  resolve: { alias: tsconfigAliases(path.resolve(currentDir, 'tsconfig.json')) },
})
