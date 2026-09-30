<!-- MATERIALIZED from docs/dsd-pathways.md by scripts/docs/materialize.py. Do not hand-edit; edit the canonical doc and re-run. -->

# PATHWAYS Design

> Visual language, materialized from DSD sections 2-8.

## 2. Brand Primitives

### 2.0 Token Architecture

Current tokens are the 47 CSS variables in `apps/web/src/app/globals.css` (HSL triplets consumed through Tailwind semantic names). The target tokens below come from the Pathways foundations. The target is not shipped; product UI keeps using the current variables until an approved change migrates them, and the gap table in section 2.1 is the migration map. Use semantic variables, never new hard-coded colors, and do not invent values (section 1 conflict rules).

### 2.1 Colors

**Color principle.** Blue is direction and action; cyan is connection and information; neutrals are working surfaces and hierarchy; semantic colors are status and attention. Do not reinterpret these roles per screen.

**Pathways Blue** (primary interaction and navigation family)

| Token | Hex | Intended use |
|---|---|---|
| blue.900 | #00356F | Headings, strong focus |
| blue.700 | #005EBF | Accessible buttons with white text |
| blue.500 | #007DFE | Core brand, links, visual accents |
| blue.300 | #66B4FF | Charts and accents |
| blue.100 | #CDE6FF | Selected and informational surfaces |

Use blue.700 for primary filled buttons with white text, blue.500 for brand accents, links and non-body-text UI, blue.900 for strong headings and focus, blue.100 for selected or informational surfaces. Blue indicates identity, interaction, navigation, focus, selection or information, never decoration.

**Pathways Cyan** (connected information, secondary brand expression, sidebar, highlights, data visualization)

| Token | Hex | Intended use |
|---|---|---|
| cyan.900 | #00537F | Deep accent text |
| cyan.700 | #0074B3 | Accessible filled treatments with white text |
| cyan.500 | #00A5FE | Sidebar highlights and visual accents |
| cyan.300 | #66CAFE | Data visualization |
| cyan.100 | #CCEDFF | Informational surfaces |

Cyan stays secondary to blue in the interaction hierarchy, never substitutes for semantic status colors, and gets no additional shades without a formal update.

**Interface neutrals**

| Token | Hex | Intended use |
|---|---|---|
| ink | #232631 | Primary text |
| muted | #6F7785 | Secondary text |
| divider | #DBDFE2 | Borders and separators |
| surface | #F5F6FA | Cards, pills, contained surfaces |
| canvas | #F4F1EC | Primary page ground |
| paper | #FFFFFF | Elevated cards and working surfaces |

Most operational content uses neutral surfaces; do not fill every card with brand color. Use divider only when spacing alone is insufficient.

**Semantic colors** (700 = accessible text, 500 = UI signal, 100 = background)

| Meaning | 700 | 500 | 100 |
|---|---|---|---|
| Success: complete, verified, validated | #08783E | #18A957 | #DDE6E8 |
| Warning: flagged, attention required, pending review | #9A5200 | #D97706 | #FFF0C7 |
| Danger: overdue, incomplete, error, blocked | #B51D32 | #EF3340 | #FFE1E5 |
| Information: in progress, guidance | #005EBF | #007DFE | #CDE6FF |

Ambiguity flagged for human review: the color foundations file gives success.700 as #08783E and success.100 as #DDE6E8, while the palette image shows #08783F and #DDF6E8. The foundations file value is used here; confirm against the approved palette source before implementation.

Semantic rules: information reuses the blue family; danger is never decorative; every important state pairs color with an icon or text label (for example Verified, Needs review, Validation failed, In progress); never a green dot only, red row only or yellow background only. Use the 700 tone for text on its 100 surface; 500 tones are UI signals and large display elements, not body text. Do not assume two palette colors are accessible together.

Charts primarily use the blue and cyan families; semantic colors only when the chart itself shows a semantic state; no danger red for a neutral category; do not rely on hue alone, add labels, values, patterns, markers or direct annotation.

Prohibited: inventing brand colors, decorative semantic colors, color-only status, saturated brand-color operational surfaces, low-contrast "soft" text, treating blue and cyan as interchangeable, gradients replacing functional tokens.

**Authentication gradient exception.** Current auth surfaces use a light-blue/white gradient such as `#C8EAF9 -> #F5FBFE -> #FFFFFF -> #DCEFFC`. It is an access-surface exception, not a staff-workspace background.

**Gap table: current versus target.** Current values are the `globals.css` HSL triplets with approximate hex; Target values are the foundation tokens above.

| Token | Current | Target | Use |
|---|---|---|---|
| `background` | `0 0% 100%` (#FFFFFF) | `canvas` #F4F1EC | primary page ground where the layout calls for it |
| `foreground` | `205.7 43.2% 15.9%` (#172B3A) | `ink` #232631 | primary text |
| `workspace` | `0 0% 100%` (#FFFFFF) | `paper` #FFFFFF | elevated working surfaces |
| `surface-subtle` | `210 33.3% 97.6%` (#F7F9FB) | `surface` #F5F6FA | cards, pills, contained areas |
| `card` | `0 0% 100%` (#FFFFFF) | `paper` #FFFFFF | card ground |
| `card-foreground` | `205.7 43.2% 15.9%` (#172B3A) | `ink` #232631 | card text |
| `popover` | `0 0% 100%` (#FFFFFF) | `paper` #FFFFFF | menus and popovers |
| `popover-foreground` | `205.7 43.2% 15.9%` (#172B3A) | `ink` #232631 | popover text |
| `primary` | `206.8 100% 40.4%` (#0072CE) | `blue.700` #005EBF | primary filled button with white text |
| `primary-hover` | `206.6 100% 36.3%` (#0067B9) | `blue.900` #00356F | hover and pressed (darken plus motion) |
| `primary-active` | `206.5 100% 32%` (#005BA3) | `blue.900` #00356F | pressed |
| `primary-subtle` | `206.7 75% 95.3%` (#EAF4FC) | `blue.100` #CDE6FF | selected and informational surface |
| `primary-foreground` | `0 0% 100%` (#FFFFFF) | `paper` #FFFFFF | text on primary |
| `navy` | `209.1 75.6% 17.6%` (#0B2E4F) | `blue.900` #00356F | strong headings, focus, dark shell |
| `navy-foreground` | `0 0% 100%` (#FFFFFF) | `paper` #FFFFFF | text on dark shell |
| `navy-muted` | `207.7 31% 83.5%` (#C8D6E2) | `blue.100` #CDE6FF | secondary text on dark shell |
| `light-blue` | `206.7 75% 95.3%` (#EAF4FC) | `blue.100` #CDE6FF | light brand surface |
| `light-blue-foreground` | `206.4 100% 32.9%` (#005EA8) | `blue.700` #005EBF | text on light brand surface |
| `secondary` | `206.7 25.7% 93.1%` (#E9EEF2) | `surface` #F5F6FA | secondary and disabled surface |
| `secondary-foreground` | `205.7 43.2% 15.9%` (#172B3A) | `ink` #232631 | text on secondary |
| `muted` | `204 23.8% 95.9%` (#F2F5F7) | `surface` #F5F6FA | neutral fill |
| `muted-foreground` | `207.7 19.2% 39.8%` (#526779) | `muted` #6F7785 | secondary text |
| `accent` | `206.7 75% 95.3%` (#EAF4FC) | `blue.100` #CDE6FF | hover and selected accent |
| `accent-foreground` | `206.4 100% 32.9%` (#005EA8) | `blue.700` #005EBF | text on accent |
| `link` | `206.4 100% 32.9%` (#005EA8) | `blue.500` #007DFE | links |
| `success` | `150.3 59.5% 30%` (#1F7A4D) | `success.700` #08783E | accessible success text |
| `success-subtle` | `147.7 41.9% 93.9%` (#E9F6EF) | `success.100` #DDE6E8 | success surface |
| `success-foreground` | `0 0% 100%` (#FFFFFF) | `paper` #FFFFFF | text on success fill |
| `warning` | `30.9 89% 28.6%` (#8A4B08) | `warning.700` #9A5200 | accessible warning text |
| `warning-subtle` | `34.6 100% 94.9%` (#FFF4E5) | `warning.100` #FFF0C7 | warning surface |
| `warning-foreground` | `0 0% 100%` (#FFFFFF) | `paper` #FFFFFF | text on warning fill |
| `danger` | `4.2 76.5% 40%` | `danger.700` #B51D32 | accessible danger text |
| `danger-hover` | `4.4 76.5% 35.1%` | `danger.700` #B51D32 | destructive hover |
| `danger-active` | `4.5 79.9% 29.2%` | `danger.700` #B51D32 | destructive pressed |
| `danger-subtle` | `3.5 81% 95.9%` (#FDEDEC) | `danger.100` #FFE1E5 | danger surface |
| `danger-foreground` | `0 0% 100%` (#FFFFFF) | `paper` #FFFFFF | text on danger fill |
| `info` | `206.4 100% 32.9%` (#005EA8) | `info.700` #005EBF | informational text |
| `info-subtle` | `206.7 75% 95.3%` (#EAF4FC) | `info.100` #CDE6FF | informational surface |
| `info-foreground` | `0 0% 100%` (#FFFFFF) | `paper` #FFFFFF | text on info fill |
| `destructive` | `4.2 76.5% 40%` | `danger.700` #B51D32 | destructive action |
| `destructive-foreground` | `0 0% 100%` (#FFFFFF) | `paper` #FFFFFF | text on destructive |
| `disabled-foreground` | `209.1 15.3% 42.2%` | `muted` #6F7785 | disabled text, explained where important |
| `border` | `210 24.2% 87.1%` (#D6DEE6) | `divider` #DBDFE2 | borders and separators |
| `border-strong` | `209.1 20.6% 65.7%` (#96A8BA) | `divider` #DBDFE2 | stronger divider (no separate target value; flagged) |
| `input` | `210 15.2% 58.8%` (#8696A6) | `muted` #6F7785 | form border (no separate target value; flagged) |
| `ring` | `206.8 100% 40.4%` (#0072CE) | `blue.700` #005EBF | keyboard focus ring |
| `radius` | `0.375rem` | 8 px controls, 12 px cards, 16 px panels | radius scale (section 2.5) |
| `brand-blue-900 (new)` | none | #00356F | headings, strong focus |
| `brand-blue-700 (new)` | none | #005EBF | accessible buttons with white text |
| `brand-blue-500 (new)` | none | #007DFE | core brand, links, accents |
| `brand-blue-300 (new)` | none | #66B4FF | charts and accents |
| `brand-blue-100 (new)` | none | #CDE6FF | selected and informational surfaces |
| `brand-cyan-900 (new)` | none | #00537F | deep accent text |
| `brand-cyan-700 (new)` | none | #0074B3 | accessible filled treatments with white text |
| `brand-cyan-500 (new)` | none | #00A5FE | sidebar highlights and accents |
| `brand-cyan-300 (new)` | none | #66CAFE | data visualization |
| `brand-cyan-100 (new)` | none | #CCEDFF | informational surfaces |
| `canvas (new)` | none | #F4F1EC | primary page ground |
| `success-500 (new)` | none | #18A957 | success UI signal |
| `warning-500 (new)` | none | #D97706 | warning UI signal |
| `danger-500 (new)` | none | #EF3340 | danger UI signal |
| `info-500 (new)` | none | #007DFE | information UI signal |

### 2.2 Logo System

Asset: `apps/web/public/brand/pathways-mark.png`, served as `/brand/pathways-mark.png`.

Coded default size: `32 x 32px`. The staff sidebar commonly renders the mark around `44 x 44px` and applies a white/inverted treatment on the dark shell.

Rules:
- use the existing mark;
- preserve aspect ratio;
- do not recreate it as CSS art, emoji, or an improvised SVG;
- decorative empty-alt treatment is acceptable when adjacent PATHWAYS text supplies the accessible name.

### 2.3 Typography

Current heading font: `MomoTrustDisplay-Regular.ttf`, loaded via `next/font/local` as `--font-heading`, applied to h1-h4, product name, card/dialog titles and selected headings; global CSS forces regular weight.

Current body font:

```text
"Segoe UI", "Helvetica Neue", Arial, sans-serif
```

The foundations define no typeface; type stays as above until a formal update. Tables and numeric monitoring/financial data use tabular numerals.

Common current scales:
- page H1: `text-3xl` (30px)
- public hero H1: `text-4xl` through `text-6xl` (36-60px responsive)
- project/card title: `text-2xl` (24px)
- card/dialog title: `text-lg` (18px)
- body: `text-base` (16px)
- operational/helper: `text-sm` (14px)
- compact metadata/eyebrow: `text-xs` / ~13px

Do not introduce a competing type system without approval.

### 2.4 Imagery & Illustration

Use the existing mark, charts, approved project media and safe maps. Avoid decorative stock humanitarian imagery, fake Beneficiary portraits, fabricated project photos and placeholders that imply verified impact. Private evidence stays private until separately approved. Brand artwork may use approved brand treatments; operational UI stays restrained and readable.

### 2.5 Elevation & Depth

**Radius scale (target).** Use only these; radius communicates containment, and nested rounded containers are avoided.

| Radius | Usage |
|---|---|
| 4 px | Tags and compact elements |
| 8 px | Controls |
| 12 px | Cards |
| 16 px | Panels |
| 999 px | Pills (status) |

Current: root `--radius: 0.375rem`, so `rounded-lg` is about 6px, `rounded-md` 4px, `rounded-sm` 2px; pills, badges and progress use full radius.

**Border-first elevation (target).** Prefer spacing, then a subtle surface difference, then a border, then a shadow only when extra elevation is needed.

| Level | Use |
|---|---|
| Level 0 | Inline |
| Level 1 | Card |
| Level 2 | Menu |
| Level 3 | Modal |

Cards represent meaningful bounded groups; not every piece of information is a card. Current popover shadow `0 8px 20px rgb(11 46 79 / 10%), 0 1px 3px rgb(11 46 79 / 8%)`; current dialog shadow `0 16px 40px rgb(11 46 79 / 14%), 0 2px 6px rgb(11 46 79 / 8%)`. Cards are generally flat and bordered; existing localized `shadow-sm` is acceptable, but no strong shadows on normal cards.
## 3. Layout & Spatial System

### Spacing rhythm (target)

4 px basis. Approved tokens: 4, 8, 12, 16, 24, 32 px. Use 8-16 px inside dense controls and 24-32 px between major related blocks. Spacing establishes hierarchy before extra borders, backgrounds or shadows; no arbitrary values when a token fits.

### Standard desktop layout (target)

A centered application workspace with persistent primary navigation and a clear content area.

| Property | Value |
|---|---|
| Viewport | 1440-1920 px |
| Content maximum | 1200 px |
| Gutter | 32-64 px |
| Wider screens | extra width becomes outer margin |

Sidebar variants are one navigation architecture, not different information architectures:

1. Full sidebar (dark).
2. Branded/component sidebar (blue, cyan highlights).
3. Collapsed sidebar (icons only). It keeps recognizable navigation through icons, tooltips or labels, accessible names and active-state indication.

Frequent global utilities (activity search, notifications, project context, account controls) may stay persistent but never compete with the primary task; search labels and placeholders describe what is searchable. Summary cards stay 160-240 px wide and wrap to a new row before labels are compressed; the card grid is 12 columns.


### Current staff shell (implemented)

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

### Target foundations

**Button sizes.** Small 36 px visual height (compact contexts only, effective target stays 44 x 44 px), Default 44 px, Large 52 px (explicit primary actions and high-emphasis flows). Minimum interaction target 44 x 44 px.

**Action hierarchy.** One dominant primary action per working context: Primary (expected next step), Secondary (alternative), Tertiary (low-emphasis contextual), Destructive (consequential removal, not adjacent to frequent safe actions). Frequent actions are not hidden in overflow menus.

**Interaction states.** Default (blue.700 fill), hover/pressed (darken plus motion), keyboard focus (3 px visible ring), disabled (no action available; explain how to proceed when the action is important), loading where applicable. Minimum contrast ratio 4.5:1.

**Card sizing and padding.** 16 px compact metric or dense utility card, 20 px default card, 24 px feature or high-emphasis card; use the smallest padding that preserves readability.

**Row heights.** Compact 44 px (dense utility lists), Default 56 px (title plus status or action), Rich 72 px (secondary information or several related values). Do not increase height to look spacious.

**Choosing containers.** Card for summary metrics and bounded groups; Row for repeated records; Table when users compare across columns, sort or filter; Context panel or inspector for supporting information that keeps the screen context; Drawer for short contextual create or edit flows (do not nest drawers); Full page for a changed primary task. Avoid card soup.

**Status presentation.** Every status uses color plus a text label, and an icon where it helps (for example "! Needs review", never a yellow dot). Status pills use the 999 px radius and one convention across screens.

**Feedback and errors.** Show meaningful processing states ("Importing 248 records...", "241 records matched. 7 need review.", "Changes saved.") rather than indefinite spinners. Errors say what happened, what was affected, what to do next and whether existing information changed; they appear near the affected field and never erase valid input.

**Forms.** Minimize entry and memory load, default from known context when safe, group related fields, mark required fields, use progressive sections for long workflows, and offer a review state for consequential submission.

**Context preservation.** Filters, search terms, selected records, pagination and expanded states survive a temporary inspection.

**Reduced-click rule.** Remove interactions caused only by avoidable page switching, duplicated confirmation, hidden frequent actions, repeated entry, needless intermediate screens or context loss. Keep interaction that protects data integrity, privacy, access control, consequential changes, external publication or destructive operations.

### Current component specs (implemented)

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

### LockedField
A shared component for a control the caller may read but not change. It renders the field's visible label and current value inside a disabled control, with the tooltip "You are not authorized to change this field". The tooltip opens on hover and on keyboard focus of a focusable wrapper, and is linked through `aria-describedby` so it is announced with the control. A request never sends a locked field's value. `LockedField` shows only values the caller may already read; a value the caller cannot read stays omitted, never shown locked. Used for the activity budget (missing `budgets.create`/`budgets.update`), activity indicator links (missing `indicators.update`), and project profile fields (missing `projects.update`).

### Async / empty / error
Use truthful loading, empty, unavailable, error, and retry states. Do not inject fake records just to avoid an empty state.

A genuinely empty value or list reads "None yet". Load failures and permission states keep their error wording, such as "Unavailable" or "could not be loaded", with a retry where one helps. Missing data is never shown as 0; a real zero from the server is shown as 0.

**Data fetching.** Protected reads go through `useAuthorizedRead` (TanStack Query). Reads are live by default. Lists and summaries may opt in to the 30-second summary window. Beneficiary, step-up and import batch-status reads are never cached. Workspace tabs share stable resource keys, such as one project read for the Overview and Activities tabs.

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

**Dashboards.** Use trusted metrics and explicit project context. Do not introduce one universal overall project-success percentage unless an approved methodology defines it. The Project Overview KPI achievement tile uses the developer-approved methodology (2026-09-28) in the SDD "Project workspace reads" section.

**Rule configuration.** The create/edit dialog is a two-step wizard inside the existing dialog shell (no separate route). Step 1, "Rule", collects Applies to (project or organization template), an optional Start from template picker shown only when creating a new rule, name, code, severity, and the nested AND/OR condition tree with typed metrics, operators, and thresholds. Step 2, "Recommendations", collects the 1 to 10 predefined recommendations. Next validates step 1 client-side before advancing; Back preserves entered data; the final Create draft or Save draft action appears only on step 2 and always submits one payload matching the existing server contract. A step change and step 1 validation errors are announced through an aria-live region. Indicator and activity options for conditions are scoped to the selected project and reload from the existing authorized-read gating (activities.read or activities.context.read); changing the project clears any existing indicator/activity bindings in conditions and shows an inline explanation. Organization templates cannot bind record-specific metrics and show those metrics as unavailable with a short explanation. Existing visual grammar continues: rule list left, selected rule detail right, configuration/view-only status, two-column form at medium sizes, info-subtle rule preview, human-review disclaimer, explicit server-unavailable state. No arbitrary SQL/code input.

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

Target rules from the foundations: meaning never by color alone; important states pair color with text or a recognizable icon; visible keyboard focus; clear labels rather than icon-only controls, with accessible names where icon-only; predictable placement of recurring controls; 44 x 44 px effective targets; nothing essential depends on hover; errors associated with their fields and explained in plain language; user input preserved after recoverable errors; readable hierarchy at increased text size and zoom; charts expose meaning through labels, values or summaries. Role-specific interfaces may simplify functionality but keep the same design language.

Current implementation:

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
## 7. Design Review Settings

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

### Agent implementation rules

When generating a screen: reuse existing tokens and patterns, identify the user's primary task and one dominant next action, preserve workflow context, use approved spacing, radius and color tokens, communicate loading, empty, error and success states, support keyboard access, use plain operational language. Do not invent a design language, colors or spacing values; no decorative gradients in ordinary UI; not every block is a card; no frequent actions in overflow menus; no color-only status; no needless nested navigation; do not expose sensitive Beneficiary information simply because it exists; do not present rule-based suggestions as autonomous decisions. When uncertain, prefer the simpler established pattern.
## 8. Design Quality Gate

Before accepting frontend/design work:

- [ ] current primitives reused before creating new ones
- [ ] semantic tokens reused; any target token used is listed in the section 2.1 gap table
- [ ] heading/body typography preserved
- [ ] correct staff/auth/public surface mode preserved
- [ ] 44px normal target size preserved (36 px only in compact contexts with a 44 px effective target)
- [ ] radius and spacing values taken from the approved scales
- [ ] one dominant primary action per working context
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
