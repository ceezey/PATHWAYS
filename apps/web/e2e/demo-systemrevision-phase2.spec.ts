import { type Page, expect, test } from '@playwright/test'

const evidencePath = (name: string) =>
  `docs/frontend-revision/systemrevision/evidence/phase2/${name}`

async function resetAndSwitch(page: Page, accountId: string) {
  await page.goto('/review/demo-controls')
  await expect(page.getByRole('status')).toContainText('Review controls ready.')
  page.once('dialog', (dialog) => dialog.accept())
  await page.getByRole('button', { name: 'Reset review data' }).click()
  await page.getByLabel('Fictional account').selectOption(accountId)
}

async function switchAccount(page: Page, accountId: string) {
  await page.goto('/review/demo-controls')
  await expect(page.getByRole('status')).toContainText('Review controls ready.')
  await page.getByLabel('Fictional account').selectOption(accountId)
}

async function expectConcreteProjectOptions(page: Page, label: string) {
  await page.getByLabel(label).click()
  await expect(page.getByRole('option', { name: /All (authorized )?projects/i })).toHaveCount(0)
  await expect(page.getByRole('option').first()).toBeVisible()
  await page.keyboard.press('Escape')
}

test('role dashboards expose the approved KPIs and exact Review or Resolve destinations', async ({
  page,
}) => {
  test.setTimeout(120000)
  const roleMetrics = [
    [
      'program-manager',
      ['Active projects', 'Critical projects', 'At-risk projects', 'On-track projects'],
    ],
    [
      'project-manager',
      ['Pending approvals', 'Active budget alerts', 'Overdue activities', 'For review'],
    ],
    [
      'project-officer',
      ['Assigned activities', 'Overdue', 'Flagged proof', 'Submitted this month'],
    ],
    [
      'monitoring-evaluation-officer',
      ['Active alerts', 'Proof pending review', 'Evaluation snapshots', 'Datasets imported'],
    ],
  ] as const

  for (const [accountId, metrics] of roleMetrics) {
    await resetAndSwitch(page, accountId)
    await page.goto('/dashboard')
    for (const metric of metrics) {
      await expect(page.getByText(metric, { exact: true }).first()).toBeVisible()
    }
  }

  await resetAndSwitch(page, 'program-manager')
  await page.goto('/dashboard')
  await expectConcreteProjectOptions(page, 'Project context')
  const scrollRegions = page.locator('[data-visible-entry-limit="3"]')
  await expect(scrollRegions).toHaveCount(2)
  await expect(page.getByLabel('Portfolio health list')).toHaveAttribute('tabindex', '0')
  await expect(page.getByLabel('Escalated alerts list')).toHaveAttribute('tabindex', '0')
  await expect(page.getByLabel('Portfolio health list').locator('> div')).toHaveCount(4)
  const portfolioReview = page.getByRole('link', { name: 'Review Project Portfolio' })
  await expect(portfolioReview).toHaveAttribute('href', '/projects/futuremakers-ncr')
  await portfolioReview.click()
  await expect(page).toHaveURL(/\/projects\/futuremakers-ncr$/, { timeout: 15000 })

  await resetAndSwitch(page, 'monitoring-evaluation-officer')
  await page.goto('/dashboard')
  await page
    .getByRole('heading', { name: 'Proof submissions awaiting review' })
    .locator('xpath=ancestor::section[1]')
    .getByText('Deliver skills bootcamp sessions', { exact: true })
    .locator('xpath=ancestor::div[contains(@class,"border-b")][1]')
    .getByRole('button', { name: 'Review', exact: true })
    .first()
    .click()
  await page.getByRole('button', { name: 'Review & validate proof' }).click()
  await page.getByRole('button', { name: 'Submit review' }).click()
  await page.getByRole('button', { name: 'Close', exact: true }).first().click()
  await switchAccount(page, 'project-manager')
  await page.goto('/dashboard')
  const projectMonitoring = page
    .getByRole('heading', { name: 'Project monitoring' })
    .locator('xpath=ancestor::div[contains(@class,"rounded-lg")][1]')
  for (const metric of roleMetrics[1][1]) {
    await expect(projectMonitoring.getByText(metric, { exact: true })).toBeVisible()
    await expect(page.getByText(metric, { exact: true })).toHaveCount(1)
  }
  for (const removedMetric of [
    'Budget utilization',
    'Beneficiaries reached',
    'Average activity progress',
    'Open alerts',
  ]) {
    await expect(page.getByText(removedMetric, { exact: true })).toHaveCount(0)
  }
  await page.screenshot({
    fullPage: true,
    path: evidencePath('06-project-monitoring-role-cards.png'),
  })
  await projectMonitoring.screenshot({
    path: evidencePath('08-project-monitoring-role-cards-focus.png'),
  })
  await page.setViewportSize({ width: 390, height: 844 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  )
  await page.screenshot({
    fullPage: true,
    path: evidencePath('07-project-monitoring-role-cards-mobile.png'),
  })
  await page.setViewportSize({ width: 1280, height: 720 })
  const dashboardReview = page.getByRole('button', { name: 'Review', exact: true }).first()
  await dashboardReview.click()
  await expect(page).toHaveURL(/\/dashboard$/)
  await expect(
    page.getByRole('heading', { name: 'Deliver skills bootcamp sessions' }),
  ).toBeVisible()
  await expect(page.getByText('bootcamp-session-photos.zip', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Review decision' })).toBeVisible()
  await page.screenshot({
    path: evidencePath('09-lc02a-dashboard-review-panel.png'),
  })
  await page.getByRole('button', { name: 'Close', exact: true }).first().click()
  await expect(dashboardReview).toBeFocused()
  await page.setViewportSize({ width: 390, height: 844 })
  await dashboardReview.click()
  const mobileReviewPanel = page.getByRole('dialog')
  await expect(mobileReviewPanel).toBeVisible()
  expect((await mobileReviewPanel.boundingBox())?.width).toBeLessThanOrEqual(390)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  )
  await page.screenshot({
    path: evidencePath('10-lc02a-dashboard-review-panel-mobile.png'),
  })
  await page.getByRole('button', { name: 'Review decision' }).click()
  const decisionDialog = page.getByRole('dialog', { name: 'Review proof version 1' })
  await decisionDialog
    .getByLabel('Return reason')
    .fill('Correct the proof bundle before project approval.')
  await decisionDialog.getByRole('button', { name: 'Return for revision' }).click()
  await expect(page.getByText('Proof v1 · Returned')).toBeVisible()
  await page.getByRole('button', { name: 'Close' }).click()
  await page.setViewportSize({ width: 1280, height: 720 })

  await switchAccount(page, 'project-officer')
  await page.goto('/dashboard')
  await page.getByRole('button', { name: 'Resolve', exact: true }).click()
  await expect(page).toHaveURL(/\/activities\/act-fm-02\?proof=proof-fm-02&action=correct/)
  await expect(
    page.getByRole('heading', { name: 'Deliver skills bootcamp sessions' }),
  ).toBeVisible()
})

test('project entry lands on Overview with compact source-aligned cards and keyboard tabs', async ({
  page,
}) => {
  const runtimeErrors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') runtimeErrors.push(message.text())
  })
  page.on('pageerror', (error) => runtimeErrors.push(error.message))
  await resetAndSwitch(page, 'project-manager')
  await page.setViewportSize({ width: 1900, height: 900 })
  await page.goto('/projects')

  const futureMakersCard = page.getByTestId('project-card-futuremakers-ncr')
  await expect(futureMakersCard.getByText(/842\s*\/\s*1,200/)).toBeVisible()
  await expect(futureMakersCard.getByText('Youth Livelihoods', { exact: true })).toBeVisible()
  await expect(futureMakersCard.getByText('National Capital Region', { exact: true })).toBeVisible()
  await expect(futureMakersCard.getByText('Jan 2026 - Dec 2026', { exact: true })).toBeVisible()
  await expect(futureMakersCard.getByText('Project Manager A', { exact: true })).toBeVisible()
  await expect(futureMakersCard.getByRole('button', { name: 'Quick Preview' })).toBeVisible()
  await expect(futureMakersCard.getByRole('link', { name: 'Open Project' })).toBeVisible()
  await page.screenshot({
    fullPage: true,
    path: evidencePath('15-project-directory-reference-layout-wide.png'),
  })
  await futureMakersCard.screenshot({
    path: evidencePath('12-project-card-reference-layout.png'),
  })
  const quickPreview = futureMakersCard.getByRole('button', { name: 'Quick Preview' })
  await quickPreview.click()
  await expect(page.getByRole('dialog', { name: 'FutureMakers NCR' })).toBeVisible()
  await expect(page).toHaveURL(/\/projects$/)
  await page.getByRole('button', { name: 'Close', exact: true }).first().click()
  await resetAndSwitch(page, 'program-manager')
  await page.goto('/projects')
  const criticalProjectCard = page.getByTestId('project-card-safe-spaces-northern-samar')
  await expect(criticalProjectCard.getByText('Critical', { exact: true })).toBeVisible()
  await expect(criticalProjectCard).toHaveClass(/border-t-danger/)
  await criticalProjectCard.screenshot({
    path: evidencePath('14-project-card-reference-layout-critical.png'),
  })
  await resetAndSwitch(page, 'project-manager')
  await page.goto('/projects')
  await page.setViewportSize({ width: 390, height: 844 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  )
  await futureMakersCard.screenshot({
    path: evidencePath('13-project-card-reference-layout-mobile.png'),
  })
  await page.setViewportSize({ width: 1280, height: 720 })
  await futureMakersCard.getByRole('link', { name: 'Open Project' }).click()
  await expect(page).toHaveURL(/\/projects\/futuremakers-ncr$/)
  await expect(page.getByRole('tab', { name: 'Overview' })).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByText('Beneficiary target', { exact: true })).toHaveCount(0)
  await expect(page.getByText('Project modules', { exact: true })).toHaveCount(0)
  await expect(page.getByText('Project period', { exact: true })).toHaveCount(0)
  await expect(page.getByText('Target beneficiaries', { exact: true })).toHaveCount(0)
  await expect(page.getByText('Overall progress', { exact: true })).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'Edit project profile' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Archive project' })).toBeVisible()
  await page.screenshot({
    fullPage: true,
    path: evidencePath('02-lc02b-project-overview-tabs.png'),
  })

  const overviewTab = page.getByRole('tab', { name: 'Overview' })
  await overviewTab.focus()
  await overviewTab.press('ArrowRight')
  await expect(page.getByRole('tab', { name: 'Project Activities' })).toBeFocused()
  await page.getByRole('tab', { name: 'Project Activities' }).click()
  await expect(page).toHaveURL(/\/projects\/futuremakers-ncr\/activities$/)
  await page.getByRole('link', { name: 'Back to Projects' }).click()
  await expect(page).toHaveURL(/\/projects$/)
  expect(runtimeErrors).toEqual([])
})

test('System Administrator edits each permitted heading in place and the legacy module is retired', async ({
  page,
}) => {
  await resetAndSwitch(page, 'system-administrator')
  await page.evaluate(() => localStorage.removeItem('pathways.prototypeLabels'))
  await page.goto('/projects')

  await expect(page.getByRole('link', { name: 'Edit Labels' })).toHaveCount(0)
  await page.getByRole('button', { name: /Edit .* page heading/ }).click()
  const dialog = page.getByRole('dialog', { name: 'Edit page heading' })
  const field = dialog.getByLabel('Page heading')
  await field.fill('')
  await dialog.getByRole('button', { name: 'Save' }).click()
  await expect(dialog.getByRole('alert')).toContainText('Enter a page heading')
  await field.fill('Projects overview')
  await dialog.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Projects overview' })).toBeVisible()
  await expect
    .poll(() =>
      page.evaluate(
        () => JSON.parse(localStorage.getItem('pathways.prototypeLabels') ?? '{}').moduleProjects,
      ),
    )
    .toBe('Projects overview')
  await page.screenshot({ fullPage: true, path: evidencePath('03-lc02c-header-edit-saved.png') })

  await page.getByRole('button', { name: /Edit .* page heading/ }).click()
  await dialog.getByLabel('Page heading').fill('Discarded heading')
  await dialog.getByRole('button', { name: 'Cancel' }).click()
  await expect(dialog).toBeHidden()
  await expect(page.getByRole('heading', { level: 1, name: 'Projects overview' })).toBeVisible()

  await page.goto('/settings/labels')
  await expect(page).toHaveURL(/\/dashboard$/)
})

test('shared project selectors stay concrete and Analytics keeps the rearranged analysis controls', async ({
  page,
}) => {
  test.setTimeout(120000)

  for (const [accountId, route, label] of [
    ['project-manager', '/beneficiaries', 'Project'],
    ['monitoring-evaluation-officer', '/analytics', 'Project filter'],
    ['monitoring-evaluation-officer', '/alerts', 'Filter alerts by project'],
    ['program-manager', '/reports/project-summary', 'Project'],
  ] as const) {
    await resetAndSwitch(page, accountId)
    await page.goto(route)
    if (route === '/beneficiaries') {
      await page.getByLabel('Beneficiary access PIN').fill('2468')
      await page.getByRole('button', { name: 'Verify and enter' }).click()
    }
    await expectConcreteProjectOptions(page, label)
  }

  await resetAndSwitch(page, 'monitoring-evaluation-officer')
  await page.goto('/analytics')
  await expect(page.getByText('Indicators (Actual vs Target)', { exact: true })).toHaveCount(0)
  const analyticsControls = page
    .getByRole('heading', { name: 'Analysis and visualization' })
    .locator('xpath=ancestor::section[1]')
  for (const label of [
    'Project filter',
    'Reporting period',
    'Analysis view',
    'Visualization type',
    'Indicator filter',
  ]) {
    await expect(analyticsControls.getByLabel(label)).toBeVisible()
  }
  await expect(analyticsControls.getByText(/^Project:/)).toHaveCount(0)
  const analysisViewBox = await analyticsControls
    .getByText('Analysis view', { exact: true })
    .boundingBox()
  const visualizationTypeBox = await analyticsControls
    .getByLabel('Visualization type')
    .boundingBox()
  const reviewNoticeBox = await analyticsControls
    .getByText('Recommendations are generated from predefined rules and require human review.')
    .boundingBox()
  expect(analysisViewBox).not.toBeNull()
  expect(visualizationTypeBox).not.toBeNull()
  expect(reviewNoticeBox).not.toBeNull()
  expect(visualizationTypeBox?.y).toBeGreaterThan(analysisViewBox?.y ?? 0)
  expect(Math.abs((reviewNoticeBox?.y ?? 0) - (analysisViewBox?.y ?? 0))).toBeLessThan(12)

  const generatedAnalysis = page.getByRole('heading', {
    name: 'KPI / indicator performance · Bar chart',
  })
  const firstMetric = page.getByText('KPI achievement', { exact: true })
  await expect(generatedAnalysis).toBeVisible()
  await expect(firstMetric).toBeVisible()
  const generatedAnalysisBox = await generatedAnalysis.boundingBox()
  const firstMetricBox = await firstMetric.boundingBox()
  expect(generatedAnalysisBox).not.toBeNull()
  expect(firstMetricBox).not.toBeNull()
  expect(generatedAnalysisBox?.y).toBeLessThan(firstMetricBox?.y ?? 0)
  await page.screenshot({
    fullPage: true,
    path: evidencePath('15-ref20-analytics-output-order.png'),
  })

  await page.getByLabel('Analysis view').click()
  await page.getByRole('option', { name: 'Participation patterns' }).click()
  await page.getByLabel('Visualization type').click()
  await page.getByRole('option', { name: 'Line chart' }).click()
  await expect(
    page.getByRole('heading', { name: 'Participation patterns · Line chart' }),
  ).toBeVisible()
  await page.screenshot({
    fullPage: true,
    path: evidencePath('12-ref20-rearranged-analytics-controls.png'),
  })
  await analyticsControls.screenshot({
    path: evidencePath('14-ref20-rearranged-analytics-controls-focus.png'),
  })

  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/analytics')
  await expect(page.getByRole('heading', { name: 'Analysis and visualization' })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  )
  await page.screenshot({
    fullPage: true,
    path: evidencePath('13-ref20-rearranged-analytics-controls-mobile.png'),
  })

  await page.goto('/projects/futuremakers-ncr')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  )
  await page.screenshot({ fullPage: true, path: evidencePath('05-project-overview-mobile.png') })
})
