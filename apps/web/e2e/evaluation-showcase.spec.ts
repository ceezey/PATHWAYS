import path from 'node:path'
import { type Page, expect, test } from '@playwright/test'
import { loadActors, seedAccounts, signIn } from './fixtures/real-sign-in'

test.describe.configure({ mode: 'serial' })

let actors: Awaited<ReturnType<typeof loadActors>>
const shots = path.resolve(__dirname, '../../../.tmp/evaluation-showcase')

test.beforeAll(async () => {
  actors = await loadActors([seedAccounts.ME, seedAccounts.PM])
})

// Opens the Safe Schools for Girls project (has indicators, a budget envelope and enrolled
// beneficiaries, so KPI, Budget efficiency and Beneficiary reach all have something to compute
// from) and its Monitor & Evaluate tab. Each test gets its own fresh browser context, so a plain
// sign-in works even though a different role signed in last in the previous test.
async function openSsg(page: Page) {
  const card = page.locator('[data-testid^="project-card-"]').filter({
    has: page.getByRole('heading', { name: /Safe Schools for Girls/ }),
  })
  await card.getByRole('link', { name: 'Open Project' }).click()
  await page.getByRole('link', { name: 'Monitor & Evaluate' }).click()
  await expect(page.getByRole('heading', { name: 'Monitor & Evaluate' })).toBeVisible()
}

test('Monitoring and Evaluation Officer sets up and publishes criteria', async ({ page }) => {
  await signIn(page, seedAccounts.ME, actors)
  await page.goto('/projects')
  await openSsg(page)
  await page.screenshot({ path: `${shots}/01-empty.png`, fullPage: true })

  // Only build a draft rubric if this project has none yet.
  const codeInput = page.getByLabel('Code').first()
  if (await codeInput.isVisible().catch(() => false)) {
    const rows = [
      { code: 'relevance', name: 'Relevance', type: 'OTHER', weight: '20' },
      { code: 'effectiveness', name: 'Effectiveness', type: 'KPI', weight: '30' },
      { code: 'efficiency', name: 'Efficiency', type: 'BUDGET_EFFICIENCY', weight: '30' },
      { code: 'reach', name: 'Beneficiary Reach', type: 'BENEFICIARY_REACH', weight: '20' },
    ]
    for (let i = 0; i < rows.length - 1; i++) {
      await page.getByRole('button', { name: 'Add criterion' }).click()
    }
    const codeInputs = page.getByLabel('Code')
    const nameInputs = page.getByLabel('Name')
    const weightInputs = page.getByLabel('Weight (%)')
    const typeSelects = page.getByRole('combobox', { name: 'Type' })
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i] as (typeof rows)[number]
      await codeInputs.nth(i).fill(row.code)
      await nameInputs.nth(i).fill(row.name)
      await weightInputs.nth(i).fill(row.weight)
      await typeSelects.nth(i).click()
      await page.getByRole('option', { name: row.type }).click()
    }
    await page.screenshot({ path: `${shots}/02-draft-rubric-filled.png`, fullPage: true })
    await page.getByRole('button', { name: 'Initialize draft rubric' }).click()
    await expect(page.getByText('Relevance')).toBeVisible()
  }
  await page.screenshot({ path: `${shots}/03-criteria-draft.png`, fullPage: true })

  // Publish, if there are still draft criteria to publish.
  const publishButton = page.getByRole('button', { name: 'Publish criteria' }).first()
  if (await publishButton.isVisible().catch(() => false)) {
    await publishButton.click()
    await page.getByRole('dialog').getByRole('button', { name: 'Publish criteria' }).click()
    await expect(page.getByText('PUBLISHED').first()).toBeVisible()
  }
  await page.screenshot({ path: `${shots}/04-criteria-published.png`, fullPage: true })
})

test('Monitoring and Evaluation Officer starts, scores and submits an evaluation', async ({
  page,
}) => {
  await signIn(page, seedAccounts.ME, actors)
  await page.goto('/projects')
  await openSsg(page)

  // Start an evaluation, if none is already open.
  const titleInput = page.getByLabel('Title')
  if (await titleInput.isVisible().catch(() => false)) {
    await titleInput.fill('Mid-term 2026')
    await page.getByLabel('Period start').fill('2026-01-01')
    await page.getByLabel('Period end').fill('2026-06-30')
    await page.getByRole('button', { name: 'Start evaluation' }).click()
    await expect(page.getByText('Score: Mid-term 2026')).toBeVisible()
  }
  await page.screenshot({ path: `${shots}/05-evaluation-started.png`, fullPage: true })

  // Score every row that still needs a manual value and a note (computed rows fill themselves).
  const scoreInputs = page.locator('input[aria-label^="Score for "]')
  const count = await scoreInputs.count()
  for (let i = 0; i < count; i++) {
    const input = scoreInputs.nth(i)
    const label = (await input.getAttribute('aria-label')) ?? ''
    const criterion = label.replace('Score for ', '')
    await input.fill('80')
    await page.getByLabel(`Note for ${criterion}`).fill('Evidence reviewed against field records.')
  }
  await page.screenshot({ path: `${shots}/06-scores-entered.png`, fullPage: true })
  await page.getByRole('button', { name: 'Save scores' }).click()
  await page.waitForTimeout(500)
  await page.screenshot({ path: `${shots}/07-scores-saved.png`, fullPage: true })

  await page.getByRole('button', { name: 'Submit evaluation' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Submit evaluation' }).click()
  await expect(page.getByText('SUBMITTED').first()).toBeVisible()
  await page.screenshot({ path: `${shots}/08-submitted.png`, fullPage: true })
})

test('Project Manager returns the evaluation for correction', async ({ page }) => {
  await signIn(page, seedAccounts.PM, actors)
  await page.goto('/projects')
  await openSsg(page)
  await expect(page.getByText('SUBMITTED').first()).toBeVisible()
  await page.screenshot({ path: `${shots}/09-pm-submitted-view.png`, fullPage: true })

  await page.getByRole('button', { name: 'Return for correction' }).click()
  await page.getByLabel('Reason for returning').fill('Please re-check the Efficiency note.')
  await page.getByRole('dialog').getByRole('button', { name: 'Return evaluation' }).click()
  await expect(page.getByText('DRAFT').first()).toBeVisible()
  await page.screenshot({ path: `${shots}/10-pm-returned.png`, fullPage: true })
})

test('Monitoring and Evaluation Officer resubmits and the Project Manager signs off', async ({
  page,
}) => {
  await signIn(page, seedAccounts.ME, actors)
  await page.goto('/projects')
  await openSsg(page)
  await expect(page.getByText('Please re-check the Efficiency note.')).toBeVisible()
  await page.getByRole('button', { name: 'Submit evaluation' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Submit evaluation' }).click()
  await expect(page.getByText('SUBMITTED').first()).toBeVisible()
})

test('Project Manager signs off the resubmitted evaluation', async ({ page }) => {
  await signIn(page, seedAccounts.PM, actors)
  await page.goto('/projects')
  await openSsg(page)
  await page.getByRole('button', { name: 'Sign off' }).click()
  await page.getByLabel('Sign-off feedback').fill('Scores agree with the field records.')
  await page.getByRole('dialog').getByRole('button', { name: 'Sign off' }).click()
  await expect(page.getByText('SIGNED_OFF').first()).toBeVisible()
  await page.screenshot({ path: `${shots}/11-signed-off.png`, fullPage: true })
})
