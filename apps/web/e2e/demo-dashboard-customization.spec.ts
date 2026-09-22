import { type Page, expect, test } from '@playwright/test'

async function resetAndSwitch(page: Page, accountId: string) {
  await page.goto('/review/demo-controls')
  await expect(page.getByRole('status')).toContainText('Review controls ready.')
  page.once('dialog', (dialog) => dialog.accept())
  await page.getByRole('button', { name: 'Reset review data' }).click()
  await page.getByLabel('Fictional account').selectOption(accountId)
}

async function chooseOption(page: Page, label: string, option: string) {
  await page.getByLabel(label).click()
  await page.getByRole('option', { name: option, exact: true }).click()
}

test('saved monitoring charts are project-specific, draggable, resizable, and removable', async ({
  page,
}) => {
  test.setTimeout(120000)
  await resetAndSwitch(page, 'monitoring-evaluation-officer')
  await page.goto('/analytics')

  const sadddWarning = page.getByTestId('saddd-data-quality-warning')
  const sadddChart = page.getByTestId('saddd-chart')
  await expect(sadddWarning).toBeVisible()
  await expect(sadddChart).toBeVisible()
  const warningBox = await sadddWarning.boundingBox()
  const sadddChartBox = await sadddChart.boundingBox()
  expect(warningBox).not.toBeNull()
  expect(sadddChartBox).not.toBeNull()
  expect(
    (sadddChartBox?.y ?? 0) - ((warningBox?.y ?? 0) + (warningBox?.height ?? 0)),
  ).toBeGreaterThanOrEqual(20)

  await expect(page.getByLabel('Project filter')).toContainText('FutureMakers NCR')
  await page.getByRole('button', { name: 'Add to Dashboard' }).click()
  await expect(page.getByText('Chart added to this project dashboard.')).toBeVisible()

  await chooseOption(page, 'Indicator filter', 'FM-ORIENTED · Beneficiaries completing orientation')
  await page.getByRole('button', { name: 'Add to Dashboard' }).click()

  await chooseOption(
    page,
    'Indicator filter',
    'FM-BOOTCAMP · Beneficiaries completing skills bootcamp',
  )
  await page.getByRole('button', { name: 'Add to Dashboard' }).click()

  await page.getByRole('link', { name: 'View project dashboard' }).click()
  await expect(page).toHaveURL(/\/dashboard\?project=futuremakers-ncr/, { timeout: 15000 })
  await expect(page.locator('#dashboard-project-scope')).toContainText('FutureMakers NCR')
  const chartSection = page.locator('section[aria-labelledby="saved-charts-title"]')
  await expect(
    chartSection.getByRole('heading', { name: 'KPI / indicator performance' }),
  ).toHaveCount(3)

  const kpiCard = chartSection.locator('article').nth(0)
  const participationCard = chartSection.locator('article').filter({ hasText: 'FM-ORIENTED' })
  const timelineCard = chartSection.locator('article').filter({ hasText: 'FM-BOOTCAMP' })
  const kpiBox = await kpiCard.boundingBox()
  const participationBox = await participationCard.boundingBox()
  const timelineBox = await timelineCard.boundingBox()
  expect(kpiBox).not.toBeNull()
  expect(participationBox).not.toBeNull()
  expect(timelineBox).not.toBeNull()
  expect(Math.abs((kpiBox?.y ?? 0) - (participationBox?.y ?? 0))).toBeLessThan(2)
  expect(timelineBox?.y ?? 0).toBeGreaterThan(kpiBox?.y ?? 0)

  const layoutButtons = kpiCard
    .getByRole('group', { name: 'Layout controls for KPI / indicator performance' })
    .getByRole('button')
  await expect(layoutButtons).toHaveCount(4)
  await expect(layoutButtons.last()).toContainText('Remove')
  const layoutButtonBoxes = await layoutButtons.evaluateAll((buttons) =>
    buttons.map((button) => {
      const box = button.getBoundingClientRect()
      return { height: box.height, width: box.width }
    }),
  )
  for (const box of layoutButtonBoxes.slice(1)) {
    expect(Math.abs(box.width - layoutButtonBoxes[0].width)).toBeLessThan(2)
    expect(Math.abs(box.height - layoutButtonBoxes[0].height)).toBeLessThan(2)
  }

  await participationCard.dragTo(kpiCard)
  await expect(chartSection.locator('article').first()).toContainText('FM-ORIENTED')
  await expect(
    participationCard.getByRole('button', { name: 'Move KPI / indicator performance later' }),
  ).toContainText('Later')

  const heightBeforeResize =
    (await participationCard.getByTestId('saved-chart-body').boundingBox())?.height ?? 0
  await chartSection.getByRole('button', { name: 'Full width' }).first().click()
  await expect(chartSection.getByRole('button', { name: 'Half width' })).toBeVisible()
  const heightAfterResize =
    (await participationCard.getByTestId('saved-chart-body').boundingBox())?.height ?? 0
  expect(Math.abs(heightAfterResize - heightBeforeResize)).toBeLessThan(2)

  await page.locator('#dashboard-project-scope').click()
  await page.getByRole('option', { name: 'Grassroots Centers - Navotas', exact: true }).click()
  await expect(chartSection.getByText('No saved charts', { exact: true })).toBeVisible()

  await page.locator('#dashboard-project-scope').click()
  await page.getByRole('option', { name: 'FutureMakers NCR', exact: true }).click()
  await expect(chartSection.getByText('FM-ORIENTED')).toBeVisible()

  await page.goto('/dashboard')
  await expect(page.locator('#dashboard-project-scope')).toContainText('FutureMakers NCR')
  await expect(chartSection.getByText('FM-ORIENTED')).toBeVisible()

  page.on('dialog', (dialog) => dialog.accept())
  await chartSection
    .getByRole('button', { name: /Remove / })
    .first()
    .click()
  await chartSection
    .getByRole('button', { name: /Remove / })
    .first()
    .click()
  await chartSection.getByRole('button', { name: /Remove / }).click()
  await expect(chartSection.getByText('No saved charts', { exact: true })).toBeVisible()
})
