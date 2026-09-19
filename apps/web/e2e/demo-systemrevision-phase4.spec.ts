import { resolve } from 'node:path'

import { type Locator, type Page, expect, test } from '@playwright/test'

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
  resolve(repositoryRoot, 'docs/frontend-revision/systemrevision/evidence/phase4', name)

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

async function submitExpense(page: Page, category: string, amount: string) {
  await page.getByRole('button', { name: 'Log expense' }).click()
  const dialog = page.getByRole('dialog', { name: 'Log expense' })
  await dialog.getByLabel('Amount (PHP)').fill(amount)
  await dialog.getByLabel('Category').fill(category)
  await dialog.getByLabel('Date').fill('2026-09-13')
  await dialog.getByLabel('Description').fill(`${category} Phase 4 fixture`)
  await dialog.getByRole('button', { name: 'Save expense' }).click()
  await expect(dialog).toBeHidden()
}

const expenseCard = (page: Page, category: string) =>
  page.getByRole('article').filter({ hasText: category })

async function decide(
  card: Locator,
  decision: 'Approve' | 'Reject' | 'Partial' | 'Escalate',
  options: { amount?: string; reason?: string } = {},
) {
  await card.getByRole('button', { name: decision, exact: true }).click()
  const dialog = card.page().getByRole('dialog', { name: `${decision} expense` })
  if (options.amount) await dialog.getByLabel('Approved amount').fill(options.amount)
  if (options.reason) await dialog.getByLabel('Reason').fill(options.reason)
  await dialog.getByRole('button', { name: `Confirm ${decision}` }).click()
  await expect(dialog).toBeHidden()
}

test.describe.configure({ mode: 'serial' })

test('Phase 4 roles expose Budget and Target Indicators only to approved actors', async ({
  page,
}) => {
  await resetAndSwitch(page, 'project-manager')
  await page.goto('/projects/futuremakers-ncr')
  await expect(page.getByRole('tab', { name: 'Budget' })).toBeVisible()
  await expect(page.getByRole('tab', { name: 'Target Indicators' })).toHaveCount(0)

  for (const accountId of ['program-manager', 'grant-manager', 'system-administrator']) {
    await switchAccount(page, accountId)
    await page.goto('/projects/futuremakers-ncr/budget')
    await expect(page.getByRole('heading', { name: 'Budget & Expense Ledger' })).toBeVisible()
  }

  for (const accountId of ['project-officer', 'monitoring-evaluation-officer']) {
    await switchAccount(page, accountId)
    await page.goto('/projects/futuremakers-ncr/budget')
    await expect(page.getByText('Unauthorized access', { exact: true })).toBeVisible()
  }

  await switchAccount(page, 'monitoring-evaluation-officer')
  await page.goto('/projects/futuremakers-ncr')
  const indicatorsTab = page.getByRole('tab', { name: 'Target Indicators' })
  await expect(indicatorsTab).toBeVisible()
  const tabLabels = await page
    .getByRole('navigation', { name: 'Project navigation' })
    .getByRole('tab')
    .allTextContents()
  expect(tabLabels.indexOf('Activities')).toBeLessThan(tabLabels.indexOf('Target Indicators'))
  await page.goto('/indicators')
  await expect(page).toHaveURL(/\/projects$/)
  await expect(page.getByRole('heading', { name: 'Project Information Management' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Indicator Library' })).toHaveCount(0)
})

test('Ref13 presents the stored overall score, four dimensions, and dated history', async ({
  page,
}) => {
  await resetAndSwitch(page, 'monitoring-evaluation-officer')
  await page.goto('/projects/futuremakers-ncr/monitor-evaluate')
  await expect(page.getByRole('heading', { name: 'OECD-informed evaluation' })).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Overall evaluation score' })).toBeVisible()
  await expect(page.getByText('82', { exact: true })).toBeVisible()
  for (const label of ['Effectiveness', 'Efficiency', 'Reach', 'Journey progress']) {
    await expect(page.getByRole('progressbar', { name: label })).toBeVisible()
  }
  await expect(page.getByRole('heading', { name: 'Evaluation update history' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Evaluation weights' })).toHaveCount(0)
  await page.getByRole('button', { name: 'View Basis' }).click()
  await expect(page.getByRole('dialog', { name: 'OECD (2021) basis' })).toBeVisible()
  await expect(
    page.getByText(/Effectiveness and Efficiency use the corresponding OECD/),
  ).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByText('Jun 30, 2026', { exact: true })).toBeVisible()
  await page.screenshot({ path: evidencePath('00-ref13-evaluation-desktop.png'), fullPage: true })

  await page.setViewportSize({ width: 390, height: 844 })
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
    .toBe(true)
  await page.screenshot({ path: evidencePath('01-ref13-evaluation-mobile.png'), fullPage: true })

  await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem('pathways.demo.v1') ?? '{}')
    state.budgets = []
    localStorage.setItem('pathways.demo.v1', JSON.stringify(state))
  })
  await page.reload()
  await expect(page.getByText('Unavailable', { exact: true })).toBeVisible()
})

test.skip('Superseded D05 PM expense decisions (replaced by explicit M&E validation contract)', async ({
  page,
}) => {
  test.setTimeout(180_000)
  await resetAndSwitch(page, 'project-officer')
  await page.goto('/projects/futuremakers-ncr/activities')
  await page
    .getByRole('article', { name: 'Activity: Deliver skills bootcamp sessions' })
    .getByRole('button', { name: 'View details' })
    .click()
  for (const [category, amount] of [
    ['Approve fixture', '1000'],
    ['Reject fixture', '900'],
    ['Partial fixture', '1200'],
    ['Escalate fixture', '800'],
  ]) {
    await submitExpense(page, category, amount)
  }

  await switchAccount(page, 'grant-manager')
  await page.goto('/projects/futuremakers-ncr/budget')
  await expect(page.getByText('Pending Review', { exact: true })).toHaveCount(4)
  await expect(page.getByRole('button', { name: 'Approve', exact: true })).toHaveCount(0)

  await switchAccount(page, 'system-administrator')
  await page.goto('/projects/futuremakers-ncr/budget')
  await expect(page.getByRole('button', { name: 'Approve', exact: true })).toHaveCount(0)

  await switchAccount(page, 'project-manager')
  await page.goto('/projects/futuremakers-ncr/budget')
  await page.screenshot({
    path: evidencePath('02-ref14-budget-review-desktop.png'),
    fullPage: true,
  })
  await page.setViewportSize({ width: 390, height: 844 })
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
    .toBe(true)
  await page.screenshot({
    path: evidencePath('02a-ref14-budget-review-mobile.png'),
    fullPage: true,
  })
  await page.setViewportSize({ width: 1280, height: 720 })
  const before = await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem('pathways.demo.v1') ?? '{}')
    return state.budgets.find(
      (record: { projectId: string }) => record.projectId === 'futuremakers-ncr',
    ).actualSpending
  })

  await decide(expenseCard(page, 'Approve fixture'), 'Approve')
  await decide(expenseCard(page, 'Reject fixture'), 'Reject', { reason: 'Outside approved scope.' })
  await expenseCard(page, 'Partial fixture').getByRole('button', { name: 'Partial' }).click()
  const partialDialog = page.getByRole('dialog', { name: 'Partial expense' })
  await partialDialog.getByLabel('Approved amount').fill('700')
  await partialDialog.getByLabel('Reason').fill('Only the allowable portion is approved.')
  await page.screenshot({ path: evidencePath('03-lc04a-partial-dialog.png') })
  await partialDialog.getByRole('button', { name: 'Confirm Partial' }).click()
  await decide(expenseCard(page, 'Escalate fixture'), 'Escalate', {
    reason: 'Program-level decision required.',
  })

  await expect(expenseCard(page, 'Partial fixture')).toContainText('Approved ₱700.00')
  await expect(expenseCard(page, 'Partial fixture')).toContainText('Rejected balance ₱500.00')
  await expect
    .poll(() =>
      page.evaluate(() => {
        const state = JSON.parse(localStorage.getItem('pathways.demo.v1') ?? '{}')
        return state.budgets.find(
          (record: { projectId: string }) => record.projectId === 'futuremakers-ncr',
        ).actualSpending
      }),
    )
    .toBe(before + 1700)

  await switchAccount(page, 'program-manager')
  await page.goto('/projects/futuremakers-ncr/budget')
  await expect(expenseCard(page, 'Escalate fixture')).toContainText('Escalated')
  await page.screenshot({ path: evidencePath('04-lc04a-program-escalation.png'), fullPage: true })
  await decide(expenseCard(page, 'Escalate fixture'), 'Approve')
  await expect(expenseCard(page, 'Escalate fixture')).toContainText('Approved')

  await switchAccount(page, 'grant-manager')
  await page.goto('/projects/safe-spaces-northern-samar/budget')
  await expect(page.getByText('Budget utilization requires human review')).toBeVisible()
  await expect(
    page.getByText(
      'Compare spending against approved activity plans before authorizing additional releases.',
    ),
  ).toBeVisible()
  await page.screenshot({
    path: evidencePath('02b-ref14-budget-alert-recommendation.png'),
    fullPage: true,
  })
})

test('LC-04A validates expenses through M&E and keeps budget outcomes and previews contextual', async ({
  page,
}) => {
  test.setTimeout(180_000)
  await resetAndSwitch(page, 'project-officer')
  await page.goto('/projects/futuremakers-ncr/activities')
  await page
    .getByRole('article', { name: 'Activity: Deliver skills bootcamp sessions' })
    .getByRole('button', { name: 'View details' })
    .click()
  await submitExpense(page, 'Training materials', '1000')
  await expect
    .poll(() =>
      page.evaluate(
        () => JSON.parse(localStorage.getItem('pathways.demo.v1') ?? '{}').expenses?.at(-1)?.status,
      ),
    )
    .toBe('For Verification')

  const before = await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem('pathways.demo.v1') ?? '{}')
    return state.budgets.find(
      (record: { projectId: string }) => record.projectId === 'futuremakers-ncr',
    ).actualSpending
  })

  await switchAccount(page, 'monitoring-evaluation-officer')
  await page.goto('/dashboard')
  const expenseItem = page
    .getByText('Training materials expense', { exact: true })
    .locator('xpath=ancestor::div[contains(@class,"border-b")][1]')
  await expenseItem.getByRole('button', { name: 'Review' }).click()
  const reviewDialog = page.getByRole('dialog', { name: 'Review submitted expense' })
  await expect(reviewDialog).toContainText('Training materials')
  await reviewDialog.getByRole('button', { name: 'Validate expense' }).click()
  await expect(reviewDialog).toBeHidden()
  await expect
    .poll(() =>
      page.evaluate(() => {
        const state = JSON.parse(localStorage.getItem('pathways.demo.v1') ?? '{}')
        return state.budgets.find(
          (record: { projectId: string }) => record.projectId === 'futuremakers-ncr',
        ).actualSpending
      }),
    )
    .toBe(before + 1000)

  await switchAccount(page, 'project-manager')
  await page.goto('/projects/futuremakers-ncr/budget')
  await expect(page.getByText('Delivery spending is nearing the approved ceiling')).toBeVisible()
  await expect(page.getByText('Single activity accounts for most recorded spending')).toBeVisible()
  await page.getByRole('button', { name: 'Log Outcome Decision' }).first().click()
  const outcomeDialog = page.getByRole('dialog', { name: 'Log Outcome Decision' })
  await outcomeDialog.getByLabel('Outcome').click()
  await page.getByRole('option', { name: 'Partially Accept' }).click()
  await outcomeDialog.getByLabel('Decision note').fill('Reserve the remaining balance.')
  await outcomeDialog.getByRole('button', { name: 'Submit decision' }).click()
  await expect(page.getByText('Partially Accept', { exact: true })).toBeVisible()

  await page.getByRole('tab', { name: 'Expense ledger' }).click()
  const ledgerCard = page.getByRole('button', { name: /Training materials/ })
  await expect(ledgerCard).toContainText('Verified')
  await ledgerCard.click()
  await expect(page.getByRole('dialog', { name: 'Expense record preview' })).toContainText(
    'Deliver skills bootcamp sessions',
  )
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
  await page.screenshot({
    path: evidencePath('09-post-handoff-budget-workflow.png'),
  })
})

test('LC-04B uses one Add/Edit modal for atomic authorized project-local copies', async ({
  page,
}) => {
  await resetAndSwitch(page, 'monitoring-evaluation-officer')
  await page.goto('/projects/futuremakers-ncr/indicators')
  await expect(page.getByRole('heading', { name: 'Target Indicators' })).toBeVisible()
  await expect(page.getByText('Reuse an existing indicator')).toHaveCount(0)
  await expect(page.getByLabel('Project', { exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: 'Add indicator' }).click()
  const dialog = page.getByRole('dialog', { name: 'Add indicator' })
  await dialog.getByRole('button', { name: /Projects/ }).click()
  await expect(page.getByRole('menuitemcheckbox', { name: /FutureMakers NCR/ })).toBeChecked()
  await page.getByRole('menuitemcheckbox', { name: /Grassroots Centers - Navotas/ }).click()
  await page.keyboard.press('Escape')
  await dialog.getByLabel('Name').fill('Phase 4 completion quality')
  await dialog.getByLabel('Description').fill('Fictional project-local completion quality measure')
  await dialog.getByLabel('Unit of measure').fill('Percent')
  await dialog.getByRole('button', { name: /Disaggregation requirements/ }).click()
  await page.getByRole('menuitemcheckbox', { name: 'Age' }).click()
  await page.getByRole('menuitemcheckbox', { name: 'Disability' }).click()
  await page.keyboard.press('Escape')
  await dialog.getByLabel('Data source').fill('Demo completion records')
  await dialog.getByLabel('Target').fill('85')
  await page.screenshot({ path: evidencePath('05-lc04b-indicator-modal.png') })
  await dialog.getByRole('button', { name: 'Save indicator' }).click()
  await expect(dialog).toBeHidden()
  await expect(page.getByText('2 project-local indicator copies saved.')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Phase 4 completion quality' })).toBeVisible()

  await page.getByRole('button', { name: 'Edit Phase 4 completion quality' }).click()
  const editDialog = page.getByRole('dialog', { name: 'Edit indicator' })
  await editDialog.getByRole('button', { name: /Projects/ }).click()
  await page.getByRole('menuitemcheckbox', { name: /Grassroots Centers - Navotas/ }).click()
  await page.keyboard.press('Escape')
  await editDialog.getByLabel('Name').fill('Phase 4 revised completion quality')
  await editDialog.getByRole('button', { name: 'Save indicator' }).click()
  await expect(editDialog).toBeHidden()
  await expect(page.getByText('2 project-local indicator copies saved.')).toBeVisible()
  await expect(
    page.getByRole('heading', { name: 'Phase 4 revised completion quality' }),
  ).toBeVisible()

  await page.getByRole('button', { name: 'Edit Phase 4 revised completion quality' }).click()
  const cancelDialog = page.getByRole('dialog', { name: 'Edit indicator' })
  await cancelDialog.getByLabel('Name').fill('Canceled indicator edit')
  await cancelDialog.getByRole('button', { name: 'Cancel' }).click()
  await expect(cancelDialog).toBeHidden()
  await expect(page.getByRole('heading', { name: 'Canceled indicator edit' })).toHaveCount(0)
  await expect(
    page.getByRole('heading', { name: 'Phase 4 revised completion quality' }),
  ).toBeVisible()

  await page.goto('/projects/grassroots-centers-navotas/indicators')
  await expect(
    page.getByRole('heading', { name: 'Phase 4 revised completion quality' }),
  ).toBeVisible()
  await page.screenshot({ path: evidencePath('06-ref16-target-indicators.png'), fullPage: true })
  await page.setViewportSize({ width: 390, height: 844 })
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
    .toBe(true)
  await page.screenshot({
    path: evidencePath('06a-ref16-target-indicators-mobile.png'),
    fullPage: true,
  })
})

test('LC-04C consolidates Journey Stages and retains the four safeguarded actions', async ({
  page,
}) => {
  await resetAndSwitch(page, 'project-manager')
  await page.goto('/projects/futuremakers-ncr/journey-stages')
  const workspace = page.getByRole('region', { name: 'Journey stage configuration' })
  await expect(workspace).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Stage diagram' })).toHaveCount(0)
  await expect(page.getByText('Project-specific stages')).toHaveCount(0)
  await workspace.getByRole('button', { name: 'Add stage' }).click()
  const stageName = workspace.getByText('Stage name').locator('..').getByRole('textbox')
  await stageName.fill('')
  await workspace.getByRole('button', { name: 'Save configuration' }).click()
  let dialog = page.getByRole('dialog', { name: 'Save journey-stage configuration' })
  await dialog.getByRole('button', { name: 'Confirm save' }).click()
  await expect(
    page.getByText('Each journey stage needs a code, name, and positive order.'),
  ).toBeVisible()
  await expect(dialog).toBeVisible()
  await dialog.getByRole('button', { name: 'Cancel' }).click()
  await stageName.fill('Phase 4 follow-up')
  await workspace.getByRole('button', { name: 'Save configuration' }).click()
  dialog = page.getByRole('dialog', { name: 'Save journey-stage configuration' })
  await dialog.getByRole('button', { name: 'Confirm save' }).click()
  await expect(page.getByText('Journey-stage configuration saved.')).toBeVisible()
  await page.screenshot({ path: evidencePath('07-ref15-journey-consolidated.png'), fullPage: true })

  await page.setViewportSize({ width: 390, height: 844 })
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
    .toBe(true)
  await page.screenshot({ path: evidencePath('08-ref15-journey-mobile.png'), fullPage: true })
})
