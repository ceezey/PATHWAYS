import { describe, expect, it } from 'vitest'
import { classifyAlertSeverity } from './severity-classify'
import type { ConditionBasis, SeverityBasis, SeverityMissing } from './severity-criteria'
import fixtureFile from './severity-fixtures.json'
import { formatSeverityBasis } from './severity-format'

const fixtures = fixtureFile as unknown as { name: string; expected: SeverityBasis }[]
const fixture = (name: string) => {
  const found = fixtures.find((item) => item.name === name)
  if (!found) throw new Error(`Missing fixture ${name}`)
  return found.expected
}
const basis = (overrides: Partial<SeverityBasis>): SeverityBasis => ({
  criteriaVersion: 'severity-guide-v0.2',
  status: 'CLASSIFIED',
  level: null,
  supportedLevel: null,
  decisiveConditionId: null,
  combination: null,
  manualCritical: false,
  conditions: [],
  missing: [],
  unchecked: [],
  ...overrides,
})
const behind: ConditionBasis = {
  conditionId: 'progress',
  metric: 'INDICATOR_PROGRESS_PERCENT',
  outcome: 'LEVEL',
  level: 'HIGH',
  measure: { kind: 'BEHIND_PERCENT', actual: '45.0000', expected: '80.0000', value: '43.7500' },
  missing: null,
}

describe('formatSeverityBasis', () => {
  it('states the guide section 7 sentence for 45 against 80', () => {
    expect(
      formatSeverityBasis(
        basis({
          level: 'HIGH',
          supportedLevel: 'HIGH',
          decisiveConditionId: 'progress',
          conditions: [behind],
        }),
      ),
    ).toEqual({
      headline: 'Suggested severity: High.',
      reason:
        'The plan expected 80% progress by the reporting date. Actual progress is 45%, which is 43.75% behind the expectation. (Severity Guide v0.2, 5.2)',
      missing: [],
      section: '5.2',
    })
  })

  const wording: Record<SeverityMissing, string> = {
    EXPECTED_PROGRESS_FOR_DATE:
      'We need the approved expected progress for this date before suggesting a level.',
    INDICATOR_BASELINE_TARGET_DIRECTION:
      'We need a usable starting value, target and direction for this indicator.',
    ACTIVITY_PLANNED_END_DATES: 'We need a planned end date for every included activity.',
    ACTIVITY_TOTAL: 'We need the total number of included activities.',
    PROJECT_DATES: 'We need valid project start and end dates.',
    SAME_DAY_PROJECT:
      'We need an agreed delay rule for a project that starts and ends on the same day.',
    ACTIVITY_DATES: 'We need valid planned start and end dates for this activity.',
    SAME_DAY_ACTIVITY:
      'We need an agreed delay rule for an activity that starts and ends on the same day.',
    EXPECTED_SCORE_IMPROVEMENT: 'We need the expected score improvement for this assessment.',
    MANAGEABLE_FOLLOW_UP_LEVEL: 'We need the manageable follow-up level for this group.',
    DELIVERY_EXPECTATION: 'To get a level, add an Activities completed condition to this rule.',
  }
  it.each(Object.entries(wording))('words %s as a Needs context request', (code, text) => {
    const formatted = formatSeverityBasis(
      basis({ status: 'CONTEXT_REQUIRED', missing: [code as SeverityMissing] }),
    )
    expect(formatted.headline).toBe('Needs context.')
    expect(formatted.missing).toEqual([text])
  })

  it('names the level already supported while context is missing', () => {
    const formatted = formatSeverityBasis(
      fixture('medium known with a counted needs context condition needs context'),
    )
    expect(formatted.headline).toBe('Needs context.')
    expect(formatted.reason).toBe(
      'Medium already supported. Budget used is 105%, which is above the planned budget. (Severity Guide v0.2, 5.9)',
    )
    expect(formatted.missing).toEqual([wording.EXPECTED_SCORE_IMPROVEMENT])
  })

  it('names the high spending with low delivery combination', () => {
    const formatted = formatSeverityBasis(
      fixture('budget 95 with completion 56.25 behind is high spending with low delivery'),
    )
    expect(formatted).toEqual({
      headline: 'Suggested severity: High.',
      reason:
        'The plan expected 80% of activities completed by the reporting date. Actual completion is 35%, which is 56.25% behind the expectation. Budget used is 95%, so the linked spending supports the concern. (Severity Guide v0.2, 6)',
      missing: [],
      section: '6',
    })
  })

  it('explains time without giving it a level', () => {
    expect(
      formatSeverityBasis(fixture('timeline 85 with progress 45 is high and time only explains'))
        .reason,
    ).toBe(
      'The plan expected 100% progress by the reporting date. Actual progress is 45%, which is 55% behind the expectation. Time helps explain the situation; it has no separate severity. (Severity Guide v0.2, 5.2)',
    )
  })

  it('uses the assessment wording from the change record', () => {
    expect(formatSeverityBasis(fixture('assessment shortfall 11 is high')).reason).toBe(
      'Expected +10 points, actual -1, 11 points below. (Severity Guide v0.2, 5.11)',
    )
  })

  it('formats every fixture with a guide section', () => {
    for (const item of fixtures) {
      const formatted = formatSeverityBasis(item.expected)
      expect(formatted.section).toMatch(/^(5\.(1[0-4]?|[2-9])|6)$/)
      expect(formatted.reason).toContain(`(Severity Guide v0.2, ${formatted.section})`)
      expect(formatted.missing).toHaveLength(item.expected.missing.length)
    }
  })

  it('formats what the classifier returns', () => {
    const input = structuredClone(
      (
        fixtureFile as unknown as {
          name: string
          input: Parameters<typeof classifyAlertSeverity>[0]
        }[]
      )[0].input,
    )
    expect(formatSeverityBasis(classifyAlertSeverity(input)).section).toBe('5.2')
  })
})
