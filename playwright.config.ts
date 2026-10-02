import { execSync } from 'node:child_process'
import { defineConfig, devices } from '@playwright/test'

// Local Supabase values override the remote apps/web/.env so a started dev server can sign in locally.
const localSupabaseEnv = (): Record<string, string> => {
  if (process.env.CI) return {}
  try {
    const status = JSON.parse(execSync('npx supabase status -o json', { stdio: ['ignore', 'pipe', 'ignore'] }).toString())
    return {
      NEXT_PUBLIC_SUPABASE_URL: status.API_URL,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: status.ANON_KEY,
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: status.ANON_KEY,
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY: status.ANON_KEY,
    }
  } catch {
    return {}
  }
}

export default defineConfig({
  testDir: './apps/web/e2e',
  // Real sign-in specs share seed accounts and reset their credentials, so they must run serially.
  workers: 1,
  fullyParallel: false,
  retries: process.env.CI ? 2 : 0,
  use: {
    baseURL: 'http://127.0.0.1:3000',
    trace: 'on-first-retry',
  },
  webServer: {
    command: 'pnpm --filter @pathways/web dev',
    url: 'http://127.0.0.1:3000',
    // A reused dev server must already have been started with the local Supabase values.
    reuseExistingServer: !process.env.CI,
    env: {
      NEXT_PUBLIC_API_BASE_URL: 'http://127.0.0.1:4000/api',
      ...localSupabaseEnv(),
    },
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
})
