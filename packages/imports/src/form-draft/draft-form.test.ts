import { CONSENT_FIELD_CODES, formIntakeDefinitionErrors } from '@pathways/shared'
import { describe, expect, it } from 'vitest'

import { smartMatchColumnsV3 } from '../mappers/smart-match'
import {
  type DraftColumn,
  type DraftField,
  FormDraftError,
  draftFormFromImport,
} from './draft-form'
import { fieldCodeFromHeader } from './field-code'
import { buildFuturemakersFixture, fixtureColumns } from './futuremakers-fixture'

type Spec = [string, string, DraftField['dataType'], boolean, boolean, boolean, string[]?]

// The default registration form of migration 0040.
const SPECS: Spec[] = [
  [
    'registration_operation',
    'Registration operation',
    'SELECT',
    true,
    false,
    false,
    ['CREATE', 'LINK', 'UPDATE'],
  ],
  ['beneficiary_code', 'Beneficiary code', 'TEXT', true, true, false],
  [
    'subject_type',
    'Subject type',
    'SELECT',
    true,
    false,
    false,
    ['INDIVIDUAL', 'GROUP', 'COMMUNITY'],
  ],
  ['display_name', 'Display name', 'TEXT', false, false, false],
  ['first_name', 'First name', 'TEXT', false, false, false],
  ['middle_name', 'Middle name', 'TEXT', false, false, false],
  ['last_name', 'Last name', 'TEXT', false, false, false],
  [
    'sex',
    'Sex',
    'SELECT',
    false,
    false,
    true,
    ['MALE', 'FEMALE', 'OTHER', 'PREFER_NOT_TO_SAY', 'NOT_SPECIFIED'],
  ],
  ['birth_date', 'Birth date', 'DATE', false, false, true],
  ['age_at_registration', 'Age at registration', 'INTEGER', false, false, true],
  [
    'disability_status',
    'Disability status',
    'SELECT',
    false,
    false,
    true,
    ['WITH_DISABILITY', 'WITHOUT_DISABILITY', 'NOT_SPECIFIED'],
  ],
  ['location_barangay', 'Barangay', 'TEXT', false, false, false],
  ['location_city_municipality', 'City or municipality', 'TEXT', false, false, false],
  ['location_province', 'Province', 'TEXT', false, false, false],
  ['consent_recorded', 'Participation consent', 'BOOLEAN', true, false, false],
  ['data_processing_consent_recorded', 'Data processing consent', 'BOOLEAN', true, false, false],
  ['is_minor', 'Minor status', 'BOOLEAN', false, false, false],
  ['guardian_consent_recorded', 'Guardian consent', 'BOOLEAN', false, false, false],
  ['enrollment_date', 'Enrollment date', 'DATE', true, false, false],
  ['external_identifier_type', 'External identifier namespace', 'TEXT', false, false, false],
  ['external_identifier_value', 'External identifier value', 'TEXT', false, false, false],
  [
    'profile_update_fields',
    'Profile fields to update',
    'MULTIPLE_SELECT',
    false,
    false,
    false,
    [
      'display_name',
      'first_name',
      'middle_name',
      'last_name',
      'sex',
      'birth_date',
      'age_at_registration',
      'disability_status',
      'location_barangay',
      'location_city_municipality',
      'location_province',
    ],
  ],
]

const REGISTRATION: DraftField[] = SPECS.map(
  ([code, label, dataType, required, metadataKey, sadddField, allowedValues], index) => ({
    id: `field-${index + 1}`,
    code,
    label,
    dataType,
    required,
    metadataKey,
    sadddField,
    ...(allowedValues ? { allowedValues } : {}),
  }),
)

const isBlankValue = (value: unknown) => value === '' || value === null || value === undefined

function draft(
  columns: DraftColumn[],
  fields: readonly DraftField[] = REGISTRATION,
  formType: 'BENEFICIARY_REGISTRATION' | 'OTHER' = 'BENEFICIARY_REGISTRATION',
) {
  const decisions = smartMatchColumnsV3(
    columns.map((column) => ({
      key: column.key,
      columnIndex: column.columnIndex,
      header: column.header,
      samples: column.values,
      blank: column.values.every(isBlankValue),
    })),
    fields.map((field) => ({ ...field, id: field.id ?? field.code })),
  )
  return draftFormFromImport({ formType, fields, columns, decisions, uploadDate: '2026-10-23' })
}

const fixture = () => draft(fixtureColumns())
const find = (result: ReturnType<typeof draft>, code: string) =>
  result.fields.find((field) => field.code === code)
const columnOf = (header: string, values: unknown[], index = 1): DraftColumn => ({
  key: `column_${String(index).padStart(4, '0')}`,
  columnIndex: index,
  header,
  values,
})

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
  it('adds "Gender - YEE" as a sex source name with SUGGESTED_SOURCE_NAME', () => {
    const result = fixture()
    expect(find(result, 'sex')?.sourceNames).toEqual(['Gender - YEE'])
    expect(result.summary.sourceNamesAdded).toContain('sex')
    expect(result.summary.needsCheck).toContainEqual({
      fieldCode: 'sex',
      reason: 'SUGGESTED_SOURCE_NAME',
    })
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

  it('proposes registration_operation CREATE and subject_type INDIVIDUAL with IMPORT_DEFAULT', () => {
    const result = fixture()
    expect(find(result, 'registration_operation')?.importDefault).toBe('CREATE')
    expect(find(result, 'subject_type')?.importDefault).toBe('INDIVIDUAL')
    expect(result.summary.defaults).toEqual(
      expect.arrayContaining(['registration_operation', 'subject_type']),
    )
    expect(result.summary.needsCheck).toContainEqual({
      fieldCode: 'subject_type',
      reason: 'IMPORT_DEFAULT',
    })
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

  it('proposes Student ID/Barangay Certificate No as external_identifier_value with a type default', () => {
    const result = fixture()
    expect(find(result, 'external_identifier_value')?.sourceNames).toEqual([
      'Student ID/Barangay Certificate No',
    ])
    expect(find(result, 'external_identifier_type')?.importDefault).toBe(
      'STUDENT_ID_BARANGAY_CERTIFICATE',
    )
    expect(result.summary.needsCheck).toContainEqual({
      fieldCode: 'external_identifier_value',
      reason: 'IDENTIFIER_PROPOSED',
    })
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
    expect(find(result, 'living_with_disability')?.dataType).toBe('BOOLEAN')
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

  it('throws NOTHING_TO_ADD when every column is already covered', () => {
    const covered = [columnOf('First Name', ['Ana'], 1), columnOf('Last Name', ['Reyes'], 2)]
    const attempt = () => draft(covered, REGISTRATION, 'OTHER')
    expect(attempt).toThrowError(FormDraftError)
    expect(attempt).toThrowError(expect.objectContaining({ code: 'NOTHING_TO_ADD' }))
  })

  it('does not change the fields it was given', () => {
    const before = structuredClone(REGISTRATION)
    fixture()
    expect(REGISTRATION).toEqual(before)
  })
})
