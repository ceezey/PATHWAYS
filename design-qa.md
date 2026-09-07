# I01 frontend staff-shell design QA

## Comparison target

- **Scope:** I01 frontend-only staff-shell chrome: PATHWAYS identity, desktop sidebar, current-location header, actor/role/scope context, session action, responsive navigation sheet, and visible focus. The dashboard body is not a fidelity target for this pass because the selected concept shows the later project-triage workflow while this narrowed I01 run did not authorize that workflow.
- **Source visual truth:** `docs/pathways-manuscript-revision/evidence/phase-4/concept-01.png`
- **Rendered implementation:** `docs/pathways-manuscript-revision/evidence/i01/implementation-desktop-staff-shell.png`
- **Additional rendered states:** `implementation-desktop-session-focus.png` and `implementation-mobile-workspace-navigation.png` in the same evidence folder.
- **Full-view comparison:** `docs/pathways-manuscript-revision/evidence/i01/design-qa-full-comparison.png`
- **Focused comparisons:** `design-qa-sidebar-comparison.png` and `design-qa-header-comparison.png` in the same evidence folder.

## Normalization and state

- Source and desktop implementation are both 1512 × 1064 pixels, captured or generated for a 1512 × 1064 CSS-pixel viewport at device scale factor 1. No density resampling was needed.
- Desktop source state: selected Option 1, Program Manager, expanded staff shell around the portfolio-triage concept.
- Desktop implementation state: GUI prototype mode with synthetic `frontend.review@demo.pathways.local`, Program Manager, `Portfolio preview`, expanded staff shell at `/dashboard`.
- Mobile implementation state: 390 × 844 CSS pixels at device scale factor 1, Project Officer, workspace navigation open, close control focused.
- The full-view comparison was used for shell proportions, hierarchy, color, and density. Focused sidebar/header comparisons were used because shell labels, icons, spacing, and identity details were too small to judge reliably in the full pair.

## Findings

No actionable P0, P1, or P2 difference remains within the staff-shell comparison scope.

- **Fonts and typography:** The implementation retains the PATHWAYS display heading role and system body role. Shell labels, role, scope, and email preserve the compact operational hierarchy. Truncation is limited to constrained account labels and the full values remain available in the session menu.
- **Spacing and layout rhythm:** The implementation retains the source's fixed navy navigation, compact top bar, low-elevation workspace, and grouped navigation. Its 292px expanded sidebar is slightly wider than the concept, but this follows the existing responsive AppShell contract and does not reduce the main task's usability at the tested viewport.
- **Colors and tokens:** Navy shell, blue selected/action state, white workspace, restrained borders, and semantic state colors match the selected institutional direction. The new `border-strong` semantic token closes the previously undefined hover-token gap.
- **Image and asset fidelity:** The existing PATHWAYS brand mark is retained. No visible source logo or icon was replaced with CSS art, text glyphs, emoji, or a newly handcrafted SVG.
- **Copy and content:** Role and scope are explicit. Browser-selected roles are labelled as preview scope rather than verified authority. The body copy differs because it represents `/dashboard`, which is outside this shell-only comparison.
- **Interaction and accessibility evidence:** Playwright verified labelled navigation, a visible session-button focus state, a labelled modal navigation sheet, a 44 × 44px close target, focus return to the navigation trigger, no page-level horizontal overflow at 390px, sign-out, post-sign-out direct-route denial, and no captured browser-console or page errors. This is scoped evidence and is not a WCAG conformance claim.

## Comparison history

1. **Initial comparison — blocked by one P2 accessibility issue.** The mobile sheet inherited `text-muted-foreground` for its close icon while rendering over the navy sidebar. The icon was visibly low contrast even though the control already had a 44 × 44px hit area.
2. **Fix applied.** `apps/web/src/components/layout/app-shell.tsx` now supplies white text, hover, and focus-ring treatment to the sheet's direct close button without changing the shared Sheet component or other surfaces.
3. **Post-fix comparison.** `implementation-mobile-workspace-navigation.png` shows a visible white close icon and focus ring. The final Playwright run verified the target size and focus restoration; both scoped tests passed with no captured browser errors.

## Open questions and limits

- The selected concept's project-triage body, actor-derived real scope, server authorization, persistence, inactive/locked/error branches, and production session behavior were not implemented or evaluated because the developer restricted this run to frontend checking and revoked backend-flow changes.
- Contrast was visually reviewed for the changed shell states. No full measured contrast, screen-reader, browser-zoom, forced-colors, or production-environment audit was run.

## Implementation checklist

- [x] Preserve selected PATHWAYS shell identity and existing components.
- [x] Show truthful role and preview-scope context.
- [x] Keep prototype and development bypass modes fail-closed in production and mutually exclusive in GUI prototype mode.
- [x] Verify session-menu focus, sign-out, direct-route denial, mobile drawer containment, close target, focus return, and narrow-width containment.
- [x] Resolve the in-scope P2 mobile close-control contrast finding and recapture the state.

## Follow-up polish

- Re-run the full visual comparison against the same project-triage route and content when that later frontend workflow is authorized and rendered.
- Add measured contrast, 200% zoom/reflow, forced-colors, and assistive-technology sampling at the final integration gate.

final result: passed
