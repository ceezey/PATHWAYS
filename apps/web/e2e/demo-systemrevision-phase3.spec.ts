import { resolve } from 'node:path'

import { type Page, expect, test } from '@playwright/test'

const repositoryRoot = process.cwd().replaceAll('\\', '/').endsWith('/apps/web')
  ? resolve(process.cwd(), '../..')
  : process.cwd()
const evidencePath = (name: string) =>
  resolve(repositoryRoot, 'docs/frontend-revision/systemrevision/evidence/phase3', name)

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
}

const activityCard = (page: Page, title = 'Deliver skills bootcamp sessions') =>
  page.getByRole('article', { name: `Activity: ${title}` })

async function openActivityPanel(page: Page, title = 'Deliver skills bootcamp sessions') {
  await activityCard(page, title).getByRole('button', { name: 'View details' }).click()
  const panel = page.getByRole('dialog', { name: title })
  await expect(panel).toBeVisible()
  return panel
}

async function openDashboardProof(page: Page, sectionName: string) {
  const section = page
    .getByRole('heading', { name: sectionName })
    .locator('xpath=ancestor::section[1]')
  const proofItem = section
    .getByText('Deliver skills bootcamp sessions', { exact: true })
    .locator('xpath=ancestor::div[contains(@class,"border-b")][1]')
  await proofItem.getByRole('button', { name: 'Review', exact: true }).click()
  const panel = page.getByRole('dialog', { name: 'Deliver skills bootcamp sessions' })
  await expect(panel).toBeVisible()
  return panel
}

test('Ref09-Ref11 activity presentation is consolidated, derived, responsive, and role-safe', async ({
  page,
}) => {
  test.setTimeout(120000)
  await page.setViewportSize({ width: 1280, height: 720 })
  await resetAndSwitch(page, 'project-manager')
  await page.goto('/projects/futuremakers-ncr/activities')

  await expect(page.getByRole('button', { name: 'List view' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await expect(page.getByRole('heading', { name: 'Activity list' })).toBeVisible()
  await expect(page.getByRole('combobox', { name: 'Activity List' })).toHaveCount(0)
  await expect(page.getByText('Activity status at a glance', { exact: true })).toHaveCount(0)
  await expect(page.getByText('Milestones', { exact: true })).toHaveCount(0)
  await expect(page.getByText('Activity progress approval', { exact: true })).toHaveCount(0)
  await expect(page.getByRole('combobox', { name: /Change status for/ })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'New Activity' })).toBeVisible()
  await expect(
    page.getByRole('button', { name: /^Filter activities by Completed status, 1 activity/ }),
  ).toContainText('Completed 1')
  await expect(
    activityCard(page, 'Run cohort orientation and baseline profiling').getByText('Progress'),
  ).toHaveCount(0)
  await page.screenshot({
    path: evidencePath('00-ref09-ref10-activity-layout.png'),
    fullPage: true,
  })

  const detailTrigger = activityCard(page).getByRole('button', { name: 'View details' })
  await detailTrigger.click()
  const panel = page.getByRole('dialog', { name: 'Deliver skills bootcamp sessions' })
  await expect(panel).toBeVisible()
  await expect(panel.getByRole('button', { name: 'Edit activity' })).toBeVisible()
  await expect(panel.getByRole('button', { name: 'Log expense' })).toHaveCount(0)
  await expect(panel.getByRole('button', { name: 'Submit Update & Proof' })).toHaveCount(0)
  await expect(panel.getByRole('heading', { name: 'Connected Indicators' })).toBeVisible()
  await expect(panel.getByText('FM-BOOTCAMP', { exact: true })).toBeVisible()

  const scrollArea = panel.locator('[data-side-panel-scroll="true"]')
  const beforeScroll = await scrollArea.evaluate((element) => element.scrollTop)
  await page.screenshot({ path: evidencePath('01-ref11-persistent-panel.png') })
  const panelBox = await panel.boundingBox()
  expect(panelBox).not.toBeNull()
  await page.mouse.move(Math.max(4, (panelBox?.x ?? 400) - 20), 300)
  await page.mouse.wheel(0, 500)
  await expect(panel).toBeVisible()
  await expect
    .poll(() => scrollArea.evaluate((element) => element.scrollTop))
    .toBeGreaterThan(beforeScroll)
  await page.screenshot({ path: evidencePath('01b-ref11-overlay-wheel-scroll.png') })
  await panel.getByRole('button', { name: 'Close' }).click()
  await expect(detailTrigger).toBeFocused()

  await detailTrigger.click()
  await expect(panel).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(panel).toBeHidden()
  await expect(detailTrigger).toBeFocused()

  for (const accountId of ['system-administrator', 'program-manager', 'grant-manager']) {
    await switchAccount(page, accountId)
    await page.goto('/projects/futuremakers-ncr/activities')
    await expect(page.getByRole('heading', { name: 'Project Activities' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'New Activity' })).toHaveCount(0)
    const readOnlyPanel = await openActivityPanel(page)
    for (const action of [
      'Edit activity',
      'Submit Update & Proof',
      'Log expense',
      'Review & validate proof',
      'Review decision',
    ]) {
      await expect(readOnlyPanel.getByRole('button', { name: action })).toHaveCount(0)
    }
    await readOnlyPanel.getByRole('button', { name: 'Close' }).click()
  }

  await switchAccount(page, 'project-officer')
  await page.goto('/projects/futuremakers-ncr/activities')
  await expect(page.getByRole('link', { name: 'Budget' })).toHaveCount(0)
  const officerPanel = await openActivityPanel(page)
  await expect(officerPanel.getByRole('button', { name: 'Log expense' })).toBeVisible()
  await expect(officerPanel.getByRole('button', { name: 'Submit Update & Proof' })).toBeDisabled()
  await expect(officerPanel.getByRole('button', { name: 'Edit activity' })).toHaveCount(0)
  await officerPanel.getByRole('button', { name: 'Close' }).click()
  await page.goto('/projects/futuremakers-ncr/budget')
  await expect(page.getByText('Unauthorized access', { exact: true })).toBeVisible()

  await switchAccount(page, 'project-manager')
  await page.goto('/projects/youth-rise-western-samar/activities')
  await expect(page.getByText('Unauthorized access', { exact: true })).toBeVisible()

  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/projects/futuremakers-ncr/activities')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  )
  await openActivityPanel(page)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  )
  await page.screenshot({ path: evidencePath('02-ref10-ref11-mobile.png') })
})

test('LC-03A/B keeps each exact proof version in the PO to M&E to PM decision chain', async ({
  page,
}) => {
  test.setTimeout(120000)
  await resetAndSwitch(page, 'monitoring-evaluation-officer')
  await page.goto('/dashboard')
  let panel = await openDashboardProof(page, 'Proof submissions awaiting review')
  await expect(panel.getByText('Version 1 · 64%')).toBeVisible()
  await panel.getByRole('button', { name: 'Review & validate proof' }).click()
  const validationDialog = page.getByRole('dialog', { name: 'Review & validate proof' })
  await expect(validationDialog.getByText('bootcamp-session-photos.zip')).toBeVisible()
  await validationDialog.getByRole('button', { name: 'Submit review' }).click()
  await expect(panel.getByText('Proof v1 · Validated')).toBeVisible()
  await panel.getByRole('button', { name: 'Close' }).click()

  await switchAccount(page, 'project-manager')
  await page.goto('/dashboard')
  panel = await openDashboardProof(page, 'Pending approval queue')
  await panel.getByRole('button', { name: 'Review decision' }).click()
  const partialDecision = page.getByRole('dialog', { name: 'Review proof version 1' })
  await expect(partialDecision.getByRole('button', { name: 'Approve update' })).toBeEnabled()
  await partialDecision
    .getByLabel('Return reason')
    .fill('Attach the attendance register and resubmit the completed activity.')
  await partialDecision.getByRole('button', { name: 'Return for revision' }).click()
  await expect(panel.getByText('Proof v1 · Returned')).toBeVisible()
  await panel.getByRole('button', { name: 'Close' }).click()

  await switchAccount(page, 'project-officer')
  await page.goto('/projects/futuremakers-ncr/activities/act-fm-02?review=proof-fm-02')
  panel = page.getByRole('dialog', { name: 'Deliver skills bootcamp sessions' })
  await expect(panel.getByText(/Return reason: Attach the attendance register/)).toBeVisible()
  await panel.getByRole('button', { name: 'Submit Update & Proof' }).click()
  const proofDialog = page.getByRole('dialog', { name: 'Submit Update & Proof' })
  await proofDialog.getByLabel('Beneficiaries reached this session').fill('152')
  await proofDialog
    .getByLabel('Narrative Notes')
    .fill('Completed activity with the corrected attendance register attached.')
  await proofDialog.getByLabel('Upload proof of conduct').setInputFiles({
    name: 'corrected-attendance-register.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('fictional evidence'),
  })
  await page.screenshot({ path: evidencePath('06-post-handoff-proof-form.png') })
  await proofDialog.getByRole('button', { name: 'Submit update & proof' }).click()
  await expect(proofDialog).toBeHidden()
  await expect(panel).toBeVisible()
  await expect(panel.getByText('Proof v2 · Submitted')).toBeVisible()
  await page.screenshot({ path: evidencePath('03-lc03a-proof-resubmitted.png') })
  await panel.getByRole('button', { name: 'Close' }).click()

  await switchAccount(page, 'monitoring-evaluation-officer')
  await page.goto('/dashboard')
  panel = await openDashboardProof(page, 'Proof submissions awaiting review')
  await expect(panel.getByText('Version 2 · 100%')).toBeVisible()
  await page.screenshot({ path: evidencePath('03b-lc03b-me-validation-action.png') })
  await panel.getByRole('button', { name: 'Review & validate proof' }).click()
  await page
    .getByRole('dialog', { name: 'Review & validate proof' })
    .getByRole('button', { name: 'Submit review' })
    .click()
  await panel.getByRole('button', { name: 'Close' }).click()

  await switchAccount(page, 'project-manager')
  await page.goto('/dashboard')
  panel = await openDashboardProof(page, 'Pending approval queue')
  await page.screenshot({ path: evidencePath('03c-lc03b-pm-decision-action.png') })
  await panel.getByRole('button', { name: 'Review decision' }).click()
  await page
    .getByRole('dialog', { name: 'Review proof version 2' })
    .getByRole('button', { name: 'Approve & complete' })
    .click()
  await expect(panel.getByText('Completed', { exact: true }).first()).toBeVisible()
  await expect(panel.getByText('Activity progress', { exact: true })).toHaveCount(0)
  await expect(panel.getByText('Proof v2 · Approved')).toBeVisible()
  await page.screenshot({ path: evidencePath('04-lc03b-approved-completed.png') })

  const workflowState = await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem('pathways.demo.v1') ?? '{}')
    const activity = state.activities.find((record: { id: string }) => record.id === 'act-fm-02')
    return {
      activity,
      notices: state.notifications.filter((notice: { href?: string }) =>
        notice.href?.includes('/activities/act-fm-02'),
      ),
    }
  })
  expect(workflowState.activity.status).toBe('Completed')
  expect(workflowState.activity.submittedProof.at(-1).status).toBe('Approved')
  expect(workflowState.notices.length).toBeGreaterThanOrEqual(3)
})

test('LC-03C logs a validated pending expense from the open activity panel without navigation', async ({
  page,
}) => {
  test.setTimeout(120000)
  await resetAndSwitch(page, 'project-officer')
  await page.goto('/projects/futuremakers-ncr/activities')
  const panel = await openActivityPanel(page)
  await panel.getByRole('button', { name: 'Log expense' }).click()
  const dialog = page.getByRole('dialog', { name: 'Log expense' })
  await dialog.getByLabel('Amount (PHP)').fill('0')
  await dialog.getByLabel('Category').fill('Training materials')
  await dialog.getByLabel('Date').fill('2026-09-09')
  await dialog.getByLabel('Description').fill('Fictional workshop kits')
  await dialog.getByRole('button', { name: 'Save expense' }).click()
  await expect(dialog.getByRole('alert')).toContainText('positive number')
  await expect(dialog.getByLabel('Category')).toHaveValue('Training materials')
  await dialog.getByLabel('Amount (PHP)').fill('1250')
  await dialog.getByRole('button', { name: 'Save expense' }).click()
  await expect(dialog).toBeHidden()
  await expect(panel).toBeVisible()
  await expect(page).toHaveURL(/\/projects\/futuremakers-ncr\/activities\/act-fm-02$/)

  const savedExpense = await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem('pathways.demo.v1') ?? '{}')
    return state.expenses.at(-1)
  })
  expect(savedExpense).toMatchObject({
    activityId: 'act-fm-02',
    projectId: 'futuremakers-ncr',
    submittedBy: 'project-officer',
    status: 'For Verification',
    counted: false,
  })
  await page.screenshot({ path: evidencePath('05-lc03c-expense-panel-context.png') })

  await panel.getByRole('button', { name: 'Log expense' }).click()
  await page.getByRole('dialog', { name: 'Log expense' }).getByLabel('Category').fill('Discard me')
  await page
    .getByRole('dialog', { name: 'Log expense' })
    .getByRole('button', { name: 'Cancel' })
    .click()
  await expect(panel).toBeVisible()
  await expect
    .poll(() =>
      page.evaluate(
        () => JSON.parse(localStorage.getItem('pathways.demo.v1') ?? '{}').expenses.length,
      ),
    )
    .toBe(1)
})
