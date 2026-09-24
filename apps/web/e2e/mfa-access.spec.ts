import { createRequire } from 'node:module'
import path from 'node:path'
import { type Page, expect, test } from '@playwright/test'

// Existing pinned tsx/esbuild toolchain. The actual React components are bundled;
// only navigation, session/provider transport and replies are synthetic.
const requireTool = createRequire(require.resolve('tsx'))
const { build } = requireTool('esbuild')
const userId = '40000000-0000-4000-8000-000000000004'
const organizationId = '30000000-0000-4000-8000-000000000003'
const authUserId = '56ad4c1a-113f-401b-84e8-1d2135f174c1'
const profile = {
  id: authUserId,
  userId,
  organizationId,
  fullName: 'Synthetic user',
  roles: ['PROJECT_OFFICER'],
  permissions: ['projects.read'],
  assignedProjectIds: [],
  aal: 'aal2',
}
const workspace = { userId, organizationId, displayName: 'Synthetic workspace' }
let component: string

test.beforeAll(async () => {
  const fixture = path.resolve(__dirname, 'fixtures/mfa-access.tsx')
  const output = await build({
    stdin: {
      contents: `import { createRoot } from 'react-dom/client';
        import { StrictMode, useEffect, useState } from 'react';
        import { useFormRevision, usePathname } from './fixtures/mfa-access';
        import { CurrentRoleProvider } from '../src/providers/current-role-provider';
        import { MfaForm } from '../src/features/auth/mfa-form';
        import { ProtectedRoute } from '../src/components/layout/protected-route';
        import { AppShell } from '../src/components/layout/app-shell';
        const routeReads = {
          '/dashboard': ['/api/projects', '/api/dashboards/monitoring'],
          '/projects': ['/api/projects'],
          '/analytics': [
            '/api/projects',
            '/api/dashboards/monitoring',
            '/api/activities?projectId=synthetic',
            '/api/dashboards/saddd?projectId=synthetic',
          ],
        };
        function ProtectedFixtureData({ path }) {
          const [settled, setSettled] = useState(false);
          useEffect(() => {
            const controller = new AbortController();
            setSettled(false);
            Promise.all((routeReads[path] ?? []).map((endpoint) =>
              fetch('http://127.0.0.1:4000' + endpoint, { signal: controller.signal }),
            )).then(() => setSettled(true), () => undefined);
            return () => controller.abort();
          }, [path]);
          return <><h1>Protected fixture data</h1><output data-testid="route-reads">
            {settled ? 'settled' : 'loading'}
          </output></>;
        }
        function Screen() {
          const revision = useFormRevision(); const path = usePathname();
          return path === '/auth/mfa' ? <MfaForm key={revision} /> :
            <AppShell><ProtectedRoute><ProtectedFixtureData key={path} path={path} /></ProtectedRoute></AppShell>;
        }
        createRoot(document.getElementById('root')).render(<StrictMode><CurrentRoleProvider><Screen /></CurrentRoleProvider></StrictMode>);`,
      resolveDir: __dirname,
      loader: 'tsx',
    },
    bundle: true,
    write: false,
    platform: 'browser',
    jsx: 'automatic',
    define: { 'process.env.NODE_ENV': '"test"' },
    tsconfig: path.resolve(__dirname, '../tsconfig.json'),
    alias: {
      ...Object.fromEntries(
        [
          '@/hooks/use-session',
          '@/lib/supabase/client',
          '@/lib/env',
          'next/navigation',
          'next/link',
        ].map((name) => [name, fixture]),
      ),
      'next/image': path.resolve(__dirname, 'fixtures/image.tsx'),
    },
  })
  component = output.outputFiles[0].text
})

type State = {
  aal: 'aal1' | 'aal2'
  applicationAccessEnabled: boolean
  status: number
  profileStatus: number
  routeStatus: number
  workspaces: unknown[]
  currentProfile: typeof profile
  counts: { mfa: number; discovery: number; profile: number; route: number }
  domainCounts: Record<string, number>
  profileWait: Promise<void> | null
  discoveryWait: Promise<void> | null
}
const headers = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' }
async function mount(page: Page, overrides: Partial<State> = {}) {
  const state: State = {
    aal: 'aal2',
    applicationAccessEnabled: true,
    status: 200,
    profileStatus: 200,
    routeStatus: 200,
    workspaces: [workspace],
    currentProfile: profile,
    counts: { mfa: 0, discovery: 0, profile: 0, route: 0 },
    domainCounts: {},
    profileWait: null,
    discoveryWait: null,
    ...overrides,
  }
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url())
    if (url.origin === 'http://127.0.0.1:3000' && url.pathname === '/component-fixture')
      return route.fulfill({ contentType: 'text/html', body: '<div id="root"></div>' })
    if (url.origin === 'http://127.0.0.1:3000' && url.pathname === '/workspace')
      return route.fulfill({
        contentType: 'text/html',
        body: '<h1>Document retry reached workspace fixture</h1>',
      })
    if (url.origin !== 'http://127.0.0.1:4000') return route.abort()
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers })
    if (url.pathname === '/api/auth/mfa/status') {
      state.counts.mfa++
      return route.fulfill({
        status: 200,
        headers,
        json: {
          authUserId,
          aal: state.aal,
          enrollmentAllowed: true,
          applicationAccessEnabled: state.applicationAccessEnabled,
        },
      })
    }
    if (url.pathname === '/api/auth/workspaces') {
      state.counts.discovery++
      expect(route.request().headers()['x-pathways-user-id']).toBeUndefined()
      if (state.discoveryWait) await state.discoveryWait
      return route.fulfill({
        status: state.status,
        headers,
        json:
          state.status === 200
            ? { authUserId, workspaces: state.workspaces }
            : { message: 'PRIVATE_DO_NOT_RENDER' },
      })
    }
    if (url.pathname === '/api/auth/me') {
      state.counts.profile++
      expect(route.request().headers()['x-pathways-user-id']).toBe(userId)
      expect(route.request().headers()['x-pathways-organization-id']).toBe(organizationId)
      if (state.profileWait) await state.profileWait
      return route.fulfill({
        status: state.profileStatus,
        headers,
        json: { user: state.currentProfile },
      })
    }
    if (url.pathname === '/api/access/route-check') {
      state.counts.route++
      return route.fulfill({
        status: state.routeStatus,
        headers,
        json:
          state.routeStatus === 200
            ? {
                route: url.searchParams.get('route'),
                authorization: 'database-verified',
                beneficiaryAccess: 'records-or-none',
              }
            : { message: 'PRIVATE_DO_NOT_RENDER' },
      })
    }
    if (
      [
        '/api/projects',
        '/api/dashboards/monitoring',
        '/api/activities',
        '/api/dashboards/saddd',
      ].includes(url.pathname)
    ) {
      state.domainCounts[url.pathname] = (state.domainCounts[url.pathname] ?? 0) + 1
      return route.fulfill({ status: 200, headers, json: {} })
    }
    return route.abort()
  })
  await page.goto('/component-fixture')
  await page.addScriptTag({ content: component })
  return state
}
const change = (page: Page, detail: Record<string, unknown>) =>
  page.evaluate(
    (value) => window.dispatchEvent(new CustomEvent('fixture-state', { detail: value })),
    detail,
  )
const handoffs = (page: Page) =>
  page.locator('meta[name="fixture-navigation"][content="/workspace"]')
const ready = (page: Page) => page.getByText('Opening your dashboard...')
const cookie = async (page: Page) =>
  (await page.context().cookies()).find((item) => item.name === 'pathways-context')
const recheck = (page: Page) => page.getByRole('button', { name: 'Recheck securely' }).click()
const restorePage = (page: Page) =>
  page.evaluate(() => {
    window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }))
  })

test('initial bootstrap has one routine MFA owner even under React StrictMode', async ({
  page,
}) => {
  const state = await mount(page)
  await expect(ready(page)).toBeVisible()
  expect(state.counts).toEqual({ mfa: 1, discovery: 1, profile: 1, route: 0 })
  await expect(handoffs(page)).toHaveCount(1)
  expect(await cookie(page)).toBeDefined()
})

test('ordinary interaction and focus do not revalidate; restoration and reconnect stay bounded', async ({
  page,
}) => {
  const state = await mount(page)
  await expect(ready(page)).toBeVisible()
  await change(page, { path: '/dashboard' })
  await expect(page.getByRole('heading', { name: 'Protected fixture data' })).toBeVisible()
  await expect(page.getByTestId('route-reads')).toHaveText('settled')
  const beforeInteraction = { ...state.counts }
  await page.getByRole('button', { name: 'Collapse sidebar' }).click()
  await page.evaluate(() => {
    window.dispatchEvent(new Event('focus'))
    document.dispatchEvent(new Event('visibilitychange'))
  })
  await page.waitForTimeout(50)
  expect(state.counts).toEqual(beforeInteraction)
  let release: () => void = () => undefined
  state.profileWait = new Promise<void>((resolve) => {
    release = resolve
  })
  await restorePage(page)
  await expect.poll(() => state.counts.profile).toBe(2)
  expect(state.counts.mfa).toBe(1)
  expect(state.counts.discovery).toBe(1)
  await expect(page.getByRole('heading', { name: 'Protected fixture data' })).toBeVisible()
  release()
  await expect.poll(() => state.counts.route).toBe(beforeInteraction.route + 1)
  await expect(page.getByRole('heading', { name: 'Protected fixture data' })).toBeVisible()
  await page.evaluate(() => window.dispatchEvent(new Event('online')))
  await expect.poll(() => state.counts.profile).toBe(3)
  expect(state.counts.mfa).toBe(1)
  expect(state.counts.discovery).toBe(1)
})

test('dashboard, projects and analytics reads stay bounded through 30-second idle windows', async ({
  page,
}) => {
  await page.clock.install()
  const state = await mount(page, {
    currentProfile: {
      ...profile,
      roles: ['SYSTEM_ADMINISTRATOR'],
      permissions: ['projects.read', 'analytics.read'],
    },
  })
  await expect(ready(page)).toBeVisible()

  for (const path of ['/dashboard', '/projects', '/analytics', '/dashboard']) {
    await change(page, { path })
    await expect(page.getByRole('heading', { name: 'Protected fixture data' })).toBeVisible()
    await expect(page.getByTestId('route-reads')).toHaveText('settled')
    const before = {
      profile: state.counts.profile,
      route: state.counts.route,
      domain: { ...state.domainCounts },
    }
    await page.clock.runFor(30_100)
    expect({
      profile: state.counts.profile,
      route: state.counts.route,
      domain: { ...state.domainCounts },
    }).toEqual(before)
  }
})

test('same token session-object replacement does not restart discovery', async ({ page }) => {
  const state = await mount(page)
  await expect(ready(page)).toBeVisible()
  await change(page, {
    session: { access_token: 'component-fixture-not-a-real-token', user: { id: authUserId } },
  })
  await expect(ready(page)).toBeVisible()
  expect(state.counts.mfa).toBe(1)
  expect(state.counts.discovery).toBe(1)
  expect(state.counts.profile).toBe(1)
})

test('token refresh uses the new token and a fresh /me, not old profile authority', async ({
  page,
}) => {
  const state = await mount(page)
  await expect(ready(page)).toBeVisible()
  await change(page, {
    session: { access_token: 'refreshed-synthetic-token', user: { id: authUserId } },
  })
  await expect.poll(() => state.counts.profile).toBe(2)
  await expect(ready(page)).toBeVisible()
  expect(state.counts.discovery).toBe(1)
  expect(state.counts.mfa).toBe(1)
})

test('a profile outage hides protected content but preserves selectors for retry', async ({
  page,
}) => {
  await page.clock.install()
  const state = await mount(page)
  await expect(ready(page)).toBeVisible()
  state.profileStatus = 503
  await restorePage(page)
  await expect(page.getByRole('alert')).toContainText('temporarily unavailable')
  await expect(ready(page)).toHaveCount(0)
  expect(await cookie(page)).toBeDefined()
  const failedRequestCount = state.counts.profile
  await page.clock.runFor(60_100)
  expect(state.counts.profile).toBe(failedRequestCount)
  await expect(page.getByRole('alert')).toContainText('temporarily unavailable')
  state.profileStatus = 200
  await recheck(page)
  await expect(ready(page)).toBeVisible()
  expect(state.counts.discovery).toBe(1)
  expect(state.counts.mfa).toBe(1)
})

test('confirmed profile revocation clears selectors without asking for a new MFA code', async ({
  page,
}) => {
  const state = await mount(page)
  await expect(ready(page)).toBeVisible()
  state.profileStatus = 403
  await restorePage(page)
  await expect(page.getByRole('alert')).toContainText('Access was denied')
  await expect(ready(page)).toHaveCount(0)
  await expect(page.getByLabel('Six-digit authenticator code')).toHaveCount(0)
  expect(await cookie(page)).toBeUndefined()
  expect(state.counts.discovery).toBe(1)
})

test('aal1 stays in the existing authenticator flow without workspace queries', async ({
  page,
}) => {
  const state = await mount(page, { aal: 'aal1' })
  await expect(
    page.getByText('Use your existing authenticator. No new factor will be created.'),
  ).toBeVisible()
  await expect(handoffs(page)).toHaveCount(0)
  expect(state.counts.discovery).toBe(0)
  expect(state.counts.profile).toBe(0)
})

test('zero and ambiguous workspaces do not authorize a first-result fallback', async ({ page }) => {
  const state = await mount(page, { workspaces: [] })
  await expect(page.getByText(/No authorized workspace is available/)).toBeVisible()
  expect(await cookie(page)).toBeUndefined()
  state.workspaces = [workspace, workspace]
  await recheck(page)
  await expect(page.getByRole('alert')).toContainText('temporarily unavailable')
  await expect(handoffs(page)).toHaveCount(0)
})

test('logout during discovery cannot be undone by a late response', async ({ page }) => {
  let release: () => void = () => undefined
  const discoveryWait = new Promise<void>((resolve) => {
    release = resolve
  })
  const state = await mount(page, { discoveryWait })
  await expect.poll(() => state.counts.discovery).toBe(1)
  await page.getByRole('button', { name: 'Sign out and clear this page' }).click()
  release()
  await expect(page.getByRole('link', { name: 'Return to staff login' })).toBeVisible()
  await expect(handoffs(page)).toHaveCount(0)
  expect(await cookie(page)).toBeUndefined()
})

test('a different subject cannot inherit the previous account profile', async ({ page }) => {
  await mount(page)
  await expect(ready(page)).toBeVisible()
  await change(page, { session: { access_token: 'different-token', user: { id: userId } } })
  await expect(page.getByRole('alert')).toContainText('Access was denied')
  await expect(ready(page)).toHaveCount(0)
  expect(await cookie(page)).toBeUndefined()
})

test('page restoration revalidates behind the mounted verified UI', async ({ page }) => {
  const state = await mount(page)
  await expect(ready(page)).toBeVisible()
  await change(page, { path: '/dashboard' })
  await expect(page.getByRole('heading', { name: 'Protected fixture data' })).toBeVisible()
  await expect(page.getByTestId('route-reads')).toHaveText('settled')
  const initialRouteChecks = state.counts.route
  let release: () => void = () => undefined
  state.profileWait = new Promise<void>((resolve) => {
    release = resolve
  })
  await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pagehide')))
  await expect(page.getByRole('heading', { name: 'Protected fixture data' })).toBeVisible()
  await restorePage(page)
  await expect.poll(() => state.counts.profile).toBe(2)
  expect(state.counts.route).toBe(initialRouteChecks)
  await expect(page.getByRole('heading', { name: 'Protected fixture data' })).toBeVisible()
  release()
  await expect.poll(() => state.counts.route).toBe(initialRouteChecks + 1)
  await expect(page.getByRole('heading', { name: 'Protected fixture data' })).toBeVisible()
})

test('MFA remount preserves the bounded attempt and offers a native document retry', async ({
  page,
}) => {
  await mount(page)
  await expect(handoffs(page)).toHaveCount(1)
  await change(page, { remount: true })
  await expect(page.getByRole('alert')).toContainText('workspace could not open')
  await expect(handoffs(page)).toHaveCount(1)
  await page.getByRole('link', { name: 'Retry opening workspace' }).click()
  await expect(
    page.getByRole('heading', { name: 'Document retry reached workspace fixture' }),
  ).toBeVisible()
})

test('timeout shows explicit recovery instead of automatically retrying navigation', async ({
  page,
}) => {
  await page.clock.install()
  await mount(page)
  await expect(handoffs(page)).toHaveCount(1)
  await page.clock.runFor(30_100)
  await expect(page.getByRole('alert')).toContainText('workspace could not open')
  await page.clock.runFor(30_100)
  await expect(handoffs(page)).toHaveCount(1)
})

test('successful entry releases the latch; sidebar state survives ordinary navigation', async ({
  page,
}) => {
  const state = await mount(page)
  await expect(handoffs(page)).toHaveCount(1)
  await change(page, { path: '/dashboard' })
  await expect(page.getByRole('heading', { name: 'Protected fixture data' })).toBeVisible()
  await page.getByRole('button', { name: 'Collapse sidebar' }).click()
  await change(page, { path: '/projects' })
  await expect(page.getByRole('heading', { name: 'Protected fixture data' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Expand sidebar' })).toBeVisible()
  expect(state.counts.mfa).toBe(1)
  expect(state.counts.discovery).toBe(1)
  await change(page, { path: '/auth/mfa' })
  await expect(handoffs(page)).toHaveCount(2)
})

test('route-check outage keeps the shell and context, but no protected page content', async ({
  page,
}) => {
  const state = await mount(page)
  await expect(handoffs(page)).toHaveCount(1)
  await change(page, { path: '/dashboard' })
  await expect(page.getByRole('heading', { name: 'Protected fixture data' })).toBeVisible()
  state.routeStatus = 503
  await change(page, { path: '/projects' })
  await expect(page.getByRole('heading', { name: 'Access verification unavailable' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Protected fixture data' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Collapse sidebar' })).toBeVisible()
  expect(await cookie(page)).toBeDefined()
  await expect(handoffs(page)).toHaveCount(1)
})
