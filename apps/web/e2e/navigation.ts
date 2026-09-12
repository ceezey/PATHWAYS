import type { Page } from '@playwright/test'

/** Test-only: keep Playwright's existing whole-test deadline and exact URL matching. */
export async function waitForExactNavigation(page: Page, destination: string): Promise<void> {
  // No per-navigation timeout override, retry, sleep or network-idle requirement.
  await page.waitForURL((url) => url.href === destination)
}
