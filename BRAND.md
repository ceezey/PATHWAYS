<!-- MATERIALIZED from docs/dsd-pathways.md by scripts/docs/materialize.py. Do not hand-edit; edit the canonical doc and re-run. -->

# PATHWAYS Brand

> Verbal identity, materialized from the DSD (sections 0, 0.5, 1, 2, 8, 9).

## 0. Brand Stance

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
## 0.5 Concept Visuals

No separate concept visuals are maintained. The implemented UI and the PATHWAYS mark are the visual baseline.

Brand applications:

- **Staff:** navy shell, PATHWAYS identity, grouped navigation, role/scope context, bordered monitoring surfaces.
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

- The implemented PATHWAYS UI is the baseline. Do not replace it with a generic redesign without explicit authorization.
- Border-first, not shadow-first.
- Evidence-first: charts, approved project media, safe maps, and the existing mark; evidence/media carries explicit access and publication provenance.
- Truthful states: missing data is unavailable, never fabricated.
- Frontend visibility is not authorization.

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
## 9. Materialization

| Target | File | Sections |
|---|---|---|
| Canonical | `docs/dsd-pathways.md` | full design authority |
| Brand reference | `BRAND.md` | 0, 0.5, 1, 2, 8, 9 |
| Design reference | `DESIGN.md` | 2-8 |

Regenerate with `pnpm docs:materialize` after any DSD change. Never hand-edit `BRAND.md` or `DESIGN.md`; if verified code and this document diverge, reconcile this document first.
