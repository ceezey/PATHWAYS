# House Style & Voice

**Status:** Locked
**Version:** 2.0
**Last reconciled:** 2026-10-01
**Owner:** PATHWAYS capstone team

## 1. Hard Bans (always on)

These mirror `scripts/docs/check.py` and fail the docs check.

- No em dash or any dash look-alike (fullwidth hyphen, figure dash, horizontal bar, minus sign), however encoded.
- En dash only inside numeric ranges with no spaces, for example `1–3`.
- No `--` as punctuation in prose; it is allowed inside inline code and fenced blocks.
- No stock phrases from the `BANNED_PHRASES` list in the checker (filler openers, hype adjectives and cliche connectives); the checker matches them even inside inline code, so never quote them.
- No AI-tool markup artifacts in any document.

Also banned as claims: a feature is complete because a screen, TODO or schema exists; the product is production-ready unless verified.

## 2. Register by document type

| Document type | Register |
|---|---|
| Engineering docs (SDD, SAD, QAD, BUILD) | Direct, explicit, testable; label Implemented, Verified, Planned, Deferred or Blocked |
| Requirements docs (BRD, PRD) | Plain statements of need and behavior; one sentence per rule |
| Manuscript and defense material | Formal but plain, using the locked PATHWAYS identity |
| User interface copy | Normal product language; truthful empty, error and unavailable states |
| Security statements | State evidence and limits; no bare "secure" without a control or test |

## 3. AI-tell pass (before locking any doc)

Remove before locking:

- exaggerated certainty and filler adjectives;
- fake precision and unsupported metrics;
- leverage used as a verb, and robust without specifics;
- listicle voice and symmetrical triplets used for rhythm;
- opening or closing summaries that restate the section;
- claims that human review is unnecessary;
- hedging stacks that say nothing.

Then run `pnpm docs:check` and read the doc aloud once.

## 4. Project Voice Tuning

Prefer this vocabulary:

- organization, workspace, project, activity;
- beneficiary as a data subject, never "user" or "customer";
- metadata-driven, project information management, descriptive analytics;
- SADDD (sex, age and disability disaggregated data), gate, charter;
- rule-based alert, predefined recommendation, human review;
- approved public information.

Banned framings: `AI-powered` (unless a separately approved AI feature exists), autonomous humanitarian decision-making, predictive ML, a full ERP, real-time interoperability with enterprise systems, production-ready or deployed unless verified, and prototype, mock or demo in user-facing copy.

## Self-Check

- [x] hard bans mirror the checker
- [x] registers separated by document type
- [x] AI-tell pass defined
- [x] PATHWAYS vocabulary and banned framings stated
