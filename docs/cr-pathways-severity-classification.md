# Change Record: Severity Classification From Actual Figures

**ID:** `cr-pathways-severity-classification`  
**Date:** 2026-10-19  
**Status:** Approved (developer, 2026-10-19)

## 1. Trigger

Tool defense revision matrix, Panelist 2 (Mr. Violeta):

- Item 3: severity has no standard basis. A label chosen per rule lets two authors rate the same situation differently.
- Item 7: demonstrate a rule against actual data: create a post-test activity, enter sample results, and show how the rule applies and what follows.

The response is the PATHWAYS Severity Guide in Plain Language, Draft 0.2 (18 October 2026), hereafter "the guide", kept in the repository as [severity-guide-v0-2](severity-guide-v0-2.md). Section references in this record and in alert reasons use the guide's numbering. The developer approved on 2026-10-19 implementing the guide within this boundary: **when an alert fires, the system suggests a severity and shows its basis.** No new roles, workflows or reseed.

## 2. Current Contract

- `alert_rules.severity` (LOW, MEDIUM, HIGH, CRITICAL; default MEDIUM) is chosen by the rule author. Every alert copies it at creation (0031:4481, trigger 0031:5945); the snapshot cross-checks it (0031:4439).
- Step 3 of the guided builder (`rule-drawer.tsx:482-497`, `severity-field.tsx`) shows a condition-only aid (`rule-severity.utils.ts`, `cr-pathways-rule-severity-guidance`) that suggests Low, Medium, High or Needs your judgment and never Critical. The advanced editor (`rule-editor.tsx:457`) has a plain select defaulting to LOW.
- Live evaluation runs in PostgreSQL (`evaluate_node`, `capture_rule_snapshot`, `commit_rule_snapshot`; latest versions in 0059/0060). The TS mirror `rule-engine.ts` serves dry-run only. Three-valued AND/OR logic; every leaf is evaluated.
- Only System Administrators author rules. Six roles read and review alerts. Resolve and Dismiss require a note.
- Planning data stored today: project start/end; activity planned start/end; indicator baseline, target, direction, target date and one period; approved expenses and planned budget. Not stored: expected progress by date, spending schedule, expected assessment improvement, manageable follow-up level, essential-commitment flags, recovery reviews.

## 3. Proposed Change

### 3.1 Outcome

Every new alert carries a **severity basis**: one suggested level (Low, Medium or High) or **Needs context**, a one-sentence reason naming the figures and the expectation compared, and the criteria version `severity-guide-v0.2`. Example: *"Suggested severity: Medium. Expected +10 points, actual +2, 8 points below (Severity Guide v0.2, 5.11)."*

The alert's severity is the system's suggestion (developer decision, "Option A"). The rule's saved Low/Medium/High no longer drives alerts. The only author-set level that still applies is Critical (3.6).

### 3.2 Expectations

Severity compares actual figures with an expectation. Expectations come from:

| Metric | Expectation source |
|---|---|
| Indicator progress, indicator current value | 100% of target once the reporting date is on or after the indicator target date (period end when no target date). Before that date: Needs context ("expected progress for this date"). Current value converts to progress through baseline, target and direction first. |
| Activity completion | Share of the same included activities (not cancelled, not archived) whose planned end is on or before the reporting date. These planned dates are the approved plan; no straight-line assumption. Any included activity without a planned end: Needs context. |
| Average assessment score change | New optional rule field **Expected score improvement** (points, 0 to 100). |
| Beneficiaries needing follow-up | New optional rule field **Manageable follow-up level** (percent, 0 to 100). |
| Days past end, activity days overdue, overdue share, budget over 100% | None needed; judged from dates and totals. |

The two new rule fields are entered in Step 3 by the rule author (managers agree the value, the administrator enters it, as stated at the defense). They belong to the rule version, are part of its definition digest, and are shown only for rules containing the matching metric.

### 3.3 Per-metric criteria (guide sections 4 and 5)

"Behind" means (expected - actual) / expected for progress and completion. Boundaries are inclusive exactly as listed; compare with exact decimals, never round into another level.

| Metric (guide item) | Low | Medium | High | Needs context when |
|---|---|---|---|---|
| Indicator value / progress (1, 2) | on/ahead, or behind <= 10% | > 10% to <= 25% behind | > 25% behind | no expectation for the date; missing baseline; unclear direction; baseline equals target |
| Timeline elapsed (3) | explanatory only (3.4) | | | missing or invalid dates |
| Remaining days (4) | positive or zero: explanatory only; negative: use row 5 with the absolute value | | | missing dates |
| Days past project end (5), as share of planned duration | <= 5% | > 5% to <= 10% | > 10% | missing dates; start equals end |
| Activity completion (6) | as row 1-2 | | | as 3.2 |
| Overdue activity share (7), count / included activities | <= 5% | > 5% to <= 15% | > 15% | total unknown; unfinished activity without dates |
| Activity days overdue (8), share of that activity's planned duration | <= 5% | > 5% to <= 10% | > 10% | missing dates; same-day activity |
| Budget used (9) | <= 100%: explanatory only, except 3.4 rule 3 | > 100% to <= 110% | > 110% | mixed currencies; no usable budget |
| Follow-up needed (10), points above manageable level | at or below, or <= 5 | > 5 to <= 15 | > 15 | no manageable level; suppressed |
| Assessment change (11), points below expected improvement | at or above, or <= 5 below | > 5 to <= 10 below | > 10 below | no expected improvement; suppressed |

Where the plan expects zero and actual is zero, there is no shortfall (Low). Missing, invalid or suppressed figures are never treated as zero.

### 3.4 Combining conditions (guide section 6)

1. Only conditions that caused the match count: in an OR group, only TRUE children; in a matched AND group, all children. A TRUE condition inside a group that did not match never raises severity.
2. The result is the highest level among counted conditions. The same figure appearing twice counts once. Reordering equivalent conditions gives the same result.
3. **High spending with low delivery:** budget used >= 90% and activity completion or indicator progress > 25% behind, both among the counted conditions for the same project, supports High and is named in the reason. This is the only special combination applied.
4. **Not enough recovery time** is not applied (needs recovery-review data outside this boundary).
5. **Explanatory-only** conditions (timeline elapsed; remaining days zero or positive; budget at or below 100%) never set or block a level; they appear in the reason ("Time helps explain the situation; it has no separate severity"). If every counted condition is explanatory only, the result is Needs context, naming the delivery expectation needed (guide 5.3, 5.9).
6. A counted condition that Needs context because a figure or expectation is missing blocks the result only if it could raise the level: if another counted condition already supports High, the result is High with the missing item disclosed; otherwise the result is Needs context, naming what is missing and any level already supported ("Medium already supported").
7. A rule that does not match produces no severity.

### 3.5 Where it runs

- One definition of the criteria lives in `packages/shared` (thresholds, boundary rules, reason text, version string). Preview, dry-run and the explanation text use it.
- Live alerts are classified server-side at snapshot commit, in the same transaction that creates or updates the alert, from the snapshot's observations. The browser never computes an official level.
- If live classification is written in SQL, a parity fixture set must prove SQL and TS give identical levels and reasons for every row of 3.3 and every rule in 3.4.
- Each evaluation stores its own basis. On a later matching evaluation of an open alert, the alert's severity and basis move to the new result, and a change is shown on the alert ("Raised from Medium to High on 22 Oct") with both reasons kept. Earlier bases remain readable in evaluation history and are never rewritten. Evaluations that do not match (FALSE, handled by auto-resolve as today) or cannot be checked (UNAVAILABLE) produce no basis and leave the alert's last basis unchanged.
- A severity change does not send a new notification or undo a review. Those would be new workflow; recorded as deferred in `deferred-features.md`.

### 3.6 Critical

The system never suggests Critical. Its two guide cases (section 8) need essential-commitment flags and recorded recovery reviews, which are outside this boundary. The rule author may still mark a rule Critical. Alerts from that rule show **Critical: manual judgment by rule author**, with the system's suggested level and reason beside it.

### 3.7 Alert data

- New alert columns (or one jsonb column) for the basis: status (CLASSIFIED or CONTEXT_REQUIRED), suggested level, reason, counted figures with their expectations, missing items, criteria version, and a manual-Critical flag.
- `rule_based_alerts.severity` holds the effective level: the suggestion, or CRITICAL for a Critical-marked rule. It is null only when the basis is CONTEXT_REQUIRED and the rule is not Critical-marked. Existing triggers and the snapshot cross-check change accordingly.
- `alert_rules.severity` becomes nullable (builder's call): null means the system decides; CRITICAL is the manual Critical mark. The payload, definition digest, template copy and commit cross-check follow this. LOW, MEDIUM and HIGH on existing rule rows are ignored for new alerts.
- The captured snapshot is extended with the planning figures 3.3 needs: project start and end; indicator baseline, target, direction, target date and period end; activity planned start and end for a bound activity; included-activity total, count due by the reporting date and count missing a planned end. These are project planning fields read by the existing evaluation role, not beneficiary detail. The canonical payload, digest and shared observation contracts change with it.
- No backfill of earlier alerts; an alert without a basis displays its stored severity as today.

### 3.8 UI

- **Step 3 (guided builder) and the advanced editor's equivalent step:** the Low/Medium/High picker is replaced by a preview: *"Possible levels: Low, Medium, or High. Critical is set manually."* The preview narrows to the attainable levels where the condition range and stored expectations allow it (example: follow-up above 30% with manageable level 10% gives "High"). Where the level depends on dates known only when the alert fires, it says so. A **Mark as Critical (manual judgment)** control remains. The two expectation fields appear here when relevant. Contradictory conditions on the same metric and binding inside an AND group show *"These conditions cannot happen together."* The guided/advanced split, Steps 1, 2 and 4 are unchanged.
- **Test rule:** the dry-run response adds the suggested level or missing context and the reason for the sample values, labelled as sample results. The workspace accepts the sample expectations needed (for example, sample planned end dates). No live effects.
- **Alerts everywhere severity shows** (alerts workspace, review cards, human review workspace, linked alert summary, notifications, dashboards, print report): a text **Needs context** badge where no level exists, and a "Why this level" line with the reason on alert detail and review screens. Colors always accompany text labels; reasons are on the page, not tooltip-only.

### 3.9 Item 7 demo runbook

New `docs/runbook-severity-panel-demo.md`, run on the existing defense demo seed with no reseed and no seed changes. It depends on [cr-pathways-assessment-score-entry](cr-pathways-assessment-score-entry.md). It walks the team through, in order:

1. Answering item 3: where severity comes from, citing the guide.
2. Creating a post-test activity.
3. Creating an assessment rule with an expected score improvement; Test rule with three labelled sample values showing Low, Medium and High with reasons.
4. Recording real post-test scores from the journey-stage assessment icon, on a seeded ONGOING project with at least five enrollments holding pre-tests (recording participation first where the stage needs it).
5. Activating the rule, triggering evaluation, and showing the alert with its suggested severity and reason.
6. Showing review or dismissal with a note.

Each step states the exact screen, inputs and expected on-screen result. Fallback when live entry is unavailable: the rule runs on the seeded pre/post pairs and Test rule covers the sample results.

### 3.10 Non-goals

Notifying or reopening review when an open alert's severity changes; changing an alert's level with a recorded reason (guide 9); automatic Critical (guide 8); recovery-review and essential-commitment records; the recovery-time combination; spending schedules or interim indicator targets; new roles or permissions; any reseed or seed edit; weighting or averaging levels; editable thresholds (changing them is a code change with a new criteria version).

## 4. Impact

### Product
Severity becomes a reproducible suggestion with a stated basis. Same rule, figures, expectations and criteria version always give the same result.

### Data / Migration
One additive migration after 0070: alert basis storage; nullable effective alert severity; two optional rule-version fields included in the definition digest; updated classification in the snapshot commit path; updated severity triggers and cross-check. Applied migrations are not rewritten.

### Authorization / Privacy
No new permissions or roles. The basis is visible exactly where the alert is. Suppressed beneficiary and assessment results stay suppressed; a reason never reveals a withheld count. Classification reads only the captured snapshot; the snapshot adds non-personal project, indicator and activity planning fields (3.7).

### API
Rule create/update payloads gain the two optional expectation fields and a Critical mark; alert read models gain the basis; dry-run gains the suggested level and reason. Shared Zod contracts updated.

### UI
As 3.8.

### Tests
- Shared classifier: every boundary in 3.3 at, just below and just above each limit; zero expectation; missing, invalid and suppressed figures; each 3.4 rule including nonmatching-group, duplicate-figure, reorder and High-with-missing-detail cases; manual Critical.
- SQL/TS parity fixtures (if SQL classifies).
- Database runtime test (`f10-f11-rules-runtime.sql`) for alert basis creation and the null-severity constraint.
- Step 3 preview, contradiction message, Critical mark and expectation fields; dry-run reason; Needs context badge and reason rendering; accessibility (labels, keyboard, focus).
- Existing F10/F11 QAD regression rows.

### Documentation
This record; `severity-guide-v0-2.md` (registered in `index.md`); `runbook-severity-panel-demo.md`; deferred-register row for severity-change notification; DSD rule-configuration paragraph; `runbook-rule-creation-test.md` severity scenarios; QAD rows; `cr-pathways-rule-severity-guidance` and `cr-pathways-guided-rule-setup` marked partly superseded by this record; `index.md`; `activity-log.md`.

## 5. Alternatives Considered

- Keep author-chosen severity and improve the Step 3 aid only (restraint option): rejected; it leaves item 3 unanswered because alerts still copy a discretionary label.
- Author's saved level as fallback when context is missing ("Option B"): rejected by the developer; it reintroduces discretion and the guide forbids defaulting.
- Full guide including overrides, recovery reviews and automatic Critical: rejected by the developer as outside the severity-classification boundary.
- Manager-entered planning records with a new permission: rejected as new workflow; expectations come from stored dates and two rule fields.
- Straight-line expected progress from elapsed time: rejected; the guide forbids it.

## 6. Migration / Rollback

Apply the additive migration locally through the normal Prisma ledger, then hosted application under its own approval. Rollback: a follow-up migration restores rule-copied severity in the commit path and both NOT NULL constraints, setting null rule severities to the former default MEDIUM and null alert severities from their rules; basis columns may remain unused. Rolled-back MEDIUM values are placeholders, not classifications.

## 7. Verification

1. SAD pre-review (rule-engine determinism, migration integrity, beneficiary privacy, design QA) before implementation.
2. Tests in section 4 pass; web and API typecheck and build; `pnpm docs:materialize`, `pnpm docs:check`.
3. Local end-to-end: run the item 7 runbook against a local restore of the defense seed and confirm each expected on-screen result.
4. Digest-bound SAD review and `pnpm sad:signoff` before marking Applied.

## 8. Approval

Developer decisions 2026-10-19: implement the guide within the severity-classification boundary; Option A; Critical remains a manual author mark; no reseed for item 7; runbook instead. Record approved by the developer on 2026-10-19.

## 9. Disposition

Implemented locally on `feature/severity-classification` (no push, deploy or hosted migration):

- e1a40e59, 89380057: shared Severity Guide v0.2 classifier, reason text and 71 fixtures.
- 73e89ad5: nullable rule severity, expectations and alert severity basis contracts.
- 5192b1a9, 9d14e56a: severity basis in rule dry-run.
- 80c86697, 33b6129e: migration 0072 (expectation columns, observation facts, SQL classifier, classification at snapshot commit, severity change on re-match, alert read model; new `rules-severity` preprovision and cleanup).
- 35fd3900: Needs context alerts in dashboards and reports.
- d8d4400c, ad4834fa: Step 3 preview, Critical mark and expectation fields.
- 04c86925: suggested severity in Test rule.
- d7830f00: severity badge and "Why this level" on alerts.
- Demo runbook: [runbook-severity-panel-demo](runbook-severity-panel-demo.md).

Verification so far: SQL and TS give identical bases for all 71 fixtures and their reordered twins; `Replay-Local.ps1 -MigrationBaseline` exit 0 with `SEVERITY_CLASSIFICATION_RUNTIME=PASS` (155 assertions), `F10_F11_RULES_RUNTIME=PASS` (89 checks) and `SCHEMA_DRIFT=CLEAN`; shared, API and web unit suites, typechecks and the web build pass. The local end-to-end run of the runbook (section 7 step 3) has not been done yet.

Seed deviation: because 0072 rejects LOW, MEDIUM and HIGH on rule save, the eight demo rule definitions in `apps/api/prisma/seeds/local-demo-data.ts` were changed from stored levels to null severity, and `defense-demo-verify.ts` now checks that an alert carries a classified level instead of expecting High and Medium (33b6129e). This is a compatibility edit only: no reseed was run, and the seed data are otherwise unchanged.

Known limits:

- A rule snapshot captured before 0072 and committed after it fails once (its observations have no facts) and is recaptured on the next claim.
- The rule dependency fingerprint does not include indicator target dates or activity planned dates; a change to those dates alone is picked up by the hourly sweep.
- Earlier bases beyond the immediately previous one are kept in evaluation evidence but not shown in alert history.
- The Step 3 preview for activity completion and current indicator value is a range, because the level depends on dates known only when the alert fires.

SAD sign-off pending; not Applied.
