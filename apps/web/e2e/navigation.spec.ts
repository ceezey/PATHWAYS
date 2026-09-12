import { type Page, expect, test } from '@playwright/test'

import { waitForExactNavigation } from './navigation'

const origin = 'http://127.0.0.1:3000'
const fixtureURL = `${origin}/navigation-fixture`

async function loadNavigationFixture(page: Page, destination: string, delayMs = 0) {
  const requestURL = new URL(destination)
  requestURL.hash = ''

  // Every request is fulfilled or aborted locally; no application/Auth request is sent.
  await page.context().route('**/*', async (route) => {
    const url = route.request().url()
    if (url === fixtureURL) {
      await route.fulfill({
        contentType: 'text/html',
        body: `<a id="next" href="${destination}">Continue</a>
          <script>
            document.getElementById('next').addEventListener('click', (event) => {
              event.preventDefault();
              setTimeout(() => location.assign(${JSON.stringify(destination)}), ${delayMs});
            });
          </script>`,
      })
    } else if (url === requestURL.href) {
      await route.fulfill({
        contentType: 'text/html',
        body: '<h1>Synthetic destination</h1>',
      })
    } else await route.abort()
  })
  await page.goto(fixtureURL)
}

for (const pathname of ['/public/projects', '/staff/forgot-password']) {
  test(`exact navigation survives a delayed ${pathname} transition`, async ({ page }, testInfo) => {
    expect(testInfo.timeout).toBe(30_000)
    const destination = `${origin}${pathname}`
    await loadNavigationFixture(page, destination, 6_500)
    await page.getByRole('link', { name: 'Continue' }).click()

    const navigation = waitForExactNavigation(page, destination)
    // Reproduce the old assertion-window failure without retrying the navigation.
    const oldAssertionPassed = await expect(page)
      .toHaveURL(destination)
      .then(
        () => true,
        () => false,
      )
    expect(oldAssertionPassed).toBe(false)

    await navigation
    await expect(page).toHaveURL(destination)
    await expect(page.getByRole('heading', { name: 'Synthetic destination' })).toBeVisible()
  })
}

for (const [classification, wrongDestination] of [
  ['path', `${origin}/wrong-destination`],
  ['origin', 'http://127.0.0.1:3999/public/projects'],
  ['query', `${origin}/public/projects?unexpected=1`],
  ['fragment', `${origin}/public/projects#unexpected`],
]) {
  test(`exact navigation does not accept a wrong ${classification}`, async ({ page }, testInfo) => {
    expect(testInfo.timeout).toBe(30_000)
    const destination = `${origin}/public/projects`
    await loadNavigationFixture(page, wrongDestination)
    await page.getByRole('link', { name: 'Continue' }).click()

    const state = { outcome: 'pending' }
    const navigation = waitForExactNavigation(page, destination).then(
      () => {
        state.outcome = 'resolved'
      },
      () => {
        state.outcome = 'rejected'
      },
    )
    await expect(page).toHaveURL(wrongDestination)
    await expect(page.getByRole('heading', { name: 'Synthetic destination' })).toBeVisible()
    expect(state.outcome).toBe('pending')

    // Closing this synthetic page proves rejection/cleanup without extending a timeout.
    await page.close()
    await navigation
    expect(state.outcome).toBe('rejected')
  })
}
