import { describe, expect, it } from 'vitest'

import { IMPORT_VALUE_MAP_LIMITS } from './value-map'
import { columnTranslations, suggestValueMap } from './value-map-suggest'

const SEX = ['MALE', 'FEMALE', 'OTHER', 'PREFER_NOT_TO_SAY', 'NOT_SPECIFIED']
const DISABILITY = ['WITH_DISABILITY', 'WITHOUT_DISABILITY', 'NOT_SPECIFIED']

describe('value map suggestions', () => {
  it('translates lettered Filipino sex answers through synonyms', () => {
    const result = suggestValueMap(['A. Babae', 'B. Lalaki', 'C. Non-binary', 'A. Babae'], SEX)
    expect(result.pairs).toEqual([
      { from: 'A. Babae', to: 'FEMALE' },
      { from: 'B. Lalaki', to: 'MALE' },
      { from: 'C. Non-binary', to: 'OTHER' },
    ])
    expect(result.unmatched).toEqual([])
  })

  it('maps TRUE and FALSE onto disability status', () => {
    expect(suggestValueMap(['TRUE', 'FALSE'], DISABILITY).pairs).toEqual([
      { from: 'TRUE', to: 'WITH_DISABILITY' },
      { from: 'FALSE', to: 'WITHOUT_DISABILITY' },
    ])
  })

  it('matches allowed values after removing the prefix, ignoring case, spaces and hyphens', () => {
    const allowed = ['SINGLE', 'MARRIED', 'LIVING_IN_WITH_PARTNER']
    expect(
      suggestValueMap(['A. Single', 'B. Married', 'C. Living-in with Partner'], allowed).pairs,
    ).toEqual([
      { from: 'A. Single', to: 'SINGLE' },
      { from: 'B. Married', to: 'MARRIED' },
      { from: 'C. Living-in with Partner', to: 'LIVING_IN_WITH_PARTNER' },
    ])
  })

  it('leaves descriptive or unknown answers for the reviewer instead of guessing', () => {
    const result = suggestValueMap(
      ['A. Hindi – Hindi nahihirapan', 'B. Oo – medyo nahihirapan', 'Maybe'],
      ['true', 'false'],
    )
    expect(result.pairs).toEqual([])
    expect(result.unmatched).toHaveLength(3)
  })

  it('skips values that are already allowed or already translated', () => {
    const result = suggestValueMap(['FEMALE', 'A. Babae', 'B. Lalaki'], SEX, [
      { from: 'a. babae', to: 'FEMALE' },
    ])
    expect(result.pairs).toEqual([{ from: 'B. Lalaki', to: 'MALE' }])
  })

  it('stops at the value map entry limit', () => {
    const allowed = Array.from({ length: 60 }, (_, index) => `V${index}`)
    const source = allowed.map((value) => value.toLowerCase())
    const result = suggestValueMap(source, allowed)
    expect(result.pairs).toHaveLength(IMPORT_VALUE_MAP_LIMITS.maxEntries)
    expect(result.unmatched).toHaveLength(10)
  })
})

describe('column translations', () => {
  const consent = { dataType: 'BOOLEAN', allowedValues: null, valueAliases: null } as const
  const sex = { dataType: 'SELECT', allowedValues: ['MALE', 'FEMALE'], valueAliases: null } as const

  it('lists the automatic pairs and the values nothing converts', () => {
    expect(columnTranslations(['TRUE', 'Yes', 'No', 'Maybe'], consent, [])).toEqual({
      automatic: [
        { from: 'Yes', to: 'true' },
        { from: 'No', to: 'false' },
      ],
      unmatched: ['Maybe'],
    })
    expect(columnTranslations(['FEMALE', 'b. Male', 'Babae', 'X'], sex, [])).toEqual({
      automatic: [{ from: 'Babae', to: 'FEMALE' }],
      unmatched: ['X'],
    })
  })

  it('leaves a value with a saved translation out of both lists', () => {
    expect(
      columnTranslations(['Yes', 'Maybe'], consent, [{ from: ' maybe ', to: 'false' }]),
    ).toEqual({ automatic: [{ from: 'Yes', to: 'true' }], unmatched: [] })
  })

  it('leaves a value the form answer aliases already settle out of both lists', () => {
    const aliased = { ...sex, valueAliases: [{ from: 'Lalaki po', to: 'MALE' }] }
    expect(columnTranslations(['lalaki po', 'Babae'], aliased, [])).toEqual({
      automatic: [{ from: 'Babae', to: 'FEMALE' }],
      unmatched: [],
    })
  })

  it('reports nothing for a field type Suggest does not serve', () => {
    const text = { dataType: 'TEXT', allowedValues: null, valueAliases: null } as const
    expect(columnTranslations(['anything'], text, [])).toEqual({ automatic: [], unmatched: [] })
  })
})
