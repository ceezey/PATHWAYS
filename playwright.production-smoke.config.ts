import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './apps/web/e2e',
  testMatch: 'integration-phase5-public.spec.ts',
  use: { baseURL: 'http://127.0.0.1:3001' },
  webServer: {
    command: 'pnpm --filter @pathways/web exec next start --hostname 127.0.0.1 --port 3001',
    url: 'http://127.0.0.1:3001',
    reuseExistingServer: false,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
})
