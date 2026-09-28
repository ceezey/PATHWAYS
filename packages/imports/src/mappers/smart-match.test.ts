import { describe, expect, it } from 'vitest'

import {
  AUTO_SMART_V2_LIMITS,
  SMART_DECISION_REASONS,
  SMART_MATCH_REASONS,
  type SmartMatchColumn,
  type SmartMatchField,
  SmartMatchInputError,
  boundedEditDistance,
  normalizeMappingNameV1,
  smartMatchColumns,
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
