# Change Record: Rules Board and Review Cards

**ID:** `cr-pathways-rules-board-ui`

**Date:** 2026-10-04

**Status:** Approved; implementation pending

**Approval:** Developer direction on 2026-10-04 to copy the layout in `docs/ui-ux-pathways-reference/rule-based-alerts-recommendations`, consolidate with the DSD, replace `/alerts/repository` and remove it from the sidebar, and restyle the review queue to Figma frame 1344:342.

## 1. Decision and Scope

- `/alerts/repository` shows two cards, Rule-based Alert Configuration and Rule-based Recommendation Configuration, each with View All, Create Rule and a table.
- Rules are created and edited in a 480px right drawer instead of the dialog wizard in DSD rule configuration. The existing editor remains reachable as the advanced editor for nested condition trees.
- The Alerts Repository sidebar entry is removed. The page stays reachable from Analytics and from a Manage rules action on `/alerts`, under `rules.read`.
- The `/alerts` queue renders alerts as danger-subtle cards and recommendations as warning-subtle cards, each with a Review action.

## 2. Truthful mapping of reference fields

The reference shows fields the rule contract does not store. They are shown without new persistence:

| Reference field | Behavior |
|---|---|
| Rule Category | Read-only, derived from the metric family |
| Applies To | Checkboxes filter the metric list; scopes without a catalog metric are disabled |
| Unit | Read-only, derived from the metric |
| Time Basis | Read-only: evaluated on source changes and the scheduled sweep |
| Notification Recipients | Read-only: assigned project users holding alert access |
| Severity on recommendations | Replaced by Linked Rule; recommendations never carry severity |

Sector and Region filters are replaced by Scope and Status, which rules carry.

## 3. DSD impact

The DSD rule configuration and alert queue entries are amended to record the drawer builder, the review cards and the Auto-resolved recommendation state. Tokens and existing components are unchanged.
