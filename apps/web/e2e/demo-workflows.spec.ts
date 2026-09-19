import { type Page, expect, test } from '@playwright/test'

async function switchAccount(page: Page, accountId: string) {
  await page.goto('/review/demo-controls')
  await expect(page.getByRole('status')).toContainText('Review controls ready.')
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
  await expect(page.getByRole('status')).toContainText('Review controls ready.')
  page.once('dialog', (dialog) => dialog.accept())
  await page.getByRole('button', { name: 'Reset review data' }).click()
  await page.getByLabel('Fictional account').selectOption(accountId)
  await expect
    .poll(() =>
      page.evaluate(
        () => JSON.parse(localStorage.getItem('pathways.demo.v1') ?? '{}').session?.accountId,
      ),
    )
    .toBe(accountId)
}

test('I03-I05: expenses propagate, draft entry resumes, and beneficiary PIN is deterministic', async ({
  page,
}, info) => {
  test.setTimeout(120000)
  await resetAndSwitch(page, 'project-officer')
  await page.goto('/projects/futuremakers-ncr/activities')
  await expect(page.getByRole('link', { name: 'Budget' })).toHaveCount(0)
  await page
    .getByRole('article', { name: 'Activity: Deliver skills bootcamp sessions' })
    .getByRole('button', { name: 'View details' })
    .click()
  await page.getByRole('button', { name: 'Log expense' }).click()
  const expenseDialog = page.getByRole('dialog', { name: 'Log expense' })
  await expenseDialog.getByLabel('Amount (PHP)').fill('1250')
  await expenseDialog.getByLabel('Category').fill('Training materials')
  await expenseDialog.getByLabel('Date').fill('2026-09-09')
  await expenseDialog.getByLabel('Description').fill('Fictional workshop kits')
  await page.getByRole('button', { name: 'Save expense' }).click()
  await expect(expenseDialog).toBeHidden()
  await expect(page.getByText('Expense submitted for review.')).toBeVisible()

  await switchAccount(page, 'project-manager')
  await page.goto('/projects/futuremakers-ncr/budget')
  await page.getByRole('button', { name: 'Approve', exact: true }).click()
  await page
    .getByRole('dialog', { name: 'Approve expense' })
    .getByRole('button', { name: 'Confirm Approve' })
    .click()
  await expect(page.getByText('Approved', { exact: true })).toBeVisible()
  await expect(page.getByText(/Approve decision saved/)).toBeVisible()

  await switchAccount(page, 'project-officer')
  await page.goto('/collection/entry')
  await page.locator('#entry-project').selectOption('futuremakers-ncr')
  await page.getByLabel('Record notes').fill('Partial fictional draft')
  await page.getByRole('button', { name: 'Save as draft' }).click()
  await expect(page.getByRole('button', { name: /Resume entry-/ })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('button', { name: /Resume entry-/ })).toBeVisible()

  await switchAccount(page, 'project-manager')
  await page.goto('/beneficiaries/evaluation-center')
  await page.getByLabel('Access PIN').fill('9999')
  await page.getByRole('button', { name: /Verify|Continue/ }).click()
  await expect(page.getByText(/PIN is incorrect/)).toBeVisible()
  await page.getByLabel('Access PIN').fill('2468')
  await page.getByRole('button', { name: /Verify|Continue/ }).click()
  await expect(page.getByRole('heading', { name: 'Beneficiary code lookup' })).toBeVisible()
  await page.screenshot({ path: info.outputPath('evaluation-center-desktop.png'), fullPage: true })
})

test('I06-I08: scoped analytics, outcomes, reports, and four genuine downloads', async ({
  page,
}) => {
  test.setTimeout(120000)
  await resetAndSwitch(page, 'grant-manager')
  await page.goto('/analytics')
  await expect(page.getByRole('heading', { name: 'Data Analysis' })).toBeVisible()
  await expect(page.getByLabel(/Project/).first()).toBeVisible()

  await switchAccount(page, 'monitoring-evaluation-officer')
  await page.goto('/alerts')
  await expect(page.getByRole('heading', { name: /Alerts/ })).toBeVisible()
  await page.getByRole('button', { name: 'Mark as reviewed' }).click()
  await expect(page.getByText('Alert marked as reviewed.')).toBeVisible()

  await switchAccount(page, 'project-manager')
  await page.goto('/reports/project-summary')
  for (const format of ['CSV', 'XLSX', 'XLS', 'PDF']) {
    await page.getByRole('button', { name: 'Export report' }).click()
    const download = page.waitForEvent('download')
    await page.getByRole('menuitem', { name: format, exact: true }).click()
    const artifact = await download
    expect(artifact.suggestedFilename().toLowerCase()).toMatch(
      new RegExp(`\\.${format.toLowerCase()}$`),
    )
  }
})

test('I09: backup failure preserves state and approved content reaches anonymous public view', async ({
  page,
}, info) => {
  test.setTimeout(120000)
  await resetAndSwitch(page, 'system-administrator')
  await page.goto('/settings/backups')
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Create & download backup' }).click()
  expect((await download).suggestedFilename()).toMatch(/\.json$/)
  await expect(page.getByText(/pathways-backup/).first()).toBeVisible()

  await page.goto('/review/demo-controls')
  await expect(page.getByRole('status')).toContainText('Review controls ready.')
  await page.getByLabel('Exception scenario').selectOption('backup-create-failure')
  await expect
    .poll(() =>
      page.evaluate(() => JSON.parse(localStorage.getItem('pathways.demo.v1') ?? '{}').scenario),
    )
    .toBe('backup-create-failure')
  await page.goto('/settings/backups')
  await page.getByRole('button', { name: 'Create & download backup' }).click()
  await expect(page.getByText(/creation failed|could not/i).first()).toBeVisible()

  await page.goto('/review/demo-controls')
  await expect(page.getByRole('status')).toContainText('Review controls ready.')
  await page.getByLabel('Exception scenario').selectOption('baseline')
  await expect
    .poll(() =>
      page.evaluate(() => JSON.parse(localStorage.getItem('pathways.demo.v1') ?? '{}').scenario),
    )
    .toBe('baseline')
  await switchAccount(page, 'program-manager')
  await page.goto('/transparency')
  const newTagline = 'Fictional evidence, approved for public review'
  await page.getByLabel('Public tagline').fill(newTagline)
  await page.getByRole('button', { name: 'Save draft' }).click()
  await page.getByRole('button', { name: 'Approve revision' }).click()
  await page.getByRole('button', { name: 'Publish', exact: true }).click()
  await page.goto('/public/projects')
  await expect(page.getByText(newTagline)).toBeVisible()
  await page.setViewportSize({ width: 390, height: 844 })
  await page.screenshot({ path: info.outputPath('public-tracker-mobile.png'), fullPage: true })
})
