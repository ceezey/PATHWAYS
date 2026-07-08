import { type Page, expect, test } from '@playwright/test'

const prototypePassword = 'PathwaysDemo!2026'

const seedPrototypeSession = async (page: Page, role = 'Program Manager') => {
  await page.addInitScript((selectedRole) => {
    window.localStorage.setItem(
      'pathways.prototypeSession',
      JSON.stringify({
        email: 'program.manager@demo.pathways.local',
        displayName: 'Program Manager Demo',
        role: selectedRole,
        signedInAt: new Date().toISOString(),
      }),
    )
    window.localStorage.setItem('pathways.prototypeRole', selectedRole)
  }, role)
}

test('public dashboard links work without the internal sidebar', async ({ page }) => {
  await page.goto('/')

  await expect(
    page.getByRole('heading', { name: 'PATHWAYS Public Project Dashboard' }),
  ).toBeVisible()
  await expect(page.getByText('Prototype Role Preview')).toHaveCount(0)
  await expect(page.getByRole('link', { name: /Staff Login|Sign In|Admin Login/i })).toHaveCount(0)

  await page.locator('a[href="/public/projects"]').first().click()
  await expect(page).toHaveURL(/\/public\/projects$/)
  await expect(page.getByRole('heading', { name: 'Projects' })).toBeVisible()

  await page
    .getByRole('link', { name: /Read more/i })
    .first()
    .click()
  await expect(page).toHaveURL(/\/public\/projects\/futuremakers-ncr$/)
  await expect(page.getByRole('heading', { name: 'FutureMakers NCR' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'About the Project' })).toBeVisible()
  await expect(page.getByRole('link', { name: /Donate or Engage/i })).toBeVisible()
})

test('login works and role preview switches through every supported role', async ({ page }) => {
  await page.goto('/login')
  await expect(page).toHaveURL(/\/staff\/login$/)

  await expect(page.getByRole('heading', { name: 'Sign in to PATHWAYS' })).toBeVisible()
  await page.getByRole('button', { name: 'Demo Accounts' }).click()
  await page
    .getByRole('dialog', { name: 'Demo accounts' })
    .getByRole('button', { name: /Program Manager/ })
    .click()
  await page.keyboard.press('Escape')
  await page.getByLabel('Password', { exact: true }).fill(prototypePassword)
  await page.getByRole('button', { name: 'Log In' }).click()
  await expect(page.getByRole('heading', { name: 'OTP verification' })).toBeVisible()
  await page.getByLabel('Six-digit OTP code').fill('123456')
  await page.getByRole('button', { name: 'Verify Code' }).click()
  await expect(page).toHaveURL(/\/dashboard$/, { timeout: 15_000 })

  const roleSwitcher = page.getByRole('combobox', { name: 'Prototype Role Preview' })
  await expect(roleSwitcher).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Program Manager dashboard' })).toBeVisible()

  for (const role of [
    'Project Manager',
    'Monitoring and Evaluation Officer',
    'Project Officer',
    'System Administrator',
  ]) {
    await roleSwitcher.click()
    await page.getByRole('option', { name: role }).click()
    await expect(page.getByRole('heading', { name: `${role} dashboard` })).toBeVisible()
  }
})

test('dashboard navigation and legacy route redirects are reachable', async ({ page }) => {
  await seedPrototypeSession(page)
  await page.goto('/dashboard')

  await expect(page.getByRole('heading', { name: 'Program Manager dashboard' })).toBeVisible()

  for (const linkName of [
    'Projects',
    'Beneficiaries',
    'Analytics',
    'Alerts',
    'Recommendations',
    'Reports',
  ]) {
    await expect(page.getByRole('link', { name: linkName }).first()).toBeVisible()
  }

  await page.goto('/participants')
  await expect(page).toHaveURL(/\/beneficiaries$/)
  await expect(
    page.getByRole('heading', { name: 'Verify beneficiary module access' }),
  ).toBeVisible()

  await page.goto('/imports')
  await expect(page).toHaveURL(/\/collection\/import$/)
  await expect(page.getByText('Unauthorized access')).toBeVisible()
  await expect(page.getByText(/cannot access Collection/)).toBeVisible()
})

test('project directory, workspace tabs, and activity dialog are navigable', async ({ page }) => {
  await seedPrototypeSession(page, 'Project Manager')
  await page.goto('/projects')

  await expect(page.getByRole('heading', { name: 'Project Information Management' })).toBeVisible()
  await expect(page.getByLabel('Search projects')).toBeVisible()

  await page.goto('/projects/futuremakers-ncr/activities')
  await expect(page.getByRole('heading', { name: 'Activity Management' })).toBeVisible()

  for (const tab of ['Monitor & Evaluate', 'Budget', 'Journey Stages', 'Transparency']) {
    await expect(page.getByRole('link', { name: tab })).toBeVisible()
  }

  await page.getByRole('button', { name: 'New Activity' }).click()
  await expect(page.getByRole('heading', { name: 'Create activity' })).toBeVisible()
  await page.getByRole('button', { name: 'Cancel' }).click()
})

test('beneficiary directory and analytics screens expose critical controls', async ({ page }) => {
  await seedPrototypeSession(page, 'Monitoring and Evaluation Officer')
  await page.goto('/beneficiaries')

  await expect(
    page.getByRole('heading', { name: 'Verify beneficiary module access' }),
  ).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Beneficiary management' })).toHaveCount(0)
  await page.getByLabel('Beneficiary access PIN').fill('0000')
  const beneficiaryVerifyButton = page.getByRole('button', { name: 'Verify and enter' })
  await expect(beneficiaryVerifyButton).toBeEnabled()
  await beneficiaryVerifyButton.click()
  await expect(page.getByText('Invalid beneficiary access PIN.')).toBeVisible({ timeout: 15_000 })
  await page.getByLabel('Beneficiary access PIN').fill('2468')
  await expect(beneficiaryVerifyButton).toBeEnabled()
  await beneficiaryVerifyButton.click()
  await expect(page.getByRole('heading', { name: 'Beneficiary management' })).toBeVisible()
  await expect(page.getByLabel('Search')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Verify access' })).toHaveCount(0)

  await page.goto('/analytics')
  await expect(
    page.getByRole('heading', { name: 'Monitoring and analytics dashboard' }),
  ).toBeVisible()
  await expect(page.getByRole('link', { name: 'Active alerts' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Manage rules' })).toBeVisible()

  await page.goto('/collection/import')
  await expect(page.getByText('Prototype upload progress')).toBeVisible()
})

test('reports are filterable, previewable, and keep export actions prototype-only', async ({
  page,
}) => {
  await seedPrototypeSession(page, 'Program Manager')
  await page.goto('/reports/indicator-summary')

  await expect(page.getByRole('heading', { name: 'Reporting workspace' })).toBeVisible()
  await expect(page.getByText('Generate a report.')).toBeVisible()
  await page.getByRole('button', { name: 'Generate' }).click()
  await expect(page.getByText('Beneficiaries completing orientation')).toBeVisible()

  await page.getByRole('button', { name: 'Columns' }).click()
  await expect(page.getByRole('heading', { name: 'Select columns' })).toBeVisible()
  await page
    .getByRole('dialog', { name: 'Select columns' })
    .getByRole('button', { name: 'Next' })
    .click()

  await page.getByRole('button', { name: 'Preview', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Report Preview' })).toBeVisible()
  await page
    .getByRole('dialog', { name: 'Report Preview' })
    .getByRole('button', { name: 'Close' })
    .first()
    .click()
})

for (const viewport of [
  { width: 1440, height: 900 },
  { width: 1024, height: 768 },
  { width: 768, height: 1024 },
  { width: 390, height: 844 },
]) {
  test(`responsive smoke at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport)

    await page.goto('/')
    await expect(
      page.getByRole('heading', { name: 'PATHWAYS Public Project Dashboard' }),
    ).toBeVisible()

    await seedPrototypeSession(page)
    await page.goto('/dashboard')
    await expect(page.getByRole('heading', { name: 'Program Manager dashboard' })).toBeVisible()

    if (viewport.width < 1024) {
      await expect(page.getByRole('button', { name: 'Open navigation' })).toBeVisible()
    } else {
      await expect(page.getByRole('button', { name: 'Collapse sidebar' })).toBeVisible()
    }
  })
}
