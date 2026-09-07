import { type Page, expect, test } from '@playwright/test'

const seedPrototypeSession = async (page: Page) => {
  await page.goto('/staff/login')
  await page.evaluate(() => {
    window.localStorage.setItem(
      'pathways.prototypeSession',
      JSON.stringify({
        email: 'frontend.review@demo.pathways.local',
        displayName: 'Frontend Review',
        role: 'Program Manager',
        signedInAt: new Date().toISOString(),
      }),
    )
    window.localStorage.setItem('pathways.prototypeRole', 'Program Manager')
  })
}

const observeBrowserErrors = (page: Page) => {
  const errors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  page.on('pageerror', (error) => errors.push(error.message))
  return errors
}

test.describe('I02 frontend-only recovery and own profile', () => {
  test('validates recovery input and keeps the response generic', async ({ page }, testInfo) => {
    const browserErrors = observeBrowserErrors(page)
    await page.setViewportSize({ width: 1512, height: 1064 })
    await page.goto('/staff/login')
    const forgotPassword = page.getByRole('link', { name: 'Forgot Password?' })
    await forgotPassword.focus()
    await expect(forgotPassword).toBeFocused()
    await forgotPassword.press('Enter')
    await expect(page).toHaveURL(/\/staff\/recover$/)

    await page.getByRole('textbox', { name: /Registered email address/ }).fill('invalid')
    await page.getByRole('button', { name: 'Continue' }).click()
    await expect(page.getByText('Enter a valid staff email address.')).toBeVisible()

    await page
      .getByRole('textbox', { name: /Registered email address/ })
      .fill('unknown@example.org')
    await page.getByRole('button', { name: 'Continue' }).click()
    await expect(page.getByRole('status')).toContainText('If an active PATHWAYS account matches')
    await expect(page.getByText(/does not send email, create a recovery token/)).toBeVisible()
    await page.screenshot({ path: testInfo.outputPath('desktop-recovery-requested.png') })
    expect(browserErrors).toEqual([])
  })

  test('covers valid, expired, used, and invalid reset-link presentations', async ({
    page,
  }, testInfo) => {
    const browserErrors = observeBrowserErrors(page)
    for (const [state, heading] of [
      ['expired', 'This recovery link has expired'],
      ['used', 'This recovery link was already used'],
      ['invalid', 'This recovery link is not valid'],
    ] as const) {
      await page.goto(`/staff/reset-password?state=${state}`)
      await expect(page.getByRole('heading', { name: heading })).toBeVisible()
      const freshRequest = page.getByRole('link', { name: 'Request a new recovery link' })
      await expect(freshRequest).toBeVisible()
      await freshRequest.focus()
      await expect(freshRequest).toBeFocused()
    }

    await page.goto('/staff/reset-password?state=valid')
    await page.getByLabel(/^New password/).fill('weak')
    await page.getByLabel(/^Confirm new password/).fill('different')
    await page.getByRole('button', { name: 'Validate new password' }).click()
    await expect(page.getByText(/Use 15/).last()).toBeVisible()

    await page.getByLabel(/^New password/).fill('StrongPathways!2026')
    await page.getByLabel(/^Confirm new password/).fill('StrongPathways!2026')
    await page.getByRole('button', { name: 'Validate new password' }).click()
    await expect(page.getByRole('status')).toContainText('No password was changed')
    await page.screenshot({ path: testInfo.outputPath('desktop-reset-validated.png') })
    expect(browserErrors).toEqual([])
  })

  test('updates the browser-local profile, preserves it on reload, and validates password fields', async ({
    page,
  }, testInfo) => {
    const browserErrors = observeBrowserErrors(page)
    await page.setViewportSize({ width: 390, height: 844 })
    await seedPrototypeSession(page)
    await page.goto('/dashboard')
    const sessionMenu = page.getByRole('button', { name: 'frontend.review@demo.pathways.local' })
    await sessionMenu.focus()
    await sessionMenu.press('Enter')
    const myProfile = page.getByRole('menuitem', { name: 'My Profile' })
    await myProfile.focus()
    await myProfile.press('Enter')
    await expect(page).toHaveURL(/\/settings\/profile$/)
    await expect(page.getByRole('heading', { name: 'My Profile' })).toBeVisible()

    await page.getByRole('textbox', { name: /^Email address/ }).fill('invalid')
    await page.getByRole('button', { name: 'Update browser profile' }).click()
    await expect(page.getByText('Enter a valid email address.')).toBeVisible()

    await page.getByRole('textbox', { name: /^Name/ }).fill('Frontend Reviewer')
    await page.getByRole('textbox', { name: 'Contact number' }).fill('+63 917 123 4567')
    await page.getByRole('textbox', { name: /^Email address/ }).fill('reviewer@demo.pathways.local')
    await page.getByRole('button', { name: 'Update browser profile' }).click()
    await expect(page.getByText(/updated in this browser only/)).toBeVisible()
    await page.reload()
    await expect(page.getByRole('textbox', { name: /^Email address/ })).toHaveValue(
      'reviewer@demo.pathways.local',
    )

    await page.getByLabel(/^Current password/).fill('CurrentPathways!2025')
    await page.getByLabel(/^New password/).fill('NewPathwaysPass!2026')
    await page.getByLabel(/^Confirm new password/).fill('NewPathwaysPass!2026')
    await page.getByRole('button', { name: 'Validate password change' }).click()
    await expect(page.getByText(/No credential was changed/)).toBeVisible()
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true)
    await page.evaluate(() => {
      document.documentElement.style.scrollBehavior = 'auto'
      document.documentElement.scrollTop = 0
      document.body.scrollTop = 0
      document.querySelector<HTMLElement>('#main-content')?.focus({ preventScroll: true })
    })
    await page.waitForTimeout(100)
    await page.screenshot({ path: testInfo.outputPath('mobile-own-profile.png') })
    expect(browserErrors).toEqual([])
  })
})
