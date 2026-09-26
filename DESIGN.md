<!-- MATERIALIZED from docs/dsd-pathways.md by scripts/docs/materialize.py. Do not hand-edit; edit the canonical doc and re-run. -->

# PATHWAYS Design

> Visual language, materialized from DSD sections 2-8.

## 2. Brand Primitives

### 2.1 Logo / Mark

Asset: `apps/web/public/brand/pathways-mark.png`, served as:

```text
/brand/pathways-mark.png
```

Coded default size: `32 × 32px`. The staff sidebar commonly renders the mark around `44 × 44px` and applies a white/inverted treatment on navy.

Rules:
- use the existing mark;
- preserve aspect ratio;
- do not recreate it as CSS art, emoji, or an improvised SVG;
- decorative empty-alt treatment is acceptable when adjacent PATHWAYS text supplies the accessible name.

### 2.2 Color Tokens

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

Use semantic CSS variables/Tailwind names instead of new hard-coded colors for normal product UI. Semantic status colors are always paired with readable text.

**Authentication gradient exception.** Current auth surfaces use a light-blue/white gradient such as:

```text
#C8EAF9 → #F5FBFE → #FFFFFF → #DCEFFC
```

This is an access-surface exception, not the default staff-workspace background.

### 2.3 Typography

Heading font: `MomoTrustDisplay-Regular.ttf`, loaded via `next/font/local` as `--font-heading`. Applied to h1-h4, product name, card/dialog titles, and other selected headings. Current global CSS forces normal/regular heading weight.

Body font:

```text
"Segoe UI", "Helvetica Neue", Arial, sans-serif
```

Tables and numeric monitoring/financial data use tabular numerals.

Common current scales:
- page H1: `text-3xl` (30px)
- public hero H1: `text-4xl` through `text-6xl` (36-60px responsive)
- project/card title: `text-2xl` (24px)
- card/dialog title: `text-lg` (18px)
- body: `text-base` (16px)
- operational/helper: `text-sm` (14px)
- compact metadata/eyebrow: `text-xs` / ~13px

Do not introduce a competing type system without approval.

### 2.4 Radius, Borders, Elevation

Root radius: `--radius: 0.375rem`.

- `rounded-lg` ≈ 6px
- `rounded-md` ≈ 4px
- `rounded-sm` ≈ 2px
- pills/badges/progress may use full radius

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

Cards are generally flat/bordered. Existing localized `shadow-sm` usage is acceptable where already established; do not add strong shadows to normal cards by default.
## 3. Layout & Spatial System

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

Common public width: `max-w-6xl`. Project-detail public surfaces may use their explicitly configured wider layout.

### Page headers

`PageHeader` remains flat: optional eyebrow, title, concise description, actions, bottom border. Cards belong to page content rather than wrapping every route heading.

### Information architecture

Current staff navigation groups:

- **Workspace:** Dashboard, Projects, Beneficiaries, Collection
- **Decision Support:** Analytics, Alerts, Reports, Alerts Repository, Public Tracker
- **Administration:** User Management, Audit Log, Backup & Recovery

Role filtering happens before navigation is rendered. Project workspaces use permission-aware tabs. Frontend visibility is not authorization.
## 4. Core Component Specs

### Buttons
Variants: primary/default, secondary, outline, ghost, destructive. Normal height: `44px`.

### Inputs / selects
44px height, explicit border, visible hover/focus, 2px focus ring, ARIA invalid danger state, disabled secondary state.

### Textareas
Minimum height 96px, vertical resize.

### Cards
White/card background, border, 6px radius, normally flat, common `p-5` internal spacing.

### Status badges
Semantic tones: info, success, warning, danger, neutral. Always display a readable label.

### Metric cards
Semantic top border, label + help tooltip, large tabular value, optional semantic icon tile.

### Progress bars
Visual clamp 0-100, ARIA progress semantics, semantic tone. Surrounding copy may preserve actual over-target achievement when business values exceed 100%.

### Tabs
Flat underline/bottom-border pattern, 44px minimum height, visible keyboard focus.

### Tables
Horizontal overflow container, tabular numerals, ~44px rows/headers, subtle header surface, hover/selection feedback, no tiny terminal density.

### Dialogs
Navy 45% overlay, centered bounded surface, scroll containment, visible 44px close control, stacked small-screen footer actions.

### Async / empty / error
Use truthful loading, empty, unavailable, error, and retry states. Do not inject fake records just to avoid an empty state.

### Domain composition patterns

**Project directory**

```text
Page Header
→ Search / Filters
→ Results Announcement
→ Loading / Error / Empty
→ Responsive Project Cards
→ Quick Preview / Open Project
```

**Project workspace**

```text
Page Header
→ Project Workspace Header
→ permission-aware tabs
→ Section Cards / domain panels
```

**Dashboards.** Use trusted metrics and explicit project context. Do not introduce one universal overall project-success percentage unless an approved methodology defines it.

**Rule configuration.** Current implementation is a single-condition configuration shell. Existing visual grammar: rule list left, selected rule detail right, configuration/view-only status, create/edit dialog, two-column form at medium sizes, info-subtle rule preview, human-review disclaimer, explicit server-unavailable state. Future rule-builder work preserves this grammar while adding project/scope, trusted metric selector, typed operators, conditional threshold fields, recommendation linkage, dry run, and ALL/ANY condition groups when approved. No arbitrary SQL/code input.

**Beneficiary-sensitive UI.** Scope is explicit where relevant; aggregate-only roles do not receive detail data; private media remains private by default; public publication requires separate provenance/approval; forbidden existence does not leak through error/empty states.

**Public transparency.** Public navigation, approved-information notice, navy project hero, aggregate values, approved public copy/media, explicit distinction between staff preview and published view.

### Charts, maps, monitoring visuals

Libraries: ECharts, MapLibre GL.

- visualize trusted persisted/derived metrics;
- missing data remains unavailable, not zero by assumption;
- label statuses/values in text;
- avoid misleading scales;
- aggregate-only roles cannot gain sensitive detail through drilldowns;
- apply SADDD suppression before visualization/export;
- do not expose sensitive Beneficiary coordinates without explicit authorization.
## 5. Motion & Micro-interactions

- normal transitions: approximately `150ms`;
- progress width: `200ms ease-out`;
- global CSS honors `prefers-reduced-motion`.

No essential information may depend on animation.
## 6. Accessibility (a11y)

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

The historical `design-qa.md` records a fixed mobile navigation close-control contrast issue and scoped focus/target-size evidence.

Do not claim full WCAG conformance without a complete audit. Final-gate additions: measured contrast, 200% zoom/reflow, forced-colors, screen-reader sampling, chart/map alternatives.
## 7. Taste-Skill Settings

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

### Asset governance

Use existing assets first. Do not:
- create substitute logos;
- use arbitrary remote imagery;
- use stock/fabricated Beneficiary imagery as evidence;
- publish private media without approval/provenance.
## 8. Impeccable Quality Gate

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
