import { expect, test } from '@playwright/test'

test('public dashboard remains navigable with no published projects', async ({ page }) => {
  await page.goto('/')

  await expect(
    page.getByRole('heading', { name: 'PATHWAYS Public Project Dashboard' }),
  ).toBeVisible()
  await expect(
    page.getByRole('heading', { name: 'No public projects are available yet' }),
  ).toBeVisible()
  await expect(page.getByText('Prototype Role Preview')).toHaveCount(0)

  await page.getByRole('link', { name: 'View projects' }).click()
  await expect(page).toHaveURL(/\/public\/projects$/)
  await expect(page.getByRole('heading', { level: 1, name: 'Projects' })).toBeVisible()
  await expect(
    page.getByRole('heading', { name: 'No public projects are available yet' }),
  ).toBeVisible()
})

test('public project empty state remains usable on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/public/projects')

  await expect(page.getByRole('heading', { level: 1, name: 'Projects' })).toBeVisible()
  await expect(
    page.getByRole('heading', { name: 'No public projects are available yet' }),
  ).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  )
})

test('public project detail reports the missing publishing integration', async ({ page }) => {
  await page.goto('/public/projects/not-published')

  await expect(
    page.getByText('Public project details are not available yet', { exact: true }),
  ).toBeVisible()
  await expect(page.getByRole('link', { name: 'Back to public projects' })).toBeVisible()
})

test('legacy login redirects to the real staff sign-in form', async ({ page }) => {
  await page.goto('/login')

  await expect(page).toHaveURL(/\/staff\/login$/)
  await expect(page.getByRole('heading', { name: 'Sign in to PATHWAYS' })).toBeVisible()
  await expect(page.getByText('Supabase authentication', { exact: true })).toBeVisible()
  await expect(page.getByText(/demo account|one-time code|role preview/i)).toHaveCount(0)
})

test('local password recovery is styled, explicit, and fails closed without a recovery link', async ({
  page,
}) => {
  await page.goto('/staff/login')
  await page.getByRole('link', { name: 'Forgot Password?' }).click()

  await expect(page).toHaveURL('http://127.0.0.1:3000/staff/forgot-password')
  await expect(page.getByRole('heading', { name: 'Reset your password' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Send recovery message' })).toBeVisible()
  await expect(page.locator('main')).toHaveCSS('background-image', /linear-gradient/)

  await page.goto('/auth/update-password')
  await expect(page.getByRole('heading', { name: 'Recovery link unavailable' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Change password' })).toHaveCount(0)
})

test('protected dashboard does not inject an identity when unauthenticated', async ({ page }) => {
  await page.goto('/dashboard')

  await expect
    .poll(async () => {
      if (new URL(page.url()).pathname === '/staff/login') {
        return 'login'
      }

      const setupRequired = await page
        .getByRole('heading', { name: 'Supabase auth setup is still required' })
        .isVisible()
        .catch(() => false)

      return setupRequired ? 'setup-required' : 'pending'
    })
    .toMatch(/login|setup-required/)

  await expect(page.getByText(/Program Manager Demo|Prototype Role Preview/i)).toHaveCount(0)
})

test('workspace cannot be opened using a forged profile-selector cookie', async ({
  page,
  context,
}) => {
  await context.addCookies([
    {
      name: 'pathways-context',
      value: encodeURIComponent(
        JSON.stringify({
          authUserId: '56ad4c1a-113f-401b-84e8-1d2135f174c1',
          organizationId: '30000000-0000-4000-8000-000000000003',
          userId: '40000000-0000-4000-8000-000000000004',
          roles: ['SYSTEM_ADMINISTRATOR'],
          permissions: ['projects.read'],
        }),
      ),
      url: 'http://127.0.0.1:3000',
      sameSite: 'Strict',
    },
  ])
  await page.goto('/workspace')
  await expect(page).toHaveURL('http://127.0.0.1:3000/staff/login')
  await expect(page.getByRole('heading', { name: 'Your projects' })).toHaveCount(0)
})
