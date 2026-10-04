import { createRequire } from 'node:module'
import path from 'node:path'
import { expect, test } from '@playwright/test'

const requireTool = createRequire(require.resolve('tsx'))
const { build } = requireTool('esbuild')
let component: string

test.beforeAll(async () => {
  const fixture = path.resolve(__dirname, 'fixtures/password-login.tsx')
  const output = await build({
    stdin: {
      contents: `import { createRoot } from 'react-dom/client';
        import { LoginForm } from '../src/features/auth/login-form';
        createRoot(document.getElementById('root')).render(<LoginForm />);`,
      resolveDir: __dirname,
      loader: 'tsx',
    },
    alias: Object.fromEntries(
      [
        '@/hooks/use-session',
        '@/lib/supabase/client',
        '@/lib/env',
        'next/navigation',
        'next/link',
      ].map((name) => [name, fixture]),
    ),
    bundle: true,
    define: { 'process.env.NODE_ENV': '"test"' },
    jsx: 'automatic',
    platform: 'browser',
    tsconfig: path.resolve(__dirname, '../tsconfig.json'),
    write: false,
  })
  component = output.outputFiles[0].text
})

type Mode = 'pending-success' | 'rejected' | 'network' | 'success'

// The sign-in API call is stubbed by mode and counted on the Node side.
const loadComponent = async (page: import('@playwright/test').Page, mode: Mode = 'success') => {
  const state = { count: 0, release: () => {} }
  const gate = new Promise<void>((resolve) => {
    state.release = resolve
  })
  await page.route('**/*', async (route) => {
    const { pathname } = new URL(route.request().url())
    if (pathname === '/component-fixture') {
      await route.fulfill({ body: '<div id="root"></div>', contentType: 'text/html' })
    } else if (pathname.endsWith('/auth/sign-in')) {
      state.count += 1
      if (mode === 'pending-success') await gate
      if (mode === 'network') return route.abort()
      if (mode === 'rejected') return route.fulfill({ status: 401, json: {} })
      await route.fulfill({
        json: { accessToken: 'synthetic-access', refreshToken: 'synthetic-refresh' },
      })
    } else await route.abort()
  })
  await page.goto('/component-fixture')
  await page.addScriptTag({ content: component })
  return state
}

test('password login submits once, clears the password, and enters only TOTP', async ({ page }) => {
  const state = await loadComponent(page, 'pending-success')

  await page.getByLabel('Email').fill('staff@example.org')
  const password = page.getByRole('textbox', { name: 'Password', exact: true })
  await password.fill('Synthetic-password-42!')
  await page.getByRole('button', { name: 'Sign In' }).evaluate((button) => {
    button.click()
    button.click()
  })

  await expect.poll(() => state.count).toBe(1)
  await expect(page.getByRole('button', { name: 'Signing in...' })).toBeDisabled()
  await expect(password).toBeDisabled()
  state.release()

  await expect
    .poll(() => page.evaluate(() => window.__PASSWORD_LOGIN_NAVIGATION__))
    .toBe('/auth/mfa')
  await expect(password).toHaveValue('')
  await expect(page.getByText(/email code|sign-in code/i)).toHaveCount(0)
})

test('credential rejection is generic and never exposes provider detail', async ({ page }) => {
  await loadComponent(page, 'rejected')

  await page.getByLabel('Email').fill('staff@example.org')
  const password = page.getByRole('textbox', { name: 'Password', exact: true })
  await password.fill('Synthetic-password-42!')
  await page.getByRole('button', { name: 'Sign In' }).click()

  await expect(page.getByRole('alert')).toHaveText(
    'Could not sign in. Check your credentials and try again.',
  )
  await expect(password).toHaveValue('')
})

test('network denies access with a fixed message', async ({ page }) => {
  await loadComponent(page, 'network')
  await page.getByLabel('Email').fill('staff@example.org')
  await page.getByRole('textbox', { name: 'Password', exact: true }).fill('Synthetic-password-42!')
  await page.getByRole('button', { name: 'Sign In' }).click()

  await expect(page.getByRole('alert')).toHaveText(
    'Authentication is temporarily unavailable. No application access was granted.',
  )
  await expect.poll(() => page.evaluate(() => window.__PASSWORD_LOGIN_NAVIGATION__)).toBe(undefined)
})

test('a restored validated session bypasses password entry for the existing TOTP transition', async ({
  page,
}) => {
  await page.addInitScript(() => {
    window.__PASSWORD_LOGIN_SESSION_STATUS__ = 'authenticated'
  })
  await loadComponent(page)

  await expect(page.getByLabel('Email')).toHaveCount(0)
  await expect(page.getByText('Checking your existing session...')).toBeVisible()
  await expect
    .poll(() => page.evaluate(() => window.__PASSWORD_LOGIN_NAVIGATION__))
    .toBe('/auth/mfa')
})
