import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

const currentDir = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  resolve: {
    alias: [
      {
        find: /^@pathways\/shared$/,
        replacement: path.resolve(currentDir, '../shared/src/index.ts'),
      },
    ],
  },
})
