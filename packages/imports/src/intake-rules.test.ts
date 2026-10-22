import { describe, expect, it } from 'vitest'

import {
  type IntakeField,
  type NormalizedImportValue,
  applyIntakeRules,
  washingtonGroupLevel,
} from './intake-rules'

const wgCodes = [
  'wg_seeing',
  'wg_hearing',
  'wg_walking',
  'wg_remembering',
  'wg_self_care',
  'wg_communicating',
]
const WG_VALUES = ['Oo - Madalas nahihirapan', 'Walang akong kakayahang gawin']

const field = (code: string, dataType: IntakeField['dataType'], extra: Partial<IntakeField> = {}) =>
  ({ code, label: code, dataType, required: false, ...extra }) as IntakeField

const fields: IntakeField[] = [
  field('birth_date', 'DATE'),
  field('enrollment_date', 'DATE'),
  field('first_name', 'TEXT'),
  field('last_name', 'TEXT'),
  field('age_at_registration', 'INTEGER', {
    rule: { kind: 'AGE_AT_DATE', birthField: 'birth_date', atField: 'enrollment_date' },
  }),
  field('is_minor', 'BOOLEAN', {
    rule: { kind: 'MINOR_AT_DATE', birthField: 'birth_date', atField: 'enrollment_date' },
  }),
  field('age', 'INTEGER', {
    rule: { kind: 'AGE_CHECK', birthField: 'birth_date', atFields: ['enrollment_date'] },
  }),
  ...wgCodes.map((code) => field(code, 'SELECT')),
  field('disability_status', 'SELECT', {
    sadddField: true,
    rule: {
      kind: 'WASHINGTON_GROUP_DISABILITY',
      questionFields: wgCodes,
      disabilityValues: WG_VALUES,
    },
  }),
  field('consent_recorded', 'BOOLEAN'),
  field('data_processing_consent_recorded', 'BOOLEAN', {
    rule: { kind: 'SAME_ANSWER_AS', field: 'consent_recorded' },
  }),
  field('guardian_consent_recorded', 'BOOLEAN'),
  field('job', 'SELECT'),
  field('job_other', 'TEXT', {
    rule: { kind: 'FOLLOW_UP_OF', parentField: 'job', whenValues: ['F. Iba pa'] },
  }),
  field('participant_id', 'TEXT', {
    rule: {
      kind: 'ID_FROM_INITIALS_AND_BIRTH_DATE',
      firstNameField: 'first_name',
      lastNameField: 'last_name',
      birthField: 'birth_date',
    },
  }),
]

const run = (
  values: Record<string, NormalizedImportValue>,
  sourceProvided: string[] = [],
  uploadDate = '2026-10-22',
) => applyIntakeRules(fields, values, new Set(sourceProvided), uploadDate)

const wg = (...answers: Array<string | null>) =>
  Object.fromEntries(wgCodes.map((code, i) => [code, answers[i] ?? null]))

describe('applyIntakeRules', () => {
  it('age_at_registration from birth 2008-08-17 at enrollment 2026-05-28 is 17 and is_minor true, with a guardian warning', () => {
    const values: Record<string, NormalizedImportValue> = {
      birth_date: '2008-08-17',
      enrollment_date: '2026-05-28',
    }
    const { errors, warnings } = run(values)
    expect(values.age_at_registration).toBe(17)
    expect(values.is_minor).toBe(true)
    expect(errors).toEqual([])
    expect(warnings).toEqual([
      { fieldCode: 'guardian_consent_recorded', code: 'GUARDIAN_CONSENT_MISSING' },
    ])
  })

  it('leaves a calculation null when an input is missing and skips the guardian warning', () => {
    const values: Record<string, NormalizedImportValue> = { birth_date: '2008-08-17' }
    const { warnings } = run(values)
    expect(values.age_at_registration).toBeUndefined()
    expect(warnings).toEqual([])
  })

  it('does not warn about guardian consent when it is recorded', () => {
    const values: Record<string, NormalizedImportValue> = {
      birth_date: '2008-08-17',
      enrollment_date: '2026-05-28',
      guardian_consent_recorded: true,
    }
    expect(run(values).warnings).toEqual([])
  })

  it('AGE_CHECK accepts 18 when uploadDate is 2026-10-22 and warns AGE_MISMATCH for 25', () => {
    const base = {
      birth_date: '2008-08-17',
      enrollment_date: '2026-05-28',
      guardian_consent_recorded: true,
    }
    expect(run({ ...base, age: 18 }, ['age']).warnings).toEqual([])
    expect(run({ ...base, age: 17 }, ['age']).warnings).toEqual([])
    expect(run({ ...base, age: 25 }, ['age']).warnings).toEqual([
      { fieldCode: 'age', code: 'AGE_MISMATCH' },
    ])
  })

  describe('WASHINGTON_GROUP_DISABILITY', () => {
    const none = 'Hindi - Hindi nahihirapan'
    const some = 'Oo - medyo nahihirapan'

    it('gives WITH_DISABILITY for one level-3 answer', () => {
      const values = wg(none, none, 'Oo - Madalas nahihirapan', none, none, none)
      run(values)
      expect(values.disability_status).toBe('WITH_DISABILITY')
    })

    it('gives WITHOUT_DISABILITY when all six are level 1-2', () => {
      const values = wg(none, some, none, some, none, none)
      run(values)
      expect(values.disability_status).toBe('WITHOUT_DISABILITY')
    })

    it('gives NOT_SPECIFIED when one is blank and none qualifies', () => {
      const values = wg(none, some, none, some, none, null)
      run(values)
      expect(values.disability_status).toBe('NOT_SPECIFIED')
    })

    it('matches answers through dash and case folding', () => {
      const values = wg(none, none, 'OO – MADALAS NAHIHIRAPAN', none, none, none)
      run(values)
      expect(values.disability_status).toBe('WITH_DISABILITY')
    })

    it('a mapped disability flag that disagrees is an error on a SADDD field and a warning otherwise', () => {
      const answers = wg(none, none, 'Oo - Madalas nahihirapan', none, none, none)
      const saddd = run({ ...answers, disability_status: 'WITHOUT_DISABILITY' }, [
        'disability_status',
      ])
      expect(saddd.errors).toEqual([
        expect.objectContaining({ fieldCode: 'disability_status', code: 'CALCULATION_MISMATCH' }),
      ])
      expect(saddd.warnings).toEqual([])

      const plain = fields.map((item) =>
        item.code === 'disability_status' ? { ...item, sadddField: false } : item,
      )
      const values: Record<string, NormalizedImportValue> = {
        ...answers,
        disability_status: 'WITHOUT_DISABILITY',
      }
      const result = applyIntakeRules(plain, values, new Set(['disability_status']), '2026-10-22')
      expect(result.errors).toEqual([])
      expect(result.warnings).toEqual([
        { fieldCode: 'disability_status', code: 'CALCULATION_MISMATCH' },
      ])
      expect(values.disability_status).toBe('WITH_DISABILITY')
    })

    it('accepts a mapped flag that agrees', () => {
      const answers = wg(none, none, 'Oo - Madalas nahihirapan', none, none, none)
      const result = run({ ...answers, disability_status: 'WITH_DISABILITY' }, [
        'disability_status',
      ])
      expect(result.errors).toEqual([])
    })
  })

  it('SAME_ANSWER_AS copies false and true', () => {
    for (const answer of [false, true]) {
      const values: Record<string, NormalizedImportValue> = { consent_recorded: answer }
      run(values)
      expect(values.data_processing_consent_recorded).toBe(answer)
    }
  })

  it('FOLLOW_UP_OF warns when other-job text is filled after "A. construction" and stays silent after "F. Iba pa"', () => {
    expect(run({ job: 'A. construction', job_other: 'welder' }).warnings).toEqual([
      { fieldCode: 'job_other', code: 'FOLLOW_UP_UNEXPECTED' },
    ])
    expect(run({ job: 'F. Iba pa', job_other: 'welder' }).warnings).toEqual([])
    expect(run({ job: 'A. construction', job_other: null }).warnings).toEqual([])
  })

  it('ID_FROM_INITIALS_AND_BIRTH_DATE accepts AB08172008 for Ana Bautista 2008-08-17', () => {
    const base = { first_name: 'Ana', last_name: 'Bautista', birth_date: '2008-08-17' }
    expect(run({ ...base, participant_id: 'AB08172008' }).warnings).toEqual([])
    expect(run({ ...base, participant_id: 'ab08172008' }).warnings).toEqual([])
    expect(run({ ...base, participant_id: 'XX08172008' }).warnings).toEqual([
      { fieldCode: 'participant_id', code: 'ID_PATTERN_MISMATCH' },
    ])
  })

  it('a calculation never reads another calculation output', () => {
    const swapped: IntakeField[] = [
      field('a', 'BOOLEAN', { rule: { kind: 'SAME_ANSWER_AS', field: 'consent_recorded' } }),
      field('consent_recorded', 'BOOLEAN', { rule: { kind: 'SAME_ANSWER_AS', field: 'a' } }),
    ]
    const values: Record<string, NormalizedImportValue> = { a: true, consent_recorded: false }
    applyIntakeRules(swapped, values, new Set(), '2026-10-22')
    expect(values).toEqual({ a: false, consent_recorded: true })
  })
})

describe('applyIntakeRules hardening', () => {
  it('never reads inherited object properties as calculation inputs', () => {
    const inherited: IntakeField[] = [
      field('copy', 'BOOLEAN', { rule: { kind: 'SAME_ANSWER_AS', field: 'constructor' } }),
    ]
    const values: Record<string, NormalizedImportValue> = {}
    applyIntakeRules(inherited, values, new Set(), '2026-10-22')
    expect(values.copy).toBeUndefined()
  })

  it('FOLLOW_UP_OF matches with or without a letter prefix on either side', () => {
    const follow = (whenValues: string[]) => [
      field('job', 'SELECT'),
      field('job_other', 'TEXT', {
        rule: { kind: 'FOLLOW_UP_OF', parentField: 'job', whenValues },
      }),
    ]
    const warnings = (list: IntakeField[], job: string) =>
      applyIntakeRules(list, { job, job_other: 'welder' }, new Set(), '2026-10-22').warnings
    expect(warnings(follow(['F. Iba pa']), 'Iba pa')).toEqual([])
    expect(warnings(follow(['Iba pa']), 'F. Iba pa')).toEqual([])
    expect(warnings(follow(['F. Iba pa']), 'A. construction')).toHaveLength(1)
  })

  it('throws when uploadDate is not a YYYY-MM-DD calendar date', () => {
    for (const bad of ['', 'yesterday', '2026-13-01', '2026-02-30', '10/22/2026'])
      expect(() => run({}, [], bad)).toThrow(Error)
  })

  it('one blank answer plus one level-3 answer gives WITH_DISABILITY', () => {
    const values = wg('Hindi - Hindi nahihirapan', null, 'Oo - Madalas nahihirapan')
    run(values)
    expect(values.disability_status).toBe('WITH_DISABILITY')
  })

  it('keeps a mapped age_at_registration source when birth_date is null, with no mismatch', () => {
    const values: Record<string, NormalizedImportValue> = {
      birth_date: null,
      enrollment_date: '2026-05-28',
      age_at_registration: 17,
    }
    const { errors, warnings } = run(values, ['age_at_registration'])
    expect(values.age_at_registration).toBe(17)
    expect(errors).toEqual([])
    expect(warnings.map((warning) => warning.code)).not.toContain('CALCULATION_MISMATCH')
  })
})

describe('washingtonGroupLevel', () => {
  it('maps English and Tagalog texts, with a letter prefix and dash variants', () => {
    expect(washingtonGroupLevel('No difficulty')).toBe(1)
    expect(washingtonGroupLevel('B. Oo – medyo nahihirapan')).toBe(2)
    expect(washingtonGroupLevel('yes - a lot of difficulty')).toBe(3)
    expect(washingtonGroupLevel('Cannot do at all')).toBe(4)
    expect(washingtonGroupLevel('maybe')).toBeNull()
  })
})
