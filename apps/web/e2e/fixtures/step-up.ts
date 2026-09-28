import type { Page } from '@playwright/test'

/**
 * Stubs only the UI preflight read of Beneficiary step-up status
 * (cr-pathways-beneficiary-step-up, cr-pathways-beneficiary-step-up-pin). It grants
 * nothing: against a live API every Beneficiary detail request still needs a TOTP
 * verification or a session-bound PIN grant from the last 15 minutes.
 * The most recently registered stub wins.
 */
export async function stubBeneficiaryStepUp(page: Page, fresh = true) {
  await page.route('**/api/auth/step-up/status', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'cache-control': 'private, no-store' },
      body: JSON.stringify({
        fresh,
        expiresAt: fresh ? new Date(Date.now() + 900_000).toISOString() : null,
        windowSeconds: 900,
        method: fresh ? 'TOTP' : null,
        pinState: 'NONE',
      }),
    }),
  )
}
