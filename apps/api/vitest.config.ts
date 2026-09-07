import path from 'node:path'

import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '@app': path.resolve(__dirname, 'src'),
      '@pathways/config': path.resolve(__dirname, '../../packages/config/src/index.ts'),
      '@pathways/shared': path.resolve(__dirname, '../../packages/shared/src/index.ts'),
    },
  },
  test: { environment: 'node', include: ['src/**/*.test.ts', 'prisma/**/*.test.ts'] },
})
