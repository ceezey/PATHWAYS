# PATHWAYS Design System Document (DSD)

**Status:** Working — reconciled against the supplied PATHWAYS frontend source snapshot on 2026-09-26.  
**Canonical design source:** this file.  
**Materialized root references:** `BRAND.md` and `DESIGN.md`.

> Make durable design changes here first, then synchronize the root materializations. The current implemented PATHWAYS UI is the baseline; this document governs consistency and does not authorize a redesign.

## 0. Verified Source Basis

Reviewed current source includes:

- `apps/web/src/app/globals.css`
- `apps/web/tailwind.config.ts`
- `apps/web/src/app/layout.tsx`
- `apps/web/components.json`
- `apps/web/src/components/ui/*`
- `apps/web/src/components/pathways/*`
- `apps/web/src/components/layout/*`
- `apps/web/src/features/auth/*`
- `apps/web/src/features/dashboard/*`
- `apps/web/src/features/projects/*`
- `apps/web/src/features/analytics/rule-configuration-workspace.tsx`
- `apps/web/src/features/public/*`
- `apps/web/src/constants/navigation.ts`
- `apps/web/src/constants/display-labels.ts`
- `design-qa.md`

### Verified frontend stack

- Next.js `^15.2.2`
- React / React DOM `^19.0.0`
- Tailwind CSS `^3.4.17`
- shadcn-style default primitives + Radix UI
- Lucide React `^0.475.0`
- TanStack Query `^5.66.9`
- TanStack Table `^8.21.2`
- ECharts `^5.6.0`
- MapLibre GL `6.10.0`
- Sonner `^1.7.4`
- React Hook Form `^7.54.2`
- Zod `^3.25.76`

## 1. Brand Stance

PATHWAYS should feel institutional but not cold, operational rather than promotional, evidence-first, privacy-aware, and calm under monitoring or risk conditions.

The product is a project-information system, not a consumer app, gamified tracker, or AI assistant.

### Surface modes

**Staff Workspace**
- deep navy navigation;
- white workspace;
- blue actions;
- compact role/scope context;
- bordered operational surfaces;
- restrained elevation;
- semantic statuses.

**Access / Authentication**
- light-blue/white gradient;
- centered identity card;
- PATHWAYS mark/name;
- direct single-purpose flow.

**Public Transparency**
- white/subtle body surfaces;
- navy storytelling hero;
- larger public headings;
- explicit approved-public framing;
- aggregate/non-sensitive information only.

### Anti-references

Avoid:
- default purple SaaS gradients;
- glass-heavy staff dashboards;
- dark-mode-first analytics styling;
- cartoon/gamified status treatment;
- color-only statuses;
- hover-only actions;
- tiny terminal-density controls;
- fabricated project/Beneficiary imagery;
- AI/autonomous-decision styling or copy;
- user-facing `prototype`, `mock`, `demo`, `presentation-only`.

Legitimate workflow labels such as **Quick Preview**, **Staff Preview**, and **Public Preview** remain valid when they describe real preview behavior.

## 2. Product Identity

Canonical name:

```text
PATHWAYS
```

Current staff-shell descriptor:

```text
Project Information Management
```

Current public context:

```text
HDO Public Portal
PATHWAYS
```

Current shared application description:

> A digital integrated program monitoring and dashboard system with a metadata-driven mechanism.

Do not casually rename the product or modules outside approved copy/configuration mechanisms.

## 3. Logo / Mark

Current component references:

```text
/brand/pathways-mark.png
```

Coded default size: `32 × 32px`.

The staff sidebar commonly renders the mark around `44 × 44px` and applies a white/inverted treatment on navy.

Rules:
- use the existing mark;
- preserve aspect ratio;
- do not recreate it as CSS art, emoji, or an improvised SVG;
- decorative empty-alt treatment is acceptable when adjacent PATHWAYS text supplies the accessible name.

**Snapshot limitation:** the uploaded source snapshot referenced the asset path but did not contain the binary file. Verify it in the authoritative repository before release.

## 4. Color Tokens

Current CSS variables are canonical until an approved change updates them.

| Token | Approx. Hex | Use |
|---|---|---|
| `background` | `#FFFFFF` | page background |
| `foreground` | `#172B3A` | primary text |
| `workspace` | `#FFFFFF` | staff workspace |
| `surface-subtle` | `#F7F9FB` | low-emphasis surfaces |
| `primary` | `#0072CE` | primary action/selection |
| `primary-hover` | `#0067B9` | hover |
| `primary-active` | `#005BA3` | active |
| `primary-subtle` | `#EAF4FC` | selected/info surface |
| `navy` | `#0B2E4F` | staff shell/public hero |
| `navy-muted` | `#C8D6E2` | text on navy |
| `secondary` | `#E9EEF2` | secondary/disabled surface |
| `muted` | `#F2F5F7` | neutral fill |
| `muted-foreground` | `#526779` | secondary text |
| `success` | `#1F7A4D` | positive/on-track |
| `success-subtle` | `#E9F6EF` | success surface |
| `warning` | `#8A4B08` | caution/at-risk |
| `warning-subtle` | `#FFF4E5` | warning surface |
| `danger` | `#B42318` | destructive/critical |
| `danger-subtle` | `#FDEDEC` | danger surface |
| `info` | `#005EA8` | informational text |
| `border` | `#D6DEE6` | default divider |
| `border-strong` | `#96A8BA` | stronger hover/divider |
| `input` | `#8696A6` | form border |
| `ring` | `#0072CE` | focus ring |

Use semantic tokens instead of new hard-coded colors for normal product UI.

### Authentication gradient exception

Current auth surfaces use a light-blue/white gradient such as:

```text
#C8EAF9 → #F5FBFE → #FFFFFF → #DCEFFC
```

This is an access-surface exception, not the default staff-workspace background.

## 5. Typography

### Heading font

Current source loads:

```text
MomoTrustDisplay-Regular.ttf
```

via `next/font/local` as `--font-heading`.

Applied to h1–h4, product name, card/dialog titles, and other selected headings. Current global CSS forces normal/regular heading weight.

### Body font

```text
"Segoe UI", "Helvetica Neue", Arial, sans-serif
```

### Numeric data

Tables and numeric monitoring data use tabular numerals.

### Common current scales

- page H1: `text-3xl`
- public hero H1: `text-4xl` through `text-6xl`
- project/card title: `text-2xl`
- card/dialog title: `text-lg`
- body: `text-base`
- operational/helper: `text-sm`
- compact metadata/eyebrow: `text-xs` / ~13px

Do not introduce a competing type system without approval.

## 6. Radius, Borders, Elevation

Root radius:

```text
--radius: 0.375rem
```

Current mapping:
- `rounded-lg` ≈ 6px
- `rounded-md` ≈ 4px
- `rounded-sm` ≈ 2px
- pills/badges/progress may use full radius

PATHWAYS is border-first, not shadow-first.

Popover shadow:

```text
0 8px 20px rgb(11 46 79 / 10%),
0 1px 3px rgb(11 46 79 / 8%)
```

Dialog shadow:

```text
0 16px 40px rgb(11 46 79 / 14%),
0 2px 6px rgb(11 46 79 / 8%)
```

Cards are generally flat/bordered. Existing localized `shadow-sm` usage is acceptable where already established.

## 7. Layout

### Staff shell

Desktop:
- expanded sidebar: `292px`
- compact sidebar: `86px`
- sticky/full-height navigation
- sticky white header
- staff content `max-w-7xl`
- horizontal page padding: 16px mobile / 24px md+
- vertical page padding: 24px mobile / 32px md+

Mobile:
- left navigation Sheet ≈ 292px
- 44px menu/close targets
- no page-level horizontal overflow

### Public surfaces

Common public width:

```text
max-w-6xl
```

Project-detail public surfaces may use their explicitly configured wider layout.

### Page headers

`PageHeader` remains flat:
- optional eyebrow
- title
- concise description
- actions
- bottom border

Cards belong to page content rather than wrapping every route heading.

## 8. Core Components

### Buttons
Variants:
- primary/default
- secondary
- outline
- ghost
- destructive

Normal height: `44px`.

### Inputs / selects
- 44px height
- explicit border
- visible hover/focus
- 2px focus ring
- ARIA invalid danger state
- disabled secondary state

### Textareas
- minimum height 96px
- vertical resize

### Cards
- white/card background
- border
- 6px radius
- normally flat
- common `p-5` internal spacing

### Status badges
Semantic tones:
- info
- success
- warning
- danger
- neutral

Always display a readable label.

### Metric cards
- semantic top border
- label + help tooltip
- large tabular value
- optional semantic icon tile

### Progress bars
- visual clamp 0–100
- ARIA progress semantics
- semantic tone
- surrounding copy may preserve actual over-target achievement when business values exceed 100%

### Tabs
- flat underline/bottom-border pattern
- 44px minimum height
- visible keyboard focus

### Tables
- horizontal overflow container
- tabular numerals
- ~44px rows/headers
- subtle header surface
- hover/selection feedback
- no tiny terminal density

### Dialogs
- navy 45% overlay
- centered bounded surface
- scroll containment
- visible 44px close control
- stacked small-screen footer actions

### Async / empty / error
Use truthful:
- loading
- empty
- unavailable
- error
- retry

Do not inject fake records just to avoid an empty state.

## 9. Information Architecture

Current staff navigation groups:

**Workspace**
- Dashboard
- Projects
- Beneficiaries
- Collection

**Decision Support**
- Analytics
- Alerts
- Reports
- Alerts Repository
- Public Tracker

**Administration**
- User Management
- Audit Log
- Backup & Recovery

Role filtering happens before navigation is rendered.

Project workspaces use permission-aware tabs.

Frontend visibility is not authorization.

## 10. Domain Composition Patterns

### Project directory

```text
Page Header
→ Search / Filters
→ Results Announcement
→ Loading / Error / Empty
→ Responsive Project Cards
→ Quick Preview / Open Project
```

### Project workspace

```text
Page Header
→ Project Workspace Header
→ permission-aware tabs
→ Section Cards / domain panels
```

### Dashboards

Use trusted metrics and explicit project context.

Do not introduce one universal overall project-success percentage unless an approved methodology defines it.

### Rule configuration

Current implementation is a single-condition configuration shell.

Existing visual grammar:
- rule list left
- selected rule detail right
- configuration/view-only status
- create/edit dialog
- two-column form at medium sizes
- info-subtle rule preview
- human-review disclaimer
- explicit server-unavailable state

Future rule-builder work should preserve this grammar while adding:
- project/scope
- trusted metric selector
- typed operators
- conditional threshold fields
- recommendation linkage
- dry run
- ALL/ANY condition groups when approved

No arbitrary SQL/code input.

### Beneficiary-sensitive UI

- scope must be explicit where relevant
- aggregate-only roles do not receive detail data
- private media remains private by default
- public publication requires separate provenance/approval
- forbidden existence should not leak through error/empty states

### Public transparency

Current public pattern:
- public navigation
- approved-information notice
- navy project hero
- aggregate values
- approved public copy/media
- explicit distinction between staff preview and published view

## 11. Motion

Normal transitions: approximately `150ms`.

Progress width: `200ms ease-out`.

Global CSS honors `prefers-reduced-motion`.

No essential information may depend on animation.

## 12. Accessibility

Preserve existing direction:
- skip link
- semantic landmarks
- visible focus rings
- ~44px controls
- keyboard navigation
- ARIA invalid/error relationships
- ARIA progress bars
- live result/status announcements
- reduced motion
- mobile overflow containment
- status text plus color
- labelled modal/sheet controls

`design-qa.md` records a mobile navigation close-control contrast issue that was fixed and scoped focus/target-size evidence.

Do not claim full WCAG conformance without a complete audit.

Final-gate additions should include:
- measured contrast
- 200% zoom/reflow
- forced-colors
- screen-reader sampling
- chart/map alternatives

## 13. Charts, Maps, Monitoring Visuals

Current libraries:
- ECharts
- MapLibre GL

Rules:
- visualize trusted persisted/derived metrics
- missing data remains unavailable, not zero by assumption
- label statuses/values in text
- avoid misleading scales
- aggregate-only roles cannot gain sensitive detail through drilldowns
- apply SADDD suppression before visualization/export
- do not expose sensitive Beneficiary coordinates without explicit authorization

## 14. Copy / Product Maturity

User-facing UI must not present PATHWAYS as:
- prototype
- mock
- demo-only
- presentation-only

Valid functional preview terms remain allowed:
- Quick Preview
- Staff Preview
- Public Preview

Runtime mock/fallback data must not masquerade as persisted production data.

Voice is:
- direct
- factual
- calm
- privacy-aware
- human-review aware

Avoid AI/autonomous-decision language for deterministic rule support.

## 15. Asset Governance

Current verified source convention:

```text
/brand/pathways-mark.png
```

Use existing assets first.

Do not:
- create substitute logos
- use arbitrary remote imagery
- use stock/fabricated Beneficiary imagery as evidence
- publish private media without approval/provenance

## 16. Quality Gate

Before accepting frontend/design work:

- [ ] current primitives reused before creating new ones
- [ ] semantic tokens reused
- [ ] heading/body typography preserved
- [ ] correct staff/auth/public surface mode preserved
- [ ] 44px normal target size preserved
- [ ] keyboard/focus tested
- [ ] mobile overflow/reflow tested
- [ ] loading/empty/error states implemented
- [ ] statuses not color-only
- [ ] no sensitive-data leakage
- [ ] no fabricated runtime data
- [ ] no user-facing prototype/mock/demo/presentation-only label
- [ ] frontend visibility is not treated as authorization
- [ ] visual result compared with current PATHWAYS UI
- [ ] relevant component/E2E tests pass

## 17. Materialization Contract

| Target | File | Purpose |
|---|---|---|
| Canonical | `docs/dsd-pathways.md` | full design authority |
| Brand reference | `BRAND.md` | materialized brand/product subset |
| Design reference | `DESIGN.md` | materialized implementation subset |

No automatic materialization script is currently claimed.
