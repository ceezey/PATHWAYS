/**
 * Web-only feature flags. A flag here hides UI without touching the API or schema.
 * See the deferred/hidden feature register at docs/deferred-features.md before changing one.
 */

/**
 * The beneficiary step-up PIN fallback UI is hidden (2026-09-29): the fallback is buggy,
 * so only the authenticator (TOTP) step-up path is shown until it is fixed. The API
 * endpoints, migration 0037 and the PIN components stay in place; only the UI entry
 * points are gated by this flag. See docs/deferred-features.md and
 * docs/cr-pathways-beneficiary-step-up-pin.md.
 */
export const STEP_UP_PIN_UI_ENABLED = false
