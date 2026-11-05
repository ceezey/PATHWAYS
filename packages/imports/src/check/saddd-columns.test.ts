import { describe, expect, it } from 'vitest'

import { unfedSadddFields } from './saddd-columns'

const codes = (...items: string[]) => new Set(items)

describe('unfedSadddFields', () => {
  const all = codes('sex', 'birth_date', 'age_at_registration', 'disability_status')

  it('lists every group when no column feeds the form', () => {
    expect(unfedSadddFields(all, codes(), new Map())).toEqual([
      { fieldCode: 'sex', suggestedHeader: null },
      { fieldCode: 'birth_date', suggestedHeader: null },
      { fieldCode: 'disability_status', suggestedHeader: null },
    ])
  })

  it('counts either birth date or age as feeding its group', () => {
    const fed = codes('sex', 'age_at_registration', 'disability_status')
    expect(unfedSadddFields(all, fed, new Map())).toEqual([])
  })

  it('skips groups the form does not have and names the first code present', () => {
    expect(unfedSadddFields(codes('age_at_registration'), codes(), new Map())).toEqual([
      { fieldCode: 'age_at_registration', suggestedHeader: null },
    ])
  })

  it('carries the header suggested for any code of the group', () => {
    const suggestions = new Map([['age_at_registration', 'Edad']])
    expect(unfedSadddFields(all, codes('sex', 'disability_status'), suggestions)).toEqual([
      { fieldCode: 'birth_date', suggestedHeader: 'Edad' },
    ])
  })
})
