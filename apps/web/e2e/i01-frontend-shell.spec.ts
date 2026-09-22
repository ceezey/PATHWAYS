import { type Page, expect, test } from '@playwright/test'

const seedPrototypeSession = async (page: Page, role = 'Program Manager') => {
  await page.goto('/staff/login')
  await page.evaluate((selectedRole) => {
    window.localStorage.setItem(
      'pathways.prototypeSession',
      JSON.stringify({
        email: 'frontend.review@demo.pathways.local',
        displayName: 'Frontend Review',
        role: selectedRole,
        signedInAt: new Date().toISOString(),
      }),
    )
    window.localStorage.setItem('pathways.prototypeRole', selectedRole)
  }, role)
}

const observeBrowserErrors = (page: Page) => {
  const errors: string[] = []

  page.on('console', (message) => {
    if (message.type() === 'error') {
      errors.push(message.text())
    }
  })
  page.on('pageerror', (error) => errors.push(error.message))

  return errors
}

test.describe('I01 frontend-only staff shell', () => {
  test('shows truthful role and preview scope, then clears the local session on sign out', async ({
    page,
  }, testInfo) => {
    const browserErrors = observeBrowserErrors(page)
    await page.setViewportSize({ width: 1512, height: 1064 })
    await seedPrototypeSession(page)
    await page.goto('/dashboard')

    const header = page.locator('header').first()
    await expect(header.getByText('Program Manager · Portfolio preview')).toBeVisible()
    await expect(page.locator('aside').getByText('Portfolio preview')).toBeVisible()
    await page.screenshot({
      path: testInfo.outputPath('desktop-staff-shell.png'),
    })

    await page.getByRole('combobox', { name: 'Prototype Role Preview' }).click()
    await page.getByRole('option', { name: 'Project Officer' }).click()
    await expect(header.getByText('Project Officer · 1 assigned project · preview')).toBeVisible()

    const sessionButton = header.getByRole('button', {
      name: 'frontend.review@demo.pathways.local',
    })
    await sessionButton.focus()
    await expect(sessionButton).toBeFocused()
    await page.screenshot({
      path: testInfo.outputPath('desktop-session-focus.png'),
    })
    await sessionButton.click()
    const sessionMenu = page.getByRole('menu')
    await expect(sessionMenu.getByText('1 assigned project · preview')).toBeVisible()
    await sessionMenu.getByRole('menuitem', { name: 'Sign out' }).click()
    await expect(page).toHaveURL(/\/staff\/login$/)

    await page.goto('/dashboard')
    await expect(page).toHaveURL(/\/staff\/login$/)
    expect(browserErrors).toEqual([])
  })

  test('keeps the labelled navigation and scope usable at a narrow viewport', async ({
    page,
  }, testInfo) => {
    const browserErrors = observeBrowserErrors(page)
    await page.setViewportSize({ width: 390, height: 844 })
    await seedPrototypeSession(page, 'Project Officer')
    await page.goto('/dashboard')

    const openNavigation = page.getByRole('button', { name: 'Open navigation' })
    await openNavigation.focus()
    await expect(openNavigation).toBeFocused()
    await openNavigation.click()

    const navigation = page.getByRole('dialog', { name: 'Workspace navigation' })
    await expect(navigation.getByText('1 assigned project · preview')).toBeVisible()
    await expect(navigation.getByRole('link', { name: 'Projects', exact: true })).toBeVisible()
    const closeNavigation = navigation.getByRole('button', { name: 'Close' })
    await closeNavigation.focus()
    await expect(closeNavigation).toBeFocused()
    const closeBox = await closeNavigation.boundingBox()
    expect(closeBox?.width).toBeGreaterThanOrEqual(44)
    expect(closeBox?.height).toBeGreaterThanOrEqual(44)
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true)
    await page.screenshot({
      path: testInfo.outputPath('mobile-workspace-navigation.png'),
    })
    await closeNavigation.click()
    await expect(navigation).not.toBeVisible()
    await expect(openNavigation).toBeFocused()
    expect(browserErrors).toEqual([])
  })
})
