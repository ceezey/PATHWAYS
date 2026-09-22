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
  resolve(repositoryRoot, 'docs/frontend-revision/systemrevision/evidence/phase5', name)

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

async function resetAndSwitch(page: Page, accountId = 'project-manager') {
  await page.goto('/review/demo-controls')
  await expect(page.getByRole('status')).toContainText('Review controls ready.', {
    timeout: 20_000,
  })
  page.once('dialog', (dialog) => dialog.accept())
  await page.getByRole('button', { name: 'Reset review data' }).click()
  await switchAccount(page, accountId)
}

async function verifyBeneficiaryGate(page: Page) {
  const gate = page.getByRole('dialog', { name: 'Verify beneficiary module access' })
  await expect(gate).toBeVisible()
  await gate.getByLabel('Beneficiary access PIN').fill('2468')
  await gate.getByRole('button', { name: 'Verify and enter' }).click()
  await expect(gate).toBeHidden()
}

test.describe.configure({ mode: 'serial' })

test('Ref17 gates every entry and supports cancel, retry, direct-link resume, and role change', async ({
  page,
}) => {
  await resetAndSwitch(page)
  await page.goto('/beneficiaries/ben-001')
  const gate = page.getByRole('dialog', { name: 'Verify beneficiary module access' })
  await expect(gate.getByText(/Frontend demo gate only/i)).toBeVisible()
  await gate.getByLabel('Beneficiary access PIN').fill('9999')
  await gate.getByRole('button', { name: 'Verify and enter' }).click()
  await expect(gate.getByText(/PIN is incorrect/i)).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Beneficiary NCR-001' })).toHaveCount(0)
  await gate.getByRole('button', { name: 'Back to dashboard' }).click()
  await expect(page).toHaveURL(/\/dashboard$/)

  await page.goto('/beneficiaries/ben-001')
  await verifyBeneficiaryGate(page)
  await expect(page).toHaveURL(/\/beneficiaries\/ben-001$/)
  await expect(page.getByRole('heading', { name: 'Beneficiary NCR-001' })).toBeVisible()

  await expect(page.getByRole('button', { name: 'Relock beneficiary records' })).toHaveCount(0)
  await switchAccount(page, 'project-officer')
  await page.goto('/beneficiaries/ben-001')
  await expect(gate).toBeVisible()
})

test('LC-05A uses a compact directory and whole-record keyboard navigation with safe return context', async ({
  page,
}) => {
  await resetAndSwitch(page)
  await page.goto('/beneficiaries')
  await verifyBeneficiaryGate(page)

  await expect(page.getByText(/Find Beneficiary records by name or code/i)).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'Evaluation Center lookup' })).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'Add beneficiary' })).toBeVisible()

  const search = page.getByRole('searchbox', { name: 'Search by name or code' })
  await search.fill('NCR-001')
  const recordLink = page.getByRole('link', { name: 'Open Beneficiary NCR-001' })
  await expect(recordLink).toBeVisible()
  await recordLink.focus()
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/\/beneficiaries\/ben-001\?returnTo=/)
  await expect(page.getByRole('heading', { name: 'Beneficiary NCR-001' })).toBeVisible()

  await page.getByRole('link', { name: 'Back to Beneficiaries' }).click()
  await expect(search).toHaveValue('NCR-001')
  await expect(recordLink).toBeVisible()
  await page.screenshot({ path: evidencePath('00-ref17-directory-desktop.png'), fullPage: true })
})

test('LC-05B keeps journey selection and contextual actions inline without a journey modal', async ({
  page,
}) => {
  await resetAndSwitch(page)
  await page.goto('/beneficiaries/ben-001')
  await verifyBeneficiaryGate(page)

  await expect(page.getByRole('button', { name: 'Add note' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Record participation' })).toHaveCount(0)
  await expect(
    page.getByRole('button', { name: /J1 Registration and intake: Reached/i }),
  ).toBeVisible()
  await expect(
    page.getByRole('button', { name: /J2 Core capability building: Reached/i }),
  ).toBeVisible()
  const stage = page.getByRole('button', {
    name: /J3 Skills bootcamp branch: Current stage/i,
  })
  await expect(
    page.getByRole('button', { name: /J4 Learning support branch: Locked/i }),
  ).toBeDisabled()
  await stage.click()
  await expect(stage).toHaveAttribute('aria-expanded', 'true')
  await expect(page.getByRole('dialog', { name: /J2\.1/i })).toHaveCount(0)
  const detail = page.locator('#journey-stage-detail-stage-vocational')
  await expect(detail).toBeVisible()
  await expect(detail.getByRole('button', { name: 'Record participation' })).toBeVisible()
  await expect(detail.getByRole('button', { name: 'View assessment' })).toBeVisible()
  await expect(detail.getByRole('button', { name: 'Add note' })).toBeVisible()
  await page.screenshot({
    path: evidencePath('01-ref18-inline-journey-detail.png'),
    fullPage: true,
  })

  await detail.getByRole('button', { name: 'View assessment' }).click()
  await expect(page.getByRole('dialog', { name: 'Skills readiness check' })).toBeVisible()
  await page.keyboard.press('Escape')

  await detail.getByRole('button', { name: 'Add note' }).click()
  const noteDialog = page.getByRole('dialog', { name: 'Add beneficiary note' })
  await expect(noteDialog.getByText('J3 · Skills bootcamp branch', { exact: true })).toBeVisible()
  await noteDialog.getByLabel('Beneficiary note').fill('Phase 5 journey-context note.')
  await noteDialog.getByRole('button', { name: 'Save note' }).click()
  await expect(detail.getByText('Phase 5 journey-context note.')).toBeVisible()

  await detail.getByRole('button', { name: 'Record participation' }).click()
  const participationDialog = page.getByRole('dialog', { name: 'Record participation' })
  await expect(participationDialog.getByText(/J3 journey stage/i)).toBeVisible()
  await participationDialog.getByRole('button', { name: 'Save participation' }).click()
  await expect(participationDialog).toBeHidden()
  const entryStage = page.getByRole('button', { name: /J1.*Registration and intake/i })
  await entryStage.click()
  await expect(detail).toBeHidden()
  await expect(entryStage).toHaveAttribute('aria-expanded', 'true')
  await entryStage.click()
  await expect(entryStage).toHaveAttribute('aria-expanded', 'false')
  await expect(stage).toHaveAttribute('aria-expanded', 'false')
})

test('LC-05C groups Media Proof and Participation History in tabs and preserves unlinked notes', async ({
  page,
}) => {
  await resetAndSwitch(page)
  await page.goto('/beneficiaries/ben-001')
  await verifyBeneficiaryGate(page)
  await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem('pathways.demo.v1') ?? '{}')
    const beneficiary = state.beneficiaries.find(
      (record: { id: string }) => record.id === 'ben-001',
    )
    beneficiary.notes.unshift({
      id: 'legacy-unlinked-note',
      beneficiaryId: 'ben-001',
      projectId: 'futuremakers-ncr',
      stageId: 'legacy-stage-without-mapping',
      author: 'Imported record',
      createdAt: '2026-01-05',
      visibility: 'Internal',
      note: 'Preserved legacy note without a verified journey association.',
    })
    localStorage.setItem('pathways.demo.v1', JSON.stringify(state))
  })
  await page.reload()

  const tabs = page.getByRole('tablist', { name: 'Beneficiary information' })
  await expect(tabs).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Unlinked notes' })).toBeVisible()
  await expect(
    page.getByText(/Preserved legacy note without a verified journey association/),
  ).toBeVisible()
  await tabs.getByRole('tab', { name: 'Media proof' }).click()
  await expect(page.getByRole('region', { name: 'Media proof' })).toBeVisible()
  await tabs.getByRole('tab', { name: 'Participation history' }).click()
  await expect(page.getByRole('heading', { name: 'Participation history' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Notes', exact: true })).toHaveCount(0)

  await page.setViewportSize({ width: 390, height: 844 })
  await tabs.getByRole('tab', { name: 'Journey tracking' }).click()
  await page.getByRole('button', { name: /J3.*Skills bootcamp branch/i }).click()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  )
  await page.screenshot({
    path: evidencePath('02-ref18-19-beneficiary-mobile.png'),
    fullPage: true,
  })
})

test('direct record access remains project-scoped and aggregate-only roles stay outside records', async ({
  page,
}) => {
  await resetAndSwitch(page, 'project-officer')
  await page.goto('/beneficiaries/ben-003')
  await verifyBeneficiaryGate(page)
  await expect(page.getByText('Beneficiary record restricted', { exact: true })).toBeVisible()

  await switchAccount(page, 'monitoring-evaluation-officer')
  await page.goto('/beneficiaries/ben-003')
  await verifyBeneficiaryGate(page)
  await expect(page.getByRole('heading', { name: 'Beneficiary NAV-022' })).toBeVisible()

  await switchAccount(page, 'system-administrator')
  await page.goto('/beneficiaries/ben-002')
  await expect(page.getByText('Unauthorized access', { exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Beneficiary WS-014' })).toHaveCount(0)
})
