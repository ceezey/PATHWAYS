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

/**
 * The analytics aggregate export (CSV) button is hidden (2026-09-29) on developer
 * request. The GET analytics/descriptive/export endpoint, its permission and its
 * download behavior stay in place; only the UI entry point (the button and its
 * "Exporting aggregates" busy state) is gated by this flag. See
 * docs/deferred-features.md.
 */
export const ANALYTICS_AGGREGATE_EXPORT_UI_ENABLED = false

/**
 * Controls with no backend yet (disabled "Not available yet" buttons, disabled form options,
 * the beneficiary Media proof tab and similar) are shown (true, the shipped value). Set to
 * `false` to hide them so the product shows no unfinished state; nothing server-side changes.
 * Each gated entry is listed in docs/deferred-features.md.
 */
export const UNFINISHED_CONTROLS_UI_ENABLED = true
