import path from 'node:path'

import { defineConfig } from 'vitest/config'

export default defineConfig({
  esbuild: { jsx: 'automatic' },
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
    // jsdom suites are CPU-bound React renders. The default (cores - 1) forks, plus the API
    // suite that `pnpm -r test` runs concurrently, oversubscribe the CPU and inflate individual
    // tests 5-10x. Half the cores finishes the suite faster with lower per-test latency.
    maxWorkers: '50%',
    // Heavy workspace tests take ~0.3-1s in isolation, but a loaded developer machine (dev
    // servers, concurrent workspace suites) can still stretch them past the 5s default. There
    // are no timers or delays to fake; this only bounds genuine hangs, not assertion strictness.
    testTimeout: 15_000,
  },
})
