import path from 'node:path'

import { defineConfig } from 'vitest/config'

import { tsconfigAliases } from '../../scripts/tsconfig-aliases.mjs'

export default defineConfig({
  esbuild: { jsx: 'automatic' },
  resolve: { alias: tsconfigAliases(path.resolve(__dirname, 'tsconfig.json')) },
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
