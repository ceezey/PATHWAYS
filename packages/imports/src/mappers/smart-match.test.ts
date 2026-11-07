import { describe, expect, it } from 'vitest'

import { readImportFile } from '../check/read-import-file'
import { buildAnySourceFixture } from '../fixtures/any-source/build'
import { REGISTRATION } from '../form-draft/draft-test-support'
import { importCoverage } from './coverage'
import {
  AUTO_SMART_V2_LIMITS,
  AUTO_SMART_V3,
  AUTO_SMART_V4,
  AUTO_SMART_V5,
  SMART_DECISION_REASONS,
  SMART_MATCH_REASONS,
  type SmartMatchColumn,
  type SmartMatchField,
  SmartMatchInputError,
  boundedEditDistance,
  groupPathLeaf,
  normalizeMappingNameV1,
  smartMatchColumns,
  smartMatchColumnsV3,
  smartMatchColumnsV4,
  smartMatchColumnsV5,
} from './smart-match'

const text = (id: string, code: string, label: string): SmartMatchField => ({
  id,
  code,
  label,
  dataType: 'TEXT',
})

const column = (
  columnIndex: number,
  header: string,
  samples: unknown[] = ['x'],
): SmartMatchColumn => ({
  key: `column_${String(columnIndex).padStart(4, '0')}`,
  columnIndex,
  header,
  samples,
})

const registration: SmartMatchField[] = [
  text('f-first', 'first_name', 'First name'),
  text('f-last', 'last_name', 'Last name'),
  { id: 'f-birth', code: 'birth_date', label: 'Birth date', dataType: 'DATE' },
  {
    id: 'f-sex',
    code: 'sex',
    label: 'Sex',
    dataType: 'SELECT',
    allowedValues: ['MALE', 'FEMALE', 'OTHER'],
  },
  { id: 'f-age', code: 'age_at_registration', label: 'Age at registration', dataType: 'INTEGER' },
  { id: 'f-minor', code: 'is_minor', label: 'Is minor', dataType: 'BOOLEAN' },
]

const one = (header: string, samples: unknown[], fields = registration) =>
  smartMatchColumns([column(1, header, samples)], fields)[0]

describe('AUTO_SMART_V2 tiers', () => {
  it('keeps V1 exact code and label matches as the top tier', () => {
    expect(one('First name', ['Ana'])).toMatchObject({
      status: 'MAPPED',
      targetFieldId: 'f-first',
      score: 100,
      matchReason: 'EXACT',
      reason: 'AUTO_MATCH',
    })
    expect(one(' FIRST-NAME ', ['Ana'])).toMatchObject({ status: 'MAPPED', score: 100 })
  })

  it('auto-maps a reviewed synonym with compatible values', () => {
    expect(one('DOB', ['2012-04-01', '03/15/2011'])).toMatchObject({
      status: 'MAPPED',
      targetFieldId: 'f-birth',
      score: 90,
      matchReason: 'SYNONYM',
    })
    expect(one('Date of Birth', ['2012-04-01'])).toMatchObject({ status: 'MAPPED', score: 90 })
    expect(one('Beneficiary First Name', ['Ana'])).toMatchObject({
      status: 'MAPPED',
      targetFieldId: 'f-first',
      matchReason: 'SYNONYM',
    })
  })

  it('never auto-maps gender to sex; it is only ever a suggestion', () => {
    for (const header of ['Gender', 'GENDER', ' gender ']) {
      const decision = one(header, ['MALE', 'FEMALE'])
      expect(decision).toMatchObject({
        status: 'PENDING',
        targetFieldId: null,
        suggestedFieldId: 'f-sex',
        matchReason: 'SYNONYM_REVIEW',
        reason: 'SUGGESTED',
      })
      expect(decision.score).toBeLessThan(AUTO_SMART_V2_LIMITS.autoMapScore)
    }
    const gender: SmartMatchField[] = [
      { id: 'f-gender', code: 'gender', label: 'Gender identity', dataType: 'TEXT' },
    ]
    expect(one('Sex', ['F'], gender)).toMatchObject({
      status: 'PENDING',
      suggestedFieldId: 'f-gender',
    })
  })

  it('suggests equal token sets after stop words and scores token overlap', () => {
    expect(one('The Last Name', ['Cruz'])).toMatchObject({
      status: 'PENDING',
      suggestedFieldId: 'f-last',
      score: 85,
      matchReason: 'TOKEN_SET',
      reason: 'SUGGESTED',
    })
    const fields = [text('f-site', 'region_site', 'Site code area region')]
    expect(one('site code area', ['A'], fields)).toMatchObject({
      score: 60,
      matchReason: 'TOKEN_OVERLAP',
      suggestedFieldId: 'f-site',
    })
  })

  it('scores bounded edit distance and ignores distant names', () => {
    const fields = [text('f-village', 'village_name', 'Village name')]
    expect(one('vilage_name', ['A'], fields)).toMatchObject({
      status: 'PENDING',
      suggestedFieldId: 'f-village',
      matchReason: 'EDIT_DISTANCE',
      score: 64,
    })
    expect(one('household size', ['4'], fields)).toMatchObject({
      status: 'PENDING',
      suggestedFieldId: null,
      score: null,
      reason: 'NO_MATCH',
    })
  })

  it('computes exact bounded distances', () => {
    const points = (value: string) => Array.from(value, (c) => c.codePointAt(0) ?? 0)
    expect(boundedEditDistance(points('kitten'), points('sitting'), 3)).toBe(3)
    expect(boundedEditDistance(points('kitten'), points('sitting'), 2)).toBe(3)
    expect(boundedEditDistance(points(''), points('abc'), 3)).toBe(3)
    expect(boundedEditDistance(points('abc'), points('abc'), 0)).toBe(0)
    expect(boundedEditDistance(points('abcdefgh'), points('abcdxfgh'), 1)).toBe(1)
  })

  it('reports blank headers as EMPTY_NAME', () => {
    expect(one('   ', ['x'])).toMatchObject({ status: 'PENDING', reason: 'EMPTY_NAME' })
  })
})

describe('AUTO_SMART_V2 value gate', () => {
  it.each([
    ['INTEGER', 'age_at_registration', ['12', '1,200', 7], ['12', 'twelve', 'n/a']],
    ['DATE', 'birth_date', ['2012-04-01', '15 Mar 2011', 'March 5, 2010'], ['yesterday', '42']],
    ['BOOLEAN', 'is_minor', ['Yes', 'no', true, 'Y'], ['maybe', 'sometimes']],
    ['SELECT', 'sex', ['male', 'Female'], ['M', 'F']],
  ])('%s passes compatible samples and holds incompatible ones', (_type, code, good, bad) => {
    const field = registration.find((item) => item.code === code) as SmartMatchField
    expect(one(field.label, good as unknown[])).toMatchObject({ status: 'MAPPED' })
    expect(one(field.label, bad as unknown[])).toMatchObject({
      status: 'PENDING',
      suggestedFieldId: field.id,
      score: 100,
      reason: 'HELD_VALUE_GATE',
    })
  })

  it('requires at least 90 percent of the sampled non-blank values', () => {
    const nine = Array.from({ length: 9 }, () => '5')
    expect(one('Age at registration', [...nine, 'five']).status).toBe('MAPPED')
    expect(one('Age at registration', [...nine.slice(1), 'five', 'six']).reason).toBe(
      'HELD_VALUE_GATE',
    )
  })

  it('holds a column with no non-blank samples', () => {
    expect(one('First name', ['', '  ', null])).toMatchObject({
      status: 'PENDING',
      suggestedFieldId: 'f-first',
      reason: 'HELD_NO_SAMPLES',
    })
  })

  it('reads only the bounded sample prefix', () => {
    const late = [...Array.from({ length: AUTO_SMART_V2_LIMITS.sampleRows }, () => ''), 'Ana']
    expect(one('First name', late).reason).toBe('HELD_NO_SAMPLES')
    const many = [
      ...Array.from({ length: AUTO_SMART_V2_LIMITS.samplesPerColumn }, () => '3'),
      'not a number',
    ]
    expect(one('Age at registration', many).status).toBe('MAPPED')
  })

  it('checks multiple-select choices and text length bounds', () => {
    const fields: SmartMatchField[] = [
      {
        id: 'f-topics',
        code: 'topics',
        label: 'Topics',
        dataType: 'MULTIPLE_SELECT',
        allowedValues: ['Math', 'Reading'],
      },
      { id: 'f-note', code: 'note', label: 'Note', dataType: 'TEXT', maximumLength: 5 },
    ]
    expect(one('Topics', ['math; reading', '["Math"]'], fields).status).toBe('MAPPED')
    expect(one('Topics', ['art', 'music'], fields).reason).toBe('HELD_VALUE_GATE')
    expect(one('Note', ['short'], fields).status).toBe('MAPPED')
    expect(one('Note', ['far too long'], fields).reason).toBe('HELD_VALUE_GATE')
  })
})

describe('AUTO_SMART_V2 decisions', () => {
  it('is deterministic and independent of input order', () => {
    const columns = [
      column(1, 'Given Name', ['Ana']),
      column(2, 'surname', ['Cruz']),
      column(3, 'Gender', ['FEMALE']),
      column(4, 'DOB', ['2012-04-01']),
      column(5, 'Notes', ['free text']),
    ]
    const first = smartMatchColumns(columns, registration)
    expect(smartMatchColumns(columns, registration)).toEqual(first)
    expect(smartMatchColumns([...columns].reverse(), [...registration].reverse())).toEqual(first)
    expect(JSON.stringify(first)).toBe(JSON.stringify(smartMatchColumns(columns, registration)))
  })

  it('never maps two columns to one field and never suggests a mapped field', () => {
    const decisions = smartMatchColumns(
      [
        column(1, 'First name', ['Ana']),
        column(2, 'Given name', ['Ana']),
        column(3, 'first_name', ['Ana']),
        column(4, 'fname', ['Ana']),
      ],
      registration,
    )
    const mapped = decisions.filter((decision) => decision.status === 'MAPPED')
    expect(new Set(mapped.map((decision) => decision.targetFieldId)).size).toBe(mapped.length)
    // Columns 1 and 3 tie at 100 for first_name, so neither is auto-mapped.
    expect(decisions[0]).toMatchObject({ status: 'PENDING', reason: 'HELD_CONTESTED' })
    expect(decisions[2]).toMatchObject({ status: 'PENDING', reason: 'HELD_CONTESTED' })
    const targets = decisions.flatMap((decision) =>
      [decision.targetFieldId, decision.suggestedFieldId].filter(Boolean),
    )
    expect(new Set(targets).size).toBe(targets.length)
  })

  it('maps only the strictly strongest column for a field', () => {
    const decisions = smartMatchColumns(
      [column(1, 'First name', ['Ana']), column(2, 'Given name', ['Ana'])],
      registration,
    )
    expect(decisions[0]).toMatchObject({ status: 'MAPPED', targetFieldId: 'f-first' })
    expect(decisions[1]).toMatchObject({
      status: 'PENDING',
      reason: 'HELD_CONTESTED',
      suggestedFieldId: null,
    })
  })

  it('holds a high score without a clear margin over the next field', () => {
    const fields = [text('f-a', 'name', 'Name'), text('f-b', 'full_name', 'Name')]
    expect(one('Name', ['Ana'], fields)).toMatchObject({
      status: 'PENDING',
      reason: 'HELD_MARGIN',
      suggestedFieldId: 'f-b',
    })
  })

  it('returns only fixed reason codes and bounded integer scores, never sample values', () => {
    const secret = 'Private-Beneficiary-Value-9931'
    const decisions = smartMatchColumns(
      [
        column(1, 'First name', [secret]),
        column(2, 'Gender', [secret]),
        column(3, 'Unrelated', [secret]),
      ],
      registration,
    )
    expect(JSON.stringify(decisions)).not.toContain(secret)
    for (const decision of decisions) {
      expect(Object.keys(decision).sort()).toEqual(
        [
          'columnIndex',
          'matchReason',
          'reason',
          'score',
          'sourceKey',
          'status',
          'suggestedFieldId',
          'targetFieldId',
        ].sort(),
      )
      expect(SMART_DECISION_REASONS).toContain(decision.reason)
      if (decision.matchReason) expect(SMART_MATCH_REASONS).toContain(decision.matchReason)
      if (decision.score !== null) {
        expect(Number.isInteger(decision.score)).toBe(true)
        expect(decision.score).toBeGreaterThanOrEqual(60)
        expect(decision.score).toBeLessThanOrEqual(100)
      }
    }
  })

  it('rejects inputs beyond the import bounds before scoring', () => {
    const tooMany = Array.from({ length: AUTO_SMART_V2_LIMITS.maxColumns + 1 }, (_, index) =>
      column(index + 1, `c${index}`),
    )
    expect(() => smartMatchColumns(tooMany, registration)).toThrow(SmartMatchInputError)
    expect(() => smartMatchColumns([column(1, 'x'.repeat(161))], registration)).toThrow(
      SmartMatchInputError,
    )
  })

  it('finishes the largest adversarial bounded input quickly', () => {
    // Near-identical same-length names keep every banded edit-distance row alive.
    const alphabet = 'abcdefghijklmnopqrstuvwxyz'
    const word = (seed: number) =>
      Array.from(
        { length: AUTO_SMART_V2_LIMITS.maxEditCodePoints },
        (_, index) => alphabet[(seed * 7 + index * 13 + (index % 3)) % 26],
      ).join('')
    const fields = Array.from({ length: AUTO_SMART_V2_LIMITS.maxFields }, (_, index) =>
      text(`f-${index}`, word(index + 1).replace(/a/g, 'b'), word(index + 1).replace(/e/g, 'f')),
    )
    const columns = Array.from({ length: AUTO_SMART_V2_LIMITS.maxColumns }, (_, index) =>
      column(index + 1, word((index % 100) + 1), ['v']),
    )
    const started = performance.now()
    smartMatchColumns(columns, fields)
    expect(performance.now() - started).toBeLessThan(1_500)
  })

  it.each([
    [' \tAGE\nAT\rREGISTRATION\f\v ', 'age_at_registration'],
    ['Birth---Date', 'birth_date'],
    ['ＡＧＥ　ＡＴ　ＲＥＧＩＳＴＲＡＴＩＯＮ', 'age_at_registration'],
    ['É', 'É'],
    ['é', 'é'],
    ['\u0085Age\u0085', '\u0085age\u0085'],
    ['\u2028Age\u2028', '\u2028age\u2028'],
    ['Birth.Date', 'birth.date'],
    ['', ''],
    [' \t\n\r\f\v', ''],
  ])('keeps the V1 normalizer contract for %j', (source, expected) => {
    expect(normalizeMappingNameV1(source)).toBe(expected)
  })

  it('keeps non-ASCII case distinctions in the exact tier', () => {
    const fields = [text('f-e', 'accent_e', 'é'), text('f-age', 'age', 'Age')]
    expect(one('é', ['x'], fields)).toMatchObject({ status: 'MAPPED', targetFieldId: 'f-e' })
    expect(one('É', ['x'], fields).targetFieldId).toBeNull()
    expect(one('\u0085age', ['x'], fields).status).toBe('PENDING')
  })
})

describe('AUTO_SMART_V3', () => {
  const sex = registration[3]
  const oneV3 = (header: string, samples: unknown[], fields: SmartMatchField[]) =>
    smartMatchColumnsV3([column(1, header, samples)], fields)[0]

  it('names the algorithm', () => {
    expect(AUTO_SMART_V3).toBe('AUTO_SMART_V3')
  })

  it('maps "Gender - YEE" to sex only when it is a source name', () => {
    const withName = [{ ...sex, sourceNames: ['Gender - YEE'] }]
    expect(oneV3('Gender - YEE', ['MALE', 'FEMALE'], withName)).toMatchObject({
      status: 'MAPPED',
      targetFieldId: 'f-sex',
      score: 100,
      matchReason: 'METADATA_SOURCE_NAME',
      reason: 'AUTO_MATCH',
    })
    expect(oneV3('Gender - YEE', ['MALE'], [sex]).status).toBe('PENDING')
  })

  it('exempts a source name from the review-only synonyms and leaves a bare Gender suggested at 80', () => {
    expect(oneV3('Gender', ['MALE'], [{ ...sex, sourceNames: ['gender'] }])).toMatchObject({
      status: 'MAPPED',
      score: 100,
    })
    expect(oneV3('Gender', ['MALE'], [sex])).toMatchObject({
      status: 'PENDING',
      reason: 'SUGGESTED',
      suggestedFieldId: 'f-sex',
      score: 80,
      matchReason: 'SYNONYM_REVIEW',
    })
  })

  it('does not use a source name shared by two fields', () => {
    const fields = [
      { ...text('f-a', 'alpha', 'Alpha'), sourceNames: ['Shared'] },
      { ...text('f-b', 'beta', 'Beta'), sourceNames: ['shared'] },
    ]
    expect(oneV3('Shared', ['x'], fields)).toMatchObject({
      status: 'PENDING',
      targetFieldId: null,
    })
  })

  it('never maps Age to a calculated age_at_registration, while V2 still does', () => {
    const calculated = registration.map((field) =>
      field.id === 'f-age' ? { ...field, calculated: true } : field,
    )
    expect(oneV3('Age', ['21', '30'], calculated)).toMatchObject({
      status: 'PENDING',
      targetFieldId: null,
      suggestedFieldId: null,
    })
    expect(one('Age', ['21', '30'], calculated)).toMatchObject({
      status: 'MAPPED',
      targetFieldId: 'f-age',
    })
    expect(oneV3('Age', ['21'], registration)).toMatchObject({ status: 'MAPPED', score: 90 })
  })

  it('lets a calculated field take an exact name or a source name', () => {
    const exact = [{ ...registration[4], calculated: true }]
    expect(oneV3('Age at registration', ['21'], exact)).toMatchObject({
      status: 'MAPPED',
      score: 100,
    })
    const named = [{ ...registration[4], calculated: true, sourceNames: ['Age'] }]
    expect(oneV3('Age', ['21'], named)).toMatchObject({
      status: 'MAPPED',
      matchReason: 'METADATA_SOURCE_NAME',
    })
  })

  it('records a blank column as IGNORED BLANK_COLUMN with no target, suggestion or score', () => {
    const blank = { ...column(1, 'First name', []), blank: true }
    expect(smartMatchColumnsV3([blank], registration)[0]).toEqual({
      sourceKey: blank.key,
      columnIndex: 1,
      status: 'IGNORED',
      targetFieldId: null,
      suggestedFieldId: null,
      score: null,
      matchReason: null,
      reason: 'BLANK_COLUMN',
    })
    // A blank column never claims a field from a real one.
    const decisions = smartMatchColumnsV3([blank, column(2, 'First name', ['Ana'])], registration)
    expect(decisions[1]).toMatchObject({ status: 'MAPPED', targetFieldId: 'f-first' })
    expect(smartMatchColumns([blank], registration)[0].status).toBe('PENDING')
  })

  it('passes MULTIPLE_SELECT answers that resolve only through aliases in V3 only', () => {
    const tags: SmartMatchField = {
      id: 'f-tags',
      code: 'tags',
      label: 'Tags',
      dataType: 'MULTIPLE_SELECT',
      allowedValues: ['A', 'B'],
      valueAliases: [
        { from: 'Isa', to: 'A' },
        { from: 'Dalawa', to: 'B' },
      ],
    }
    const samples = ['["Isa","Dalawa"]', '["isa"]']
    const decision = oneV3('Tags', samples, [tags])
    expect(decision).toMatchObject({ status: 'MAPPED', targetFieldId: 'f-tags' })
    expect(
      importCoverage({
        formType: 'PRE_TEST',
        decisions: [decision],
        fields: [{ ...tags, required: false }],
        distinctValues: { [decision.sourceKey]: samples },
      }).coverage,
    ).toBe('COVERED')
    expect(one('Tags', samples, [tags])).toMatchObject({ reason: 'HELD_VALUE_GATE' })
  })

  it('rejects oversized source names and value aliases', () => {
    const tooMany = { ...sex, sourceNames: Array.from({ length: 21 }, (_, index) => `n${index}`) }
    const tooLong = { ...sex, sourceNames: ['x'.repeat(161)] }
    const aliases = {
      ...sex,
      valueAliases: Array.from({ length: 101 }, (_, index) => ({ from: `f${index}`, to: 'MALE' })),
    }
    for (const field of [tooMany, tooLong, aliases]) {
      expect(() => oneV3('Sex', ['MALE'], [field])).toThrow(SmartMatchInputError)
    }
  })

  it('passes lettered and aliased answers through the SELECT value gate in V3 only', () => {
    const lettered = ['A. Male', 'B. Female', 'a) male']
    expect(oneV3('Sex', lettered, [sex])).toMatchObject({
      status: 'MAPPED',
      targetFieldId: 'f-sex',
    })
    expect(one('Sex', lettered, [sex])).toMatchObject({ reason: 'HELD_VALUE_GATE' })
    const aliased = { ...sex, valueAliases: [{ from: 'Lalaki', to: 'MALE' }] }
    expect(oneV3('Sex', ['Lalaki', 'Lalaki'], [aliased]).status).toBe('MAPPED')
    expect(oneV3('Sex', ['Lalaki', 'Lalaki'], [sex]).reason).toBe('HELD_VALUE_GATE')
  })
})

describe('AUTO_SMART_V4', () => {
  const fields: SmartMatchField[] = [
    ...registration,
    text('f-name', 'display_name', 'Display name'),
    text('f-city', 'location_city_municipality', 'City or municipality'),
    text('f-donor', 'donor', 'Donor'),
  ]
  const oneV4 = (header: string, samples: unknown[] = ['x'], list = fields) =>
    smartMatchColumnsV4([column(1, header, samples)], list)[0]
  const oneV3 = (header: string, samples: unknown[] = ['x']) =>
    smartMatchColumnsV3([column(1, header, samples)], fields)[0]

  it('names the algorithm', () => {
    expect(AUTO_SMART_V4).toBe('AUTO_SMART_V4')
  })

  it.each([
    ['Pangalan', 'f-name', ['Ana Cruz']],
    ['Petsa ng Kapanganakan', 'f-birth', ['2001-02-03']],
    ['Bayan', 'f-city', ['Borongan']],
    ['Edad', 'f-age', ['12']],
  ])('maps the Filipino header %s under V4 only', (header, id, samples) => {
    expect(oneV4(header, samples)).toMatchObject({
      status: 'MAPPED',
      targetFieldId: id,
      matchReason: 'SYNONYM',
      reason: 'AUTO_MATCH',
    })
    expect(oneV3(header, samples).status).toBe('PENDING')
  })

  it('only ever suggests Kasarian, for sex and for gender', () => {
    expect(oneV4('Kasarian', ['MALE', 'FEMALE'])).toMatchObject({
      status: 'PENDING',
      targetFieldId: null,
      suggestedFieldId: 'f-sex',
      matchReason: 'SYNONYM_REVIEW',
      reason: 'SUGGESTED',
    })
    const gender = [text('f-gender', 'gender', 'Gender identity')]
    expect(oneV4('Kasarian', ['x'], gender)).toMatchObject({
      status: 'PENDING',
      suggestedFieldId: 'f-gender',
    })
  })

  it('does not map or suggest a header that names another person', () => {
    expect(oneV4('Kasarian ng magulang', ['MALE', 'FEMALE'])).toMatchObject({
      status: 'PENDING',
      targetFieldId: null,
      suggestedFieldId: null,
    })
  })

  it('reads the leaf of a group path with no spaces', () => {
    for (const header of [
      'personal_info/sex',
      'personal_info-sex',
      'respondent/demographics/sex',
    ]) {
      expect(oneV4(header, ['MALE', 'FEMALE'])).toMatchObject({
        status: 'MAPPED',
        targetFieldId: 'f-sex',
        reason: 'AUTO_MATCH',
      })
    }
    expect(oneV3('personal_info/sex', ['MALE']).status).toBe('PENDING')
  })

  it('reads the leaf of a group path whenever it scores higher than the whole header', () => {
    for (const [header, samples, target] of [
      ['participant/sex', ['MALE', 'FEMALE'], 'f-sex'],
      ['participant-sex', ['MALE', 'FEMALE'], 'f-sex'],
      ['participant/birth_date', ['2001-02-03'], 'f-birth'],
      ['participant/first_name', ['Ana'], 'f-first'],
    ] as const) {
      expect(oneV4(header, [...samples])).toMatchObject({
        status: 'MAPPED',
        targetFieldId: target,
        score: 100,
        reason: 'AUTO_MATCH',
      })
    }
  })

  it('maps the leaf of a participant or generic group path', () => {
    for (const [header, samples, target] of [
      ['location/municipality', ['Borongan'], 'f-city'],
      ['beneficiary_profile/name', ['Ana Cruz'], 'f-name'],
      ['registration-identity-age', ['30'], 'f-age'],
      ['donor/donor', ['Acme'], 'f-donor'],
    ] as const) {
      expect(oneV4(header, [...samples])).toMatchObject({
        status: 'MAPPED',
        targetFieldId: target,
        reason: 'AUTO_MATCH',
      })
    }
  })

  it('only suggests the leaf of a path whose group may name someone else', () => {
    for (const [header, samples, target] of [
      ['emergency_contact/name', ['Ana Cruz'], 'f-name'],
      ['household_head/name', ['Ana Cruz'], 'f-name'],
      ['referral/name', ['Ana Cruz'], 'f-name'],
      ['contact_person/age', ['40'], 'f-age'],
      ['child-age', ['8'], 'f-age'],
      ['a/b.c/sex', ['MALE', 'FEMALE'], 'f-sex'],
    ] as const) {
      expect(oneV4(header, [...samples])).toMatchObject({
        status: 'PENDING',
        targetFieldId: null,
        suggestedFieldId: target,
        score: 80,
        matchReason: 'SYNONYM_REVIEW',
        reason: 'SUGGESTED',
      })
    }
  })

  it('leaves headers with spaces whole, as under V3', () => {
    for (const header of [
      'Project Donor/Name',
      'Student ID/Barangay Certificate No',
      'Gender - YEE',
    ]) {
      expect(oneV4(header, ['MALE'])).toEqual(oneV3(header, ['MALE']))
    }
    expect(oneV4('Project Donor/Name').targetFieldId).not.toBe('f-name')
  })

  it('keeps the whole-header match of a hyphenated name', () => {
    expect(oneV4('first-name', ['Ana'])).toMatchObject({
      targetFieldId: 'f-first',
      matchReason: 'EXACT',
    })
    expect(oneV4('date-of-birth', ['2001-02-03'])).toMatchObject({
      targetFieldId: 'f-birth',
      matchReason: 'SYNONYM',
    })
  })

  it('ignores submission system columns but not time columns', () => {
    for (const header of [
      '_uuid',
      'meta-instanceID',
      'KEY',
      '_id',
      '__version__',
      'SubmitterID',
      'SubmitterName',
      'AttachmentsPresent',
      'AttachmentsExpected',
      'ReviewState',
      'DeviceID',
      'Edits',
      'FormVersion',
    ]) {
      expect(oneV4(header, ['abc'])).toEqual({
        sourceKey: 'column_0001',
        columnIndex: 1,
        status: 'IGNORED',
        targetFieldId: null,
        suggestedFieldId: null,
        score: null,
        matchReason: null,
        reason: 'SYSTEM_COLUMN',
      })
    }
    expect(oneV4('_submission_time', ['2026-01-01']).status).toBe('PENDING')
    expect(oneV4('Timestamp', ['2026-01-01']).status).toBe('PENDING')
    expect(oneV4('Status', ['Active']).status).toBe('PENDING')
    expect(oneV3('_uuid', ['abc']).status).toBe('PENDING')
  })

  it('maps a system column a field approved as its source name', () => {
    const record = { ...text('f-record', 'record_id', 'Record ID'), sourceNames: ['_id', 'Edits'] }
    for (const header of ['_id', 'Edits']) {
      expect(oneV4(header, ['abc'], [...fields, record])).toMatchObject({
        status: 'MAPPED',
        targetFieldId: 'f-record',
        matchReason: 'METADATA_SOURCE_NAME',
        reason: 'AUTO_MATCH',
      })
    }
    expect(oneV4('KEY', ['abc'], [...fields, record]).reason).toBe('SYSTEM_COLUMN')
  })

  it('never reads the leaf of a path that names another person', () => {
    for (const header of ['Mother-Sex', 'Spouse/Sex', 'guardian/gender', 'grp/magulang-sex']) {
      expect(oneV4(header, ['Male', 'Female'])).toEqual(oneV3(header, ['Male', 'Female']))
      expect(oneV4(header, ['Male', 'Female']).targetFieldId).toBeNull()
    }
  })

  it('splits a path on "/" first so a hyphenated leaf stays whole', () => {
    expect(groupPathLeaf('group/first-name')).toBe('first-name')
    for (const header of ['group/first-name', 'grp/middle-name']) {
      expect(oneV4(header, ['Ana']).targetFieldId).not.toBe('f-name')
    }
    expect(oneV4('group/first-name', ['Ana'])).toMatchObject({ targetFieldId: 'f-first' })
  })

  it('splits only clean group paths', () => {
    expect(groupPathLeaf('a/b')).toBe('b')
    expect(groupPathLeaf('a-b')).toBe('b')
    for (const header of ['plain', 'a /b', 'a/', '/b', '1a/b', 'a/b c', 'a/b$']) {
      expect(groupPathLeaf(header)).toBeNull()
    }
  })

  it("passes Kobo's space-separated choices as validation reads them, under V4 only", () => {
    const interests: SmartMatchField = {
      id: 'f-interests',
      code: 'training_interests',
      label: 'Training interests',
      dataType: 'MULTIPLE_SELECT',
      allowedValues: ['COOKING', 'SEWING'],
    }
    const samples = ['sewing cooking', 'cooking', 'cooking sewing']
    expect(oneV4('training_interests', samples, [interests])).toMatchObject({
      status: 'MAPPED',
      targetFieldId: 'f-interests',
    })
    expect(
      smartMatchColumnsV3([column(1, 'training_interests', samples)], [interests])[0].reason,
    ).toBe('HELD_VALUE_GATE')
    expect(oneV4('training_interests', ['sewing baking'], [interests]).reason).toBe(
      'HELD_VALUE_GATE',
    )
  })

  it('passes date-time text through the DATE gate under V4 only', () => {
    const samples = ['2026/01/10 9:15:22 AM GMT+8', '1/10/2026 14:05', '10-01-2026 2:05 PM']
    expect(oneV4('Birth date', samples)).toMatchObject({
      status: 'MAPPED',
      targetFieldId: 'f-birth',
      reason: 'AUTO_MATCH',
    })
    expect(oneV3('Birth date', samples).reason).toBe('HELD_VALUE_GATE')
    expect(oneV4('Birth date', ['1/10/2026 25:05']).reason).toBe('HELD_VALUE_GATE')
    expect(oneV4('Timestamp', samples)).toMatchObject({ status: 'PENDING', targetFieldId: null })
  })

  it('keeps V3 output unchanged for Filipino synonyms', () => {
    expect(oneV3('Kasarian', ['MALE']).suggestedFieldId).toBeNull()
  })
})

describe('AUTO_SMART_V5', () => {
  const disability = {
    ...text('f-disability', 'disability_status', 'Disability status'),
    calculated: true,
  }
  const consent = {
    ...text('f-consent', 'consent_recorded', 'Participation consent'),
    calculated: true,
  }
  const guardian = text('f-guardian', 'guardian_consent_recorded', 'Guardian consent')
  const fields: SmartMatchField[] = [...registration, disability, consent, guardian]
  const columns = (headers: string[]) => headers.map((header, index) => column(index + 1, header))
  const v5 = (headers: string[], list = fields) => smartMatchColumnsV5(columns(headers), list)
  const v4 = (headers: string[], list = fields) => smartMatchColumnsV4(columns(headers), list)
  const ignored = (reason: string, suggestedFieldId: string | null = null) => ({
    status: 'IGNORED',
    targetFieldId: null,
    suggestedFieldId,
    score: null,
    matchReason: null,
    reason,
  })
  const noMatch = {
    status: 'PENDING',
    targetFieldId: null,
    suggestedFieldId: null,
    reason: 'NO_MATCH',
  }

  it('names the algorithm and appends its reasons', () => {
    expect(AUTO_SMART_V5).toBe('AUTO_SMART_V5')
    expect(SMART_DECISION_REASONS.slice(-3)).toEqual([
      'SYSTEM_COLUMN',
      'CALCULATED_FIELD',
      'SUBMISSION_TIME',
    ])
  })

  it('ignores a participant header naming a calculated field, carrying the field for the fed check', () => {
    expect(v5(['participant/disability'])[0]).toEqual({
      sourceKey: 'column_0001',
      columnIndex: 1,
      ...ignored('CALCULATED_FIELD', 'f-disability'),
    })
    expect(v4(['participant/disability'])[0]).toMatchObject(noMatch)
  })

  it('ignores every column that names the calculated field loosely', () => {
    for (const decision of v5(['participant/disability', 'Disability'])) {
      expect(decision).toMatchObject(ignored('CALCULATED_FIELD', 'f-disability'))
    }
  })

  it('still maps the exact label, and ignores a second loose column', () => {
    const [exact, loose] = v5(['Disability status', 'participant/disability'])
    expect(exact).toMatchObject({
      status: 'MAPPED',
      targetFieldId: 'f-disability',
      reason: 'AUTO_MATCH',
    })
    expect(loose).toMatchObject(ignored('CALCULATED_FIELD', 'f-disability'))
  })

  it('leaves a header two calculated fields tie on pending', () => {
    const other = { ...text('f-other', 'pwd_flag', 'Status disability'), calculated: true }
    expect(v5(['Status of disability'], [disability])[0]).toMatchObject(
      ignored('CALCULATED_FIELD', 'f-disability'),
    )
    expect(v5(['Status of disability'], [disability, other])[0]).toMatchObject(noMatch)
  })

  it('ignores a submission time header only where V4 offers nothing', () => {
    for (const header of ['_submission_time', 'SubmissionDate', 'Timestamp', 'timestamp']) {
      expect(v5([header])[0]).toMatchObject(ignored('SUBMISSION_TIME'))
      expect(v4([header])[0]).toMatchObject(noMatch)
    }
    const owned = { ...text('f-stamp', 'stamp', 'Stamp'), sourceNames: ['Timestamp'] }
    const coded = text('f-submission', 'submission_time', 'Submitted at')
    const labelled = text('f-submitted', 'submitted_on', 'Submission date')
    for (const [header, field, status] of [
      ['Timestamp', owned, 'MAPPED'],
      ['_submission_time', coded, 'PENDING'],
      ['SubmissionDate', labelled, 'PENDING'],
    ] as const) {
      const list = [...fields, field]
      const [decision] = v5([header], list)
      expect(v5([header], list)).toEqual(v4([header], list))
      expect(decision.status).toBe(status)
      expect([decision.targetFieldId, decision.suggestedFieldId]).toContain(field.id)
    }
  })

  it('never ignores a calculated field from a path about someone else or a refused word', () => {
    const calculatedGuardian = {
      ...text('f-guardian-calc', 'guardian_consent_recorded', 'Guardian approval'),
      calculated: true,
    }
    for (const [header, list] of [
      ['emergency_contact/disability', fields],
      ['household/disability', fields],
      ['Guardian consent given', fields],
      ['Guardian consent', [calculatedGuardian]],
    ] as const) {
      expect(v5([header], [...list])[0]).toMatchObject(noMatch)
      expect(v5([header], [...list])).toEqual(v4([header], [...list]))
    }
    expect(v5(['participant/disability'])[0]).toMatchObject(
      ignored('CALCULATED_FIELD', 'f-disability'),
    )
    expect(v5(['consent/consent_given'])[0]).toMatchObject(ignored('CALCULATED_FIELD', 'f-consent'))
  })

  it('ignores Kobo timing columns only beside two Kobo or ODK markers', () => {
    expect(v5(['_uuid', '_submission_time', 'start'])[2]).toMatchObject(ignored('SYSTEM_COLUMN'))
    expect(v5(['SubmissionDate', 'meta-instanceID', 'End', 'today']).slice(2)).toMatchObject([
      ignored('SYSTEM_COLUMN'),
      ignored('SYSTEM_COLUMN'),
    ])
    for (const headers of [
      ['Key', 'Start', 'End'],
      ['_uuid', 'Start', 'End'],
      ['_uuid', '_UUID', 'Start', 'End'],
      ['Timestamp', 'Start', 'End'],
    ]) {
      expect(v5(headers).slice(-2)).toEqual(v4(headers).slice(-2))
      expect(v5(headers).slice(-2)).toMatchObject([noMatch, noMatch])
    }
    expect(v5(['start'])).toEqual(v4(['start']))
    const owned = { ...text('f-start', 'session_start', 'Session start'), sourceNames: ['start'] }
    expect(v5(['_uuid', '_id', 'start'], [...fields, owned])[2]).toMatchObject({
      status: 'MAPPED',
      targetFieldId: 'f-start',
    })
  })

  it('matcher output before the fed guard leaves only training/training_interests pending on the Kobo corpus file', () => {
    const { bytes, fileType } = buildAnySourceFixture('kobo-xlsx')
    const file = readImportFile(
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer,
      fileType,
      null,
    )
    const koboColumns = file.sourceColumns.map((source) => {
      const values = file.rows.map((row) => row[source.key])
      return {
        key: source.key,
        columnIndex: source.columnIndex,
        header: source.header,
        samples: values,
        blank: values.every((value) => value === '' || value === null || value === undefined),
      }
    })
    // The default registration form with the calculations of the trigger form (ECD-MB-2026).
    const calculated = ['age_at_registration', 'disability_status', 'consent_recorded', 'is_minor']
    const form = REGISTRATION.map((field) => ({
      ...field,
      id: field.id ?? field.code,
      calculated: calculated.includes(field.code),
    }))
    const reasons = Object.fromEntries(
      smartMatchColumnsV5(koboColumns, form)
        .filter((decision) => decision.status !== 'MAPPED')
        .map((decision) => [
          koboColumns.find((source) => source.key === decision.sourceKey)?.header,
          `${decision.status} ${decision.reason}`,
        ]),
    )
    expect(reasons).toEqual({
      start: 'IGNORED SYSTEM_COLUMN',
      end: 'IGNORED SYSTEM_COLUMN',
      'participant/disability': 'IGNORED CALCULATED_FIELD',
      'training/training_interests': 'PENDING NO_MATCH',
      'consent/consent_given': 'IGNORED CALCULATED_FIELD',
      _id: 'IGNORED SYSTEM_COLUMN',
      _uuid: 'IGNORED SYSTEM_COLUMN',
      _submission_time: 'IGNORED SUBMISSION_TIME',
      _validation_status: 'IGNORED BLANK_COLUMN',
      _index: 'IGNORED SYSTEM_COLUMN',
    })
  })
})
