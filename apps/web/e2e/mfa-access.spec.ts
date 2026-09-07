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
        import { CurrentRoleProvider } from '../src/providers/current-role-provider';
        import { MfaForm } from '../src/features/auth/mfa-form';
        createRoot(document.getElementById('root')).render(<CurrentRoleProvider><MfaForm /></CurrentRoleProvider>);`,
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

test('provisioned-access button shows progress, denial and a successful retry', async ({
  page,
}) => {
  let responseStatus = 403
  let releaseRequest: (() => void) | undefined
  let requests = 0
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url())
    // All requests are intercepted; no Auth or live database is used by this test.
    if (url.origin === 'http://127.0.0.1:3000' && url.pathname === '/component-fixture') {
      await route.fulfill({ contentType: 'text/html', body: '<div id="root"></div>' })
    } else if (url.origin === 'http://127.0.0.1:4000' && url.pathname === '/api/auth/mfa/status') {
      await route.fulfill({
        json: { authUserId, aal: 'aal2', enrollmentAllowed: true, applicationAccessEnabled: true },
      })
    } else if (url.origin === 'http://127.0.0.1:4000' && url.pathname === '/api/auth/me') {
      requests += 1
      const headers = route.request().headers()
      expect(headers['x-pathways-user-id']).toBe(userId)
      expect(headers['x-pathways-organization-id']).toBe(organizationId)
      await new Promise<void>((resolve) => {
        releaseRequest = resolve
      })
      await route.fulfill({
        status: responseStatus,
        json:
          responseStatus === 200
            ? {
                user: {
                  id: authUserId,
                  userId,
                  organizationId,
                  fullName: 'Fixture Developer',
                  roles: ['SYSTEM_ADMINISTRATOR'],
                  permissions: ['projects.read'],
                  assignedProjectIds: [],
                  aal: 'aal2',
                },
              }
            : { message: 'private-response-body-must-never-appear' },
      })
    } else await route.abort()
  })
  await page.goto('/component-fixture')
  await page.addScriptTag({ content: component })
  await expect(
    page.getByRole('button', { name: 'Verify provisioned access', exact: true }),
  ).toBeEnabled()
  expect(requests).toBe(0)
  await page.getByLabel('Application user UUID').fill(userId)
  await page.getByLabel('Organization UUID').fill(organizationId)
  await page.getByRole('button', { name: 'Verify provisioned access', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Verifying provisioned access...' })).toBeDisabled()
  await expect.poll(() => requests).toBe(1)
  releaseRequest?.()
  await expect(page.getByRole('alert')).toContainText('Access was denied (403)')
  await expect(page.getByText('private-response-body-must-never-appear')).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'Open your workspace' })).toHaveCount(0)
  responseStatus = 200
  await page.getByRole('button', { name: 'Verify provisioned access', exact: true }).click()
  await expect.poll(() => requests).toBe(2)
  releaseRequest?.()
  await expect(page.getByRole('link', { name: 'Open your workspace' })).toBeVisible()
  await expect(page.getByRole('alert')).toHaveCount(0)
})
