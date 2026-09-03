import { type Page, expect, test } from '@playwright/test'

const prototypePassword = 'PathwaysDemo!2026'

const seedPrototypeSession = async (page: Page, role = 'Monitoring and Evaluation Officer') => {
  await page.addInitScript((selectedRole) => {
    window.localStorage.setItem(
      'pathways.prototypeSession',
      JSON.stringify({
        email: 'monitoring.evaluation@demo.pathways.local',
        displayName: 'Monitoring and Evaluation Officer Demo',
        role: selectedRole,
        signedInAt: new Date().toISOString(),
      }),
    )
    window.localStorage.setItem('pathways.prototypeRole', selectedRole)
  }, role)
}

const seedBeneficiaryAccess = async (page: Page) => {
  await seedPrototypeSession(page)
  await page.addInitScript(() => {
    const now = new Date()
    window.sessionStorage.setItem(
      'pathways.beneficiaryAccess',
      JSON.stringify({
        role: 'Monitoring and Evaluation Officer',
        verifiedAt: now.toISOString(),
        expiresAt: new Date(now.getTime() + 15 * 60 * 1000).toISOString(),
        token: 'p5-c1-beneficiary-access',
      }),
    )
  })
}

test.describe('P5-C1 controlled remediation', () => {
  test('login and OTP request rejection restores controls and supports retry', async ({ page }) => {
    test.setTimeout(90_000)
    let challengeRequests = 0
    await page.route('**/api/prototype-mfa/challenge', async (route) => {
      challengeRequests += 1
      if (challengeRequests === 1) {
        await route.abort('failed')
        return
      }
      await route.continue()
    })

    let verificationRequests = 0
    await page.route('**/api/prototype-mfa/verify', async (route) => {
      verificationRequests += 1
      if (verificationRequests === 1) {
        await route.abort('failed')
        return
      }
      await route.continue()
    })

    await page.goto('/staff/login')
    const identifier = page.getByLabel('Username or Email')
    const password = page.getByLabel('Password', { exact: true })
    const loginButton = page.getByRole('button', { name: 'Log In' })
    await identifier.fill('program.manager')
    await password.fill(prototypePassword)
    await loginButton.click()

    await expect(
      page.getByText(
        'The sign-in service could not be reached. Check your connection and try again.',
      ),
    ).toBeVisible()
    await expect(identifier).toHaveValue('program.manager')
    await expect(password).toHaveValue(prototypePassword)
    await expect(loginButton).toBeEnabled()
    await expect(loginButton).toBeFocused()

    await loginButton.click()
    await expect(page.getByRole('heading', { name: 'OTP verification' })).toBeVisible({
      timeout: 30_000,
    })

    const otp = page.getByLabel('Six-digit OTP code')
    const verifyButton = page.getByRole('button', { name: 'Verify Code' })
    await otp.fill('123456')
    await verifyButton.click()

    await expect(
      page.getByText(
        'The OTP verification service could not be reached. Your code was kept; check your connection and try again.',
      ),
    ).toBeVisible()
    await expect(otp).toHaveValue('123456')
    await expect(verifyButton).toBeEnabled()
    await expect(verifyButton).toBeFocused()

    await verifyButton.click()
    await expect(page).toHaveURL(/\/dashboard$/, { timeout: 60_000 })
    expect(challengeRequests).toBe(2)
    expect(verificationRequests).toBe(2)
  })

  test('beneficiary step-up rejection keeps safe input and retries without reload', async ({
    page,
  }) => {
    test.setTimeout(90_000)
    await seedPrototypeSession(page)
    let verificationRequests = 0
    await page.route('**/api/beneficiary-step-up/verify', async (route) => {
      verificationRequests += 1
      if (verificationRequests === 1) {
        await route.abort('failed')
        return
      }
      await route.continue()
    })

    await page.goto('/beneficiaries')
    const pin = page.getByLabel('Beneficiary access PIN')
    const verifyButton = page.getByRole('button', { name: 'Verify and enter' })
    await pin.fill('2468')
    await verifyButton.click()

    await expect(
      page.getByText(
        'The beneficiary access service could not be reached. Check your connection and try again.',
      ),
    ).toBeVisible()
    await expect(pin).toHaveValue('2468')
    await expect(verifyButton).toBeEnabled()
    await expect(verifyButton).toBeFocused()

    await verifyButton.click()
    await expect(page.getByRole('heading', { name: 'Beneficiary Journey Tracking' })).toBeVisible({
      timeout: 30_000,
    })
    expect(verificationRequests).toBe(2)
  })

  test('settled beneficiary, project, and activity results announce without moving focus', async ({
    page,
  }) => {
    test.setTimeout(90_000)
    await seedBeneficiaryAccess(page)

    await page.goto('/beneficiaries')
    const beneficiarySearch = page.getByRole('searchbox', { name: 'Search by name or code' })
    const beneficiaryStatus = page.getByRole('status', { name: 'Filtered results' })
    await beneficiarySearch.fill('No matching beneficiary')
    await expect(beneficiaryStatus).toHaveText(
      'No Beneficiary records match the current search and filters.',
    )
    await expect(beneficiarySearch).toBeFocused()

    await page.goto('/projects')
    const projectSearch = page.getByRole('textbox', { name: 'Search projects' })
    const projectStatus = page.getByRole('status', { name: 'Filtered results' })
    await projectSearch.fill('No matching project')
    await expect(projectStatus).toHaveText(
      'No projects match the current search and status filter.',
    )
    await expect(projectSearch).toBeFocused()

    await page.goto('/projects/futuremakers-ncr/activities')
    const activitySearch = page.getByRole('textbox', { name: 'Search activities' })
    const activityStatus = page.getByRole('status', { name: 'Filtered results' })
    await activitySearch.fill('No matching activity')
    await expect(activityStatus).toHaveText(
      'No activities match the current search and status filter.',
    )
    await expect(activitySearch).toBeFocused()
  })
})
