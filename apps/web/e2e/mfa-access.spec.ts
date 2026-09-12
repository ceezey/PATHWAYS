import { createRequire } from 'node:module'
import path from 'node:path'
import { expect, test } from '@playwright/test'

// Use the existing tsx toolchain's bundler; no application/test dependency changes.
const requireTool = createRequire(require.resolve('tsx'))
const { build } = requireTool('esbuild')
let component: string
const userId = '40000000-0000-4000-8000-000000000004'
const organizationId = '30000000-0000-4000-8000-000000000003'
const authUserId = '56ad4c1a-113f-401b-84e8-1d2135f174c1'

test.beforeAll(async () => {
  const fixture = path.resolve(__dirname, 'fixtures/mfa-access.tsx')
  const output = await build({
    stdin: {
      contents: `import { createRoot } from 'react-dom/client';
        import { StrictMode } from 'react';
        import { useFormRevision } from './fixtures/mfa-access';
        import { CurrentRoleProvider } from '../src/providers/current-role-provider';
        import { MfaForm } from '../src/features/auth/mfa-form';
        function Screen() { const revision = useFormRevision(); return <MfaForm key={revision} />; }
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
    alias: Object.fromEntries(
      [
        '@/hooks/use-session',
        '@/lib/supabase/client',
        '@/lib/env',
        'next/navigation',
        'next/link',
      ].map((name) => [name, fixture]),
    ),
  })
  component = output.outputFiles[0].text
})

const workspace = { userId, organizationId, displayName: 'Synthetic workspace' }
const profile = {
  id: authUserId,
  userId,
  organizationId,
  fullName: 'Fixture Developer',
  roles: ['PROJECT_OFFICER'],
  permissions: ['projects.read'],
  assignedProjectIds: [],
  aal: 'aal2',
}

async function mount(
  page: import('@playwright/test').Page,
  options: {
    status?: number
    workspaces?: unknown[]
    profile?: typeof profile
    wait?: Promise<void>
    path?: string
    aal?: 'aal1' | 'aal2'
    applicationAccessEnabled?: boolean
    mfaStatus?: number
    profileStatus?: number
    profileWait?: Promise<void>
  } = {},
) {
  const state = {
    status: 200,
    workspaces: [workspace] as unknown[],
    profile,
    requests: 0,
    aal: 'aal2',
    applicationAccessEnabled: true,
    mfaStatus: 200,
    profileStatus: 200,
    ...options,
  }
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url())
    // Every request is intercepted. No Auth, email, live DB or credentials.
    if (url.origin === 'http://127.0.0.1:3000' && url.pathname === '/component-fixture') {
      await route.fulfill({ contentType: 'text/html', body: '<div id="root"></div>' })
    } else if (url.origin === 'http://127.0.0.1:4000' && url.pathname === '/api/auth/mfa/status') {
      await route.fulfill({
        status: state.mfaStatus,
        json: {
          authUserId,
          aal: state.aal,
          enrollmentAllowed: true,
          applicationAccessEnabled: state.applicationAccessEnabled,
        },
      })
    } else if (url.origin === 'http://127.0.0.1:4000' && url.pathname === '/api/auth/workspaces') {
      state.requests++
      expect(route.request().headers()['x-pathways-user-id']).toBeUndefined()
      expect(route.request().headers()['x-pathways-organization-id']).toBeUndefined()
      if (state.wait) await state.wait
      await route.fulfill({
        status: state.status,
        json:
          state.status === 200
            ? { authUserId, prototypeOnly: true, workspaces: state.workspaces }
            : { message: 'private-response-body-must-never-appear' },
      })
    } else if (url.origin === 'http://127.0.0.1:4000' && url.pathname === '/api/auth/me') {
      expect(route.request().headers()['x-pathways-user-id']).toBe(userId)
      expect(route.request().headers()['x-pathways-organization-id']).toBe(organizationId)
      if (state.profileWait) await state.profileWait
      await route.fulfill({ status: state.profileStatus, json: { user: state.profile } })
    } else await route.abort()
  })
  await page.goto('/component-fixture')
  await page.addScriptTag({ content: component })
  if (options.path)
    await page.evaluate(
      (path) => window.dispatchEvent(new CustomEvent('fixture-state', { detail: { path } })),
      options.path,
    )
  return state
}
const ready = (page: import('@playwright/test').Page) => page.getByText('Opening your dashboard...')
const handoffs = (page: import('@playwright/test').Page) =>
  page.locator('meta[name="fixture-navigation"][content="/workspace"]')
const cookie = async (page: import('@playwright/test').Page) =>
  (await page.context().cookies()).find((item) => item.name === 'pathways-context')
const recheck = async (page: import('@playwright/test').Page) =>
  page.getByRole('button', { name: 'Recheck securely' }).click()

test('automatic resolution shows loading, safe denial, outage and successful retry without UUID inputs', async ({
  page,
}) => {
  let release: () => void = () => undefined
  const wait = new Promise<void>((resolve) => {
    release = resolve
  })
  const state = await mount(page, { status: 403, wait })
  await expect(page.getByText('Finding your authorized workspace...')).toBeVisible()
  await expect(page.getByLabel(/UUID/)).toHaveCount(0)
  await expect(ready(page)).toHaveCount(0)
  release()
  await expect(page.getByRole('alert')).toContainText('Access was denied')
  expect(await cookie(page)).toBeUndefined()
  state.status = 503
  await recheck(page)
  await expect(page.getByRole('alert')).toContainText('temporarily unavailable')
  await expect(page.getByText('private-response-body-must-never-appear')).toHaveCount(0)
  state.status = 200
  await recheck(page)
  await expect(ready(page)).toBeVisible()
  expect(await cookie(page)).toBeDefined()
  await expect(page.getByRole('alert')).toHaveCount(0)
  await expect(handoffs(page)).toHaveCount(1)
  await expect(page.getByRole('link', { name: 'Open your workspace' })).toHaveCount(0)
})

test('background revalidation preserves verified access and coalesces overlapping lifecycle triggers', async ({
  page,
}) => {
  const state = await mount(page)
  await expect(ready(page)).toBeVisible()
  const initialRequests = state.requests
  let release: () => void = () => undefined
  state.wait = new Promise<void>((resolve) => {
    release = resolve
  })

  await page.evaluate(() => {
    window.dispatchEvent(new Event('focus'))
    window.dispatchEvent(new Event('focus'))
    window.dispatchEvent(new PageTransitionEvent('pageshow'))
  })

  await expect.poll(() => state.requests).toBe(initialRequests + 1)
  await expect(ready(page)).toBeVisible()
  await expect(page.getByText('Finding your authorized workspace...')).toHaveCount(0)
  expect(await cookie(page)).toBeDefined()
  release()
  await expect(ready(page)).toBeVisible()
  await expect(handoffs(page)).toHaveCount(1)
})

test('zero membership provides an accessible recovery message and no workspace link', async ({
  page,
}) => {
  await mount(page, { workspaces: [] })
  await expect(page.getByText(/No authorized workspace is available/)).toBeVisible()
  await expect(ready(page)).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Sign out and clear this page' })).toBeEnabled()
  expect(await cookie(page)).toBeUndefined()
  await expect(handoffs(page)).toHaveCount(0)
})

test('multiple memberships fail closed without a chooser or first-result fallback', async ({
  page,
}) => {
  await mount(page, { workspaces: [workspace, { ...workspace, organizationId: userId }] })
  await expect(page.getByRole('alert')).toContainText('temporarily unavailable')
  await expect(ready(page)).toHaveCount(0)
  await expect(page.getByRole('combobox')).toHaveCount(0)
  expect(await cookie(page)).toBeUndefined()
  await expect(handoffs(page)).toHaveCount(0)
})

test('forged context is ignored and revoked membership disappears on refresh and history restoration', async ({
  page,
}) => {
  await page.context().addCookies([
    {
      name: 'pathways-context',
      value: encodeURIComponent(
        JSON.stringify({
          authUserId,
          organizationId: userId,
          userId: organizationId,
          roles: ['SYSTEM_ADMINISTRATOR'],
        }),
      ),
      url: 'http://127.0.0.1:3000',
    },
  ])
  const state = await mount(page)
  await expect(ready(page)).toBeVisible()
  expect(JSON.parse(decodeURIComponent((await cookie(page))?.value ?? ''))).toEqual({
    authUserId,
    organizationId,
    userId,
  })
  state.workspaces = []
  await page.evaluate(() => {
    window.dispatchEvent(new PageTransitionEvent('pagehide'))
    window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }))
  })
  await expect(page.getByText(/No authorized workspace is available/)).toBeVisible()
  await expect(ready(page)).toHaveCount(0)
  expect(await cookie(page)).toBeUndefined()
  state.workspaces = [workspace]
  state.profile = { ...profile, permissions: [] }
  await recheck(page)
  await expect(page.getByRole('alert')).toContainText('Access was denied')
  await expect(ready(page)).toHaveCount(0)
})

test('logout and a late discovery result cannot restore previous authority', async ({ page }) => {
  let release: () => void = () => undefined
  const wait = new Promise<void>((resolve) => {
    release = resolve
  })
  await mount(page, { wait })
  await expect(page.getByText('Finding your authorized workspace...')).toBeVisible()
  await page.getByRole('button', { name: 'Sign out and clear this page' }).click()
  release()
  await expect(page.getByRole('link', { name: 'Return to staff login' })).toBeVisible()
  await expect(ready(page)).toHaveCount(0)
  await expect(handoffs(page)).toHaveCount(0)
  expect(await cookie(page)).toBeUndefined()
})

test('token refresh re-resolves; account change and session expiry clear context', async ({
  page,
}) => {
  const state = await mount(page)
  await expect(ready(page)).toBeVisible()
  const count = state.requests
  await page.evaluate(
    (id) =>
      window.dispatchEvent(
        new CustomEvent('fixture-state', {
          detail: {
            session: {
              access_token: 'refreshed-fixture-token',
              user: { id },
            },
          },
        }),
      ),
    authUserId,
  )
  await expect.poll(() => state.requests).toBeGreaterThan(count)
  await expect(ready(page)).toBeVisible()
  await expect(handoffs(page)).toHaveCount(1)
  await page.evaluate(
    (id) =>
      window.dispatchEvent(
        new CustomEvent('fixture-state', {
          detail: {
            session: {
              access_token: 'refreshed-fixture-token',
              user: { id },
            },
          },
        }),
      ),
    userId,
  )
  await expect(page.getByText(/This is not the designated developer account/)).toBeVisible()
  await expect(ready(page)).toHaveCount(0)
  await expect.poll(async () => cookie(page)).toBeUndefined()
  await page.evaluate(() =>
    window.dispatchEvent(new CustomEvent('fixture-state', { detail: { logout: true } })),
  )
  await expect(page.getByRole('link', { name: 'Return to staff login' })).toBeVisible()
  expect(await cookie(page)).toBeUndefined()
})

test('public route navigation stops internal discovery and clears current context', async ({
  page,
}) => {
  const state = await mount(page)
  await expect(ready(page)).toBeVisible()
  await page.evaluate(() =>
    window.dispatchEvent(
      new CustomEvent('fixture-state', { detail: { path: '/public/dashboard' } }),
    ),
  )
  const count = state.requests
  await recheck(page)
  await expect(ready(page)).toHaveCount(0)
  expect(await cookie(page)).toBeUndefined()
  expect(state.requests).toBe(count)
})

test('handoff waits for the authoritative profile and never uses an external return target', async ({
  page,
}) => {
  let release: () => void = () => undefined
  const profileWait = new Promise<void>((resolve) => {
    release = resolve
  })
  await mount(page, { profileWait })
  await expect(page.getByText('Finding your authorized workspace...')).toBeVisible()
  await expect(handoffs(page)).toHaveCount(0)
  await page.evaluate(() => history.replaceState(null, '', '?returnTo=https://example.invalid'))
  release()
  await expect(ready(page)).toBeVisible()
  await expect(ready(page)).toHaveAttribute('aria-live', 'polite')
  await expect(ready(page)).toHaveAttribute('aria-busy', 'true')
  await expect(handoffs(page)).toHaveCount(1)
  await expect(page.locator('meta[name="fixture-navigation"]')).toHaveCount(1)
})

for (const scenario of [
  { name: 'AAL1', options: { aal: 'aal1' as const }, message: 'Use your existing authenticator.' },
  {
    name: 'disabled application access',
    options: { applicationAccessEnabled: false },
    message: 'Application access is still disabled.',
  },
  {
    name: 'MFA service denial',
    options: { mfaStatus: 401 },
    message: 'Verification is blocked.',
  },
  {
    name: 'profile service denial',
    options: { profileStatus: 403 },
    message: 'Access was denied',
  },
]) {
  test(`${scenario.name} cannot trigger an automatic handoff`, async ({ page }) => {
    await mount(page, scenario.options)
    await expect(page.getByText(scenario.message, { exact: false }).first()).toBeVisible()
    await expect(handoffs(page)).toHaveCount(0)
    await expect(ready(page)).toHaveCount(0)
    expect(await cookie(page)).toBeUndefined()
  })
}

test('return to MFA cannot automatically repeat navigation; an explicit recheck can retry', async ({
  page,
}) => {
  const state = await mount(page)
  await expect(handoffs(page)).toHaveCount(1)
  await page.evaluate(() =>
    window.dispatchEvent(new CustomEvent('fixture-state', { detail: { remount: true } })),
  )
  await expect(page.getByRole('alert')).toContainText('Dashboard navigation could not be completed')
  await expect(handoffs(page)).toHaveCount(1)
  let release: () => void = () => undefined
  state.wait = new Promise<void>((resolve) => {
    release = resolve
  })
  await recheck(page)
  await expect.poll(() => state.requests).toBeGreaterThan(1)
  await expect(handoffs(page)).toHaveCount(1)
  release()
  await expect(handoffs(page)).toHaveCount(2)
  await expect(ready(page)).toBeVisible()
})

test('stalled navigation has a bounded accessible recovery state and never retries on a timer', async ({
  page,
}) => {
  await page.clock.install()
  await mount(page)
  await expect(handoffs(page)).toHaveCount(1)
  await page.clock.runFor(29_000)
  await expect(ready(page)).toBeVisible()
  await page.clock.runFor(1_100)
  await expect(page.getByRole('alert')).toContainText('Dashboard navigation could not be completed')
  await expect(ready(page)).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Recheck securely' })).toBeEnabled()
  await page.clock.runFor(60_000)
  await expect(handoffs(page)).toHaveCount(1)
})

test('logout clears the handoff guard but a different user cannot inherit access', async ({
  page,
}) => {
  await mount(page)
  await expect(handoffs(page)).toHaveCount(1)
  await page.getByRole('button', { name: 'Sign out and clear this page' }).click()
  await expect(page.getByRole('link', { name: 'Return to staff login' })).toBeVisible()
  await page.evaluate(
    (id) =>
      window.dispatchEvent(
        new CustomEvent('fixture-state', {
          detail: { session: { access_token: 'different-synthetic-token', user: { id } } },
        }),
      ),
    userId,
  )
  await expect(page.getByText(/This is not the designated developer account/)).toBeVisible()
  await expect(handoffs(page)).toHaveCount(1)
  await page.evaluate(
    (id) =>
      window.dispatchEvent(
        new CustomEvent('fixture-state', {
          detail: { session: { access_token: 'new-synthetic-token', user: { id } } },
        }),
      ),
    authUserId,
  )
  await expect(handoffs(page)).toHaveCount(2)
  await expect(ready(page)).toBeVisible()
})
