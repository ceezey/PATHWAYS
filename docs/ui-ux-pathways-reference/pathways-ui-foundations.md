# PATHWAYS Interface Foundations
Version: 1.0
Scope: Geometry, spacing, interaction, surfaces, density, and layout
Baseline: Pathways UI foundations.png
---

## 01. Core Guidance

PATHWAYS interfaces are designed for operational work that requires
attention, without requiring unnecessary attention to the interface.

The interface should allow users to:

UNDERSTAND AT A GLANCE
ACT WITHOUT SEARCHING
INVESTIGATE WITHOUT LOSING CONTEXT

Three governing principles:

1. Accessible by default
2. Fewer unnecessary decisions
3. Bounded information density

These principles MUST NOT override safety, traceability, or required
information.

---

## 02. Geometry and Radius

Use only the approved radius scale.

| Radius | Usage |
|---|---|
| 4 px | Tags and compact elements |
| 8 px | Controls |
| 12 px | Cards |
| 16 px | Panels |
| 999 px | Pills |

Do not invent intermediate radii for ordinary components.

Radius communicates containment.

It is not decoration.

Avoid excessive rounded containers nested inside other rounded
containers.

---

## 03. Spacing Rhythm

PATHWAYS uses a 4 px spacing basis.

Approved spacing tokens:

4 px
8 px
12 px
16 px
24 px
32 px

Use 8–16 px for dense controls.

Use 24–32 px between major related blocks.

Spacing SHOULD establish hierarchy before additional borders,
backgrounds, or shadows are introduced.

Do not use arbitrary spacing values when an approved token satisfies the
layout requirement.

---

## 04. Accessible Interaction Sizes

Minimum interaction target:
44 × 44 px

Approved button sizes:

Small: 36 px visual button height
Default: 44 px
Large: 52 px

A visually smaller control MAY be used in compact contexts only when its
effective interaction target remains accessible.

Default buttons SHOULD use the 44 px interaction size.

Large buttons SHOULD be reserved for explicit primary actions and
high-emphasis flows.

---

## 05. Action Hierarchy

Each working context SHOULD have one clearly dominant primary action.

Use:

Primary
→ expected next step

Secondary
→ alternative or supporting action

Tertiary
→ low-emphasis contextual action

Destructive
→ consequential removal or irreversible action

Do not give multiple unrelated actions equal primary emphasis.

Do not hide frequent actions inside overflow menus.

Overflow menus SHOULD contain infrequent or secondary actions.

Destructive actions MUST NOT be visually adjacent to frequent,
non-destructive actions when accidental activation is reasonably
possible.

---

## 06. Interaction States

Interactive controls MUST account for:

- Default
- Hover / pressed
- Keyboard focus
- Disabled
- Loading, when applicable

Keyboard focus MUST remain visibly distinguishable.

Disabled controls MUST NOT be used when the user instead needs an
explanation of how to proceed.

When disabling an important action, provide understandable context where
practical.

---

## 07. Surfaces and Elevation

Use border-first elevation.

Prefer:

spacing
→ subtle surface difference
→ border
→ shadow only when additional elevation is necessary

Avoid using strong shadows as the primary method of separating ordinary
content.

Cards SHOULD represent meaningful bounded groups.

Do not place every piece of information inside a card.

---

## 08. Choosing Containers

Use the following decision rules.

### Card

Use for:

- summary metrics
- bounded information groups
- self-contained overview information

### Row

Use for:

- repeated records
- activities
- submissions
- beneficiaries
- compact operational items

### Table

Use when users need:

- comparison across columns
- scanning of structured records
- sorting or filtering across a dataset

Do not replace a genuinely useful table with dozens of cards.

### Context Panel / Inspector

Use when:

- supporting information belongs to the current task
- users need to inspect relationships
- users should retain their current screen context

### Drawer

Use for:

- short contextual creation or editing flows
- focused secondary tasks that should not replace the current workspace

### Full Page / Workspace

Use when:

- the user's primary task changes
- substantial screen area is required
- the workflow has its own information hierarchy

Do not nest drawers unnecessarily.

Do not create "card soup."

---

## 09. Row Heights

Approved operational row patterns:

Compact: 44 px
Default: 56 px
Rich: 72 px

Use Compact for dense utility lists.

Use Default for standard title + status/action rows.

Use Rich when secondary information or multiple related values are
necessary.

Do not increase row height merely to make the interface appear more
spacious.

---

## 10. Card Padding

Approved card padding:

16 px
→ compact metric or dense utility card

20 px
→ default card

24 px
→ feature or high-emphasis card

Use the smallest appropriate padding that preserves readability.

Operational efficiency takes precedence over decorative whitespace.

---

## 11. Information Density

PATHWAYS uses bounded density.

Organize information according to:

GLANCE
→ SCAN
→ INSPECT

### Glance

Show:
- critical KPIs
- status
- attention items
- expected next action

### Scan

Show:
- activity lists
- records
- submissions
- alerts
- beneficiary lists
- monitoring summaries

### Inspect

Show:
- detailed metadata
- history
- validation information
- audit information
- connected records
- supporting evidence

Do not expose Inspect-level detail by default on overview screens.

Do not hide Glance-level information behind additional navigation.

---

## 12. Context Preservation

When users inspect supporting information, preserve their current working
context whenever practical.

Preferred:

Dashboard
→ activity inspector
→ linked information
→ close inspector
→ same dashboard state

Avoid:

Dashboard
→ separate activity page
→ separate metadata page
→ back
→ back
→ rebuild previous context

Filters, search terms, selected records, pagination, and expanded states
SHOULD be preserved when users temporarily inspect information.

---

## 13. Feedback and System State

The system MUST communicate meaningful processing states.

Do not rely on indefinite spinners when a more informative state is
available.

Prefer:

"Importing 248 records…"

"241 records matched. 7 need review."

"Changes saved."

"Dashboard updated from validated records."

Important operations SHOULD expose:

1. current state
2. result
3. required next action, if any

---

## 14. Errors and Recovery

Errors MUST help the user recover.

Error messages SHOULD answer:

1. What happened?
2. What was affected?
3. What can the user do next?
4. Was existing information changed?

Avoid:

"Invalid metadata."

Prefer:

"7 fields could not be matched. Review the highlighted fields before
applying this dataset."

Validation errors SHOULD appear near the affected information whenever
possible.

Do not erase valid user input after a recoverable error.

---

## 15. Forms

Forms SHOULD minimize unnecessary entry and memory requirements.

Use known information as defaults when safe and appropriate.

Group related fields.

Clearly identify required information.

For longer workflows, use progressive sections rather than one
unstructured form.

Do not ask users to re-enter information already available in the current
context unless confirmation is necessary for safety.

For consequential submission, provide a review state when appropriate.

---

## 16. Status Presentation

Every operational status MUST use:

COLOR
+
TEXT LABEL

and SHOULD use an icon when it improves recognition.

Example:

[!] Needs review

not:

yellow dot

Status pills use the approved 999 px radius.

Do not create different visual status conventions on different screens.

---

## 17. Standard Desktop Layout

The canonical desktop experience uses a centered application workspace
with persistent primary navigation and a clear content area.

Supported sidebar patterns:

1. Full sidebar
2. Branded/component sidebar
3. Collapsed sidebar

These are variations of the SAME navigation architecture.

Do not create different information architectures for each sidebar
variant.

Collapsed navigation MUST preserve recognizable navigation through icons,
tooltips/labels, accessible names, and active-state indication.

The content area SHOULD maintain a readable maximum working width rather
than stretching operational content indefinitely across large screens.

Extra viewport width SHOULD become outer margin where appropriate.

---

## 18. Search and Frequent Utilities

Frequently used global utilities MAY remain persistently available.

Examples:

- activity search
- notifications
- project context
- user/account controls

Do not allow utility controls to compete visually with the primary task.

Search labels and placeholders SHOULD describe what is searchable.

---

## 19. Accessibility Rules

MUST:

- maintain at least 44 × 44 px effective interaction targets
- provide visible keyboard focus
- use text in addition to color for status
- provide accessible names for icon-only controls
- maintain readable text hierarchy
- keep essential functionality independent of hover
- preserve meaningful content at increased zoom
- provide meaningful labels for form fields
- associate errors with affected fields
- make interactive and non-interactive elements visually distinguishable

Charts and visualizations MUST expose their important meaning through
labels, values, summaries, or another accessible representation.

---

## 20. Reduced-Click Rule

PATHWAYS optimizes for fewer unnecessary interactions.

Do NOT optimize purely for the smallest numerical click count.

Remove interactions that exist only because of:

- avoidable page switching
- duplicated confirmation
- hidden frequent actions
- repeated information entry
- unnecessary intermediate screens
- preventable context loss

Retain interaction when it protects:

- data integrity
- privacy
- access control
- consequential changes
- external publication
- destructive operations

Efficiency and safety are complementary requirements.

---

## 21. Agent Implementation Rules

When generating a new PATHWAYS screen:

MUST:
- reuse existing tokens and patterns
- identify the user's primary task
- identify one dominant next action
- preserve relevant workflow context
- use approved spacing and radius values
- use approved color tokens
- communicate loading, empty, error, and success states
- account for keyboard and accessible interaction
- use plain operational language

MUST NOT:
- invent a new design language
- invent colors or spacing values
- create decorative gradients for ordinary UI
- make every content block a card
- hide frequent actions in overflow menus
- use color as the only status signal
- create unnecessary nested navigation
- expose sensitive beneficiary information simply because it exists
- present rule-based suggestions as autonomous decisions

When uncertain, prefer the simpler established pattern rather than
inventing a new component.