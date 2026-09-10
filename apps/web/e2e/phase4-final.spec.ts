import { readFile } from 'node:fs/promises'

import { type Download, type Page, expect, test } from '@playwright/test'

test.describe.configure({ mode: 'serial' })

async function switchAccount(page: Page, accountId: string) {
  await page.goto('/review/demo-controls')
  await expect(page.getByRole('status')).toContainText('Review controls ready.', { timeout: 20000 })
  await page.getByLabel('Fictional account').selectOption(accountId)
  await expect
    .poll(() =>
      page.evaluate(
        () => JSON.parse(localStorage.getItem('pathways.demo.v1') ?? '{}').session?.accountId,
      ),
    )
    .toBe(accountId)
}

async function resetAndSwitch(page: Page, accountId: string) {
  await page.goto('/review/demo-controls')
  await expect(page.getByRole('status')).toContainText('Review controls ready.', { timeout: 20000 })
  page.once('dialog', (dialog) => dialog.accept())
  await page.getByRole('button', { name: 'Reset review data' }).click()
  await switchAccount(page, accountId)
}

async function setScenario(page: Page, scenario: string) {
  await page.goto('/review/demo-controls')
  await expect(page.getByRole('status')).toContainText('Review controls ready.', { timeout: 20000 })
  await page.getByLabel('Exception scenario').selectOption(scenario)
  await expect
    .poll(() =>
      page.evaluate(() => JSON.parse(localStorage.getItem('pathways.demo.v1') ?? '{}').scenario),
    )
    .toBe(scenario)
}

async function chooseRadixOption(page: Page, label: string, option: string) {
  await page.getByLabel(label).click()
  await page.getByRole('option', { name: option, exact: true }).click()
}

async function readDownload(download: Download) {
  const artifactPath = await download.path()
  if (!artifactPath)
    throw new Error(`No browser download path for ${download.suggestedFilename()}.`)
  return readFile(artifactPath)
}

function expectArtifact(format: string, bytes: Buffer, expectedText: string) {
  if (format === 'csv') expect(bytes.toString('utf8')).toContain(expectedText)
  if (format === 'xlsx') expect([...bytes.subarray(0, 2)]).toEqual([80, 75])
  if (format === 'xls') expect([...bytes.subarray(0, 4)]).toEqual([208, 207, 17, 224])
  if (format === 'pdf') {
    expect(bytes.subarray(0, 8).toString('ascii')).toContain('%PDF-1.4')
    expect(bytes.toString('latin1')).toContain(expectedText)
  }
}

test('Phase 4: all UC entry points are reachable by their final-source actors', async ({
  page,
}) => {
  test.setTimeout(180000)
  await resetAndSwitch(page, 'system-administrator')
  for (const path of [
    '/settings/users',
    '/settings/audit',
    '/projects',
    '/projects/new',
    '/indicators',
    '/collection/forms',
    '/collection/import',
    '/analytics',
    '/alerts',
    '/recommendations',
    '/reports/project-summary',
    '/alerts/repository',
    '/settings/backups',
    '/transparency',
  ]) {
    await page.goto(path)
    await expect(page.getByText('Unauthorized access', { exact: true })).toHaveCount(0)
    await expect(page.locator('main')).toBeVisible()
  }

  await switchAccount(page, 'project-manager')
  for (const path of [
    '/settings/profile',
    '/projects/futuremakers-ncr',
    '/projects/futuremakers-ncr/activities',
    '/projects/futuremakers-ncr/budget',
    '/projects/futuremakers-ncr/indicators',
    '/beneficiaries',
    '/beneficiaries/ben-001',
    '/projects/futuremakers-ncr/journey-stages',
    '/dashboard',
  ]) {
    await page.goto(path)
    await expect(page.getByText('Unauthorized access', { exact: true })).toHaveCount(0)
    await expect(page.locator('main')).toBeVisible()
  }
  await page.goto('/beneficiaries/evaluation-center')
  await expect(page.getByRole('dialog', { name: 'Verify beneficiary module access' })).toBeVisible()

  await switchAccount(page, 'project-officer')
  await page.goto('/collection/entry')
  await expect(page.getByRole('heading', { name: 'Encode Project Data' })).toBeVisible()
  await page.goto('/analytics')
  await expect(page.getByText('Unauthorized access', { exact: true })).toBeVisible()

  await switchAccount(page, 'system-administrator')
  await page.goto('/review/demo-controls')
  await page.getByLabel('Fictional account').selectOption('')
  for (const path of ['/staff/login', '/staff/recover', '/public/projects']) {
    await page.goto(path)
    await expect(page.locator('main')).toBeVisible()
  }
})

test('Phase 4: connected dashboard, four analysis views, four visualizations, and failures', async ({
  page,
}, info) => {
  test.setTimeout(150000)
  await resetAndSwitch(page, 'grant-manager')
  await page.goto('/dashboard')
  await expect(page.getByRole('heading', { name: 'Project monitoring' })).toBeVisible()
  await expect(page.getByText(/browser-local revision/)).toHaveCount(0)
  await page.screenshot({
    path: info.outputPath('01-connected-dashboard-desktop.png'),
    fullPage: true,
  })

  await page.goto('/analytics')
  await expect(page.getByRole('heading', { name: 'Data Analysis' })).toBeVisible()
  await chooseRadixOption(page, 'Analysis view', 'Participation patterns')
  await chooseRadixOption(page, 'Visualization type', 'Table')
  await expect(page.getByRole('table', { name: 'Participation patterns' })).toBeVisible()
  await expect(page.getByText(/people/).first()).toBeVisible()
  await page.screenshot({ path: info.outputPath('02-analytics-table-desktop.png'), fullPage: true })

  await chooseRadixOption(page, 'Visualization type', 'Map')
  await expect(page.getByRole('heading', { name: 'Project reach by location' })).toBeVisible()
  await page.setViewportSize({ width: 390, height: 844 })
  await page.screenshot({ path: info.outputPath('03-analytics-map-mobile.png'), fullPage: true })

  await setScenario(page, 'render-failure')
  await page.goto('/analytics')
  await expect(page.getByText('Analytics rendering failed', { exact: true }).first()).toBeVisible({
    timeout: 20000,
  })
  await setScenario(page, 'retrieval-failure')
  await page.goto('/analytics')
  await expect(page.getByText('Analytics data unavailable', { exact: true }).first()).toBeVisible({
    timeout: 20000,
  })
  await setScenario(page, 'empty-data')
  await page.goto('/analytics')
  await expect(
    page.getByText('No analytics data for this filter', { exact: true }).first(),
  ).toBeVisible({
    timeout: 20000,
  })
  await setScenario(page, 'baseline')
})

test('Phase 4: form and report downloads are real files with matching local history', async ({
  page,
}, info) => {
  test.setTimeout(180000)
  await resetAndSwitch(page, 'project-officer')
  await page.goto('/collection/forms')
  await page.getByRole('button', { name: 'Add New' }).click()
  await page.getByRole('menuitem', { name: 'Create New' }).click()
  await page.getByRole('button', { name: 'Save As' }).click()
  await page.getByRole('button', { name: 'Proceed' }).click()
  await expect(page.getByText(/Form published and linked/)).toBeVisible()

  for (const format of ['csv', 'xlsx', 'xls', 'pdf']) {
    await page.getByLabel(/Download format/).selectOption(format)
    const pendingDownload = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Export form' }).click()
    const download = await pendingDownload
    expect(download.suggestedFilename().toLowerCase()).toMatch(new RegExp(`\\.${format}$`))
    expectArtifact(format, await readDownload(download), 'Journey 1')
  }

  await switchAccount(page, 'project-manager')
  await page.goto('/reports/project-summary')
  await page.getByRole('button', { name: 'Save report snapshot' }).first().click()
  await expect(page.getByTestId('generated-report-history')).toContainText(
    '1 report snapshot',
  )
  for (const format of ['csv', 'xlsx', 'xls', 'pdf']) {
    await page.getByRole('button', { name: 'Export' }).click()
    const pendingDownload = page.waitForEvent('download')
    await page.getByRole('menuitem', { name: format.toUpperCase(), exact: true }).click()
    const download = await pendingDownload
    expectArtifact(format, await readDownload(download), 'Project')
  }
  await page.screenshot({ path: info.outputPath('04-report-history-desktop.png'), fullPage: true })
})

test('Phase 4: backup/restore and publication/public projection cover distinct failures', async ({
  page,
}, info) => {
  test.setTimeout(240000)
  await resetAndSwitch(page, 'system-administrator')
  await page.goto('/settings/backups')
  const backupDownload = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Create & download backup' }).click()
  const backup = await backupDownload
  const backupBytes = await readDownload(backup)
  expect(JSON.parse(backupBytes.toString('utf8'))).toMatchObject({ version: 1 })

  for (const scenario of ['backup-storage-unavailable', 'backup-create-failure']) {
    await setScenario(page, scenario)
    await page.goto('/settings/backups')
    await page.getByRole('button', { name: 'Create & download backup' }).click()
    await expect(page.locator('output[aria-live="polite"]')).toContainText(/unavailable|failed/i)
  }

  await setScenario(page, 'baseline')
  await page.goto('/transparency')
  const originalTagline = await page.getByLabel('Public tagline').inputValue()
  await page.getByLabel('Public tagline').fill('Changed after the selected backup')
  await page.getByRole('button', { name: 'Save draft' }).click()
  await setScenario(page, 'restore-failure')
  await page.goto('/settings/backups')
  await page.getByRole('button', { name: 'Restore selected' }).click()
  await page.getByRole('button', { name: 'Confirm restore' }).click()
  await expect(page.locator('output[aria-live="polite"]')).toContainText(/retained/i)
  await setScenario(page, 'baseline')
  await page.goto('/settings/backups')
  await page.getByRole('button', { name: 'Restore selected' }).click()
  await page.getByRole('button', { name: 'Confirm restore' }).click()
  await expect(page.locator('output[aria-live="polite"]')).toContainText(/Backup restored/i)
  await page.goto('/transparency')
  await expect(page.getByLabel('Public tagline')).toHaveValue(originalTagline)

  await page.getByLabel('Approved public summary').fill('')
  await page.getByRole('button', { name: 'Save draft' }).click()
  await page.getByRole('button', { name: 'Approve revision' }).click()
  await expect(page.getByText(/Public content is incomplete/)).toBeVisible()
  await page
    .getByLabel('Approved public summary')
    .fill('A complete fictional public summary for the final frontend review.')
  await page.getByLabel('Public tagline').fill('Approved Phase 4 public projection')
  await page.getByRole('button', { name: 'Save draft' }).click()
  await page.getByRole('button', { name: 'Publish', exact: true }).click()
  await expect(page.getByText(/has not been approved/)).toBeVisible()
  await page.getByRole('button', { name: 'Approve revision' }).click()
  await page.getByRole('button', { name: 'Publish', exact: true }).click()
  await page.goto('/public/projects')
  await expect(page.getByText('Approved Phase 4 public projection')).toBeVisible()
  await page.screenshot({ path: info.outputPath('05-approved-public-desktop.png'), fullPage: true })

  await page.goto('/transparency')
  await page.getByRole('button', { name: 'Unpublish', exact: true }).click()
  await page.goto('/public/projects')
  await expect(page.getByText('Approved Phase 4 public projection')).toHaveCount(0)

  await switchAccount(page, 'project-officer')
  await page.goto('/transparency')
  await expect(page.getByText('Unauthorized access', { exact: true })).toBeVisible()

  await switchAccount(page, 'system-administrator')
  await setScenario(page, 'public-empty')
  await page.goto('/public/projects')
  await expect(page.getByText('No public projects are available yet')).toBeVisible()
  await setScenario(page, 'public-maintenance')
  await page.goto('/public/projects')
  await expect(
    page.getByRole('heading', { name: 'Public tracker temporarily unavailable' }),
  ).toBeVisible()
})
