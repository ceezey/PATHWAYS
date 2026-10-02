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

test.skip(!hasLocalDb, 'Local Supabase database container is not running')

test.describe.configure({ mode: 'serial' })

let actors: Record<string, Actor> = {}
let projectId = ''
let activityId = ''
let activityTitle = ''

test.beforeAll(async () => {
  test.setTimeout(120_000)
  actors = await loadActors(Object.values(seedAccounts))
  projectId = ownerQuery(
    `SELECT p.id FROM pathways.projects p JOIN pathways.user_project_assignments a ON a.project_id=p.id JOIN pathways.system_users u ON u.id=a.user_id WHERE u.email='${managerEmail}' LIMIT 1`,
  )
  expect(projectId).toMatch(/^[0-9a-f-]{36}$/)
  const officerId = ownerQuery(`SELECT id FROM pathways.system_users WHERE email='${officerEmail}'`)
  const managerId = ownerQuery(`SELECT id FROM pathways.system_users WHERE email='${managerEmail}'`)
  const organizationId = ownerQuery(
    `SELECT organization_id FROM pathways.projects WHERE id='${projectId}'`,
  )

  // Fixture: a fresh open activity per run assigned to the Project Officer, so proof submission is repeatable.
  activityTitle = `E2E workflow proof ${runTag}`
  const created = await fetch(`${api}/projects/${projectId}/activities`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${actors[managerEmail]?.token}`,
      'x-pathways-organization-id': organizationId,
      'x-pathways-user-id': managerId,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      clientMutationId: randomUUID(),
      code: `E2E-WF-${runTag}`,
      title: activityTitle,
      plannedStartDate: '2026-10-01',
      plannedEndDate: '2026-12-31',
      assignedUserIds: [officerId],
    }),
  })
  expect(created.status, await created.clone().text()).toBeLessThan(300)
  const { updatedAt } = (await created.json()) as { updatedAt: string }
  activityId = ownerQuery(
    `SELECT id FROM pathways.project_activities WHERE project_id='${projectId}' AND title='${activityTitle}'`,
  )
  // Proof is accepted only for in-progress activities, so the assigned officer starts it through the API.
  const started = await fetch(`${api}/projects/${projectId}/activities/${activityId}/transition`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${actors[officerEmail]?.token}`,
      'x-pathways-organization-id': organizationId,
      'x-pathways-user-id': officerId,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      clientMutationId: randomUUID(),
      status: 'IN_PROGRESS',
      expectedUpdatedAt: updatedAt,
    }),
  })
  expect(started.status, await started.clone().text()).toBeLessThan(300)
})

const signIn = (page: Page, email: string) => realSignIn(page, email, actors)

test('Project Officer submits an update and proof', async ({ page }) => {
  test.setTimeout(120_000)
  await signIn(page, officerEmail)
  await page.goto(`/projects/${projectId}/activities/${activityId}`)
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
  const title = `E2E created activity ${runTag}`
  await signIn(page, managerEmail)
  await page.goto(`/projects/${projectId}/activities`)
  const newActivity = page.getByRole('button', { name: 'New Activity' })
  await expect(newActivity).toBeVisible({ timeout: 30_000 })
  await newActivity.click()
  const dialog = page.getByRole('dialog', { name: 'Create activity' })
  await dialog.getByLabel('Activity title').fill(title)
  await dialog.getByLabel('Description').fill('Created by the workflows e2e spec.')
  await dialog.getByLabel('Start date').fill('2026-10-05')
  await dialog.getByLabel('Due date').fill('2026-11-30')
  await dialog.getByRole('group', { name: /Assigned officers/ }).getByRole('checkbox').first().check()
  await dialog.getByRole('button', { name: 'Create Activity' }).click()
  await expect(dialog).toBeHidden({ timeout: 30_000 })
  // The list view may not show the new row yet, so confirm persistence in the database.
  await expect
    .poll(() =>
      ownerQuery(
        `SELECT count(*) FROM pathways.project_activities WHERE project_id='${projectId}' AND title='${title}'`,
      ),
    )
    .toBe('1')
})

for (const key of ['PG', 'GM'] as const) {
  test(`${key} reads activities without create, edit or archive`, async ({ page }) => {
    test.setTimeout(120_000)
    await signIn(page, seedAccounts[key])
    await page.goto(`/projects/${projectId}/activities`)
    await expect(page.getByRole('article', { name: `Activity: ${activityTitle}` })).toBeVisible({
      timeout: 30_000,
    })
    for (const name of [/New Activity/, /Edit activity/, /Archive/, /Submit Update & Proof/]) {
      await expect(page.getByRole('button', { name })).toHaveCount(0)
    }
  })
}
