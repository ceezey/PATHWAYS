import { smartMatchColumnsV3 } from '../mappers/smart-match'
import { type DraftColumn, type DraftField, draftFormFromImport } from './draft-form'

export type Spec = [string, string, DraftField['dataType'], boolean, boolean, boolean, string[]?]

// The default registration form of migration 0040.
export const SPECS: Spec[] = [
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

export const REGISTRATION: DraftField[] = SPECS.map(
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

export function draft(
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

export const find = (result: ReturnType<typeof draft>, code: string) =>
  result.fields.find((field) => field.code === code)
export const columnOf = (header: string, values: unknown[], index = 1): DraftColumn => ({
  key: `column_${String(index).padStart(4, '0')}`,
  columnIndex: index,
  header,
  values,
})
