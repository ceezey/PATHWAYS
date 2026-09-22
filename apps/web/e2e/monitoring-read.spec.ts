import { createRequire } from 'node:module'
import path from 'node:path'
import { type Page, expect, test } from '@playwright/test'

// Bundle the actual React hook; only authority and load replies are synthetic.
const requireTool = createRequire(require.resolve('tsx'))
const { build } = requireTool('esbuild')
let component: string

test.beforeAll(async () => {
  const fixture = path.resolve(__dirname, 'fixtures/monitoring-read.tsx')
  const output = await build({
    stdin: {
      contents: `import { createRoot } from 'react-dom/client';
        import { useCallback } from 'react';
        import { useFixtureProject } from './fixtures/monitoring-read';
        import { useMonitoringRead } from '../src/features/analytics/use-monitoring-read';
        const pending = new Map();
        const fixture = window;
        fixture.monitoringRequests = [];
        fixture.respondToMonitoring = (id, value) => {
          const resolve = pending.get(id);
          if (!resolve) throw new Error('Unknown monitoring request');
          pending.delete(id);
          resolve(value);
        };
        function Screen() {
          const project = useFixtureProject();
          const load = useCallback(() => new Promise((resolve) => {
            const id = fixture.monitoringRequests.length + 1;
            fixture.monitoringRequests.push({ id, project });
            pending.set(id, resolve);
          }), [project]);
          const read = useMonitoringRead(project, load);
          return <main>
            <output data-testid="value">{read.data ?? 'withheld'}</output>
            <output data-testid="loading">{read.loading ? 'loading' : 'idle'}</output>
            <button onClick={read.reload}>Reload</button>
          </main>;
        }
        createRoot(document.getElementById('root')).render(<Screen />);`,
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
      '@/hooks/use-current-role': fixture,
      '@/hooks/use-session': fixture,
    },
  })
  component = output.outputFiles[0].text
})

async function mount(page: Page) {
  await page.route('**/*', async (route) => {
    if (new URL(route.request().url()).pathname === '/monitoring-component-fixture') {
      return route.fulfill({ contentType: 'text/html', body: '<div id="root"></div>' })
    }
    return route.abort()
  })
  await page.goto('http://127.0.0.1:3000/monitoring-component-fixture')
  await page.addScriptTag({ content: component })
}

async function requestCount(page: Page) {
  return page.evaluate(
    () => (window as unknown as { monitoringRequests: unknown[] }).monitoringRequests.length,
  )
}

async function respond(page: Page, id: number, value: string) {
  await page.evaluate(
    ({ id, value }) => {
      ;(
        window as unknown as { respondToMonitoring: (id: number, value: string) => void }
      ).respondToMonitoring(id, value)
    },
    { id, value },
  )
}

test('explicit reload requests a fresh value after a committed change', async ({ page }) => {
  await mount(page)
  await expect.poll(() => requestCount(page)).toBe(1)
  await respond(page, 1, 'revision-one')
  await expect(page.getByTestId('value')).toHaveText('revision-one')
  await page.getByRole('button', { name: 'Reload' }).click()
  await expect.poll(() => requestCount(page)).toBe(2)
  await expect(page.getByTestId('value')).toHaveText('withheld')
  await respond(page, 2, 'revision-two')
  await expect(page.getByTestId('value')).toHaveText('revision-two')
})

test('late old-project reply cannot replace current scope', async ({ page }) => {
  await mount(page)
  await expect.poll(() => requestCount(page)).toBe(1)
  await page.evaluate(() =>
    window.dispatchEvent(
      new CustomEvent('monitoring-authority', { detail: { project: 'project-b' } }),
    ),
  )
  await expect.poll(() => requestCount(page)).toBe(2)
  await respond(page, 2, 'project-b-current')
  await expect(page.getByTestId('value')).toHaveText('project-b-current')
  await respond(page, 1, 'project-a-late')
  await expect(page.getByTestId('value')).toHaveText('project-b-current')
})

test('logout with an in-flight reply hides protected values', async ({ page }) => {
  await mount(page)
  await expect.poll(() => requestCount(page)).toBe(1)
  await page.evaluate(() =>
    window.dispatchEvent(
      new CustomEvent('monitoring-authority', {
        detail: { session: null, profile: null, access: 'denied' },
      }),
    ),
  )
  await respond(page, 1, 'late-private-value')
  await expect(page.getByTestId('value')).toHaveText('withheld')
  expect(await requestCount(page)).toBe(1)
})
