import { execFileSync } from 'node:child_process'
import { type Page, expect, test } from '@playwright/test'
import { localDatabase } from '../../../scripts/db/local-target.mjs'
import {
  type Actor,
  hasLocalDb,
  loadActors,
  nextTotpCode,
  ownerQuery,
  signIn as realSignIn,
  seedAccounts,
} from './fixtures/real-sign-in'

const code = 'E2E-BEN-001'
const displayName = 'E2E Beneficiary Sample'

// Superuser seed on the disposable local container, as the beneficiary guard trigger blocks the owner role.
const seedQuery = (sql: string) =>
  execFileSync(
    'docker',
    [
      'exec',
      localDatabase.container,
      'psql',
      '-U',
      'postgres',
      '-d',
      'postgres',
      '-At',
      '-c',
      `SET session_replication_role=replica; ${sql}`,
    ],
    { encoding: 'utf8' },
  )

test.skip(!hasLocalDb, 'Local Supabase database container is not running')

test.describe.configure({ mode: 'serial' })

let actors: Record<string, Actor> = {}
let projectId = ''
let beneficiaryId = ''

test.beforeAll(async () => {
  test.setTimeout(120_000)
  actors = await loadActors(Object.values(seedAccounts))
  projectId = ownerQuery(
    `SELECT p.id FROM pathways.projects p JOIN pathways.user_project_assignments a ON a.project_id=p.id JOIN pathways.system_users u ON u.id=a.user_id WHERE u.email='${seedAccounts.PM}' ORDER BY p.id LIMIT 1`,
  )
  expect(projectId).toMatch(/^[0-9a-f-]{36}$/)
  const org = `(SELECT organization_id FROM pathways.projects WHERE id='${projectId}')`
  const manager = `(SELECT id FROM pathways.system_users WHERE email='${seedAccounts.PM}')`
  // Seed one beneficiary and two journey stages on the manager's project, only if missing.
  seedQuery(
    `INSERT INTO pathways.beneficiaries (organization_id, code, first_name, last_name, display_name, subject_type, sex, location_city_municipality, created_by_id) SELECT ${org}, '${code}', 'E2E', 'Sample', '${displayName}', 'INDIVIDUAL', 'NOT_SPECIFIED', 'Quezon City', ${manager} WHERE NOT EXISTS (SELECT 1 FROM pathways.beneficiaries WHERE code='${code}')`,
  )
  beneficiaryId = ownerQuery(`SELECT id FROM pathways.beneficiaries WHERE code='${code}'`)
  seedQuery(
    `INSERT INTO pathways.beneficiary_project_enrollments (organization_id, project_id, beneficiary_id, enrollment_date, recorded_by_id) SELECT ${org}, '${projectId}', '${beneficiaryId}', CURRENT_DATE, ${manager} WHERE NOT EXISTS (SELECT 1 FROM pathways.beneficiary_project_enrollments WHERE beneficiary_id='${beneficiaryId}' AND project_id='${projectId}')`,
  )
  // Stages take the next free order so seeded demo stages never collide.
  for (const order of [1, 2]) {
    seedQuery(
      `INSERT INTO pathways.journey_stages (organization_id, project_id, code, name, stage_order) SELECT ${org}, '${projectId}', 'E2E-S${order}', 'E2E Stage ${order}', (SELECT COALESCE(MAX(stage_order), 0) + 1 FROM pathways.journey_stages WHERE project_id='${projectId}') WHERE NOT EXISTS (SELECT 1 FROM pathways.journey_stages WHERE project_id='${projectId}' AND code='E2E-S${order}')`,
    )
  }
})

const signIn = (page: Page, email: string) => realSignIn(page, email, actors)

// Sign-in itself is a fresh TOTP, so report the step-up as stale until the browser verifies a code.
const staleStepUp = async (page: Page) => {
  let stale = true
  page.on('response', (response) => {
    if (/\/auth\/v1\/factors\/.+\/verify/.test(response.url()) && response.ok()) stale = false
  })
  await page.route('**/auth/step-up/status', (route) =>
    stale
      ? route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            fresh: false,
            expiresAt: null,
            windowSeconds: 900,
            method: null,
            pinState: 'NONE',
          }),
        })
      : route.continue(),
  )
}

const gate = (page: Page) => page.getByRole('dialog', { name: 'Verify beneficiary module access' })

// Answers the real step-up prompt with an authenticator code from a time step not yet used.
const verifyStepUp = async (page: Page, email: string) => {
  const dialog = gate(page)
  await expect(dialog).toBeVisible({ timeout: 30_000 })
  await dialog
    .getByLabel('Authenticator code')
    .fill(await nextTotpCode((actors[email] as Actor).secret))
  await dialog.getByRole('button', { name: 'Verify and enter' }).click()
  await expect(dialog).toBeHidden({ timeout: 30_000 })
}

for (const key of ['SA', 'PG', 'GM'] as const) {
  test(`${key} stays outside beneficiary records`, async ({ page }) => {
    test.setTimeout(120_000)
    await signIn(page, seedAccounts[key])
    for (const path of [
      '/beneficiaries',
      `/beneficiaries/${beneficiaryId}?projectId=${projectId}`,
    ]) {
      await page.goto(path)
      await expect(page.getByText('Unauthorized access', { exact: true }).first()).toBeVisible()
    }
    await expect(page.getByText(displayName)).toHaveCount(0)
  })
}

test('Project Officer is gated, a rejected code reveals nothing, and Back returns to the dashboard', async ({
  page,
}) => {
  test.setTimeout(120_000)
  await signIn(page, seedAccounts.PO)
  await staleStepUp(page)
  await page.goto('/beneficiaries')
  const dialog = gate(page)
  await expect(dialog).toBeVisible({ timeout: 30_000 })
  await expect(page.getByText(displayName)).toHaveCount(0)
  await dialog.getByLabel('Authenticator code').fill('000000')
  await dialog.getByRole('button', { name: 'Verify and enter' }).click()
  await expect(dialog.getByText(/The code was not accepted/)).toBeVisible({ timeout: 30_000 })
  await expect(page.getByText(displayName)).toHaveCount(0)
  await dialog.getByRole('button', { name: 'Back to dashboard' }).click()
  await expect(page).toHaveURL(/\/dashboard$/)
})

test('Project Officer opens a record from the directory by keyboard and returns to it', async ({
  page,
}) => {
  test.setTimeout(120_000)
  await signIn(page, seedAccounts.PO)
  await staleStepUp(page)
  await page.goto('/beneficiaries')
  await verifyStepUp(page, seedAccounts.PO)
  const row = page.getByRole('link', { name: `Open ${displayName}` })
  await expect(row).toBeVisible({ timeout: 30_000 })
  await page.getByLabel('Search by name or code').fill(code)
  await row.focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('heading', { name: displayName, level: 1 })).toBeVisible({
    timeout: 30_000,
  })
  await expect(page.getByRole('tab', { name: 'Journey tracking' })).toBeVisible()
  await expect(page.getByRole('tab', { name: 'Media proof' })).toBeVisible()
  await expect(page.getByRole('tab', { name: 'Participation history' })).toBeVisible()
  await page.getByRole('link', { name: 'Back to Beneficiaries' }).click()
  await expect(page).toHaveURL(new RegExp(`/beneficiaries\\?.*q=${code}`))
  await expect(page.getByLabel('Search by name or code')).toHaveValue(code)
})

test('Project Manager resumes a direct record link after step-up and picks a stage inline', async ({
  page,
}) => {
  test.setTimeout(120_000)
  await signIn(page, seedAccounts.PM)
  await staleStepUp(page)
  await page.goto(`/beneficiaries/${beneficiaryId}?projectId=${projectId}`)
  await expect(page.getByText(displayName)).toHaveCount(0)
  await verifyStepUp(page, seedAccounts.PM)
  await expect(page.getByRole('heading', { name: displayName, level: 1 })).toBeVisible({
    timeout: 30_000,
  })
  await page.getByRole('tab', { name: 'Participation history' }).click()
  await expect(page.getByRole('tabpanel')).toBeVisible()
  await page.getByRole('tab', { name: 'Journey tracking' }).click()
  // Earlier seeded stages lock later ones, so pick the first unlocked stage.
  const stage = page.locator('button[aria-controls^="journey-stage-detail-"]:not([disabled])').first()
  await stage.click()
  await expect(stage).toHaveAttribute('aria-expanded', 'true')
  await expect(page.getByRole('dialog')).toHaveCount(0)
})

test('Project Officer sees no record while the step-up check is unavailable, then recovers on retry', async ({
  page,
}) => {
  test.setTimeout(120_000)
  await signIn(page, seedAccounts.PO)
  let down = true
  await page.route('**/auth/step-up/status', (route) =>
    down ? route.abort('failed') : route.continue(),
  )
  await page.goto('/beneficiaries')
  await expect(
    page.getByRole('heading', { name: 'Beneficiary verification unavailable' }),
  ).toBeVisible({ timeout: 30_000 })
  await expect(page.getByText(displayName)).toHaveCount(0)
  down = false
  await page.getByRole('button', { name: 'Retry verification check' }).click()
  await expect(page.getByRole('link', { name: `Open ${displayName}` })).toBeVisible({
    timeout: 30_000,
  })
})
