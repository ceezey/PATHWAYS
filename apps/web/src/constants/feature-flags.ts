/**
 * Web-only feature flags. A flag here hides UI without touching the API or schema.
 * See the deferred/hidden feature register at vault note deferred-features before changing one.
 */

/**
 * The beneficiary step-up PIN fallback UI is hidden (2026-09-29): the fallback is buggy,
 * so only the authenticator (TOTP) step-up path is shown until it is fixed. The API
 * endpoints, migration 0037 and the PIN components stay in place; only the UI entry
 * points are gated by this flag. See vault note deferred-features and
 * vault note cr-pathways-beneficiary-step-up-pin.
 */
export const STEP_UP_PIN_UI_ENABLED = false

/**
 * The beneficiary step-up dialog's Reset button is hidden (2026-10-07, developer request); the code
 * fields can still be cleared by hand. See vault note deferred-features.
 */
export const STEP_UP_RESET_UI_ENABLED = false

/**
 * The analytics aggregate export (CSV) button was hidden on 2026-09-29 and is shown again
 * (2026-10-04). The GET analytics/descriptive/export endpoint, its permission and its
 * download behavior stay in place; only the UI entry point (the button and its
 * "Exporting aggregates" busy state) is gated by this flag. See
 * vault note deferred-features.
 */
export const ANALYTICS_AGGREGATE_EXPORT_UI_ENABLED = true

/**
 * The Analytics "Map" visualization (project coverage map) was hidden on 2026-10-07 because it drew
 * no tiles or points, and is shown again for every role (2026-10-22) now that the maplibre worker is
 * served from public. See vault note deferred-features.
 */
export const MAPS_UI_ENABLED = true

/**
 * Backup & Recovery is hidden for every role, System Administrator included (2026-10-07, developer
 * request): the sidebar entry is removed and /settings/backups returns not found. See
 * vault note deferred-features.
 */
export const BACKUP_RECOVERY_UI_ENABLED = false

/**
 * The project Target Indicators tab hides "Use from library" and the Indicator library link
 * (2026-10-07, developer request). The library page, API and permissions stay in place; see
 * vault note deferred-features.
 */
export const INDICATOR_LIBRARY_UI_ENABLED = false

/**
 * The System Administrator dashboard hides its Active budget alerts and Overdue activities cards
 * and the Project monitoring card (2026-10-07, developer request). Other roles' dashboards are
 * unchanged; see vault note deferred-features.
 */
export const ADMIN_DASHBOARD_MONITORING_UI_ENABLED = false

/**
 * Controls with no backend yet (disabled "Not available yet" buttons, disabled form options,
 * the beneficiary Media proof tab and similar) are shown (true, the shipped value). Set to
 * `false` to hide them so the product shows no unfinished state; nothing server-side changes.
 * Each gated entry is listed in vault note deferred-features.
 */
export const UNFINISHED_CONTROLS_UI_ENABLED = true

/**
 * The analytics "Add to Dashboard" button and the role dashboard's pinned "Monitoring charts"
 * section are hidden (2026-10-06, developer request). Browser-stored pins, the pin library and
 * the components stay in place; only these two UI entry points are gated by this flag. See
 * vault note deferred-features.
 */
export const DASHBOARD_PINS_UI_ENABLED = false

/**
 * The page-heading pencil is hidden for every role, System Administrator included (2026-10-07,
 * developer request), on top of `UNFINISHED_CONTROLS_UI_ENABLED`. The component stays in place;
 * see vault note deferred-features.
 */
export const PAGE_HEADING_EDITOR_UI_ENABLED = false

/**
 * The import "Duplicate records decision" select is hidden (2026-10-07, developer request), on top
 * of `UNFINISHED_CONTROLS_UI_ENABLED`. Imports keep the default "decide when flagged" behavior; see
 * vault note deferred-features.
 */
export const IMPORT_DUPLICATE_DECISION_UI_ENABLED = false
