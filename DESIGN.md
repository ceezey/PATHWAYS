> Materialized from `docs/dsd-pathways.md` after review of the supplied PATHWAYS frontend source snapshot on 2026-09-26. Durable design changes belong in the canonical DSD first.

# Design: PATHWAYS

## 1. Current Frontend Design Stack

- Next.js `^15.2.2`
- React `^19.0.0`
- Tailwind CSS `^3.4.17`
- shadcn-style default primitives
- Radix UI
- Lucide React
- ECharts
- MapLibre GL
- Sonner
- React Hook Form
- Zod

The implemented PATHWAYS UI is the baseline. Do not replace it with a generic redesign without explicit authorization.

## 2. Tokens

### Colors

| Token | Approx. Hex |
|---|---|
| `background` | `#FFFFFF` |
| `foreground` | `#172B3A` |
| `surface-subtle` | `#F7F9FB` |
| `primary` | `#0072CE` |
| `primary-hover` | `#0067B9` |
| `primary-active` | `#005BA3` |
| `primary-subtle` | `#EAF4FC` |
| `navy` | `#0B2E4F` |
| `navy-muted` | `#C8D6E2` |
| `secondary` | `#E9EEF2` |
| `muted` | `#F2F5F7` |
| `muted-foreground` | `#526779` |
| `success` | `#1F7A4D` |
| `success-subtle` | `#E9F6EF` |
| `warning` | `#8A4B08` |
| `warning-subtle` | `#FFF4E5` |
| `danger` | `#B42318` |
| `danger-subtle` | `#FDEDEC` |
| `info` | `#005EA8` |
| `border` | `#D6DEE6` |
| `border-strong` | `#96A8BA` |
| `input` | `#8696A6` |

Use semantic CSS variables/Tailwind names rather than duplicate hard-coded literals.

### Typography

Heading:

```text
MomoTrustDisplay Regular
```

Body:

```text
Segoe UI, Helvetica Neue, Arial, sans-serif
```

Use tabular numerals for monitoring/financial/tabular values.

Common current scale:
- page H1: 30px
- public hero H1: 36–60px responsive
- project/card title: 24px
- section/dialog title: 18px
- body: 16px
- operational/helper: 14px
- compact metadata: 12–13px

### Radius

- `rounded-lg`: ~6px
- `rounded-md`: ~4px
- `rounded-sm`: ~2px
- pills/status/progress: full radius

### Elevation

PATHWAYS is border-first.

Popover:
```text
0 8px 20px rgb(11 46 79 / 10%),
0 1px 3px rgb(11 46 79 / 8%)
```

Dialog:
```text
0 16px 40px rgb(11 46 79 / 14%),
0 2px 6px rgb(11 46 79 / 8%)
```

Do not add strong shadows to normal cards by default.

## 3. Layout

### Staff
- sidebar expanded: 292px
- sidebar compact: 86px
- sticky navigation/header
- content: `max-w-7xl`
- page px: 16px mobile / 24px md+
- page py: 24px mobile / 32px md+

### Mobile
- left navigation Sheet ≈ 292px
- normal primary controls ≈ 44px minimum

### Public
- common width: `max-w-6xl`
- project detail may use its explicit configured wider layout

### Route heading
Keep flat:
- eyebrow
- title
- description
- actions
- bottom border

Do not wrap route headers in decorative cards.

## 4. Core Components

### Buttons
Primary, secondary, outline, ghost, destructive. Normal height 44px.

### Inputs / selects
44px, explicit border, 2px focus ring, invalid danger state, disabled secondary surface.

### Textareas
Min 96px, vertical resize.

### Cards
White, bordered, ~6px radius, normally flat, common 20px inner spacing.

### Status badges
Info/success/warning/danger/neutral. Always pair color with text.

### Metric cards
Semantic top border, large tabular value, helper tooltip, optional icon tile.

### Progress bars
Visual clamp 0–100 with ARIA semantics. Preserve true over-target values in adjacent copy when applicable.

### Tables
Horizontal overflow, tabular numbers, ~44px rows, subtle headers, no tiny terminal density.

### Dialogs
Navy 45% overlay, bounded viewport height, internal scroll, 44px close control, stacked mobile footer.

### Tabs
Underline/bottom-border pattern, 44px minimum height, keyboard focus.

### Async states
Truthful loading/empty/unavailable/error/retry. Never fill an empty screen with fabricated records.

## 5. Surface Modes

### Staff Workspace
```text
navy shell + white workspace + bordered cards + semantic status
```

### Authentication
Current allowed exception:
```text
light-blue/white gradient + centered card
```

### Public
```text
white/subtle body + navy hero + larger public headings + approved aggregate information
```

Do not merge public storytelling composition into the staff workspace without an explicit design reason.

## 6. Domain Patterns

### Project Directory
```text
Page Header
→ Search / Filters
→ Results Announcement
→ Loading/Error/Empty
→ Responsive Cards
→ Quick Preview / Open Project
```

### Project Workspace
```text
Page Header
→ Project Workspace Header
→ permission-aware tabs
→ Section Cards
```

### Dashboard
Use trusted metrics and explicit project context. Do not invent one universal project-success percentage.

### Rule Configuration

Current visual grammar:
- rule list left
- selected detail right
- access-status badge
- create/edit dialog
- two-column form at medium sizes
- info-subtle rule preview
- human-review disclaimer
- explicit server-unavailable state

Future expansion should preserve this grammar while adding:
- scope/project
- trusted metric selector
- typed operators
- conditional thresholds
- recommendation linkage
- dry run
- ALL/ANY groups

No arbitrary SQL/code.

### Public Transparency
Approved notice, navy hero, aggregate values, approved media/copy, explicit preview-vs-published distinction.

## 7. Motion

- normal product transitions: ~150ms
- progress width: 200ms ease-out
- reduced motion honored globally

No essential information depends on motion.

## 8. Accessibility

Preserve:
- skip link
- semantic landmarks
- visible focus
- ~44px controls
- keyboard interaction
- ARIA invalid/error relationships
- ARIA progress semantics
- live result/status announcements
- reduced motion
- mobile overflow containment
- text plus color for status

Current design QA records a fixed mobile navigation close-control contrast issue.

Final gates should also test measured contrast, 200% zoom/reflow, forced colors, screen-reader sampling, and chart/map alternatives.

## 9. Charts and Maps

Current libraries:
- ECharts
- MapLibre GL

Rules:
- use trusted persisted/derived metrics
- missing data is not silently zero
- label status/value in text
- avoid misleading scaling
- prevent aggregate-only users from drilling into sensitive detail
- apply SADDD suppression before visualization/export
- do not expose sensitive Beneficiary coordinates without explicit authorization

## 10. Copy / Maturity

Do not show:
- prototype
- mock
- demo-only
- presentation-only

Valid functional terms such as **Quick Preview**, **Staff Preview**, and **Public Preview** remain acceptable.

Runtime mock data must not masquerade as persisted production data.

## 11. Assets

Current mark path:
```text
/brand/pathways-mark.png
```

Use existing approved assets first. Do not create substitute logos or fabricated humanitarian/project imagery.

Public project media requires publication approval/provenance.

## 12. UI Quality Gate

- [ ] existing primitive reused before a new one
- [ ] semantic tokens reused
- [ ] typography retained
- [ ] correct staff/auth/public mode retained
- [ ] ~44px targets preserved
- [ ] keyboard/focus tested
- [ ] mobile overflow/reflow tested
- [ ] loading/empty/error implemented
- [ ] status not color-only
- [ ] no sensitive-data leakage
- [ ] no fabricated runtime data
- [ ] no user-facing prototype/mock/demo/presentation-only label
- [ ] frontend visibility not treated as authorization
- [ ] visual result compared with current PATHWAYS UI
- [ ] relevant component/E2E tests pass

## Governance

Canonical source:

```text
docs/dsd-pathways.md
```

If verified current code and this reference diverge after an approved change, reconcile the DSD first and re-materialize this file.
