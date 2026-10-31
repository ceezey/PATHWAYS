import { CONSENT_FIELD_CODES, formIntakeDefinitionErrors } from '@pathways/shared'
import { describe, expect, it } from 'vitest'

import { sourceNameKey } from '../mappers/smart-match'
import { type DraftField, FormDraftError, draftFormFromImport } from './draft-form'
import { REGISTRATION, SPECS, columnOf, draft, find } from './draft-test-support'
import { fieldCodeFromHeader } from './field-code'
import { buildFuturemakersFixture, fixtureColumns } from './futuremakers-fixture'

const fixture = () => draft(fixtureColumns())
describe('fieldCodeFromHeader', () => {
  it('builds an ASCII code, prefixes digits and suffixes clashes', () => {
    const taken = new Set<string>(['first_name'])
    expect(fieldCodeFromHeader('Municipality - OU', taken)).toBe('municipality_ou')
    expect(fieldCodeFromHeader('First name', taken)).toBe('first_name_2')
    expect(fieldCodeFromHeader('First name', taken)).toBe('first_name_3')
    expect(fieldCodeFromHeader('4P beneficiary', taken)).toBe('f_4p_beneficiary')
    expect(fieldCodeFromHeader('Pangalan ñ', taken)).toBe('pangalan_n')
    expect(fieldCodeFromHeader('x'.repeat(80), taken)).toMatch(/^[a-z][a-z0-9_]{0,63}$/)
    expect(taken.has('municipality_ou')).toBe(true)
  })
})

describe('draftFormFromImport on the Futuremakers fixture', () => {
  it('leaves only what no rule can settle for a person to check', () => {
    expect(fixture().summary.needsCheck).toEqual([
      { fieldCode: 'data_processing_consent_recorded', reason: 'CONSENT_SOURCE_PROPOSED' },
      { fieldCode: 'consent_recorded', reason: 'PARTICIPATION_CONSENT_NO_SOURCE' },
    ])
  })

  it('adds "Gender - YEE" as a sex source name without asking for a check', () => {
    const result = fixture()
    expect(find(result, 'sex')?.sourceNames).toEqual(['Gender - YEE'])
    expect(result.summary.sourceNamesAdded).toContain('sex')
    expect(result.summary.needsCheck.some((item) => item.fieldCode === 'sex')).toBe(false)
  })

  it('adds aliases A. Babae to FEMALE, B. Lalaki to MALE, C. Non-binary to OTHER', () => {
    const aliases = find(fixture(), 'sex')?.valueAliases
    expect(aliases).toEqual(
      expect.arrayContaining([
        { from: 'A. Babae', to: 'FEMALE' },
        { from: 'B. Lalaki', to: 'MALE' },
        { from: 'C. Non-binary', to: 'OTHER' },
      ]),
    )
    expect(find(fixture(), 'sex')?.allowedValues).toEqual(SPECS[7][6])
  })

  it('builds civil_status as SELECT with options in letter order', () => {
    const civil = find(fixture(), 'civil_status')
    expect(civil?.dataType).toBe('SELECT')
    expect(civil?.allowedValues).toEqual([
      'Single',
      'Married',
      'Living-in with Partner',
      'Separated',
    ])
    expect(civil?.sourceNames).toEqual(['Civil Status'])
    expect(civil?.valueAliases).toContainEqual({ from: 'E. Separated', to: 'Separated' })
  })

  it('keeps First Name, Contact Number, Email Address as TEXT, never SELECT', () => {
    const result = fixture()
    expect(find(result, 'first_name')?.dataType).toBe('TEXT')
    expect(find(result, 'contact_number')?.dataType).toBe('TEXT')
    expect(find(result, 'email_address')?.dataType).toBe('TEXT')
    expect(find(result, 'contact_number')?.allowedValues).toBeUndefined()
    expect(find(result, 'email_address')?.valueAliases).toBeUndefined()
  })

  it('sets registration_operation CREATE and subject_type INDIVIDUAL without asking for a check', () => {
    const result = fixture()
    expect(find(result, 'registration_operation')?.importDefault).toBe('CREATE')
    expect(find(result, 'subject_type')?.importDefault).toBe('INDIVIDUAL')
    expect(result.summary.defaults).toEqual(
      expect.arrayContaining(['registration_operation', 'subject_type']),
    )
    expect(result.summary.needsCheck.some((item) => item.fieldCode === 'subject_type')).toBe(false)
  })

  it('maps the consent column to data_processing_consent_recorded and flags consent_recorded', () => {
    const result = fixture()
    expect(find(result, 'data_processing_consent_recorded')?.sourceNames).toEqual([
      'Consent to the collection and use of your data for the purposes - Futuremaker',
    ])
    expect(result.summary.needsCheck).toContainEqual({
      fieldCode: 'data_processing_consent_recorded',
      reason: 'CONSENT_SOURCE_PROPOSED',
    })
    expect(result.summary.needsCheck).toContainEqual({
      fieldCode: 'consent_recorded',
      reason: 'PARTICIPATION_CONSENT_NO_SOURCE',
    })
  })

  it('never sets importDefault on a consent field', () => {
    const result = fixture()
    for (const code of CONSENT_FIELD_CODES)
      expect(find(result, code)?.importDefault).toBeUndefined()
  })

  it('maps Student ID/Barangay Certificate No to external_identifier_value with a type default', () => {
    const result = fixture()
    expect(find(result, 'external_identifier_value')?.sourceNames).toEqual([
      'Student ID/Barangay Certificate No',
    ])
    expect(find(result, 'external_identifier_type')?.importDefault).toBe(
      'STUDENT_ID_BARANGAY_CERTIFICATE',
    )
    expect(
      result.summary.needsCheck.some((item) => item.fieldCode === 'external_identifier_value'),
    ).toBe(false)
    expect(
      result.summary.needsCheck.some((item) => item.fieldCode === 'external_identifier_type'),
    ).toBe(false)
    expect(result.summary.defaults).toContain('external_identifier_type')
  })

  it('does not pick Contact Number as an identifier and adds nothing for blank columns', () => {
    const result = fixture()
    expect(find(result, 'external_identifier_value')?.sourceNames).not.toContain('Contact Number')
    expect(result.summary.addedFields).not.toContain('project_donor_name')
    expect(result.summary.addedFields).not.toContain('province')
    expect(result.summary.addedFields).toContain('contact_number')
  })

  it('appends new fields after the existing ones and types them from the values', () => {
    const result = fixture()
    expect(result.fields.slice(0, 22).map((field) => field.code)).toEqual(
      REGISTRATION.map((field) => field.code),
    )
    expect(result.fields.slice(22).map((field) => field.code)).toEqual(result.summary.addedFields)
    expect(find(result, 'living_with_disability')).toBeUndefined()
    expect(find(result, 'orgunit')?.dataType).toBe('TEXT')
    expect(find(result, 'is_your_family_a_4p_s_beneficiary')?.dataType).toBe('BOOLEAN')
    expect(find(result, 'civil_status')?.label).toBe('Civil Status')
  })

  it('the draft passes the form intake definition checks and carries no id', () => {
    const result = fixture()
    expect(formIntakeDefinitionErrors(result.fields)).toEqual([])
    expect(result.fields.some((field) => 'id' in field)).toBe(false)
  })

  it('the summary contains no source value', () => {
    const text = JSON.stringify(fixture().summary)
    const sample = buildFuturemakersFixture().rows[0]
    for (const value of ['Reyes', 'Cruz', 'user1@example.invalid', 'NS-1000', 'Babae', 'Navotas'])
      expect(text).not.toContain(value)
    expect(text).not.toContain(String(sample.column_0017))
  })
})

const yearsBetween = (birth: string, at: string) => {
  const [by, bm, bd] = birth.split('-').map(Number)
  const [ay, am, ad] = at.split('-').map(Number)
  return ay - by - (am < bm || (am === bm && ad < bd) ? 1 : 0)
}

describe('the Futuremakers fixture', () => {
  const { headers, rows } = buildFuturemakersFixture()
  const col = (n: number) => `column_${String(n).padStart(4, '0')}`

  it('has 100 rows and 36 columns', () => {
    expect(rows).toHaveLength(100)
    expect(headers).toHaveLength(36)
  })

  it('shows exactly the spec letters for each Washington Group question', () => {
    const letters = [0, 1, 2, 3, 4, 5].map((q) =>
      [...new Set(rows.map((row) => String(row[col(19 + q)]).charAt(0)))].sort().join(''),
    )
    expect(letters).toEqual(['ABC', 'ABCD', 'ABC', 'ABCD', 'ABD', 'ABCD'])
  })

  it('Living With Disability agrees with the C or D cut-off on every row', () => {
    const flags = rows.map((row) => {
      const severe = [19, 20, 21, 22, 23, 24].some((n) => /^[CD]/.test(String(row[col(n)])))
      return severe === row[col(25)]
    })
    expect(flags.every(Boolean)).toBe(true)
    expect(rows.filter((row) => row[col(25)] === true).length).toBe(25)
  })

  it('has 16 minors at enrollment, nobody under 17, and Age counted at 2026-10-22', () => {
    const ages = rows.map((row) => yearsBetween(String(row[col(14)]), String(row[col(2)])))
    expect(ages.filter((age) => age < 18)).toHaveLength(16)
    expect(Math.min(...ages)).toBeGreaterThanOrEqual(17)
    expect(
      rows.every((row) => row[col(15)] === yearsBetween(String(row[col(14)]), '2026-10-22')),
    ).toBe(true)
  })
})

describe('draftFormFromImport rules', () => {
  it('an answer outside an enum-mirror field options is ENUM_ANSWER_UNRESOLVED and adds no option', () => {
    const gender = columnOf('Gender - YEE', ['A. Babae', 'B. Lalaki', 'Z. Unknown', 'A. Babae'])
    const result = draft([gender])
    expect(find(result, 'sex')?.allowedValues).toEqual(SPECS[7][6])
    expect(result.summary.needsCheck).toContainEqual({
      fieldCode: 'sex',
      reason: 'ENUM_ANSWER_UNRESOLVED',
    })
    expect(result.summary.optionsAdded).toEqual([])
  })

  it('adds the stripped answers as options in letter order whatever the row order', () => {
    const fields: DraftField[] = [
      ...REGISTRATION,
      {
        id: 'field-civil',
        code: 'civil_status',
        label: 'Civil Status',
        dataType: 'SELECT',
        required: false,
        metadataKey: false,
        sadddField: false,
        allowedValues: ['Single', 'Married'],
      },
    ]
    const values = [
      ...Array.from({ length: 4 }, () => ['A. Single', 'B. Married']).flat(),
      'D. Divorced',
      'C. Widowed',
    ]
    const result = draft([columnOf('Civil Status', values)], fields)
    expect(find(result, 'civil_status')?.allowedValues).toEqual([
      'Single',
      'Married',
      'Widowed',
      'Divorced',
    ])
    expect(result.summary.optionsAdded).toEqual(['civil_status'])
    const reversed = draft([columnOf('Civil Status', [...values].reverse())], fields)
    expect(reversed.fields).toEqual(result.fields)
  })

  it('a lettered column with 101 distinct answers becomes TEXT', () => {
    const labels = [...Array.from({ length: 99 }, (_, i) => String(i + 1)), 'a', 'b']
    const values = labels.flatMap((label, i) => [`${label}. answer ${i}`, `${label}. answer ${i}`])
    expect(find(draft([columnOf('Quiz', values)]), 'quiz')?.dataType).toBe('TEXT')
    expect(find(draft([columnOf('Quiz', values.slice(0, 200))]), 'quiz')?.dataType).toBe('SELECT')
  })

  it('lettered personal data stays TEXT with no option or alias', () => {
    const initials = Array.from(
      { length: 100 },
      (_, i) => `${'JMAL'[i % 4]}. ${['Cruz', 'Reyes', 'Santos', 'Ramos', 'Flores'][i % 5]}`,
    )
    const roster = Array.from({ length: 100 }, (_, i) => `${i + 1}. Juan Dela Cruz ${i}`)
    const names = Array.from({ length: 100 }, (_, i) => `Juan Dela Cruz ${i}`)
    const result = draft([
      columnOf('Pangalan', initials, 1),
      columnOf('Listahan', roster, 2),
      columnOf('Buong Pangalan', names, 3),
    ])
    for (const code of ['pangalan', 'listahan', 'buong_pangalan']) {
      const field = find(result, code)
      expect(field?.dataType).toBe('TEXT')
      expect(field?.allowedValues).toBeUndefined()
      expect(field?.valueAliases).toBeUndefined()
    }
    expect(JSON.stringify(result)).not.toMatch(/Cruz|Reyes|Santos|Juan/)
  })

  it('a column that is not mostly lettered stays TEXT or LONG_TEXT', () => {
    const names = Array.from({ length: 10 }, (_, i) => `Name ${i}`)
    expect(find(draft([columnOf('Nickname', names)]), 'nickname')?.dataType).toBe('TEXT')
    expect(find(draft([columnOf('Story', ['x'.repeat(300), 'short'])]), 'story')?.dataType).toBe(
      'LONG_TEXT',
    )
  })

  it('infers date, boolean, integer and decimal columns', () => {
    const result = draft([
      columnOf('Joined', ['2026-01-02', '2026-03-04'], 1),
      columnOf('Member', [true, false], 2),
      columnOf('Children', [1, 2], 3),
      columnOf('Income', [1.5, 2], 4),
    ])
    expect(
      ['joined', 'member', 'children', 'income'].map((c) => find(result, c)?.dataType),
    ).toEqual(['DATE', 'BOOLEAN', 'INTEGER', 'DECIMAL'])
  })

  it('keeps whole numbers too long for INTEGER, such as phone numbers, as text', () => {
    const result = draft([
      columnOf('Contact Number', [9171234567, 9281234567], 1),
      columnOf('Household Size', [4, 6], 2),
    ])
    expect(find(result, 'contact_number')?.dataType).toBe('TEXT')
    expect(find(result, 'household_size')?.dataType).toBe('INTEGER')
  })

  it('a draft over 100 fields throws FIELD_LIMIT', () => {
    const full: DraftField[] = Array.from({ length: 100 }, (_, i) => ({
      id: `id-${i}`,
      code: `field_${i}`,
      label: `Field ${i}`,
      dataType: 'TEXT',
      required: false,
      metadataKey: false,
      sadddField: false,
    }))
    expect(() => draft([columnOf('Brand new column', ['x'])], full, 'OTHER')).toThrowError(
      expect.objectContaining({ code: 'FIELD_LIMIT' }),
    )
  })

  describe('a match no person confirms goes to a field of its own when it is unsure', () => {
    const idOf = (code: string) => REGISTRATION.find((field) => field.code === code)?.id ?? null
    const pending = (
      column: ReturnType<typeof columnOf>,
      reason: 'SUGGESTED' | 'HELD_MARGIN' | 'HELD_CONTESTED',
      suggestedFieldId = idOf('location_barangay'),
    ) => ({
      sourceKey: column.key,
      columnIndex: column.columnIndex,
      status: 'PENDING' as const,
      targetFieldId: null,
      suggestedFieldId,
      score: 70,
      matchReason: null,
      reason,
    })
    const drafted = (
      columns: ReturnType<typeof columnOf>[],
      reason: 'SUGGESTED' | 'HELD_MARGIN' | 'HELD_CONTESTED' = 'SUGGESTED',
    ) =>
      draftFormFromImport({
        formType: 'OTHER',
        fields: REGISTRATION,
        columns,
        decisions: columns.map((column) => pending(column, reason)),
        uploadDate: '2026-10-23',
      })

    it('accepts a plain suggestion', () => {
      const result = drafted([columnOf('Village', ['Dolores'], 1)])
      expect(find(result, 'location_barangay')?.sourceNames).toEqual(['Village'])
      expect(result.summary.addedFields).toEqual([])
    })

    it.each(['HELD_MARGIN', 'HELD_CONTESTED'] as const)('adds a field on %s', (reason) => {
      const result = drafted([columnOf('Village', ['Dolores'], 1)], reason)
      expect(find(result, 'location_barangay')?.sourceNames).toBeUndefined()
      expect(result.summary.addedFields).toEqual(['village'])
    })

    it('adds a field for a second column suggested for a field already taken', () => {
      const result = drafted([columnOf('Village', ['Dolores'], 1), columnOf('Sitio', ['Purok'], 2)])
      expect(find(result, 'location_barangay')?.sourceNames).toEqual(['Village'])
      expect(result.summary.addedFields).toEqual(['sitio'])
    })

    it('adds a field when the values do not fit the suggested field type', () => {
      const result = draft([columnOf('Birth date', ['unknown', 'not sure', 'n/a'], 1)])
      expect(find(result, 'birth_date')?.sourceNames).toBeUndefined()
      expect(find(result, 'birth_date_2')?.dataType).toBe('TEXT')
    })

    it('keeps a column whose header is too long to be a source name', () => {
      const header = `Gender ${'of the person answering '.repeat(5)}`.trim()
      expect(header.length).toBeGreaterThan(100)
      const result = draft([columnOf(header, ['A. Babae', 'B. Lalaki'], 1)])
      expect(find(result, 'sex')?.sourceNames).toBeUndefined()
      expect(result.summary.addedFields).toHaveLength(1)
      expect(result.fields.find((field) => field.label === header)).toBeDefined()
    })

    it('lists a repeated header once across the form', () => {
      const result = draft(
        [columnOf('Favourite colour', ['red'], 1), columnOf('Favourite colour', ['blue'], 2)],
        REGISTRATION,
        'OTHER',
      )
      expect(find(result, 'favourite_colour')?.sourceNames).toEqual(['Favourite colour'])
      expect(find(result, 'favourite_colour_2')?.sourceNames).toBeUndefined()
    })

    it('adds a field when the suggested field already has 20 source names', () => {
      const names = Array.from({ length: 20 }, (_, index) => `Place ${index}`)
      const fields = REGISTRATION.map((field) =>
        field.code === 'location_barangay' ? { ...field, sourceNames: names } : field,
      )
      const column = columnOf('Village', ['Dolores'], 1)
      const result = draftFormFromImport({
        formType: 'OTHER',
        fields,
        columns: [column],
        decisions: [pending(column, 'SUGGESTED')],
        uploadDate: '2026-10-23',
      })
      expect(find(result, 'location_barangay')?.sourceNames).toEqual(names)
      expect(find(result, 'village')?.sourceNames).toEqual(['Village'])
    })

    it('adds a field for true or false values suggested for a multiple choice field', () => {
      const column = columnOf('Profile fields', [true, false], 1)
      const result = draftFormFromImport({
        formType: 'OTHER',
        fields: REGISTRATION,
        columns: [column],
        decisions: [pending(column, 'SUGGESTED', idOf('profile_update_fields'))],
        uploadDate: '2026-10-23',
      })
      expect(find(result, 'profile_update_fields')?.sourceNames).toBeUndefined()
      expect(find(result, 'profile_fields')?.dataType).toBe('BOOLEAN')
    })

    it('never drafts a source name the API refuses', () => {
      const first = columnOf('Village', ['Dolores'], 1)
      const same = columnOf('Village!', ['Oras'], 2)
      const blank = columnOf('#', [1, 2], 3)
      const result = draftFormFromImport({
        formType: 'OTHER',
        fields: REGISTRATION,
        columns: [first, same, blank],
        decisions: [
          pending(first, 'SUGGESTED'),
          pending(same, 'SUGGESTED', idOf('location_province')),
          { ...pending(blank, 'SUGGESTED', null), reason: 'EMPTY_NAME' as const },
        ],
        uploadDate: '2026-10-23',
      })
      const keys = result.fields.flatMap((field) => (field.sourceNames ?? []).map(sourceNameKey))
      expect(keys).not.toContain('')
      expect(new Set(keys).size).toBe(keys.length)
      expect(find(result, 'location_province')?.sourceNames).toBeUndefined()
      expect(result.summary.addedFields).toHaveLength(2)
    })

    it('lists numeric answers on a choice field for a person to settle', () => {
      const result = draft([columnOf('Gender', [1, 2, 1, 2], 1)])
      expect(result.summary.needsCheck).toContainEqual({
        fieldCode: 'sex',
        reason: 'ENUM_ANSWER_UNRESOLVED',
      })
    })

    it('keeps a column that lost its match as text, so lettered names make no options', () => {
      const names = ['M. Santos', 'M. Santos', 'J. Cruz', 'J. Cruz']
      const result = drafted([columnOf('Village', names, 1)], 'HELD_MARGIN')
      expect(find(result, 'village')?.dataType).toBe('TEXT')
      expect(find(result, 'village')?.allowedValues).toBeUndefined()
      expect(find(result, 'village')?.valueAliases).toBeUndefined()
    })

    it('never sends a refused or tied suggestion to the identifier field', () => {
      const studentId: DraftField = {
        id: 'student-id',
        code: 'student_id',
        label: 'Student ID',
        dataType: 'INTEGER',
        required: false,
        metadataKey: false,
        sadddField: false,
        sourceNames: ['Student ID'],
      }
      const refused = draft(
        [columnOf('Student ID', ['S-1001', 'S-1002'], 1)],
        [...REGISTRATION, studentId],
        'OTHER',
      )
      expect(find(refused, 'external_identifier_value')?.sourceNames).toBeUndefined()
      expect(find(refused, 'student_id_2')?.dataType).toBe('TEXT')
      expect(find(refused, 'student_id_2')?.sourceNames).toBeUndefined()
      const tied = drafted([columnOf('Student ID', ['S-1001'], 1)], 'HELD_MARGIN')
      expect(find(tied, 'external_identifier_value')?.sourceNames).toBeUndefined()
      expect(tied.summary.addedFields).toEqual(['student_id'])
    })

    it('has nothing to add on a redraft of its own result', () => {
      const columns = [columnOf('Favourite colour', ['red'], 1), columnOf('Gender', ['MALE'], 2)]
      const once = draft(columns, REGISTRATION, 'OTHER')
      const published = once.fields.map((field) => ({ ...field, id: field.code }))
      expect(() => draft(columns, published, 'OTHER')).toThrowError(
        expect.objectContaining({ code: 'NOTHING_TO_ADD' }),
      )
    })

    it.each(['Photo use consent', 'Consent for collection of samples', 'Consent to use photo'])(
      'does not treat "%s" as the data consent answer',
      (header) => {
        const result = draft([columnOf(header, [true, false, true], 1)])
        for (const code of CONSENT_FIELD_CODES)
          expect(find(result, code)?.sourceNames).toBeUndefined()
        expect(result.summary.addedFields).toHaveLength(1)
      },
    )

    it.each(['Parents consent to data use', 'Non-consent to data use'])(
      'always asks a person about "%s"',
      (header) => {
        const result = draft([columnOf(header, [true, false, true], 1)])
        expect(result.summary.needsCheck).toContainEqual({
          fieldCode: 'data_processing_consent_recorded',
          reason: 'CONSENT_SOURCE_PROPOSED',
        })
      },
    )

    it('keeps a text yes or no consent column off the consent field', () => {
      const result = draft([columnOf('Consent to data use', ['Yes', 'No', 'Yes'], 1)])
      expect(find(result, 'data_processing_consent_recorded')?.sourceNames).toBeUndefined()
      expect(result.summary.addedFields).toHaveLength(1)
    })

    it('never gives a new field a consent code', () => {
      const owned = REGISTRATION.filter((field) => field.code !== 'guardian_consent_recorded')
      const result = draft(
        [columnOf('Guardian Consent Recorded', [true, false, true], 1)],
        owned,
        'OTHER',
      )
      expect(find(result, 'guardian_consent_recorded')).toBeUndefined()
      expect(find(result, 'guardian_consent_recorded_2')?.dataType).toBe('BOOLEAN')
    })

    it('keeps an unlettered answer out of a new choice field and asks a person', () => {
      const answers = [...Array(19).fill('A. Yes'), 'Juan Cruz']
      const result = draft([columnOf('Attended orientation', answers, 1)], REGISTRATION, 'OTHER')
      const field = find(result, 'attended_orientation')
      expect(field?.allowedValues).toEqual(['Yes'])
      expect(JSON.stringify(result)).not.toContain('Juan Cruz')
      expect(result.summary.needsCheck).toContainEqual({
        fieldCode: 'attended_orientation',
        reason: 'ENUM_ANSWER_UNRESOLVED',
      })
    })

    it('keeps an unlettered answer out of an existing choice field and asks a person', () => {
      const fields: DraftField[] = [
        {
          id: 'civil',
          code: 'civil_status',
          label: 'Civil status',
          dataType: 'SELECT',
          required: false,
          metadataKey: false,
          sadddField: false,
          allowedValues: ['Single'],
        },
      ]
      const answers = [...Array(10).fill('A. Single'), ...Array(9).fill('B. Married'), 'Juan Cruz']
      const result = draft([columnOf('Civil status', answers, 1)], fields, 'OTHER')
      expect(find(result, 'civil_status')?.allowedValues).toEqual(['Single', 'Married'])
      expect(JSON.stringify(result)).not.toContain('Juan Cruz')
      expect(result.summary.needsCheck).toContainEqual({
        fieldCode: 'civil_status',
        reason: 'ENUM_ANSWER_UNRESOLVED',
      })
    })
  })

  it('drafts a calculation even when it is the only change', () => {
    const owned = REGISTRATION.filter((field) =>
      ['birth_date', 'enrollment_date', 'age_at_registration'].includes(field.code),
    )
    const result = draft(
      [columnOf('Birth date', ['2000-01-01'], 1), columnOf('Enrollment date', ['2026-01-01'], 2)],
      owned,
      'OTHER',
    )
    expect(result.summary).toMatchObject({
      addedFields: [],
      rules: ['age_at_registration'],
      needsCheck: [],
    })
  })

  it('throws NOTHING_TO_ADD when every column is already covered', () => {
    const covered = [columnOf('First Name', ['Ana'], 1), columnOf('Last Name', ['Reyes'], 2)]
    const attempt = () => draft(covered, REGISTRATION, 'OTHER')
    expect(attempt).toThrowError(FormDraftError)
    expect(attempt).toThrowError(expect.objectContaining({ code: 'NOTHING_TO_ADD' }))
  })

  it('drafted field lists its column code in sourceNames', () => {
    const owned = REGISTRATION.map((field) =>
      field.code === 'middle_name' ? { ...field, sourceNames: ['Shared_code1'] } : field,
    )
    const result = draft(
      [
        { ...columnOf('First Name', ['Ana'], 1), sourceCode: 'VFXAUuYgXtm' },
        { ...columnOf('Surname', ['Reyes'], 2), sourceCode: 'Shared_code1' },
        { ...columnOf('Favourite colour', ['red'], 3), sourceCode: 'Qw3rTyUiOpA' },
        columnOf('Pet name', ['Rex'], 4),
      ],
      owned,
      'OTHER',
    )
    expect(find(result, 'first_name')?.sourceNames).toEqual(['VFXAUuYgXtm'])
    expect(find(result, 'last_name')?.sourceNames).toBeUndefined()
    expect(find(result, 'favourite_colour')?.sourceNames).toEqual([
      'Favourite colour',
      'Qw3rTyUiOpA',
    ])
    expect(find(result, 'pet_name')?.sourceNames).toEqual(['Pet name'])
    expect(result.summary.sourceNamesAdded).toContain('first_name')
    expect(result.summary.needsCheck.some((item) => item.fieldCode === 'first_name')).toBe(false)
  })

  it('does not change the fields it was given', () => {
    const before = structuredClone(REGISTRATION)
    fixture()
    expect(REGISTRATION).toEqual(before)
  })
})
