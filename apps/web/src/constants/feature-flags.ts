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
 * The analytics aggregate export (CSV) button was hidden on 2026-09-29 and is shown again
 * (2026-10-04). The GET analytics/descriptive/export endpoint, its permission and its
 * download behavior stay in place; only the UI entry point (the button and its
 * "Exporting aggregates" busy state) is gated by this flag. See
 * docs/deferred-features.md.
 */
export const ANALYTICS_AGGREGATE_EXPORT_UI_ENABLED = true

/**
 * The Analytics "Map" visualization (project coverage map) is hidden for every role (2026-10-07,
 * developer request) because it does not work yet. The map components and the project-map API stay
 * in place; see docs/deferred-features.md.
 */
export const MAPS_UI_ENABLED = false

/**
 * Backup & Recovery is hidden for every role, System Administrator included (2026-10-07, developer
 * request): the sidebar entry is removed and /settings/backups returns not found. See
 * docs/deferred-features.md.
 */
export const BACKUP_RECOVERY_UI_ENABLED = false

/**
 * Controls with no backend yet (disabled "Not available yet" buttons, disabled form options,
 * the beneficiary Media proof tab and similar) are shown (true, the shipped value). Set to
 * `false` to hide them so the product shows no unfinished state; nothing server-side changes.
 * Each gated entry is listed in docs/deferred-features.md.
 */
export const UNFINISHED_CONTROLS_UI_ENABLED = true

/**
 * The analytics "Add to Dashboard" button and the role dashboard's pinned "Monitoring charts"
 * section are hidden (2026-10-06, developer request). Browser-stored pins, the pin library and
 * the components stay in place; only these two UI entry points are gated by this flag. See
 * docs/deferred-features.md.
 */
export const DASHBOARD_PINS_UI_ENABLED = false

/**
 * The page-heading pencil is hidden for every role, System Administrator included (2026-10-07,
 * developer request), on top of `UNFINISHED_CONTROLS_UI_ENABLED`. The component stays in place;
 * see docs/deferred-features.md.
 */
export const PAGE_HEADING_EDITOR_UI_ENABLED = false
