import { defineConfig, devices } from '@playwright/test'

const port = process.env.PLAYWRIGHT_PORT ?? '3000'
const baseURL = `http://127.0.0.1:${port}`

export default defineConfig({
  testDir: './apps/web/e2e',
  retries: process.env.CI ? 2 : 0,
  use: {
    baseURL,
    trace: 'on-first-retry',
  },
  webServer: {
    command: `pnpm --filter @pathways/web dev --hostname 127.0.0.1 --port ${port}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    gracefulShutdown: { signal: 'SIGINT', timeout: 500 },
    env: {
      NEXT_PUBLIC_API_BASE_URL: 'http://127.0.0.1:4000/api',
      NEXT_PUBLIC_ENABLE_GUI_PROTOTYPE_MODE: 'true',
      NEXT_PUBLIC_ENABLE_ROLE_PREVIEW: 'true',
    },
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
})
