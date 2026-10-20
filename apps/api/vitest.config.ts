import path from 'node:path'

import { defineConfig } from 'vitest/config'

import { tsconfigAliases } from '../../scripts/tsconfig-aliases.mjs'

export default defineConfig({
  resolve: { alias: tsconfigAliases(path.resolve(__dirname, 'tsconfig.json')) },
  test: { environment: 'node', include: ['src/**/*.test.ts', 'prisma/**/*.test.ts'] },
})
