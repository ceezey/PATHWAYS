import { type FieldIntakeRule, isCalculatedRule } from '@pathways/shared'
import { describe, expect, it } from 'vitest'

import { readImportFile } from '../check/read-import-file'
import { buildAnySourceFixture } from '../fixtures/any-source/build'
import { REGISTRATION } from '../form-draft/draft-test-support'
import type { CoverageField } from '../mappers/coverage'
import {
  type SmartMatchColumn,
  smartMatchColumnsV4,
  smartMatchColumnsV5,
} from '../mappers/smart-match'
import { keepFedCalculatedIgnores } from './match-columns'

const WASHINGTON_GROUP = [
  ['wg_seeing', 'Difficulty seeing'],
  ['wg_hearing', 'Difficulty hearing'],
  ['wg_walking', 'Difficulty walking'],
  ['wg_remembering', 'Difficulty remembering'],
  ['wg_self_care', 'Difficulty with self care'],
  ['wg_communicating', 'Difficulty communicating'],
]

// The calculations of the trigger form (ECD-MB-2026), keyed by field code.
const RULES: Record<string, FieldIntakeRule> = {
  age_at_registration: {
    kind: 'AGE_AT_DATE',
    birthField: 'birth_date',
    atField: 'enrollment_date',
  },
  is_minor: { kind: 'MINOR_AT_DATE', birthField: 'birth_date', atField: 'enrollment_date' },
  disability_status: {
    kind: 'WASHINGTON_GROUP_DISABILITY',
    questionFields: WASHINGTON_GROUP.map(([code]) => code),
    disabilityValues: ['A lot of difficulty', 'Cannot do at all'],
  },
  consent_recorded: { kind: 'SAME_ANSWER_AS', field: 'data_processing_consent_recorded' },
}

const withRules = (fields: Omit<CoverageField, 'calculated'>[]): CoverageField[] =>
  fields.map((field) => {
    const rule = field.rule ?? RULES[field.code] ?? null
    return { ...field, rule, calculated: isCalculatedRule(rule) }
  })

const field = (code: string, label: string, extra: Partial<CoverageField> = {}) => ({
  id: `id-${code}`,
  code,
  label,
  dataType: 'TEXT' as const,
  required: false,
  ...extra,
})

const FORM = withRules([
  field('birth_date', 'Birth date', { dataType: 'DATE' }),
  field('enrollment_date', 'Enrollment date', { dataType: 'DATE' }),
  field('age_at_registration', 'Age at registration', { dataType: 'INTEGER' }),
  field('disability_status', 'Disability status'),
  ...WASHINGTON_GROUP.map(([code, label]) => field(code, label)),
  field('consent_recorded', 'Participation consent', { dataType: 'BOOLEAN' }),
  field('data_processing_consent_recorded', 'Data processing consent', { dataType: 'BOOLEAN' }),
])

const columns = (spec: Array<[string, unknown[]?]>): SmartMatchColumn[] =>
  spec.map(([header, samples = ['x']], index) => ({
    key: `column_${index + 1}`,
    columnIndex: index + 1,
    header,
    samples,
  }))

const REGISTRATION_TYPE = 'BENEFICIARY_REGISTRATION'

const guarded = (cols: SmartMatchColumn[], fields = FORM, formType = REGISTRATION_TYPE) =>
  keepFedCalculatedIgnores(smartMatchColumnsV5(cols, fields), fields, formType)

const ignoredCalculated = {
  status: 'IGNORED',
  targetFieldId: null,
  suggestedFieldId: null,
  score: null,
  matchReason: null,
  reason: 'CALCULATED_FIELD',
}

describe('keepFedCalculatedIgnores', () => {
  it.each([
    ['Disability', 'no Washington Group column'],
    ['PWD', 'no Washington Group column'],
    ['Consent', 'no data processing consent column'],
    ['Age', 'no birth date column'],
  ])('gives %s back exactly as V4 left it with %s', (header) => {
    const cols = columns([[header]])
    expect(smartMatchColumnsV5(cols, FORM)[0].reason).toBe('CALCULATED_FIELD')
    expect(guarded(cols)).toEqual(smartMatchColumnsV4(cols, FORM))
    expect(guarded(cols)[0]).toMatchObject({
      status: 'PENDING',
      reason: 'NO_MATCH',
      suggestedFieldId: null,
    })
  })

  it.each([
    ['Disability', 'Difficulty seeing', ['Some difficulty']],
    ['Consent', 'Data processing consent', [true]],
    ['Age', 'Birth date', ['2000-01-01']],
  ])('keeps %s ignored, with no suggestion, when %s feeds it', (header, feeder, samples) => {
    const decisions = guarded(columns([[header], [feeder, samples]]))
    expect(decisions[1].status).toBe('MAPPED')
    expect(decisions[0]).toMatchObject(ignoredCalculated)
  })

  it('counts an at-date field with an import default as supplied', () => {
    const atDefault = (importDefault: string | null) =>
      withRules([
        field('birth_date', 'Birth date', { dataType: 'DATE' }),
        field('event_date', 'Event date', { dataType: 'DATE', importDefault }),
        field('age_at_event', 'Age at event', {
          dataType: 'INTEGER',
          rule: { kind: 'AGE_AT_DATE', birthField: 'birth_date', atField: 'event_date' },
        }),
      ])
    const cols = columns([['Age at the event'], ['Birth date', ['2000-01-01']]])
    expect(guarded(cols, atDefault('2026-01-01'))[0]).toMatchObject(ignoredCalculated)
    expect(guarded(cols, atDefault(null))).toEqual(smartMatchColumnsV4(cols, atDefault(null)))
  })

  it('counts the deferred enrollment date as supplied on a registration form only', () => {
    const cols = columns([['Age'], ['Birth date', ['2000-01-01']]])
    expect(guarded(cols)[0]).toMatchObject(ignoredCalculated)
    expect(guarded(cols, FORM, 'ACTIVITY_PARTICIPATION')).toEqual(smartMatchColumnsV4(cols, FORM))
    expect(guarded(cols, FORM, 'ACTIVITY_PARTICIPATION')[0]).toMatchObject({
      status: 'PENDING',
      reason: 'NO_MATCH',
    })
  })

  it('only clears the suggestion of a kept ignore and leaves every other decision alone', () => {
    const cols = columns([
      ['Disability'],
      ['Difficulty seeing', ['Some difficulty']],
      ['_uuid'],
      ['_submission_time'],
      ['start'],
      ['Favourite colour'],
    ])
    const matched = smartMatchColumnsV5(cols, FORM)
    expect(matched[0].suggestedFieldId).toBe('id-disability_status')
    expect(guarded(cols)).toEqual([{ ...matched[0], suggestedFieldId: null }, ...matched.slice(1)])
  })

  it('on the Kobo corpus file keeps consent ignored and gives participant/disability back', () => {
    const { bytes, fileType } = buildAnySourceFixture('kobo-xlsx')
    const file = readImportFile(
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer,
      fileType,
      null,
    )
    const cols = file.sourceColumns.map((source) => ({
      key: source.key,
      columnIndex: source.columnIndex,
      header: source.header,
      samples: file.rows.map((row) => row[source.key]),
    }))
    const form = withRules(REGISTRATION.map((item) => ({ ...item, id: item.id ?? item.code })))
    const byHeader = (decisions: ReturnType<typeof guarded>) =>
      Object.fromEntries(
        decisions.map((decision) => [
          cols.find((source) => source.key === decision.sourceKey)?.header,
          `${decision.status} ${decision.reason}`,
        ]),
      )
    const decisions = guarded(cols, form)
    expect(byHeader(decisions)).toMatchObject({
      'consent/data_processing_consent': 'MAPPED AUTO_MATCH',
      'consent/consent_given': 'IGNORED CALCULATED_FIELD',
      // The file has no Washington Group column, so disability is left for a person to decide.
      'participant/disability': 'PENDING NO_MATCH',
    })
    expect(
      decisions.every((decision) => decision.status !== 'IGNORED' || !decision.suggestedFieldId),
    ).toBe(true)
  })
})
