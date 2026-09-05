import { type Page, expect, test } from '@playwright/test'

const seedPrototypeSession = async (page: Page, role = 'Program Manager') => {
  await page.addInitScript((selectedRole) => {
    window.localStorage.setItem(
      'pathways.prototypeSession',
      JSON.stringify({
        email: 'phase5@demo.pathways.local',
        displayName: `${selectedRole} Demo`,
        role: selectedRole,
        signedInAt: new Date().toISOString(),
      }),
    )
    window.localStorage.setItem('pathways.prototypeRole', selectedRole)
  }, role)
}

test.describe('Phase 5 public and authentication contract', () => {
  test('public routes preserve identity, headings, metadata, and a single main landmark', async ({
    page,
  }) => {
    await page.goto('/')

    await expect(page).toHaveTitle('Public Impact Overview | PATHWAYS')
    await expect(page.getByText('HDO Public Dashboard', { exact: true })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Dashboard', exact: true })).toHaveAttribute(
      'aria-current',
      'page',
    )
    await expect(
      page.getByRole('heading', { name: 'PATHWAYS Public Project Dashboard' }),
    ).toBeVisible()
    await expect(page.getByRole('main')).toHaveCount(1)

    await page.goto('/public/projects')
    await expect(page).toHaveTitle('Public Project Directory | PATHWAYS')
    await expect(page.getByRole('heading', { name: 'Projects', exact: true })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Projects', exact: true })).toHaveAttribute(
      'aria-current',
      'page',
    )
    await expect(page.getByRole('main')).toHaveCount(1)

    await page.goto('/public/projects/futuremakers-ncr')
    await expect(page).toHaveTitle('Public Project Story | PATHWAYS')
    await expect(page.getByRole('main')).toHaveCount(1)
    await expect(page.getByRole('heading', { name: 'FutureMakers NCR', level: 1 })).toBeVisible()

    const breadcrumb = page.getByRole('navigation', { name: 'Breadcrumb' })
    await expect(breadcrumb.getByRole('link', { name: 'Home' })).toHaveAttribute('href', '/')
    await expect(breadcrumb.getByRole('link', { name: 'Public projects' })).toHaveAttribute(
      'href',
      '/public/projects',
    )
    await expect(breadcrumb.locator('[aria-current="page"]')).toHaveText('FutureMakers NCR')

    for (const anchor of [
      'public-overview-title',
      'public-media-title',
      'public-progress-title',
      'public-indicators-title',
      'public-milestones-title',
    ]) {
      await expect(page.locator(`#${anchor}`)).toBeVisible()
    }

    await expect(page.getByRole('button', { name: 'Edit staff preview' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Modify budget' })).toHaveCount(0)
    await expect(page.getByText('Project Team', { exact: true })).toHaveCount(0)
    await expect(page.getByText('Aggregate, non-sensitive project information only.')).toBeVisible()
  })

  test('public detail and staff preview remain distinct and responsive', async ({ page }) => {
    for (const width of [320, 375, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: width < 768 ? 844 : 900 })
      await page.goto('/public/projects/futuremakers-ncr')
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      ).toBe(true)
      await expect(page.getByRole('main')).toHaveCount(1)
      await expect(page.getByRole('button', { name: 'Donate Now' })).toBeVisible()
    }

    await seedPrototypeSession(page)
    await page.goto('/projects/futuremakers-ncr/transparency/preview')
    await expect(page.getByRole('main')).toHaveCount(1)
    await expect(page.getByText('Staff-only prototype preview.')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Edit staff preview' })).toBeVisible()
  })

  test('public skip navigation and staff authentication presentation remain accessible', async ({
    page,
  }) => {
    await page.goto('/')
    await page.keyboard.press('Tab')
    const skipLink = page.getByRole('link', { name: 'Skip to main content' })
    await expect(skipLink).toBeFocused()
    await skipLink.press('Enter')
    await expect(page.getByRole('main')).toBeFocused()

    await page.goto('/staff/login')
    await expect(page).toHaveTitle('Staff Sign In | PATHWAYS')
    await expect(page.getByRole('main')).toHaveCount(1)
    await expect(page.getByRole('heading', { name: 'Sign in to PATHWAYS', level: 1 })).toBeVisible()

    const brandMark = page.locator('img[src*="pathways-mark"]')
    await expect(brandMark).toHaveCount(1)
    await expect(brandMark).toHaveAttribute('alt', '')
    await expect(brandMark).toHaveAttribute('aria-hidden', 'true')
    await expect(brandMark).toHaveAttribute('width', '32')
    await expect(brandMark).toHaveAttribute('height', '32')

    await page.getByLabel('Username or email').fill('')
    await page.getByRole('button', { name: 'Log In' }).click()
    await expect(page.getByText('Enter your username or email.')).toBeVisible()
    await expect(page.getByText('Password must be at least 8 characters.')).toBeVisible()
    await expect(page.getByLabel('Username or email')).toBeFocused()
  })
})
