# PATHWAYS Brand Foundations
Version: 1.0
Scope: Product identity, experience principles, and interpretation rules

---

## 01. Purpose

PATHWAYS is a metadata-driven Project Information Management and
Decision-Support System for humanitarian and development organizations.

It helps project teams organize project and beneficiary information,
prepare and connect field data, monitor implementation, review
performance, and support human decision-making within one structured
operational environment.

PATHWAYS is not primarily a dashboard, generic admin panel, task manager,
database frontend, or autonomous decision-making system.

The product experience MUST reflect this identity.

---

## 02. Brand Idea

### Make the pathway visible.

Project information moves through connected stages:

Field data
→ structured project information
→ validation
→ monitoring
→ interpretation
→ human action
→ reporting

PATHWAYS makes those relationships understandable without requiring users
to reconstruct them mentally.

At any meaningful point in a workflow, the interface should help answer:

1. Where am I?
2. What am I looking at?
3. What is this connected to?
4. What needs my attention?
5. What can I safely do next?

This is the central interpretation rule for PATHWAYS interfaces.

---

## 03. Brand Promise

PATHWAYS makes complex project information feel:

- Connected
- Understandable
- Traceable
- Actionable
- Safe to work with

The interface MUST reduce unnecessary operational effort without hiding
important information, uncertainty, consequences, or human responsibility.

---

## 04. Experience Character

PATHWAYS should feel:

- Calm
- Clear
- Connected
- Guided
- Operational
- Transparent
- Forgiving
- Inclusive
- Human-centered

PATHWAYS should NOT feel:

- Technically intimidating
- Visually noisy
- Bureaucratic
- Spreadsheet-heavy
- Enterprise-cluttered
- Admin-centric
- Autonomous
- Artificially "intelligent"

Do not imitate generic ERP, CRM, task-management, or analytics software
when doing so conflicts with these principles.

---

## 05. Design Principle: Context Over Navigation

Users should remain in their current working context whenever practical.

Prefer:

- contextual side panels
- drawers
- inline expansion
- inline editing
- contextual actions
- inspectors

over unnecessary:

- page changes
- nested pages
- nested tabs
- repeated modal dialogs
- back-and-forth navigation

A full page SHOULD be used when the user's primary working context changes.

A contextual panel SHOULD be used when the user is inspecting or modifying
supporting information within the current task.

### Example

Preferred:

Project Activity
→ Open activity inspector
→ Review linked indicator
→ Update status
→ Return to activity without losing context

Avoid:

Project Activity
→ Activity page
→ Indicator page
→ Edit page
→ Confirmation page
→ Navigate back repeatedly

The objective is not "zero navigation."

The objective is minimum unnecessary context switching.

---

## 06. Design Principle: Recognition Before Recall

PATHWAYS MUST NOT depend on users remembering information that the system
already knows or can reasonably display.

Prefer visible:

- project names
- activity names
- indicator labels
- status labels
- relationships
- recent context
- selected filters
- current project
- current workflow step

over requiring users to remember:

- internal IDs
- codes without labels
- previous selections
- hidden relationships
- navigation locations
- technical terminology

Relevant context SHOULD appear near the decision or action that depends
on it.

---

## 07. Design Principle: One Clear Next Action

Each task state SHOULD have one visually dominant next action.

This does NOT mean that a screen may contain only one action.

It means the expected next step should be immediately distinguishable
from alternatives.

Examples:

Dataset uploaded
→ Review mappings

Mappings reviewed
→ Apply import

Incomplete activity
→ Update activity

Flagged indicator
→ Review evidence

Avoid presenting multiple unrelated actions with equal visual emphasis.

---

## 08. Design Principle: Progressive Disclosure

Complexity MUST be revealed according to user need.

Use the hierarchy:

GLANCE
→ SCAN
→ INSPECT

### Glance
Immediate status, important metrics, urgent attention, next action.

### Scan
Activities, beneficiaries, submissions, alerts, records, summaries.

### Inspect
Metadata, history, validation details, relationships, evidence,
audit information.

Do not expose maximum detail by default simply because the information
exists.

Do not hide information required to understand or safely complete the
current task.

---

## 09. Design Principle: Connected Information

PATHWAYS records SHOULD communicate meaningful relationships.

When relevant, an object may reveal:

- parent project
- related activity
- connected indicator
- related beneficiaries
- originating dataset
- validation status
- monitoring output
- report usage

Do not add relationships merely for visual complexity.

Only display relationships that help the user understand context,
trace information, or complete the current task.

---

## 10. Design Principle: Human Control

PATHWAYS supports human judgment.

It does not replace human judgment.

System-generated mappings, alerts, recommendations, and interpretations
MUST be distinguishable from verified or user-approved information.

Use language such as:

- Suggested match
- Potential match
- Needs review
- Flagged for review
- Recommended action
- Review recommendation

Avoid language that implies certainty when human review is still required.

Do not present rule-based outputs as AI-generated conclusions.

---

## 11. Safety by Design

PATHWAYS uses proportionate friction.

Frequent, low-risk, reversible actions SHOULD require minimal interaction.

High-impact, destructive, privacy-sensitive, or difficult-to-reverse
actions MUST require greater clarity and deliberate confirmation.

### Low-friction examples

- opening a record
- changing a filter
- viewing metadata
- expanding details
- navigating between related information

### Deliberate-action examples

- deleting records
- overwriting imported data
- publishing information
- changing access permissions
- applying consequential mappings
- exposing information externally

For consequential actions, communicate:

1. What will happen
2. What information is affected
3. Whether the action can be reversed
4. What the user must do to proceed

"Fewer clicks" MUST NOT override safety.

The goal is fewer unnecessary interactions, not fewer interactions at
any cost.

---

## 12. Inclusive by Design

Accessibility is a foundation, not an optional enhancement.

PATHWAYS is used by people with different:

- organizational roles
- technical confidence
- workloads
- devices
- interaction preferences
- perceptual, motor, and cognitive needs

Interfaces MUST remain understandable without specialist technical
knowledge unless the task itself requires such knowledge.

### Required principles

- Do not communicate meaning through color alone.
- Pair important states with text and/or recognizable icons.
- Maintain visible keyboard focus.
- Use clear labels instead of relying only on icons.
- Use predictable placement for recurring controls.
- Preserve user-entered information after recoverable errors.
- Explain errors in human-readable language.
- Avoid unnecessary memory requirements.
- Avoid interaction that depends only on hover.
- Maintain readable hierarchy at increased text size and zoom.
- Provide accessible alternatives or summaries for visualized data.

Role-specific interfaces MAY simplify or expose different functionality,
but MUST preserve the same design language and interaction logic.

---

## 13. Language

Write for operational understanding, not implementation architecture.

Prefer:

"Connected indicator"
over
"Indicator metadata relationship"

"Needs review"
over
"Validation exception"

"7 fields need review"
over
"7 mapping errors"

"Imported by Maria · Today, 10:42 AM"
over
"Import batch metadata"

"Used in 3 monitoring outputs"
over
"3 downstream dependencies"

Technical terminology MAY be used when the target user requires it.

Buttons SHOULD describe the action.

Prefer:

- Review 7 fields
- Save project
- Apply import
- Generate report
- Return for correction

Avoid ambiguous labels such as:

- OK
- Proceed
- Execute
- Submit

when a more specific action label is available.

---

## 14. Brand Decision Test

Before introducing a new UI pattern, ask:

1. Does it preserve or improve the user's context?
2. Does it reduce unnecessary cognitive effort?
3. Does it make important relationships understandable?
4. Is the next action clear?
5. Does it communicate system state?
6. Is it safe and reversible where appropriate?
7. Is it accessible without relying on color, memory, or hidden controls?
8. Does it keep consequential judgment with the human user?

If a design fails these principles, visual consistency alone does not
make it a PATHWAYS design.

---

## 15. Relationship to Other Foundation Files

This document defines WHY PATHWAYS behaves and communicates as it does.

For implementation:

- `pathways-color-foundations.md` is the source of truth for color values,
  semantic colors, and permitted color usage.
- `pathways-ui-foundations.md` is the source of truth for geometry,
  spacing, components, interaction sizes, surfaces, and layout.

DO NOT invent new colors, spacing values, radii, or component conventions
from this document.

If an interpretation in this document appears to conflict with an exact
token or specification in another foundation file, the exact token or
specification takes precedence for implementation.