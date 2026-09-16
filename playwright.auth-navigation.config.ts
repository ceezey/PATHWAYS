import { defineConfig, devices } from '@playwright/test'

/** Intercepted synthetic component tests only. No app/API server or credentials. */
export default defineConfig({
  testDir: './apps/web/e2e',
  testMatch: ['mfa-access.spec.ts', 'role-routes.spec.ts'],
  workers: 1,
  retries: 0,
  timeout: 30_000,
  outputDir: '.tmp/auth-navigation-playwright',
  use: {
    baseURL: 'http://127.0.0.1:3000',
    trace: 'off',
    screenshot: 'off',
    video: 'off',
    serviceWorkers: 'block',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
})
