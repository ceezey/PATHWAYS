# Runbook: Severity Panel Demo (Panelist 2, Items 3 and 7)

**Status:** Working; written from the code, not yet rehearsed end to end
**Date:** 2026-10-20
**Owner:** PATHWAYS capstone team

Script for answering Mr. Violeta at the tool defense. Item 3 asked for a standard, condition-based basis for severity instead of individual discretion. Item 7 asked to "create a post-test activity, enter sample results, and show how the rule applies and what happens afterward." It follows [cr-pathways-severity-classification](cr-pathways-severity-classification.md) section 3.9 and uses [cr-pathways-assessment-score-entry](cr-pathways-assessment-score-entry.md). The standard is the [Severity Guide v0.2](severity-guide-v0-2.md).

**Run it locally.** Hosted devV2 does not have migrations 0071 and 0072 yet. The demo runs on the local stack until a separately approved hosted application (section 3.2). It uses the existing defense demo seed with no seed change.

Rehearse the whole script once on the same machine before the panel. Each step lists the screen, the exact inputs, what the panel should see, and a fallback.

## 1. Before the panel

### 1.1 Data used

| Item | Value |
|---|---|
| Project | `CRL-NS-2026`, Community Resilience and Livelihoods (Northern Samar). ONGOING, not archived, so its assessment figure is computed. |
| Why this project | About 42 enrollments hold a pre-test and none holds a post-test. The five post-tests entered in step 4 are the only complete pairs, so they alone decide the result. |
| Journey stage | Livelihood coaching (code `COACHING`). It has a published attendance form, Livelihood Coaching Attendance, so participation can be recorded there. |
| Seeded activity on that stage | Abaca and coconut by-product livelihood grants (every pre-tested person already has validated attendance on it) |
| Five people | `BEN-CRL-NS-2026-001` to `BEN-CRL-NS-2026-005`. Pre-tests expected from the seed code: 48, 53, 50, 47 and 52 out of 100. Always use the pre-test shown on screen. |
| Fallback project | `WSH-NS-2025`: 8 seeded pre/post pairs, average change +11.625 points, and the seeded rule "Low improvement in survey results" |

| Role (local account) | Does |
|---|---|
| Project Manager | Creates the activity, records participation and scores, reviews the alert |
| Monitoring and Evaluation Officer | Copies the attendance form |
| System Administrator | Publishes the form copy; authors, tests and activates the rule |

Project Officer, M&E Officer and Project Manager can record scores. Only the System Administrator authors rules. The System Administrator cannot see assessment alerts (no assessment detail access), so alerts are shown as the Project Manager.

### 1.2 Preparation (about 45 minutes, mostly waiting)

1. On branch `feature/severity-classification`, with Docker running: `pnpm install`, then `pnpm db:local:start`.
2. `pnpm db:local:reset`. It replays migrations through 0072, including the 0072 preprovision and cleanup.
3. Build the defense demo data locally with the existing seed ([runbook-defense-demo](runbook-defense-demo.md) section 6, steps 2 and 3): run the wipe file, then `pnpm db:defense:local` (about 30 minutes), then `node scripts/db/defense/demo.mjs --test-local --verify`. Expect no failures, including "an alert carries a classified level".
4. `pnpm dev:local`. Sign in at `http://127.0.0.1:3000/staff/login` as the Project Manager, the M&E Officer and the System Administrator, each in its own browser profile. Passwords are in `.tmp/local-seed/`; each account enrolls TOTP on first sign-in.
5. As the Project Manager, open any beneficiary once, verify with the authenticator, and accept "Set a beneficiary access PIN". The PIN reopens beneficiary details for 15 minutes.
6. Start the rule worker API (section 3.1) and run a sweep and a drain once to confirm "Rules dispatch acknowledged."
7. Open [severity-guide-v0-2](severity-guide-v0-2.md) sections 5.11 and 6 in a tab.

## 2. Demo steps

### Step 1. Answer item 3: where severity comes from (2 minutes)

Say, in plain words:

> Severity is no longer chosen by the person who writes the rule. When an alert fires, PATHWAYS compares the actual figure with an agreed expectation and reads the level from one written standard, the PATHWAYS Severity Guide v0.2. For assessment scores (section 5.11): up to 5 points below the expected improvement is Low, more than 5 up to 10 is Medium, more than 10 is High. The same figures always give the same level. The alert shows the level, the numbers compared and the guide section, so anyone can check it. If an expectation or a figure is missing, the system says Needs context instead of guessing. Critical is never automatic: only the rule author can mark a rule Critical, and the alert labels it as manual judgment with the system's own suggestion beside it. The limits are the guide's proposals for managers to approve; changing them is a code change with a new criteria version.

- **Screen:** the guide, section 5.11 table; then, as the Project Manager, `/alerts`, project WSH, the seeded alert "Low improvement in survey results".
- **Expected:** a grey **Needs context** badge; under **Why this level**: "Needs context.", "More information is needed before suggesting a level." and the missing item "We need the expected score improvement for this assessment." This rule has no agreed expectation, so the system does not guess.
- **Fallback:** if the alert is missing, show the guide table and continue; step 3 shows the same behaviour in Test rule.

### Step 2. Create the post-test activity (5 minutes)

**2a. Activity (Project Manager)**

- **Screen:** Projects, CRL-NS-2026, Activities, **New Activity**.
- **Inputs:** Activity title `Livelihood coaching post-test`; Description `Post-test on the livelihood coaching content.`; Activity status left as Planned; Start date yesterday; Due date seven days from today; Target beneficiaries `5`; assigned officer: the Project Officer; Journey stage **Livelihood coaching**. Press **Create Activity**.
- **Expected:** toast "Activity created." and the activity in the list.
- **Fallback:** if saving fails, read the toast, fix the named field and save again.

**2b. Attendance form for the activity (M&E Officer, then System Administrator)**

Participation can only be recorded through a published attendance form linked to the activity and the stage.

- **Screen (M&E):** Collection, Forms, project CRL-NS-2026, "Livelihood Coaching Attendance", **Open form**, **Generate copy**. Expect "Generated draft form Livelihood Coaching Attendance (copy)." Go back to the list and open the copy.
- **Inputs (M&E):** Form title `Livelihood Coaching Post-test Attendance`; Journey stage **Livelihood coaching**; Linked activity **Livelihood coaching post-test**. Press **Save draft**, then **Save draft** in "Save form draft?".
- **Expected:** "Draft saved to the server."
- **Screen (System Administrator):** the same draft, **Publish saved draft**. An author cannot publish their own form.
- **Expected:** "Form published to the server."
- **Fallback:** if the copy or publish fails, keep the new activity as the planned post-test session and record the scores in step 4 against the seeded activity, Abaca and coconut by-product livelihood grants. Say so plainly: the seeded attendance on that activity is the participation record.

### Step 3. Create the rule and test it with sample results (5 minutes, System Administrator)

- **Screen:** `/alerts/repository`, tab **Create rule**, Rule output **Alert rule**.
- **Inputs, step 1 "Name and monitoring area":** Rule Name `Assessment improvement below plan` (Rule Code fills as `ASSESSMENT_IMPROVEMENT_BELOW_PLAN`); Monitoring area(s) the CRL project; under Applies To tick only **Assessment**.
- **Inputs, step 2 "When should we notify you?":** Metric **Average assessment score change**; Comparison **Below (<)**; Threshold `10`.
- **Step 3 "How should this read?":** before the expectation is entered, expect a line asking for the expected score improvement. Enter **Expected score improvement** `10` (managers agree the value; the administrator enters it). Expect "Possible levels: Low, Medium, or High. Critical is set manually." Leave **Mark as Critical (manual judgment)** unticked. Point out that there is no Low/Medium/High picker any more.
- **Step 4:** keep the suggested recommendation. Press **Save Rule**.
- **Expected:** "Rule created as a draft. Activate it to start checking project data."
- **Test rule:** **Manage Rules**, find the rule, **Test**. In "Test conditions" enter Test complete pre and post pairs `5` and each mean below, then **Run condition test**. Results are labelled as sample results and create nothing.

| Test mean improvement in points | Test result | Sample result headline | Reason shown |
|---|---|---|---|
| `7` | Triggered | Suggested severity: Low. | Expected +10 points, actual +7, 3 points below. (Severity Guide v0.2, 5.11) |
| `2` | Triggered | Suggested severity: Medium. | Expected +10 points, actual +2, 8 points below. (Severity Guide v0.2, 5.11) |
| `-1` | Triggered | Suggested severity: High. | Expected +10 points, actual -1, 11 points below. (Severity Guide v0.2, 5.11) |

Optional: pairs `4` gives **Unavailable** and no sample result, because fewer than five pairs are withheld for privacy.

- **Fallback:** if Test fails, show the guide 5.11 example (expected 10; actual 5 Low, 0 Medium, -1 High) and continue.

### Step 4. Enter the post-test results (8 minutes, Project Manager)

Repeat for `BEN-CRL-NS-2026-001` to `-005`:

1. **Screen:** Beneficiaries, search the code, open the person; verify with the PIN if asked. Tab **Journey tracking**, select the **Livelihood coaching** stage.
2. **Record participation** (clipboard icon): Activity **Livelihood coaching post-test**; Date yesterday; **Present**; **Save participation**. Expect "Participation recorded and reloaded from the project history."
3. **View assessment** (document icon). The **Assessment results** dialog shows the pre-test, for example "48 / 100".
4. **Record score:** Activity **Livelihood coaching post-test**; Assessment type **Post-test**; Score = the pre-test score plus 2 (48 gives `50`); Maximum score `100`; Assessment date yesterday. **Save score**.
5. **Expected:** the post-test appears and "Change from pre-test to post-test" reads `+2`.

Every pair improves by 2 points, so the project average is exactly +2. Tell the panel: after four people the figure is still withheld; the fifth pair releases it.

- **Fallback:** "Record participation for this stage before recording a score." means the chosen activity has no validated attendance for this person. Record participation first, or, after the step 2b fallback, choose Abaca and coconut by-product livelihood grants in Activity (no participation needed). If participation on the new activity is refused, read the message; set the activity to In Progress or the participation date inside its dates, then retry. Recorded scores cannot be edited; a wrong score is fixed by recording a newer result.

### Step 5. Activate, evaluate, show the alert (4 minutes)

1. **System Administrator:** **Manage Rules**, the rule, **Activate**, confirm **Activate rule**. Expect status **Active**.
2. **Terminal:** `pnpm rules:dispatch sweep`, then `pnpm rules:dispatch drain` (section 3.1). Expect "Rules dispatch acknowledged." each time.
3. **Project Manager:** `/alerts`, project CRL. Open "Assessment improvement below plan".
- **Expected:** a **Medium** badge; under **Why this level**: "Suggested severity: Medium." and "Expected +10 points, actual +2, 8 points below. (Severity Guide v0.2, 5.11)". Say: the rule decided that there is a problem; the guide decided how serious it is.
- **Fallback:** run `pnpm rules:dispatch drain` once or twice more. Check that the rule is Active on CRL and that all five dialogs show +2. If no alert still appears, use the seeded pairs: create the same rule on WSH-NS-2025 with Threshold `20` and Expected score improvement `20`, activate, sweep and drain. Expect Medium with "Expected +20 points, actual +11.625, 8.375 points below." Step 3 already showed the sample results.

### Step 6. Review, and what happens afterwards (4 minutes, Project Manager)

1. On the alert, **Mark reviewed**; Decision note `Coaching team to repeat the module; check again after the next session.`; submit. Expect status **Reviewed**.
2. Show that the level follows the data. Open `BEN-CRL-NS-2026-005`, View assessment, Record score: Activity Livelihood coaching post-test, **Post-test**, Score = pre-test minus 9 (52 gives `43`), Assessment date **today**. It must be dated after the first post-test to count as the latest.
3. `pnpm rules:dispatch sweep`, then `pnpm rules:dispatch drain`.
4. Reopen the alert. **Expected:** a **High** badge, "Expected +10 points, actual -0.2, 10.2 points below. (Severity Guide v0.2, 5.11)", the line "Raised from Medium to High on {today, for example 20 Oct}", status still **Reviewed**. The change sends no new notification and does not undo the review.
5. Close it: **Dismiss alert** (or **Resolve alert**) with a note, for example `Demo complete; follow-up agreed with the coaching team.` Expect status **Dismissed** (or **Resolved**). A note is required.

- **Fallback:** if the level does not move after two drains, skip 2 to 4 and explain: the next evaluation uses the newest scores, and a change keeps both reasons.

## 3. Triggering rule evaluation

Rules are evaluated by background jobs: a sweep queues active rules whose data changed, and a drain evaluates the queue. A new score is picked up at the next sweep.

### 3.1 Local

`pnpm dev:local` keeps the rule worker off, so start a second, worker-enabled API on port 4001 for dispatch only. The web app keeps using port 4000; both read the same database.

1. Make two different 64-character hex tokens, for example by running `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` twice. Keep them in the terminal only; never commit them.
2. Open the two machine roles with a temporary password, exactly as `scripts/db/local/demo.mjs` does: `ALTER ROLE pathways_rules_worker WITH CONNECTION LIMIT 4 PASSWORD '<temporary>'` and `ALTER ROLE pathways_rules_sweeper WITH CONNECTION LIMIT 2 PASSWORD '<temporary>'`, run through `docker exec -i supabase_db_pathways psql -U postgres -d postgres`.
3. In a new PowerShell terminal, set the same API values that `scripts/db/local/dev.mjs` passes (`NODE_ENV=development`, `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` from `npx supabase status`, `DATABASE_URL` and `DIRECT_URL` from `scripts/db/local/target.mjs`, empty `SUPABASE_JWT_SECRET` and `WEB_ORIGIN`), plus `API_PORT=4001`, `BUSINESS_TIME_ZONE=Asia/Manila`, `RULES_WORKER_ENABLED=true`, `RULES_WORKER_DATABASE_URL=postgresql://pathways_rules_worker:<temporary>@127.0.0.1:54322/postgres`, `RULES_SWEEPER_DATABASE_URL=postgresql://pathways_rules_sweeper:<temporary>@127.0.0.1:54322/postgres`, `RULES_DRAIN_TOKEN` and `RULES_SWEEP_TOKEN` (the two tokens), `RULES_RUNTIME_VERIFIED_MS=30000`, `RULES_PERIODIC_DRAIN_VERIFIED=true`. Then, in `apps/api`, run `node dist/apps/api/src/main.js` (`pnpm dev:local` already built it).
4. In a third terminal set `RULES_DISPATCH_API_BASE_URL=http://127.0.0.1:4001/api` and the same two tokens, then run `pnpm rules:dispatch sweep` and `pnpm rules:dispatch drain`. Expect "Rules dispatch acknowledged."; "Rules dispatch is temporarily unavailable." means the second API is not running or the tokens differ.
5. After the panel, stop the second API and close the roles: `ALTER ROLE pathways_rules_worker WITH CONNECTION LIMIT 0 PASSWORD NULL` and the same for `pathways_rules_sweeper`.

### 3.2 Hosted devV2

Only after 0071 and 0072 are applied to devV2 under their own approval ([runbook-role-staging-build](runbook-role-staging-build.md) section 7). The hosted scheduler ([cr-pathways-rules-hosted-scheduler](cr-pathways-rules-hosted-scheduler.md)) drains every 5 minutes and sweeps hourly at minute 7, so a new score shows within about an hour. To avoid waiting, the developer runs `gh workflow run rules-dispatch.yml -f purpose=sweep`, waits for success, then `gh workflow run rules-dispatch.yml -f purpose=drain`.

## 4. Short answers for follow-up questions

| Question | Answer |
|---|---|
| Who decides the expected improvement? | Managers agree it; the System Administrator enters it on the rule. It is saved with the rule version. |
| What if there is no expectation? | The alert still fires, but its level is Needs context and it names what is missing (step 1). |
| Can two people get different levels for the same situation? | No. The same figures, expectation and criteria version always give the same level. |
| Can a user change the level? | Only the rule author's Critical mark. Changing a level with a recorded reason (guide 9) is not built. |
| Does the level change later? | Yes, at the next evaluation of an open alert; the alert shows "Raised" or "Lowered" with the date and keeps the review status. |
| Why not fewer than five people? | Results from fewer than five complete pairs are withheld for privacy, so no single person can be singled out. |

## 5. Cleanup and known limits

- `pnpm db:local:reset` returns the local stack to the base accounts. Nothing in this script touches devV2.
- The new activity adds one included activity to CRL's activity totals.
- A rule snapshot captured before 0072 and committed after it fails once and is recaptured.
- Changing only an indicator target date or an activity planned date does not queue a re-evaluation; the hourly sweep refreshes it.
- The alert shows only the immediately previous level and reason; earlier ones stay in evaluation evidence.
- The Step 3 preview for activity completion and current indicator value shows a range, because the level depends on dates known only when the alert fires.
