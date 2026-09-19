import { resolve } from 'node:path'

import { type Page, expect, test } from '@playwright/test'

const browserErrors = new WeakMap<Page, string[]>()

test.beforeEach(async ({ page }) => {
  const errors: string[] = []
  browserErrors.set(page, errors)
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`))
  page.on('console', (message) => {
    if (message.type() === 'error' && !message.text().includes('Failed to load resource')) {
      errors.push(`console: ${message.text()}`)
    }
  })
})

test.afterEach(async ({ page }) => {
  expect(browserErrors.get(page) ?? []).toEqual([])
})

const repositoryRoot = process.cwd().replaceAll('\\', '/').endsWith('/apps/web')
  ? resolve(process.cwd(), '../..')
  : process.cwd()
const evidencePath = (name: string) =>
  resolve(repositoryRoot, 'docs/frontend-revision/systemrevision/evidence/phase6', name)

async function switchAccount(page: Page, accountId: string) {
  await page.goto('/review/demo-controls')
  await expect(page.getByRole('status')).toContainText('Review controls ready.', {
    timeout: 20_000,
  })
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
  await expect(page.getByRole('status')).toContainText('Review controls ready.', {
    timeout: 20_000,
  })
  page.once('dialog', (dialog) => dialog.accept())
  await page.getByRole('button', { name: 'Reset review data' }).click()
  await switchAccount(page, accountId)
}

async function selectReportType(page: Page, name: string) {
  await page.getByRole('combobox', { name: 'Report type' }).click()
  await page.getByRole('option', { name }).click()
}

test.describe.configure({ mode: 'serial' })

test('Ref20 preserves the corrected Analytics controls while removing exact legacy targets', async ({
  page,
}) => {
  await resetAndSwitch(page, 'project-manager')
  await page.goto('/analytics')
  await expect(page.getByRole('heading', { name: 'Analysis and visualization' })).toBeVisible()
  for (const name of [
    'Project filter',
    'Reporting period',
    'Analysis view',
    'Visualization type',
    'Indicator filter',
  ]) {
    await expect(page.getByRole('combobox', { name })).toBeVisible()
  }
  await page.getByRole('combobox', { name: 'Project filter' }).click()
  await expect(page.getByRole('option', { name: 'All projects' })).toHaveCount(0)
  await page.keyboard.press('Escape')
  await expect(page.getByRole('link', { name: 'Recommendations' })).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'Rule-Based Alerts' })).toHaveCount(0)
  await expect(page.getByText('Indicators (Actual vs Target)')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Add to Dashboard' })).toBeVisible()
  await page.screenshot({ path: evidencePath('00-ref20-analytics-desktop.png'), fullPage: true })

  await expect(page.getByRole('link', { name: 'Recommendations' })).toHaveCount(0)
  await page.goto('/recommendations?recommendation=rec-fm-low-kpi')
  await expect(page).toHaveURL(/\/alerts$/)
  await expect(page.getByRole('heading', { name: 'Rule-Based Alerts' })).toBeVisible()

  await switchAccount(page, 'program-manager')
  await page.goto('/projects/safe-spaces-northern-samar/budget')
  await expect(
    page.getByRole('heading', { name: 'Budget risks, alerts & recommendations' }),
  ).toBeVisible()
  await expect(page.getByText(/Compare spending against approved activity plans/i)).toBeVisible()
})

test('LC-06A marks one alert reviewed without resolving it and hides only resolved conditions', async ({
  page,
}) => {
  await resetAndSwitch(page, 'monitoring-evaluation-officer')
  await page.goto('/alerts')
  const alertTitle = 'Low KPI achievement'
  const alertRow = page.getByRole('button').filter({ hasText: alertTitle })
  await expect(alertRow).toBeVisible()
  await expect(page.getByRole('button', { name: 'Review action' })).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'View recommended action' })).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'Human-reviewed recommendation' })).toHaveCount(0)

  await page.getByRole('button', { name: 'Mark as reviewed' }).click()
  await expect(page.getByText('Alert marked as reviewed.')).toBeVisible()
  await expect(alertRow).toContainText('Reviewed')
  await expect(page.getByRole('button', { name: 'Mark as reviewed' })).toHaveCount(0)
  await expect(alertRow).toBeVisible()
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
    document.documentElement.scrollTop = 0
    document.body.scrollTop = 0
  })
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0)
  await page.screenshot({ path: evidencePath('01-ref21-alert-reviewed.png') })

  await page.reload()
  await expect(alertRow).toContainText('Reviewed')
  await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem('pathways.demo.v1') ?? '{}')
    const alert = state.alerts.find((row: { id: string }) => row.id === 'alert-fm-low-kpi')
    alert.lifecycleStatus = 'Auto-resolved'
    localStorage.setItem('pathways.demo.v1', JSON.stringify(state))
  })
  await page.reload()
  await expect(page.getByRole('button').filter({ hasText: alertTitle })).toHaveCount(0)

  await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem('pathways.demo.v1') ?? '{}')
    const alert = state.alerts.find((row: { id: string }) => row.id === 'alert-fm-low-kpi')
    alert.lifecycleStatus = 'New'
    const rule = state.rules.find((row: { id: string }) => row.id === alert.ruleId)
    rule.triggeredCount += 1
    localStorage.setItem('pathways.demo.v1', JSON.stringify(state))
  })
  await page.reload()
  await expect(page.getByRole('button').filter({ hasText: alertTitle })).toContainText('New')
  await expect(page.getByRole('button', { name: 'Mark as reviewed' })).toBeVisible()
})

test('LC-06B uses the report-type dropdown and compact accessible output actions', async ({
  page,
}) => {
  await resetAndSwitch(page, 'project-manager')
  await page.goto('/reports')
  await expect(page.getByTestId('generated-report-history')).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'Open report preview' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Save report snapshot' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Filter', exact: true })).toHaveCount(0)

  const project = page.getByRole('combobox', { name: 'Project' })
  await expect(project).toContainText('FutureMakers NCR')
  await selectReportType(page, 'Indicator Summary')
  await expect(page.getByRole('heading', { name: 'Indicator Summary' })).toBeVisible()
  await expect(project).toContainText('FutureMakers NCR')
  await page.getByRole('button', { name: 'Generate' }).click()
  await expect(page.getByText('Beneficiaries completing orientation')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Choose report columns' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Preview report' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Export report' })).toBeVisible()
  await page.screenshot({ path: evidencePath('02-ref23-reports-desktop.png'), fullPage: true })

  await page.getByRole('button', { name: 'Preview report' }).click()
  const preview = page.getByRole('dialog', { name: 'Report Preview' })
  await expect(preview).toBeVisible()
  await expect(preview.getByText('Beneficiaries completing orientation')).toBeVisible()
  await preview.getByRole('button', { name: 'Close' }).first().click()

  await page.getByRole('button', { name: 'Export report' }).click()
  for (const format of ['CSV', 'XLSX', 'XLS', 'PDF']) {
    await expect(page.getByRole('menuitem', { name: format, exact: true })).toBeVisible()
  }
  await page.keyboard.press('Escape')

  await selectReportType(page, 'Project Summary')
  await expect(page.getByRole('heading', { name: 'Project Summary' })).toBeVisible()
  await selectReportType(page, 'Beneficiary Summary')
  await expect(page.getByRole('heading', { name: 'Beneficiary Summary' })).toBeVisible()
  await expect(page.getByText('Beneficiary report records loaded.')).toBeVisible()
  await selectReportType(page, 'Survey/Form Results')
  await expect(page.getByRole('heading', { name: 'Survey/Form Results' })).toBeVisible()
  await expect(page.getByRole('combobox', { name: 'Survey results form filter' })).toBeVisible()

  await page.setViewportSize({ width: 390, height: 844 })
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
    .toBe(true)
})

test('LC-06C keeps the rule list and selected detail adjacent on desktop and stacked on mobile', async ({
  page,
}) => {
  await resetAndSwitch(page, 'system-administrator')
  await page.goto('/alerts/repository')
  const ruleList = page.getByRole('heading', { name: /rules configured/ }).locator('..')
  const detail = page.locator('#selected-rule-detail')
  await expect(detail).toBeVisible()
  const desktopListBox = await ruleList.boundingBox()
  const desktopDetailBox = await detail.boundingBox()
  expect(desktopListBox).not.toBeNull()
  expect(desktopDetailBox).not.toBeNull()
  expect(desktopDetailBox?.x ?? 0).toBeGreaterThan((desktopListBox?.x ?? 0) + 100)
  expect(Math.abs((desktopDetailBox?.y ?? 0) - (desktopListBox?.y ?? 0))).toBeLessThan(30)

  const delayedRule = page.getByRole('button').filter({ hasText: 'Delayed activity' })
  await delayedRule.focus()
  await page.keyboard.press('Enter')
  await expect(detail).toContainText('Delayed activity')
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
    window.scrollTo(0, 0)
  })
  await page.screenshot({ path: evidencePath('03-ref24-repository-desktop.png'), fullPage: true })

  await page.setViewportSize({ width: 390, height: 844 })
  const mobileListBox = await ruleList.boundingBox()
  const mobileDetailBox = await detail.boundingBox()
  expect((mobileDetailBox?.y ?? 0) > (mobileListBox?.y ?? 0)).toBe(true)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  )
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
    window.scrollTo(0, 0)
  })
  await page.screenshot({ path: evidencePath('04-ref24-repository-mobile.png'), fullPage: true })
})
