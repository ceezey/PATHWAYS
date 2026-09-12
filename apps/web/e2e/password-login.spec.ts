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
      ['@/hooks/use-session', '@/lib/supabase/client', 'next/navigation', 'next/link'].map(
        (name) => [name, fixture],
      ),
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

const loadComponent = async (page: import('@playwright/test').Page) => {
  await page.route('**/*', async (route) => {
    if (new URL(route.request().url()).pathname === '/component-fixture') {
      await route.fulfill({ body: '<div id="root"></div>', contentType: 'text/html' })
    } else await route.abort()
  })
  await page.goto('/component-fixture')
  await page.addScriptTag({ content: component })
}

test('password login submits once, clears the password, and enters only TOTP', async ({ page }) => {
  await loadComponent(page)
  await page.evaluate(() => {
    window.__PASSWORD_LOGIN_MODE__ = 'pending-success'
  })

  await page.getByLabel('Email').fill('staff@example.org')
  const password = page.getByRole('textbox', { name: 'Password', exact: true })
  await password.fill('Synthetic-password-42!')
  await page.getByRole('button', { name: 'Sign In' }).evaluate((button) => {
    button.click()
    button.click()
  })

  await expect.poll(() => page.evaluate(() => window.__PASSWORD_LOGIN_COUNT__)).toBe(1)
  await expect(page.getByRole('button', { name: 'Signing in...' })).toBeDisabled()
  await expect(password).toBeDisabled()
  await page.evaluate(() => window.__PASSWORD_LOGIN_RELEASE__?.())

  await expect
    .poll(() => page.evaluate(() => window.__PASSWORD_LOGIN_NAVIGATION__))
    .toBe('/auth/mfa')
  await expect(password).toHaveValue('')
  await expect(page.getByText(/email code|sign-in code/i)).toHaveCount(0)
})

test('credential rejection is generic and never exposes provider detail', async ({ page }) => {
  await loadComponent(page)
  await page.evaluate(() => {
    window.__PASSWORD_LOGIN_MODE__ = 'rejected'
  })

  await page.getByLabel('Email').fill('staff@example.org')
  const password = page.getByRole('textbox', { name: 'Password', exact: true })
  await password.fill('Synthetic-password-42!')
  await page.getByRole('button', { name: 'Sign In' }).click()

  await expect(page.getByRole('alert')).toHaveText(
    'Could not sign in. Check your credentials and try again.',
  )
  await expect(page.getByText(/private-provider-detail/i)).toHaveCount(0)
  await expect(password).toHaveValue('')
})

for (const mode of ['network'] as const) {
  test(`${mode} denies access with a fixed message`, async ({ page }) => {
    await loadComponent(page)
    await page.evaluate((value) => {
      window.__PASSWORD_LOGIN_MODE__ = value
    }, mode)
    await page.getByLabel('Email').fill('staff@example.org')
    await page
      .getByRole('textbox', { name: 'Password', exact: true })
      .fill('Synthetic-password-42!')
    await page.getByRole('button', { name: 'Sign In' }).click()

    await expect(page.getByRole('alert')).toHaveText(
      'Authentication is temporarily unavailable. No application access was granted.',
    )
    await expect
      .poll(() => page.evaluate(() => window.__PASSWORD_LOGIN_NAVIGATION__))
      .toBe(undefined)
  })
}

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
