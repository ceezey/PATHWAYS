import { defineConfig, devices } from '@playwright/test'

const port = process.env.PLAYWRIGHT_PORT ?? '3000'
const baseURL = `http://127.0.0.1:${port}`

export default defineConfig({
  testDir: './apps/web/e2e',
  // The final UCR uses one browser-local demo contract. Older API/OTP-era specifications remain
  // in the repository as historical evidence but are not executable against the final source.
  testMatch: ['demo-*.spec.ts', 'phase4-final.spec.ts'],
  retries: process.env.CI ? 2 : 0,
  use: {
    baseURL,
    trace: 'on-first-retry',
  },
  webServer: {
    // Invoke Next directly so Playwright owns the server process instead of a pnpm wrapper.
    command: `node node_modules/next/dist/bin/next dev --hostname 127.0.0.1 --port ${port}`,
    cwd: './apps/web',
    url: baseURL,
    reuseExistingServer: !process.env.CI,
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
