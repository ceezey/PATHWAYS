import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { defineConfig } from 'vitest/config'

const configDirectory = fileURLToPath(new URL('.', import.meta.url))

export default defineConfig({
  esbuild: {
    jsx: 'automatic',
  },
  resolve: {
    alias: {
      '@': path.resolve(configDirectory, 'src'),
      '@pathways/config': path.resolve(configDirectory, '../../packages/config/src/index.ts'),
      '@pathways/imports': path.resolve(configDirectory, '../../packages/imports/src/index.ts'),
      '@pathways/shared': path.resolve(configDirectory, '../../packages/shared/src/index.ts'),
      '@pathways/ui': path.resolve(configDirectory, '../../packages/ui/src/index.ts'),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    exclude: ['e2e/**'],
  },
})
