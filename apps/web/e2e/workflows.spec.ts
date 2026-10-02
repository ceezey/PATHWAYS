import { randomUUID } from 'node:crypto'
import { type Page, expect, test } from '@playwright/test'
import {
  type Actor,
  hasLocalDb,
  loadActors,
  ownerQuery,
  signIn as realSignIn,
  seedAccounts,
} from './fixtures/real-sign-in'

const api = process.env.PATHWAYS_LOCAL_API_URL ?? 'http://127.0.0.1:4000/api'
const officerEmail = seedAccounts.PO
const managerEmail = seedAccounts.PM
const runTag = Date.now().toString(36)
const day = (offset: number) =>
  new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10)
const sharedTitle = 'E2E workflow shared'

test.skip(!hasLocalDb, 'Local Supabase database container is not running')

test.describe.configure({ mode: 'serial' })

let actors: Record<string, Actor> = {}
let projectId = ''
let officerId = ''
let managerId = ''
let organizationId = ''
let sharedId = ''

const headers = (email: string, userId: string) => ({
  Authorization: `Bearer ${actors[email]?.token}`,
  'x-pathways-organization-id': organizationId,
  'x-pathways-user-id': userId,
  'Content-Type': 'application/json',
})

// Activities must end within the project period, so cap the planned end at the project end date.
const plannedEnd = () => {
  const end = ownerQuery(`SELECT end_date FROM pathways.projects WHERE id='${projectId}'`)
  return end && end < day(30) ? end : day(30)
}

const activityIdByTitle = (title: string) =>
  ownerQuery(
    `SELECT id FROM pathways.project_activities WHERE project_id='${projectId}' AND title='${title}'`,
  )

// Creates an activity assigned to the officer through the API and starts it, as proof needs IN_PROGRESS.
const seedStartedActivity = async (title: string, code: string) => {
  const created = await fetch(`${api}/projects/${projectId}/activities`, {
    method: 'POST',
    headers: headers(managerEmail, managerId),
    body: JSON.stringify({
      clientMutationId: randomUUID(),
      code,
      title,
      plannedStartDate: day(-1),
      plannedEndDate: plannedEnd(),
      assignedUserIds: [officerId],
    }),
  })
  expect(created.status, await created.clone().text()).toBeLessThan(300)
  const { updatedAt } = (await created.json()) as { updatedAt: string }
  const id = activityIdByTitle(title)
  const started = await fetch(`${api}/projects/${projectId}/activities/${id}/transition`, {
    method: 'POST',
    headers: headers(officerEmail, officerId),
    body: JSON.stringify({
      clientMutationId: randomUUID(),
      status: 'IN_PROGRESS',
      expectedUpdatedAt: updatedAt,
    }),
  })
  expect(started.status, await started.clone().text()).toBeLessThan(300)
  return id
}

test.beforeAll(async () => {
  test.setTimeout(120_000)
  actors = await loadActors(Object.values(seedAccounts))
  projectId = ownerQuery(
    `SELECT p.id FROM pathways.projects p JOIN pathways.user_project_assignments a ON a.project_id=p.id JOIN pathways.system_users u ON u.id=a.user_id WHERE u.email='${managerEmail}' ORDER BY p.id LIMIT 1`,
  )
  expect(projectId).toMatch(/^[0-9a-f-]{36}$/)
  officerId = ownerQuery(`SELECT id FROM pathways.system_users WHERE email='${officerEmail}'`)
  managerId = ownerQuery(`SELECT id FROM pathways.system_users WHERE email='${managerEmail}'`)
  organizationId = ownerQuery(
    `SELECT organization_id FROM pathways.projects WHERE id='${projectId}'`,
  )
  // Shared read-only fixture for PG and GM, created only if missing.
  sharedId = activityIdByTitle(sharedTitle)
  if (!sharedId) sharedId = await seedStartedActivity(sharedTitle, 'E2E-WF-SHARED')
})

const signIn = (page: Page, email: string) => realSignIn(page, email, actors)

// Rows accumulate by design: the local database is disposable (pnpm db:local:reset).
test('Project Officer submits an update and proof', async ({ page }) => {
  test.setTimeout(120_000)
  const id = await seedStartedActivity(`E2E workflow proof ${runTag}`, `E2E-WF-P-${runTag}`)
  await signIn(page, officerEmail)
  await page.goto(`/projects/${projectId}/activities/${id}`)
  await page.getByRole('button', { name: 'Submit Update & Proof' }).click()
  const dialog = page.getByRole('dialog', { name: 'Submit proof' })
  await dialog.getByLabel('Beneficiaries reached this session').fill('5')
  await dialog.getByLabel('Progress (%)').fill('50')
  await dialog.getByLabel('Narrative Notes').fill('Workshop delivered with attendance sheet.')
  await dialog.getByLabel('Upload proof of conduct').setInputFiles({
    name: 'e2e-proof.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('%PDF-1.4 e2e fixture'),
  })
  await dialog.getByRole('button', { name: 'Submit proof' }).click()
  await expect(dialog).toBeHidden({ timeout: 30_000 })
  await expect(page.getByText('Proof v1 · Submitted')).toBeVisible()
})

test('Project Manager creates an activity', async ({ page }) => {
  test.setTimeout(120_000)
  const title = `E2E workflow created ${runTag}`
  await signIn(page, managerEmail)
  await page.goto(`/projects/${projectId}/activities`)
  const newActivity = page.getByRole('button', { name: 'New Activity' })
  await expect(newActivity).toBeVisible({ timeout: 30_000 })
  await newActivity.click()
  const dialog = page.getByRole('dialog', { name: 'Create activity' })
  await dialog.getByLabel('Activity title').fill(title)
  await dialog.getByLabel('Description').fill('Created by the workflows e2e spec.')
  await dialog.getByLabel('Start date').fill(day(1))
  await dialog.getByLabel('Due date').fill(plannedEnd())
  await dialog
    .getByRole('group', { name: /Assigned officers/ })
    .getByRole('checkbox')
    .first()
    .check()
  await dialog.getByRole('button', { name: 'Create Activity' }).click()
  await expect(dialog).toBeHidden({ timeout: 30_000 })
  // The new activity opens its detail panel, which makes the list behind it inert.
  await expect(page.getByRole('dialog', { name: title })).toBeVisible({ timeout: 30_000 })
})

for (const key of ['PG', 'GM'] as const) {
  test(`${key} reads activities without create or edit`, async ({ page }) => {
    test.setTimeout(120_000)
    await signIn(page, seedAccounts[key])
    await page.goto(`/projects/${projectId}/activities`)
    await expect(
      page.getByRole('article', {
        name: `Activity: ${sharedTitle}`,
        exact: true,
      }),
    ).toBeVisible({
      timeout: 30_000,
    })
    for (const name of [/New Activity/, /Edit activity/, /Submit Update & Proof/]) {
      await expect(page.getByRole('button', { name })).toHaveCount(0)
    }
  })
}
