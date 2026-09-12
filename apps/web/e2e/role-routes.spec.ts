import { createRequire } from 'node:module'
import path from 'node:path'
import { type Page, expect, test } from '@playwright/test'
import {
  type CanonicalRole,
  rolePermissions,
} from '../../api/src/modules/auth/authorization-policy'
const requireTool = createRequire(require.resolve('tsx'))
const { build } = requireTool('esbuild')
let component: string
const id = '10000000-0000-4000-8000-000000000001'
const profile = (role: CanonicalRole) => ({
  id,
  userId: id,
  organizationId: id,
  aal: 'aal2',
  fullName: 'Synthetic developer',
  roles: [role],
  permissions: [...rolePermissions[role]],
  assignedProjectIds: [id],
})
test.beforeAll(async () => {
  const fixture = path.resolve(__dirname, 'fixtures/role-routes.tsx')
  const result = await build({
    stdin: {
      contents: `import { createRoot } from 'react-dom/client'; import { ProtectedRoute, FeatureDirectory } from '../src/components/layout/protected-route'; createRoot(document.getElementById('root')).render(<ProtectedRoute><h1>Protected fixture content</h1><FeatureDirectory /></ProtectedRoute>);`,
      resolveDir: __dirname,
      loader: 'tsx',
    },
    bundle: true,
    write: false,
    platform: 'browser',
    jsx: 'automatic',
    define: { 'process.env.NODE_ENV': '"test"' },
    tsconfig: path.resolve(__dirname, '../tsconfig.json'),
    alias: Object.fromEntries(
      [
        '@/hooks/use-session',
        '@/hooks/use-current-role',
        '@/lib/env',
        'next/navigation',
        'next/link',
      ].map((name) => [name, fixture]),
    ),
  })
  component = result.outputFiles[0].text
})
async function change(page: Page, detail: Record<string, unknown>) {
  await page.evaluate(
    (detail) => window.dispatchEvent(new CustomEvent('fixture-state', { detail })),
    detail,
  )
}
async function mount(page: Page, role: CanonicalRole = 'SYSTEM_ADMINISTRATOR') {
  const state = { status: 200, count: 0, wait: null as Promise<void> | null }
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url())
    if (url.pathname === '/fixture')
      return route.fulfill({ contentType: 'text/html', body: '<div id="root"></div>' })
    if (url.origin === 'http://127.0.0.1:4000' && url.pathname === '/api/access/route-check') {
      if (route.request().method() === 'OPTIONS')
        return route.fulfill({
          status: 204,
          headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' },
        })
      state.count++
      if (state.wait) await state.wait
      return route.fulfill({
        status: state.status,
        headers: { 'access-control-allow-origin': '*' },
        json:
          state.status === 200
            ? {
                route: url.searchParams.get('route'),
                presentation: 'prototype-only',
                beneficiaryAccess: 'records-or-none',
              }
            : { message: 'private-provider-detail-must-not-render' },
      })
    }
    return route.abort()
  })
  await page.goto('/fixture')
  await page.addScriptTag({ content: component })
  await change(page, { profile: profile(role) })
  await expect(page.getByRole('heading', { name: 'Protected fixture content' })).toBeVisible()
  return state
}
// All thirteen canonical features, with independent expected role sets.
const entries = [
  ['/dashboard', 'SPGJEO'],
  ['/projects', 'SPGJEO'],
  ['/beneficiaries', 'SJEO'],
  [`/beneficiaries/${id}`, 'SJEO'],
  ['/collection/forms', 'SPJEO'],
  ['/collection/import', 'SPJEO'],
  [`/projects/${id}/monitor-evaluate`, 'SPJE'],
  ['/analytics', 'SPGJEO'],
  ['/analytics', 'SPGJEO'],
  ['/alerts/repository', 'SPJE'],
  ['/recommendations', 'SPJ'],
  ['/reports', 'SPGJEO'],
] as const
const roleCodes: Record<CanonicalRole, string> = {
  SYSTEM_ADMINISTRATOR: 'S',
  PROGRAM_MANAGER: 'P',
  GRANT_MANAGER: 'G',
  PROJECT_MANAGER: 'J',
  MONITORING_AND_EVALUATION_OFFICER: 'E',
  PROJECT_OFFICER: 'O',
}
for (const role of Object.keys(roleCodes) as CanonicalRole[]) {
  test(`${role}: feature navigation and independent direct-route decisions`, async ({ page }) => {
    await mount(page, role)
    const identityLinks = page.getByRole('link', {
      name: 'Centralized Beneficiary Profile',
      exact: true,
    })
    if ('SJEO'.includes(roleCodes[role])) await expect(identityLinks).toBeVisible()
    else await expect(identityLinks).toHaveCount(0)
    await expect(
      page.getByRole('link', { name: 'Public Project Tracker for Donors', exact: true }),
    ).toBeVisible()
    for (const [pathname, roles] of entries) {
      await change(page, { path: pathname })
      if (roles.includes(roleCodes[role])) {
        await expect(page.getByRole('heading', { name: 'Protected fixture content' })).toBeVisible()
        await expect(
          page.getByText('Prototype-only · Backend pending', { exact: true }),
        ).toBeVisible()
      } else {
        await expect(page.getByRole('heading', { name: 'Unauthorized access' })).toBeVisible()
        await expect(page.getByRole('heading', { name: 'Protected fixture content' })).toHaveCount(
          0,
        )
      }
    }
  })
}
test('server revocation, outage recovery and session expiry remove content without private errors', async ({
  page,
}) => {
  const state = await mount(page)
  state.status = 403
  await page.evaluate(() => window.dispatchEvent(new Event('focus')))
  await expect(page.getByRole('heading', { name: 'Unauthorized access' })).toBeVisible()
  state.status = 503
  await page.evaluate(() => window.dispatchEvent(new Event('focus')))
  await expect(page.getByRole('heading', { name: 'Access verification unavailable' })).toBeVisible()
  await expect(page.getByText('private-provider-detail-must-not-render')).toHaveCount(0)
  state.status = 200
  await page.getByRole('button', { name: 'Retry secure access' }).click()
  await expect(page.getByRole('heading', { name: 'Protected fixture content' })).toBeVisible()
  state.status = 401
  await page.evaluate(() => window.dispatchEvent(new Event('focus')))
  await expect(page.getByRole('heading', { name: 'Session expired' })).toBeVisible()
})
test('pagehide/pageshow, history, project revocation, logout and user switch fail closed', async ({
  page,
}) => {
  await mount(page, 'PROJECT_OFFICER')
  await page.evaluate(() => window.dispatchEvent(new Event('pagehide')))
  await expect(page.getByRole('heading', { name: 'Protected fixture content' })).toHaveCount(0)
  await page.evaluate(() => window.dispatchEvent(new Event('pageshow')))
  await expect(page.getByRole('heading', { name: 'Protected fixture content' })).toBeVisible()
  await change(page, {
    path: `/projects/${id}`,
    profile: { ...profile('PROJECT_OFFICER'), assignedProjectIds: [] },
  })
  await expect(page.getByRole('heading', { name: 'Unauthorized access' })).toBeVisible()
  await change(page, { path: '/dashboard' })
  await expect(page.getByRole('heading', { name: 'Protected fixture content' })).toBeVisible()
  await change(page, { token: null })
  await expect(page.getByRole('heading', { name: 'Protected fixture content' })).toHaveCount(0)
  await change(page, {
    token: 'new-synthetic-token',
    subject: '20000000-0000-4000-8000-000000000002',
  })
  await expect(page.getByRole('heading', { name: 'Protected fixture content' })).toHaveCount(0)
})
test('coalesces overlapping focus events and suppresses late results after logout', async ({
  page,
}) => {
  const state = await mount(page)
  let release!: () => void
  state.wait = new Promise<void>((resolve) => {
    release = resolve
  })
  const prior = state.count
  await page.evaluate(() => {
    for (let n = 0; n < 10; n++) window.dispatchEvent(new Event('focus'))
  })
  await expect.poll(() => state.count).toBe(prior + 1)
  await change(page, { token: null, profile: null })
  release()
  await expect(page.getByRole('heading', { name: 'Protected fixture content' })).toHaveCount(0)
})

test('loading, no membership and failed context resolution never flash protected content', async ({
  page,
}) => {
  await mount(page)
  await change(page, { access: 'loading', profile: null })
  await expect(page.getByRole('status')).toHaveText('Verifying MFA and database-backed access...')
  await expect(page.getByRole('heading', { name: 'Protected fixture content' })).toHaveCount(0)
  await change(page, { access: 'no_workspace' })
  await expect(page.getByText('No authorized workspace', { exact: true })).toBeVisible()
  await change(page, { access: 'blocked' })
  await expect(
    page.getByText('Protected access has not been granted', { exact: true }),
  ).toBeVisible()
  await expect(page.getByRole('link', { name: 'Review secure access' })).toBeVisible()
})

test('two tabs independently recheck current server denial', async ({ page, context }) => {
  const first = await mount(page)
  const other = await context.newPage()
  const second = await mount(other)
  first.status = 403
  second.status = 403
  for (const tab of [page, other]) {
    await tab.bringToFront()
    await tab.evaluate(() => window.dispatchEvent(new Event('focus')))
    await expect(tab.getByRole('heading', { name: 'Unauthorized access' })).toBeVisible()
    await expect(tab.getByRole('heading', { name: 'Protected fixture content' })).toHaveCount(0)
  }
  await other.close()
})
