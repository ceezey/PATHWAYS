# PATHWAYS Color Foundations
Version: 1.0
Scope: Color tokens, semantic meaning, and permitted usage
Baseline: Pathways color palette.png
---

## 01. Color Principle

Color creates orientation before decoration.

PATHWAYS uses blue and cyan to establish product identity, interaction,
and informational relationships. Neutral colors provide calm working
surfaces. Semantic colors communicate operational states.

The governing rule is:

BLUE = direction and action
CYAN = connection and information
NEUTRALS = working surfaces and hierarchy
SEMANTIC COLORS = status and attention

Do not reinterpret these roles per screen.

---

## 02. Pathways Blue

Pathways Blue is the primary interaction and navigation family.

| Token | Hex | Intended Use |
|---|---|---|
| blue.900 | #00356F | Headings, strong focus |
| blue.700 | #005EBF | Accessible buttons with white text |
| blue.500 | #007DFE | Core brand, links, visual accents |
| blue.300 | #66B4FF | Charts and accents |
| blue.100 | #CDE6FF | Selected and informational surfaces |

### Rules

Use blue.700 for primary filled buttons requiring white text.

Use blue.500 for core brand accents, links, and non-body-text UI where
appropriate.

Use blue.900 for strong headings and focus where the design calls for a
brand-toned dark value.

Use blue.100 for selected or informational surfaces.

Do NOT use blue simply to make an element visually interesting.

Blue should normally indicate brand identity, interaction, navigation,
focus, selection, or information.

---

## 03. Pathways Cyan

Pathways Cyan supports connected information, secondary brand expression,
sidebar treatments, highlights, and data visualization.

| Token | Hex | Intended Use |
|---|---|---|
| cyan.900 | #00537F | Deep accent text |
| cyan.700 | #0074B3 | Accessible filled treatments with white text |
| cyan.500 | #00A5FE | Sidebar highlights and visual accents |
| cyan.300 | #66CAFE | Data visualization |
| cyan.100 | #CCEDFF | Informational surfaces |

### Rules

Cyan SHOULD remain secondary to Pathways Blue in general interaction
hierarchy.

Do not substitute cyan for semantic status colors.

Do not create additional cyan shades unless the design system is formally
updated.

---

## 04. Interface Neutrals

| Token | Hex | Intended Use |
|---|---|---|
| ink | #232631 | Primary text |
| muted | #6F7785 | Secondary text |
| divider | #DBDFE2 | Borders and separators |
| surface | #F5F6FA | Cards, pills, contained surfaces |
| canvas | #F4F1EC | Primary page ground |
| paper | #FFFFFF | Elevated cards and working surfaces |

### Rules

The majority of operational content SHOULD use neutral surfaces.

Do not fill every card or section with brand color.

Use `canvas` as the primary page ground where the established PATHWAYS
layout calls for it.

Use `paper` for elevated working surfaces.

Use `surface` for subtle contained areas, pills, or secondary surfaces.

Use `divider` for structural separation when spacing alone is
insufficient.

---

## 05. Semantic Colors

Semantic colors have fixed meanings.

### Success

Meaning:
Complete, verified, validated, successful.

| Token | Hex |
|---|---|
| success.700 | #08783E |
| success.500 | #18A957 |
| success.100 | #DDE6E8 |

Use success.700 as accessible text on success.100 where specified.

---

### Warning

Meaning:
Flagged, attention required, pending review.

| Token | Hex |
|---|---|
| warning.700 | #9A5200 |
| warning.500 | #D97706 |
| warning.100 | #FFF0C7 |

NOTE:
The canonical hexadecimal value for `warning.700` MUST be verified
against the approved palette source before implementation if the source
token is incomplete or malformed.

Do not guess or silently replace an unclear design token.

---

### Danger

Meaning:
Overdue, incomplete, error, blocked, or other states requiring
significant attention.

| Token | Hex |
|---|---|
| danger.700 | #B51D32 |
| danger.500 | #EF3340 |
| danger.100 | #FFE1E5 |

Danger MUST NOT be used decoratively.

---

### Information

Meaning:
In progress, informational guidance, neutral system assistance.

| Token | Hex |
|---|---|
| info.700 | #005EBF |
| info.500 | #007DFE |
| info.100 | #CDE6FF |

Information intentionally reuses the Pathways Blue family.

---

## 06. Semantic Usage Rule

Semantic color communicates state, not category decoration.

Every important semantic state MUST have a non-color indicator.

Preferred pattern:

[icon] Status label

Examples:

✓ Verified
! Needs review
× Validation failed
i In progress

Never use:

green dot only
red row only
yellow background only

to communicate meaning.

---

## 07. Text and Contrast

For semantic surfaces, prefer the 700 tone for text on the corresponding
100 surface.

500 tones are primarily UI signals and large visual elements rather than
default body text.

Use established accessible foreground/background combinations.

Do not assume that two colors are accessible simply because they are part
of the approved palette.

---

## 08. Data Visualization

Charts SHOULD primarily use the approved Pathways Blue and Cyan families.

Semantic colors MAY be used when the visualization itself represents a
semantic state such as success, warning, danger, or information.

Do not assign danger red to a neutral category merely to create visual
variety.

Do not rely on hue alone to distinguish critical chart information.
Where necessary, supplement color with labels, values, patterns,
markers, or direct annotation.

---

## 09. Prohibited Color Behavior

MUST NOT:

- invent additional brand colors without updating this foundation
- use semantic colors decoratively
- communicate status using color alone
- turn large operational areas into saturated brand-color surfaces
- use low-contrast text because it appears visually softer
- treat blue and cyan as interchangeable without regard to hierarchy
- introduce gradients as replacements for functional color tokens

Brand artwork may use approved brand treatments, but operational UI
should remain restrained and readable.