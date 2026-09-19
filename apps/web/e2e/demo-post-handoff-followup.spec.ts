import { type Page, expect, test } from '@playwright/test'

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

test('journey stages are sequential and future stages cannot be opened', async ({
  page,
}, testInfo) => {
  await resetAndSwitch(page, 'project-officer')
  await page.goto('/beneficiaries/ben-001')
  const gate = page.getByRole('dialog', { name: 'Verify beneficiary module access' })
  await gate.getByLabel('Beneficiary access PIN').fill('2468')
  await gate.getByRole('button', { name: 'Verify and enter' }).click()

  await expect(
    page.getByRole('button', { name: /J1 Registration and intake: Reached/i }),
  ).toBeEnabled()
  await expect(
    page.getByRole('button', { name: /J2 Core capability building: Reached/i }),
  ).toBeEnabled()
  await expect(
    page.getByRole('button', { name: /J3 Skills bootcamp branch: Current stage/i }),
  ).toBeEnabled()
  await expect(
    page.getByRole('button', { name: /J4 Learning support branch: Locked/i }),
  ).toBeDisabled()

  await page.screenshot({ fullPage: true, path: testInfo.outputPath('sequential-journey.png') })
})

test('Encode Data follows Collection-module access for every role', async ({ page }) => {
  await resetAndSwitch(page, 'system-administrator')

  for (const accountId of [
    'system-administrator',
    'monitoring-evaluation-officer',
    'project-officer',
  ]) {
    await switchAccount(page, accountId)
    await page.goto('/collection')
    await expect(page.getByRole('link', { name: 'Encode data' })).toBeVisible()
    await page.getByRole('link', { name: 'Encode data' }).click()
    await expect(page.getByRole('heading', { name: 'Encode Project Data' })).toBeVisible()
  }

  for (const accountId of ['project-manager', 'program-manager', 'grant-manager']) {
    await switchAccount(page, accountId)
    await page.goto('/collection/entry')
    await expect(page.getByText('Unauthorized access', { exact: true })).toBeVisible()
  }
})

test('Project Officer opens exact activity details without leaving Dashboard', async ({
  page,
}, testInfo) => {
  await resetAndSwitch(page, 'project-officer')
  await page.goto('/dashboard')

  const openActivity = page.getByRole('button', { name: 'Open Activity' })
  await openActivity.click()
  await expect(page).toHaveURL(/\/dashboard$/)
  await expect(page.getByRole('dialog', { name: 'Deliver skills bootcamp sessions' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Submit Update & Proof' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Log expense' })).toBeVisible()
  await page.screenshot({
    fullPage: true,
    path: testInfo.outputPath('dashboard-activity-panel.png'),
  })

  await page.keyboard.press('Escape')
  await expect(openActivity).toBeFocused()
  await page.getByRole('button', { name: 'View Summary' }).click()
  await expect(page).toHaveURL(/\/dashboard$/)
  await expect(
    page.getByRole('dialog', { name: 'Run cohort orientation and baseline profiling' }),
  ).toBeVisible()
})

test('M&E retains the prior layout with revised OECD-informed labels and stored score', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1000 })
  await resetAndSwitch(page, 'monitoring-evaluation-officer')
  await page.goto('/projects/futuremakers-ncr/monitor-evaluate')

  await expect(page.getByRole('heading', { name: 'OECD-informed evaluation' })).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Overall evaluation score' })).toBeVisible()
  await expect(page.getByText('82', { exact: true })).toBeVisible()
  for (const label of ['Effectiveness', 'Efficiency', 'Reach', 'Journey progress']) {
    await expect(page.getByRole('progressbar', { name: label })).toBeVisible()
  }
  await expect(page.getByText(/OECD \(2021\) basis with PATHWAYS/)).toBeVisible()

  await page.getByRole('button', { name: 'View Basis' }).click()
  const basis = page.getByRole('dialog', { name: 'OECD (2021) basis' })
  await expect(basis).toBeVisible()
  await expect(
    basis.getByText(/Effectiveness and Efficiency use the corresponding OECD/),
  ).toBeVisible()
  await page.keyboard.press('Escape')

  await page.screenshot({ path: testInfo.outputPath('evaluation-layout.png') })
})

test('Evidence review uses one decision dropdown and an explicit Save action', async ({ page }) => {
  await resetAndSwitch(page, 'monitoring-evaluation-officer')
  await page.goto('/projects/futuremakers-ncr/evidence')

  const evidence = page
    .getByText('Orientation and baseline proof packet')
    .locator('xpath=ancestor::div[contains(@class,"rounded-sm")][1]')
  const decision = page.getByRole('combobox', {
    name: 'Proof decision for Orientation and baseline proof packet',
  })
  await expect(decision).toBeVisible()
  await expect(page.getByRole('button', { name: 'Validate', exact: true })).toHaveCount(0)
  await decision.click()
  await page.getByRole('option', { name: 'Flag as insufficient' }).click()
  await evidence.getByRole('button', { name: 'Save' }).click()
  await expect(evidence.getByText('Flagged', { exact: true })).toBeVisible()
})

test('Project Officer extension request appears in the Project Manager dashboard queue', async ({
  page,
}) => {
  await resetAndSwitch(page, 'project-officer')
  await page.goto('/dashboard')
  await page.getByRole('button', { name: 'Open Activity' }).click()
  const panel = page.getByRole('dialog', { name: 'Deliver skills bootcamp sessions' })
  await panel.getByRole('button', { name: 'Request an extension' }).click()
  await expect(panel.getByRole('button', { name: 'Extension requested' })).toBeDisabled()

  await switchAccount(page, 'project-manager')
  await page.goto('/dashboard')
  await expect(page.getByText('Project Officer requested a schedule extension')).toBeVisible()
  await page.getByRole('button', { name: 'Review activity' }).click()
  await expect(page).toHaveURL(/\/dashboard$/)
  await expect(page.getByRole('dialog', { name: 'Deliver skills bootcamp sessions' })).toBeVisible()
})

test('saved demo sessions receive Budget examples and an eligible proof-submission activity', async ({
  page,
}) => {
  await resetAndSwitch(page, 'project-manager')
  await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem('pathways.demo.v1') ?? '{}')
    state.activities = state.activities.filter(
      (record: { id: string }) => record.id !== 'act-fm-proof-lab',
    )
    state.alerts = state.alerts.filter(
      (record: { id: string }) =>
        record.id !== 'alert-fm-budget-burn' && record.id !== 'alert-fm-budget-concentration',
    )
    state.recommendations = state.recommendations.filter(
      (record: { id: string }) =>
        record.id !== 'rec-fm-budget-burn' && record.id !== 'rec-fm-budget-concentration',
    )
    localStorage.setItem('pathways.demo.v1', JSON.stringify(state))
  })

  await page.goto('/projects/futuremakers-ncr/budget')
  await expect(page.getByText('Delivery spending is nearing the approved ceiling')).toBeVisible()
  await expect(page.getByText('Single activity accounts for most recorded spending')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Log Outcome Decision' })).toHaveCount(2)

  await switchAccount(page, 'project-officer')
  await page.goto('/projects/futuremakers-ncr/activities')
  await page
    .getByRole('article', { name: 'Activity: Facilitate employer readiness clinic' })
    .getByRole('button', { name: 'View details' })
    .click()
  const panel = page.getByRole('dialog', { name: 'Facilitate employer readiness clinic' })
  await expect(panel.getByRole('button', { name: 'Submit Update & Proof' })).toBeEnabled()
  await panel.getByRole('button', { name: 'Submit Update & Proof' }).click()
  const proofDialog = page.getByRole('dialog', { name: 'Submit Update & Proof' })
  await proofDialog.getByLabel('Beneficiaries reached this session').fill('67')
  await expect(proofDialog.getByLabel('Beneficiaries reached this session')).toHaveValue('67')
  await proofDialog.getByLabel('Narrative Notes').fill('Frontend-only proof preview fixture.')
  await proofDialog.getByLabel('Upload proof of conduct').setInputFiles({
    name: 'employer-readiness-proof.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('%PDF-1.4 frontend-only fixture'),
  })
  await proofDialog.getByRole('button', { name: 'Submit update & proof' }).click()
  await expect(proofDialog).toBeHidden()
  await expect(panel.getByRole('button', { name: 'Submit Update & Proof' })).toBeEnabled()
  await panel.getByRole('button', { name: /employer-readiness-proof\.pdf/ }).click()
  const preview = page.getByRole('dialog', { name: 'Proof file preview' })
  await expect(preview.getByTitle('Preview of employer-readiness-proof.pdf')).toBeVisible()
  await preview.getByRole('button', { name: 'Close' }).click()

  await switchAccount(page, 'program-manager')
  await page.goto('/projects/futuremakers-ncr/budget')
  await page.getByRole('button', { name: 'Log Outcome Decision' }).first().click()
  await page
    .getByRole('dialog', { name: 'Log Outcome Decision' })
    .getByRole('combobox', { name: 'Outcome' })
    .click()
  await expect(page.getByRole('option', { name: 'Escalate to Program Manager' })).toHaveCount(0)

  await switchAccount(page, 'monitoring-evaluation-officer')
  await page.goto('/projects/futuremakers-ncr/activities')
  await page
    .getByRole('article', { name: 'Activity: Facilitate employer readiness clinic' })
    .getByRole('button', { name: 'View details' })
    .click()
  let reviewPanel = page.getByRole('dialog', { name: 'Facilitate employer readiness clinic' })
  await reviewPanel.getByRole('button', { name: 'Review & validate proof' }).click()
  await page
    .getByRole('dialog', { name: 'Review & validate proof' })
    .getByRole('button', { name: 'Submit review' })
    .click()

  await switchAccount(page, 'project-manager')
  await page.goto('/projects/futuremakers-ncr/activities')
  await page
    .getByRole('article', { name: 'Activity: Facilitate employer readiness clinic' })
    .getByRole('button', { name: 'View details' })
    .click()
  reviewPanel = page.getByRole('dialog', { name: 'Facilitate employer readiness clinic' })
  await reviewPanel.getByRole('button', { name: 'Review decision' }).click()
  const decision = page.getByRole('dialog', { name: 'Review proof version 1' })
  await expect(decision.getByText('Notes', { exact: true })).toBeVisible()
  await decision.getByRole('button', { name: /employer-readiness-proof\.pdf/ }).click()
  const managerPreview = page.getByRole('dialog', { name: 'Proof file preview' })
  await expect(managerPreview.getByTitle('Preview of employer-readiness-proof.pdf')).toBeVisible()
  await managerPreview.getByRole('button', { name: 'Close' }).click()
  await expect(decision.getByRole('button', { name: 'Approve update' })).toBeEnabled()
  await decision.getByRole('button', { name: 'Approve update' }).click()
  await expect(reviewPanel.getByText('Proof v1 · Approved')).toBeVisible()
  await expect(reviewPanel.getByText('Completed', { exact: true })).toHaveCount(0)
})
