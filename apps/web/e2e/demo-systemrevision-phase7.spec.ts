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
  resolve(repositoryRoot, 'docs/frontend-revision/systemrevision/evidence/phase7', name)

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

async function expectTabletSurface(page: Page, heading: string, screenshotName: string) {
  await expect(page.getByRole('heading', { name: heading }).first()).toBeVisible()
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
    .toBe(true)
  await page.screenshot({ path: evidencePath(screenshotName), fullPage: true })
}

test('Phase 7 tablet sweep keeps every revised module readable without horizontal overflow', async ({
  page,
}) => {
  test.setTimeout(180_000)
  await page.setViewportSize({ width: 1024, height: 768 })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  expect(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(
    true,
  )

  await switchAccount(page, 'project-manager')
  await page.goto('/dashboard')
  await expectTabletSurface(page, 'Project monitoring', '01-dashboard-tablet.png')

  await page.goto('/projects/futuremakers-ncr')
  await expectTabletSurface(page, 'FutureMakers NCR', '02-project-overview-tablet.png')

  await page.goto('/projects/futuremakers-ncr/activities')
  await page
    .getByRole('article', { name: 'Activity: Deliver skills bootcamp sessions' })
    .getByRole('button', { name: 'View details' })
    .click()
  await expect(page.getByRole('dialog', { name: 'Deliver skills bootcamp sessions' })).toBeVisible()
  await expect
    .poll(() =>
      page.evaluate(() => {
        const dialog = document.querySelector('[role="dialog"]')
        return dialog?.contains(document.activeElement) ?? false
      }),
    )
    .toBe(true)
  await expectTabletSurface(
    page,
    'Deliver skills bootcamp sessions',
    '03-activity-panel-tablet.png',
  )

  await page.goto('/projects/futuremakers-ncr/monitor-evaluate')
  await expectTabletSurface(page, 'Overall evaluation score', '04-evaluation-tablet.png')

  await page.goto('/projects/futuremakers-ncr/budget')
  await expectTabletSurface(page, 'Budget & Expense Ledger', '05-budget-tablet.png')

  await page.goto('/projects/futuremakers-ncr/indicators')
  await expectTabletSurface(page, 'Target Indicators', '06-target-indicators-tablet.png')

  await page.goto('/projects/futuremakers-ncr/journey-stages')
  await expectTabletSurface(page, 'Stage list', '07-journey-stages-tablet.png')

  await page.goto('/analytics')
  await expectTabletSurface(page, 'Analysis and visualization', '08-analytics-tablet.png')

  await page.goto('/reports')
  await expectTabletSurface(page, 'Reports', '09-reports-tablet.png')

  await page.goto('/beneficiaries/ben-001')
  const gate = page.getByRole('dialog', { name: 'Verify beneficiary module access' })
  await gate.getByLabel('Beneficiary access PIN').fill('2468')
  await gate.getByRole('button', { name: 'Verify and enter' }).click()
  await expectTabletSurface(page, 'Beneficiary NCR-001', '10-beneficiary-tablet.png')

  await switchAccount(page, 'monitoring-evaluation-officer')
  await page.goto('/alerts')
  await expectTabletSurface(page, 'Rule-Based Alerts', '11-alerts-tablet.png')

  await switchAccount(page, 'system-administrator')
  await page.goto('/alerts/repository')
  await expectTabletSurface(page, 'Alerts Repository', '12-alerts-repository-tablet.png')
})
