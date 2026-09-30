<!-- MATERIALIZED from docs/dsd-pathways.md by scripts/docs/materialize.py. Do not hand-edit; edit the canonical doc and re-run. -->

# PATHWAYS Brand

> Verbal identity, materialized from the DSD (sections 0, 0.5, 1, 2, 8, 9).

## 0. Brand Stance

**Brand idea: make the pathway visible.** Project information moves through connected stages: field data, structured project information, validation, monitoring, interpretation, human action, reporting. At any meaningful point the interface answers five questions: where am I, what am I looking at, what is this connected to, what needs my attention, what can I safely do next.

**Brand promise.** Complex project information feels connected, understandable, traceable, actionable and safe to work with.

**Experience character.** Calm, clear, connected, guided, operational, transparent, forgiving, inclusive, human-centered. It must not feel technically intimidating, visually noisy, bureaucratic, spreadsheet-heavy, enterprise-cluttered, admin-centric, autonomous or artificially "intelligent". It does not imitate generic ERP, CRM, task-management or analytics software when that conflicts with these principles.


PATHWAYS is an operational project-information system for humanitarian and development organizations. It should feel institutional but not cold, operational rather than promotional, evidence-first, privacy-aware, and calm under monitoring or risk conditions.

The brand communicates:

1. **Institutional trust:** sensitive project and Beneficiary information is handled deliberately.
2. **Operational clarity:** users understand scope, status, evidence, and next actions quickly.
3. **Human judgment:** monitoring and rule-based support inform people; they do not impersonate autonomous decision-makers.

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
- concise instructions and a direct single-purpose flow.

**Public Transparency**
- white/subtle body surfaces;
- navy storytelling hero;
- larger public headings;
- explicit approved-public framing;
- aggregate/non-sensitive information only.

Do not merge public storytelling composition into the staff workspace without an explicit design reason.

### Anti-references

Avoid:
- default purple SaaS gradients;
- glass-heavy staff dashboards;
- dark-mode-first analytics styling;
- cartoon/gamified status treatment;
- color-only statuses;
- hover-only actions;
- tiny terminal-density controls;
- gratuitous animation;
- fabricated data used to keep screens full;
- fabricated project/Beneficiary imagery;
- AI-chat or autonomous-decision styling or copy for deterministic rules;
- user-facing `prototype`, `mock`, `demo`, `presentation-only`.

Legitimate workflow labels such as **Quick Preview**, **Staff Preview**, and **Public Preview** remain valid when they describe real preview behavior.
## 0.5 Concept Visuals (from IDEA)

No separate concept visuals are maintained. The IDEA document describes the product idea; the implemented UI and the PATHWAYS mark are the current visual baseline, and the two reference boards (interface foundations and color palette) are transcribed as values in sections 2 and 3.

Brand applications:

- **Staff:** persistent primary navigation, PATHWAYS identity, grouped navigation, role/scope context, bordered monitoring surfaces.
- **Authentication:** light-blue/white gradient and centered PATHWAYS identity card.
- **Public:** approved-information notice, navy hero, aggregate metrics, approved copy/media.
## 1. Design Philosophy & Vision

### Product identity

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

### Principles

Design principles from the brand foundations:

- **Context over navigation:** stay in the working context with side panels, drawers, inline expansion and inspectors; use a full page only when the primary working context changes. The goal is minimum unnecessary context switching, not zero navigation.
- **Recognition before recall:** show project, activity and indicator names, status labels, relationships, recent context, selected filters and the current workflow step instead of internal IDs or hidden state.
- **One clear next action:** each task state has one visually dominant next action, for example dataset uploaded then Review mappings, mappings reviewed then Apply import.
- **Progressive disclosure:** Glance (status, key metrics, urgent attention, next action), Scan (lists, records, submissions, alerts), Inspect (metadata, history, validation, relationships, evidence, audit). Do not expose Inspect detail by default; do not hide what is needed to finish the task safely.
- **Connected information:** show only relationships that help the user understand context, trace information or complete the task.
- **Human control:** system-generated mappings, alerts and recommendations are distinguishable from verified or user-approved information. Use "Suggested match", "Potential match", "Needs review", "Flagged for review", "Recommended action"; never imply certainty or present rule-based output as AI conclusions.
- **Safety by design (proportionate friction):** frequent, low-risk, reversible actions need minimal interaction; deleting, overwriting imports, publishing, changing access, applying consequential mappings or exposing information externally need deliberate confirmation that states what will happen, what is affected, whether it is reversible and what to do to proceed. Fewer clicks never overrides safety.
- **Inclusive by design:** accessibility is a foundation (section 6).
- Border-first, not shadow-first.
- Evidence-first: charts, approved project media, safe maps, and the existing mark; evidence/media carries explicit access and publication provenance.
- Truthful states: missing data is unavailable, never fabricated.
- Frontend visibility is not authorization.

### Brand decision test

Before introducing a new UI pattern ask: does it preserve the user's context, reduce cognitive effort, make relationships understandable, make the next action clear, communicate system state, stay safe and reversible where appropriate, stay accessible without relying on color, memory or hidden controls, and keep consequential judgment with the human user. A design that fails these is not a PATHWAYS design even if visually consistent.

### Authority order and conflict rules

| Source | Authoritative for |
|---|---|
| Brand foundations | Product character, UX principles, accessibility philosophy, safety-by-design, language, interaction intent |
| Color foundations | Exact color tokens and color usage |
| UI foundations | Exact spacing, radius, sizing, component, surface, density and layout rules |

When sources conflict:

1. An exact token or specification beats descriptive guidance.
2. Accessibility and safety requirements beat aesthetic preference.
3. Existing approved component behavior beats invention.
4. User workflow context beats decorative consistency.
5. If a required value is missing or ambiguous, do not invent it; flag it for human review.

Do not invent new colors, spacing values, radii or component conventions. Before producing a screen, determine user, task, context, required information, primary action and safety or access constraints, then pick the established PATHWAYS pattern. Optimize for clarity, continuity, accessibility, traceability, low cognitive effort, minimum unnecessary interaction and human control; not for visual novelty, maximum density, minimum clicks at the expense of safety, dashboard aesthetics over workflow usability, or autonomous-looking behavior.

### Language

Write for operational understanding, not implementation architecture: "Connected indicator" not "Indicator metadata relationship", "Needs review" not "Validation exception", "7 fields need review" not "7 mapping errors". Buttons describe the action (Review 7 fields, Save project, Apply import, Generate report, Return for correction); avoid OK, Proceed, Execute, Submit when a specific label exists.

### Imagery and evidence

Avoid decorative stock humanitarian imagery, fake Beneficiary portraits, fabricated project photos, and imagery that implies verified impact when it is only a placeholder. Private evidence remains private until separately approved for publication.

### Voice and product maturity

PATHWAYS copy is direct, factual, calm, privacy-aware, explicit about human review, and honest about unavailable or incomplete states.

Prefer:

> Monitoring rules are unavailable in the current API.

over vague or playful failure copy, and:

> Approved public project information

when public content is approval-controlled.

User-facing UI must not present PATHWAYS as prototype, mock, demo-only, or presentation-only. Runtime mock/fallback data must not masquerade as persisted production data. Avoid AI-powered/autonomous wording and guaranteed-impact claims for deterministic rule support.
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
## 9. Materialization

| Target | File | Sections |
|---|---|---|
| Canonical | `docs/dsd-pathways.md` | full design authority |
| Brand reference | `BRAND.md` | 0, 0.5, 1, 2, 8, 9 |
| Design reference | `DESIGN.md` | 2-8 |

Regenerate with `pnpm docs:materialize` after any DSD change. Never hand-edit `BRAND.md` or `DESIGN.md`; if verified code and this document diverge, reconcile this document first.
