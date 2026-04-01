import path from 'node:path'

import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@pathways/config': path.resolve(__dirname, '../../packages/config/src/index.ts'),
      '@pathways/imports': path.resolve(__dirname, '../../packages/imports/src/index.ts'),
      '@pathways/shared': path.resolve(__dirname, '../../packages/shared/src/index.ts'),
      '@pathways/ui': path.resolve(__dirname, '../../packages/ui/src/index.ts'),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    exclude: ['e2e/**'],
  },
})
