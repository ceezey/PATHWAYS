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
const activityCode = 'E2E-V4-RBAC'
const activityTitle = 'RBAC v4 probe activity'
const officerEmail = seedAccounts.PO
const managerEmail = seedAccounts.PM

test.skip(!hasLocalDb, 'Local Supabase database container is not running')

test.describe.configure({ mode: 'serial' })

let actors: Record<string, Actor> = {}
let projectId = ''
let officerId = ''
let activityId = ''
let managerId = ''
let organizationId = ''

test.beforeAll(async () => {
  test.setTimeout(120_000)
  actors = await loadActors([officerEmail, managerEmail])
  projectId = ownerQuery(
    `SELECT p.id FROM pathways.projects p JOIN pathways.user_project_assignments a ON a.project_id=p.id JOIN pathways.system_users u ON u.id=a.user_id WHERE u.email='${managerEmail}' LIMIT 1`,
  )
  officerId = ownerQuery(`SELECT id FROM pathways.system_users WHERE email='${officerEmail}'`)
  managerId = ownerQuery(`SELECT id FROM pathways.system_users WHERE email='${managerEmail}'`)
  organizationId = ownerQuery(
    `SELECT organization_id FROM pathways.projects WHERE id='${projectId}'`,
  )
  expect(projectId).toMatch(/^[0-9a-f-]{36}$/)

  // Fixture: one open activity assigned to the Project Officer, created once through the API.
  const headers = {
    Authorization: `Bearer ${actors[managerEmail]?.token}`,
    'x-pathways-organization-id': organizationId,
    'x-pathways-user-id': managerId,
  }
  const base = `${api}/projects/${projectId}/activities`
  const existing = await fetch(base, { headers })
  if (!(await existing.text()).includes(activityTitle)) {
    const created = await fetch(base, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clientMutationId: randomUUID(),
        code: activityCode,
        title: activityTitle,
        plannedStartDate: '2026-10-01',
        plannedEndDate: '2026-12-31',
        assignedUserIds: [officerId],
      }),
    })
    expect(created.status, await created.clone().text()).toBeLessThan(300)
  }
  activityId = ownerQuery(
    `SELECT id FROM pathways.project_activities WHERE project_id='${projectId}' AND title='${activityTitle}'`,
  )
})

const signIn = (page: Page, email: string) => realSignIn(page, email, actors)

test('Project Officer: the retired entry route lands on Collection', async ({ page }) => {
  test.setTimeout(90_000)
  await signIn(page, officerEmail)
  await page.goto('/collection/entry')
  await expect(page).toHaveURL(/\/collection$/)
})

test('Project Officer: Collection offers no Encode link', async ({ page }) => {
  test.setTimeout(90_000)
  await signIn(page, officerEmail)
  await page.goto('/collection')
  await expect(page).toHaveURL(/\/collection$/)
  await expect(page.getByRole('link', { name: /Encode/i })).toHaveCount(0)
})

test('Project Officer: no New Activity, but can submit an update and proof', async ({ page }) => {
  test.setTimeout(90_000)
  await signIn(page, officerEmail)
  await page.goto(`/projects/${projectId}/activities`)
  await expect(page.getByRole('article', { name: `Activity: ${activityTitle}` })).toBeVisible()
  await expect(page.getByRole('button', { name: 'New Activity' })).toHaveCount(0)
  // Open the detail route directly; the in-page click races the first workspace load.
  await page.goto(`/projects/${projectId}/activities/${activityId}`)
  await expect(page.getByRole('button', { name: 'Submit Update & Proof' })).toBeVisible()
})

test('Project Manager sees New Activity', async ({ page }) => {
  test.setTimeout(90_000)
  await signIn(page, managerEmail)
  await page.goto(`/projects/${projectId}/activities`)
  await expect(page.getByRole('button', { name: 'New Activity' })).toBeVisible()
})
