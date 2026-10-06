import { describe, expect, it } from 'vitest'

import type { JourneyStageConfig } from '@/types/pathways'
import { formatDate, matchesBeneficiarySearch, resolveJourneySummary } from './beneficiary-utils'

const beneficiary = {
  code: 'BEN-NCR-001',
  displayName: 'María Sample Santos',
  firstName: 'María',
  middleName: 'Sample',
  lastName: 'Santos',
}

describe('beneficiary search matching', () => {
  it('matches a Beneficiary code despite punctuation differences', () => {
    expect(matchesBeneficiarySearch(beneficiary, 'ben ncr 001')).toBe(true)
  })

  it('matches name tokens in a natural order-insensitive search', () => {
    expect(matchesBeneficiarySearch(beneficiary, 'Santos Maria')).toBe(true)
    expect(matchesBeneficiarySearch(beneficiary, 'sample santos')).toBe(true)
  })

  it('returns all records for blank input and rejects unrelated text', () => {
    expect(matchesBeneficiarySearch(beneficiary, '   ')).toBe(true)
    expect(matchesBeneficiarySearch(beneficiary, 'unrelated name')).toBe(false)
  })
})

describe('beneficiary date formatting', () => {
  it('formats date-only and full ISO timestamp values in UTC', () => {
    expect(formatDate('2026-06-18')).toBe('Jun 18, 2026')
    expect(formatDate('2026-06-18T14:30:00.000Z')).toBe('Jun 18, 2026')
  })

  it('returns a safe label for missing or malformed values', () => {
    expect(formatDate(undefined)).toBe('Date unavailable')
    expect(formatDate('')).toBe('Date unavailable')
    expect(formatDate('not-a-date')).toBe('Date unavailable')
    expect(formatDate('2026-02-31')).toBe('Date unavailable')
  })
})

describe('journey summary shared by list and detail', () => {
  const stage = (code: string, order: number): JourneyStageConfig => ({
    id: code,
    projectId: 'p',
    code,
    name: code,
    order,
    type: 'Core',
    terminal: false,
    mappedActivityIds: [],
    description: '',
  })
  const stages = [stage('KIT-DISTRIBUTION', 2), stage('COMPLETED', 3)]
  const derived = stages[0]

  it('shows a completer at the terminal stage and 100 percent, not the derived stage', () => {
    const summary = resolveJourneySummary(
      {
        restricted: false,
        lastParticipation: null,
        stage: { code: 'COMPLETED', name: 'COMPLETED', progressPercent: 100 },
      },
      stages,
      derived,
      67,
    )
    expect(summary).toEqual({ stage: stages[1], percent: 100 })
  })

  it('falls back to the client rule when the summary is restricted or absent', () => {
    expect(resolveJourneySummary({ restricted: true }, stages, derived, 40)).toEqual({
      stage: derived,
      percent: 40,
    })
    expect(resolveJourneySummary(undefined, stages, derived, 40).percent).toBe(40)
  })
})
