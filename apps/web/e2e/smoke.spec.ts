import { expect, test } from '@playwright/test'
import { type Actor, hasLocalDb, loadActors, seedAccounts, signIn } from './fixtures/real-sign-in'

test.skip(!hasLocalDb, 'Local Supabase database container is not running')

test.describe.configure({ mode: 'serial' })

// Expected primary nav per role, derived from routePolicy and rolePermissions (RBAC v4).
const roles = [
  {
    key: 'SA',
    nav: [
      'Dashboard',
      'Projects',
      'Collection',
      'Analytics',
      'Alerts',
      'Reports',
      'Alerts Repository',
      'Public Tracker',
      'User Management',
      'Audit Log',
      'Backup & Recovery',
    ],
  },
  {
    key: 'PG',
    nav: [
      'Dashboard',
      'Projects',
      'Analytics',
      'Alerts',
      'Reports',
      'Public Tracker',
      'User Management',
      'Audit Log',
    ],
  },
  { key: 'GM', nav: ['Dashboard', 'Projects', 'Analytics', 'Alerts', 'Reports', 'Public Tracker'] },
  {
    key: 'PM',
    nav: [
      'Dashboard',
      'Projects',
      'Beneficiaries',
      'Analytics',
      'Alerts',
      'Reports',
      'Public Tracker',
      'User Management',
      'Audit Log',
    ],
  },
  {
    key: 'ME',
    nav: ['Dashboard', 'Projects', 'Beneficiaries', 'Collection', 'Analytics', 'Alerts', 'Reports'],
  },
  {
    key: 'PO',
    nav: ['Dashboard', 'Projects', 'Beneficiaries', 'Collection', 'Analytics', 'Alerts', 'Reports'],
  },
] as const

const allNav = [...new Set(roles.flatMap((role) => role.nav))]
let actors: Record<string, Actor> = {}

test.beforeAll(async () => {
  test.setTimeout(120_000)
  actors = await loadActors(Object.values(seedAccounts))
})

for (const { key, nav } of roles) {
  test(`${key} lands on the dashboard with exactly its v4 primary nav`, async ({ page }) => {
    test.setTimeout(90_000)
    await signIn(page, seedAccounts[key], actors)
    await page.goto('/dashboard')
    await expect(page).toHaveURL(/\/dashboard$/)
    const sidebar = page.getByRole('navigation', { name: 'Dashboard' }).first()
    for (const name of allNav) {
      await expect(sidebar.getByRole('link', { name, exact: true })).toHaveCount(
        (nav as readonly string[]).includes(name) ? 1 : 0,
      )
    }
  })
}

test('SA opens user management and audit, PO is denied both', async ({ page }) => {
  test.setTimeout(120_000)
  await signIn(page, seedAccounts.SA, actors)
  await page.goto('/settings/users')
  await expect(page.getByRole('heading', { name: 'User Management' })).toBeVisible()
  await page.goto('/settings/audit')
  await expect(page.getByText('Unauthorized access', { exact: true })).toHaveCount(0)
  await page.context().clearCookies()
  await page.evaluate(() => window.localStorage.clear())
  await signIn(page, seedAccounts.PO, actors)
  for (const path of ['/settings/users', '/settings/audit', '/settings/labels']) {
    await page.goto(path)
    await expect(page.getByText('Unauthorized access', { exact: true }).first()).toBeVisible()
  }
})

test('mobile sidebar closes after opening a workspace', async ({ page }) => {
  test.setTimeout(120_000)
  await page.setViewportSize({ width: 390, height: 844 })
  await signIn(page, seedAccounts.PO, actors)
  await page.goto('/dashboard')
  const sidebar = page.getByRole('dialog', { name: 'Workspace navigation' })
  // Wait for the async role label so the click lands after hydration and the sidebar is populated.
  await expect(page.getByText(/^Project Officer · /)).toBeVisible({ timeout: 30_000 })
  await page.getByRole('button', { name: 'Open navigation' }).click()
  const projects = sidebar.getByRole('link', { name: 'Projects', exact: true })
  await expect(projects).toBeVisible({ timeout: 30_000 })
  await projects.click()
  await expect(page).toHaveURL(/\/projects$/, { timeout: 30_000 })
  await expect(sidebar).toBeHidden()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  )
})
