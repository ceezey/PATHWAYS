import path from 'node:path'
import { type Page, expect, test } from '@playwright/test'
import { loadActors, seedAccounts, signIn } from './fixtures/real-sign-in'

test.describe.configure({ mode: 'serial' })

let actors: Awaited<ReturnType<typeof loadActors>>
const shots = path.resolve(__dirname, '../../../.tmp/evaluation-showcase')

test.beforeAll(async () => {
  actors = await loadActors([seedAccounts.ME, seedAccounts.PM])
})

// Opens the Safe Schools for Girls project (has indicators and enrolled beneficiaries for the
// automatic criterion scores) and its Monitor & Evaluate tab. Each test gets its own fresh browser
// context, so a plain sign-in works even though a different role signed in last in the previous test.
async function openSsg(page: Page) {
  const card = page.locator('[data-testid^="project-card-"]').filter({
    has: page.getByRole('heading', { name: /Safe Schools for Girls/ }),
  })
  await card.getByRole('link', { name: 'Open Project' }).click()
  await page.getByRole('link', { name: 'Monitor & Evaluate' }).click()
  await expect(page.getByRole('heading', { name: 'Monitor & Evaluate' })).toBeVisible()
}

test('Monitoring and Evaluation Officer starts, recomputes and submits an evaluation', async ({
  page,
}) => {
  await signIn(page, seedAccounts.ME, actors)
  await page.goto('/projects')
  await openSsg(page)
  await page.screenshot({ path: `${shots}/01-empty.png`, fullPage: true })

  // The default seed already opens a draft round; the Start form only shows when none is open.
  const titleInput = page.getByLabel('Title')
  if (await titleInput.isVisible().catch(() => false)) {
    await titleInput.fill('Mid-term 2026')
    await page.getByLabel('Period start').fill('2026-01-01')
    await page.getByLabel('Period end').fill('2026-06-30')
    await page.getByRole('button', { name: 'Start evaluation' }).click()
  }
  await expect(page.getByText(/^Review: /)).toBeVisible()
  await expect(page.getByRole('columnheader', { name: 'Source' })).toBeVisible()
  await page.screenshot({ path: `${shots}/02-evaluation-started.png`, fullPage: true })

  await page.getByLabel('Evaluation narrative').fill('Evidence reviewed against field records.')
  await page.getByRole('button', { name: 'Recompute' }).click()
  await expect(page.getByText('Recompute to save the narrative before submitting.')).toBeHidden()
  await page.screenshot({ path: `${shots}/03-recomputed.png`, fullPage: true })

  await page.getByRole('button', { name: 'Submit evaluation' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Submit evaluation' }).click()
  await expect(page.getByText('SUBMITTED').first()).toBeVisible()
  await page.screenshot({ path: `${shots}/04-submitted.png`, fullPage: true })
})

test('Project Manager returns the evaluation for correction', async ({ page }) => {
  await signIn(page, seedAccounts.PM, actors)
  await page.goto('/projects')
  await openSsg(page)
  await expect(page.getByText('SUBMITTED').first()).toBeVisible()
  await page.screenshot({ path: `${shots}/05-pm-submitted-view.png`, fullPage: true })

  await page.getByRole('button', { name: 'Return for correction' }).click()
  await page.getByLabel('Reason for returning').fill('Please re-check the narrative.')
  await page.getByRole('dialog').getByRole('button', { name: 'Return evaluation' }).click()
  await expect(page.getByText('DRAFT').first()).toBeVisible()
  await page.screenshot({ path: `${shots}/06-pm-returned.png`, fullPage: true })
})

test('Monitoring and Evaluation Officer resubmits and the Project Manager signs off', async ({
  page,
}) => {
  await signIn(page, seedAccounts.ME, actors)
  await page.goto('/projects')
  await openSsg(page)
  await expect(page.getByText('Please re-check the narrative.')).toBeVisible()
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
  await page.screenshot({ path: `${shots}/07-signed-off.png`, fullPage: true })
})
