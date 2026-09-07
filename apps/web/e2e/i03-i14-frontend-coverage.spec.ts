import { type Page, expect, test } from '@playwright/test'

const seedAdministratorSession = async (page: Page) => {
  await page.goto('/staff/login')
  await page.evaluate(() => {
    window.localStorage.setItem(
      'pathways.prototypeSession',
      JSON.stringify({
        email: 'admin.frontend@demo.pathways.local',
        displayName: 'Frontend Administrator',
        role: 'System Administrator',
        signedInAt: new Date().toISOString(),
      }),
    )
    window.localStorage.setItem('pathways.prototypeRole', 'System Administrator')
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

const expectNoHorizontalPageOverflow = async (page: Page) => {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  )
}

test.describe('I03-I14 frontend-only workflow coverage', () => {
  test('renders each phase representative surface for the administrator preview', async ({
    page,
  }) => {
    test.setTimeout(90_000)
    const browserErrors = observeBrowserErrors(page)
    await seedAdministratorSession(page)

    const surfaces: Array<[string, string]> = [
      ['/settings/users', 'User Management'],
      ['/settings/audit', 'Audit Log'],
      ['/projects', 'Project Information Management'],
      ['/indicators', 'Indicator Library'],
      ['/projects/futuremakers-ncr/activities', 'Project Activities'],
      ['/collection/entry', 'Encode Project Data'],
      ['/collection/import', 'Metadata-Driven Data Integration'],
      ['/beneficiaries/duplicates', 'Possible Duplicate Review'],
      ['/beneficiaries/ben-001', 'Beneficiary NCR-001'],
      ['/analytics', 'Data Analysis'],
      ['/alerts/repository', 'Alerts Repository'],
      ['/reports', 'Reports'],
      ['/settings/backups', 'Backup & Recovery'],
      ['/transparency', 'Public Tracker Review'],
    ]

    for (const [path, heading] of surfaces) {
      await page.goto(path, { waitUntil: 'domcontentloaded' })
      await expect(page.getByRole('heading', { name: heading, exact: true }).first()).toBeVisible()
      await expectNoHorizontalPageOverflow(page)
    }

    await page.goto('/public/projects', { waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('heading', { name: 'Projects', exact: true })).toBeVisible()
    await expectNoHorizontalPageOverflow(page)
    expect(browserErrors).toEqual([])
  })

  test('supports audit filtering and read-only event inspection', async ({ page }, testInfo) => {
    const browserErrors = observeBrowserErrors(page)
    await page.setViewportSize({ width: 1512, height: 1064 })
    await seedAdministratorSession(page)
    await page.goto('/settings/audit')

    await page
      .getByRole('searchbox', { name: 'Actor, action, target, or event ID' })
      .fill('no-match')
    await expect(page.getByText('No events match these filters')).toBeVisible()
    await page.getByRole('button', { name: 'Clear filters' }).click()
    await page.getByRole('button', { name: 'View' }).first().click()
    await expect(page.getByRole('dialog')).toContainText('Read-only synthetic event context')
    await page.getByRole('button', { name: 'Close' }).click()
    await page.screenshot({
      path: testInfo.outputPath('i03-audit-log-desktop.png'),
      fullPage: true,
    })
    expect(browserErrors).toEqual([])
  })

  test('validates a local manual entry without submitting a record', async ({ page }, testInfo) => {
    const browserErrors = observeBrowserErrors(page)
    await page.setViewportSize({ width: 390, height: 844 })
    await seedAdministratorSession(page)
    await page.goto('/collection/entry')

    await page.getByRole('button', { name: 'Validate entry' }).click()
    await expect(page.getByText('Beneficiary code is required.')).toBeVisible()
    await page.getByLabel('Beneficiary code').fill('BEN-NCR-001')
    await page.getByLabel('Activity date').fill('2026-09-08')
    await page.getByRole('combobox', { name: 'Attendance status' }).click()
    await page.getByRole('option', { name: 'Present' }).click()
    await page.getByRole('button', { name: 'Save local draft' }).click()
    await expect(page.getByText(/Draft saved in this browser only/)).toBeVisible()
    await page.getByRole('button', { name: 'Validate entry' }).click()
    await expect(page.getByText(/Submission remains unavailable/)).toBeVisible()
    await expectNoHorizontalPageOverflow(page)
    await page.evaluate(() => {
      document.documentElement.style.scrollBehavior = 'auto'
      document.documentElement.scrollTop = 0
      document.body.scrollTop = 0
      document.querySelector<HTMLElement>('#main-content')?.focus({ preventScroll: true })
    })
    await page.waitForTimeout(100)
    await page.screenshot({
      path: testInfo.outputPath('i06-manual-entry-mobile.png'),
    })
    expect(browserErrors).toEqual([])
  })

  test('keeps duplicate decisions and recovery operations non-destructive', async ({
    page,
  }, testInfo) => {
    const browserErrors = observeBrowserErrors(page)
    await page.setViewportSize({ width: 1512, height: 1064 })
    await seedAdministratorSession(page)

    await page.goto('/beneficiaries/duplicates')
    await page.getByRole('button', { name: 'Flag as the same person' }).click()
    await expect(page.getByRole('dialog')).toContainText('A real merge requires')
    await page.getByRole('button', { name: 'Confirm preview decision' }).click()
    await expect(page.getByText(/No profiles were merged/)).toBeVisible()
    await page.screenshot({
      path: testInfo.outputPath('i08-duplicate-review-desktop.png'),
      fullPage: true,
    })

    await page.goto('/settings/backups')
    await page.getByRole('button', { name: 'Create backup' }).click()
    await expect(page.getByText(/No operation started/)).toBeVisible()
    await page.getByRole('button', { name: 'Review restore' }).click()
    await expect(page.getByRole('dialog')).toContainText('stop without changing state')
    await page.getByRole('button', { name: 'Confirm preview check' }).click()
    await expect(page.getByText(/current state was not changed/)).toBeVisible()
    await page.screenshot({
      path: testInfo.outputPath('i13-backup-recovery-desktop.png'),
      fullPage: true,
    })
    expect(browserErrors).toEqual([])
  })

  test('keeps the public review queue usable on mobile', async ({ page }, testInfo) => {
    const browserErrors = observeBrowserErrors(page)
    await page.setViewportSize({ width: 390, height: 844 })
    await seedAdministratorSession(page)
    await page.goto('/transparency')
    await page.getByLabel('Search projects').fill('FutureMakers')
    await expect(page.getByText('FutureMakers NCR')).toBeVisible()
    await expect(page.getByText('Girls Lead - Metro Manila')).not.toBeVisible()
    await expectNoHorizontalPageOverflow(page)
    await page.screenshot({
      path: testInfo.outputPath('i14-public-review-mobile.png'),
      fullPage: true,
    })
    expect(browserErrors).toEqual([])
  })
})
