import { describe, expect, it } from 'vitest'

import { criterionHint, criterionLabel, metricGlossary } from './metric-glossary'

describe('metric glossary', () => {
  it('writes every hint as a plain sentence, not as more jargon', () => {
    for (const [term, text] of Object.entries(metricGlossary)) {
      expect(text.length, term).toBeGreaterThan(20)
      expect(text.endsWith('.'), term).toBe(true)
      expect(text, term).not.toMatch(/[A-Z]{2,}_[A-Z]/)
    }
  })

  it('names a stored criterion type in words rather than its enum value', () => {
    expect(criterionLabel('TIMELINE_COMPLIANCE')).toBe('Timeline compliance')
    expect(criterionLabel('BENEFICIARY_REACH')).toBe('Beneficiary reach')
    expect(criterionLabel('OTHER')).toBe('Other')
  })

  it('explains each OECD-DAC criterion the seed uses', () => {
    for (const code of ['RELEVANCE', 'COHERENCE', 'EFFECTIVENESS', 'SUSTAINABILITY'])
      expect(criterionHint(code), code).toBeTruthy()
  })

  it('falls back to the stored value for a criterion it does not know', () => {
    expect(criterionLabel('PROJECT_SPECIFIC')).toBe('PROJECT_SPECIFIC')
    expect(criterionHint('PROJECT_SPECIFIC')).toBeNull()
  })
})
