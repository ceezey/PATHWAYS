import { formIntakeDefinitionErrors } from '@pathways/shared'
import { describe, expect, it } from 'vitest'

import type { DraftColumn } from './draft-form'
import { draft, find } from './draft-test-support'
import { fixtureColumns } from './futuremakers-fixture'

// Zero-based positions in the Futuremakers fixture columns.
const COLUMN = { code: 3, birth: 13, age: 14, flag: 24 }
const LEVELS = [
  'Hindi - Hindi nahihirapan',
  'Oo - medyo nahihirapan',
  'Oo - Madalas nahihirapan',
  'Walang akong kakayahang gawin',
]
const dashless = (text: string) => text.replace('–', '-')

type Result = ReturnType<typeof draft>
const fixture = () => draft(fixtureColumns())
const withColumn = (index: number, change: (values: readonly unknown[]) => unknown[]) => {
  const columns: DraftColumn[] = fixtureColumns()
  columns[index] = { ...columns[index], values: change(columns[index].values) }
  return draft(columns)
}
const rule = (result: Result, code: string) => find(result, code)?.rule
const wgRule = (result: Result) => {
  const found = rule(result, 'disability_status')
  if (found?.kind !== 'WASHINGTON_GROUP_DISABILITY') throw new Error('no Washington Group rule')
  return found
}

describe('proposeIntakeRules on the Futuremakers fixture', () => {
  it('proposes WASHINGTON_GROUP_DISABILITY on disability_status with the six question fields and the Living With Disability column as its cross-check', () => {
    const result = fixture()
    const found = wgRule(result)
    const headers = fixtureColumns()
      .slice(18, 24)
      .map((column) => column.header)
    expect(found.questionFields.map((code) => find(result, code)?.label)).toEqual(headers)
    expect(found.disabilityValues.map(dashless)).toEqual(LEVELS.slice(2))
    const status = find(result, 'disability_status')
    expect(status?.sourceNames).toEqual(['Living With Disability'])
    expect(status?.valueAliases).toEqual(
      expect.arrayContaining([
        { from: 'true', to: 'WITH_DISABILITY' },
        { from: 'false', to: 'WITHOUT_DISABILITY' },
      ]),
    )
    expect(find(result, 'living_with_disability')).toBeUndefined()
    expect(result.summary.addedFields).not.toContain('living_with_disability')
    expect(result.summary.rules).toContain('disability_status')
    expect(result.summary.needsCheck).toContainEqual({
      fieldCode: 'disability_status',
      reason: 'RULE_PROPOSED',
    })
  })

  it('gives every Washington Group field all four options even when the file uses three', () => {
    const result = fixture()
    const { questionFields } = wgRule(result)
    for (const code of questionFields) {
      const field = find(result, code)
      expect(field?.allowedValues?.map(dashless)).toEqual(LEVELS)
      expect(field?.valueAliases?.every((alias) => field.allowedValues?.includes(alias.to))).toBe(
        true,
      )
    }
    const seeing = find(result, questionFields[0])
    expect(seeing?.valueAliases?.some((alias) => alias.from.startsWith('D.'))).toBe(false)
    expect(seeing?.allowedValues?.[3]).toBe('Walang akong kakayahang gawin')
    const selfCare = find(result, questionFields[4])
    expect(selfCare?.allowedValues?.[2]).toBe('Oo - Madalas nahihirapan')
    expect(selfCare?.valueAliases).toContainEqual({
      from: 'D. Walang akong kakayahang gawin',
      to: 'Walang akong kakayahang gawin',
    })
  })

  it('when one flag row disagrees, proposes the rule, keeps the flag as a plain field and adds WASHINGTON_GROUP_FLAG_DISAGREES', () => {
    const result = withColumn(COLUMN.flag, (values) =>
      values.map((value, row) => (row === 0 ? value !== true : value)),
    )
    expect(wgRule(result).questionFields).toHaveLength(6)
    expect(find(result, 'living_with_disability')?.dataType).toBe('BOOLEAN')
    expect(find(result, 'disability_status')?.sourceNames).toBeUndefined()
    expect(result.summary.addedFields).toContain('living_with_disability')
    expect(result.summary.needsCheck).toContainEqual({
      fieldCode: 'living_with_disability',
      reason: 'WASHINGTON_GROUP_FLAG_DISAGREES',
    })
  })

  it('keeps a numeric 1/0 flag column as its own field and does not fold it into disability_status', () => {
    const result = withColumn(COLUMN.flag, (values) => values.map((value) => (value ? 1 : 0)))
    expect(wgRule(result).questionFields).toHaveLength(6)
    expect(find(result, 'living_with_disability')?.dataType).toBe('INTEGER')
    expect(find(result, 'disability_status')?.sourceNames).toBeUndefined()
    expect(find(result, 'disability_status')?.valueAliases).toBeUndefined()
  })

  describe('a row with all six Washington Group answers blank and a filled flag', () => {
    const blankFirstRow = (flagHeader: string) => {
      const columns = fixtureColumns()
      for (const index of [18, 19, 20, 21, 22, 23])
        columns[index] = {
          ...columns[index],
          values: columns[index].values.map((value, row) => (row === 0 ? '' : value)),
        }
      columns[COLUMN.flag] = { ...columns[COLUMN.flag], header: flagHeader }
      return draft(columns)
    }

    it('counts as a disagreement: no fold, flagged when the header names disability', () => {
      const result = blankFirstRow('Living With Disability')
      expect(find(result, 'disability_status')?.sourceNames).toBeUndefined()
      expect(find(result, 'living_with_disability')).toBeDefined()
      expect(result.summary.needsCheck).toContainEqual({
        fieldCode: 'living_with_disability',
        reason: 'WASHINGTON_GROUP_FLAG_DISAGREES',
      })
    })

    it('stays a plain field without a flag when the header does not name disability', () => {
      const result = blankFirstRow('Special status')
      expect(find(result, 'disability_status')?.sourceNames).toBeUndefined()
      expect(find(result, 'special_status')).toBeDefined()
      expect(result.summary.needsCheck.map((item) => item.reason)).not.toContain(
        'WASHINGTON_GROUP_FLAG_DISAGREES',
      )
    })
  })

  it('treats an Age column of integer text equal to age at enrollment as a cross-check, not a move', () => {
    const columns = fixtureColumns()
    const years = (born: string, at: string) =>
      Number(at.slice(0, 4)) - Number(born.slice(0, 4)) - (at.slice(5) < born.slice(5) ? 1 : 0)
    const ages = columns[COLUMN.birth].values.map((born, row) =>
      String(years(String(born), String(columns[1].values[row]))),
    )
    const result = withColumn(COLUMN.age, () => ages)
    expect(find(result, 'age')).toBeUndefined()
    expect(find(result, 'age_at_registration')?.sourceNames).toEqual(['Age'])
  })

  it('moves Age off age_at_registration to a new age field with AGE_CHECK atFields [enrollment_date]', () => {
    const result = fixture()
    expect(find(result, 'age')).toMatchObject({
      dataType: 'INTEGER',
      label: 'Age',
      sourceNames: ['Age'],
      rule: { kind: 'AGE_CHECK', birthField: 'birth_date', atFields: ['enrollment_date'] },
    })
    expect(find(result, 'age_at_registration')?.sourceNames).toBeUndefined()
    expect(result.summary.addedFields).toContain('age')
    expect(result.summary.needsCheck).toContainEqual({
      fieldCode: 'age',
      reason: 'COLUMN_MOVED_OFF_CALCULATED',
    })
    expect(result.summary.needsCheck).not.toContainEqual({
      fieldCode: 'age_at_registration',
      reason: 'SUGGESTED_SOURCE_NAME',
    })
  })

  it('makes an Age column that equals age at enrollment a cross-check source of age_at_registration', () => {
    const columns = fixtureColumns()
    const years = (born: string, at: string) =>
      Number(at.slice(0, 4)) - Number(born.slice(0, 4)) - (at.slice(5) < born.slice(5) ? 1 : 0)
    const ages = columns[COLUMN.birth].values.map((born, row) =>
      years(String(born), String(columns[1].values[row])),
    )
    const result = withColumn(COLUMN.age, () => ages)
    expect(find(result, 'age')).toBeUndefined()
    expect(find(result, 'age_at_registration')?.sourceNames).toEqual(['Age'])
    expect(rule(result, 'age_at_registration')?.kind).toBe('AGE_AT_DATE')
  })

  describe('enrollment dates written as text', () => {
    const textDates = (rewrite: (iso: string) => string, offset = 0) => {
      const columns = fixtureColumns()
      const years = (born: string, at: string) =>
        Number(at.slice(0, 4)) - Number(born.slice(0, 4)) - (at.slice(5) < born.slice(5) ? 1 : 0)
      const ages = columns[COLUMN.birth].values.map(
        (born, row) => years(String(born), String(columns[1].values[row])) + offset,
      )
      columns[COLUMN.age] = { ...columns[COLUMN.age], values: ages }
      columns[1] = { ...columns[1], values: columns[1].values.map((iso) => rewrite(String(iso))) }
      return draft(columns)
    }

    it('reads them in the one order that fits, so a disagreeing Age is seen and moved off', () => {
      const result = textDates((iso) => iso.replaceAll('-', '/'), 1)
      expect(find(result, 'age_at_registration')?.sourceNames).toBeUndefined()
      expect(find(result, 'age')?.sourceNames).toEqual(['Age'])
    })

    it('compares no age for a birth after the enrollment date', () => {
      const columns = fixtureColumns()
      columns[COLUMN.birth] = {
        ...columns[COLUMN.birth],
        values: columns[COLUMN.birth].values.map(() => '2099-01-01'),
      }
      columns[COLUMN.age] = {
        ...columns[COLUMN.age],
        values: columns[COLUMN.age].values.map(() => -1),
      }
      const result = draft(columns)
      expect(find(result, 'age_at_registration')?.sourceNames).toBeUndefined()
    })

    it('moves Age off the calculated field when the dates fit more than one order', () => {
      const result = textDates((iso) => `${iso.slice(2, 4)}/${iso.slice(5, 7)}/${iso.slice(8, 10)}`)
      expect(find(result, 'age_at_registration')?.sourceNames).toBeUndefined()
      expect(result.summary.needsCheck).toContainEqual({
        fieldCode: 'age',
        reason: 'COLUMN_MOVED_OFF_CALCULATED',
      })
    })
  })

  it('adds AGE_AT_DATE and MINOR_AT_DATE from birth_date and enrollment_date', () => {
    const result = fixture()
    expect(rule(result, 'age_at_registration')).toEqual({
      kind: 'AGE_AT_DATE',
      birthField: 'birth_date',
      atField: 'enrollment_date',
    })
    expect(rule(result, 'is_minor')).toEqual({
      kind: 'MINOR_AT_DATE',
      birthField: 'birth_date',
      atField: 'enrollment_date',
    })
    expect(result.summary.rules).toEqual(
      expect.arrayContaining(['age_at_registration', 'is_minor']),
    )
  })

  it('adds no age rule when enrollment_date has no source column', () => {
    const columns = fixtureColumns().filter((column) => column.header !== 'enrollmentDate')
    const result = draft(columns)
    expect(rule(result, 'age_at_registration')).toBeUndefined()
    expect(rule(result, 'is_minor')).toBeUndefined()
    expect(find(result, 'age')).toBeUndefined()
  })

  it('adds FOLLOW_UP_OF for the three "If other" columns with whenValues ["Iba pa"]', () => {
    const result = fixture()
    const parents = [
      'what_sector_does_your_job_belongs_to',
      'what_sector_does_your_business_belongs_to',
      'what_technical_skills_do_you_wish_to_learn',
    ]
    const followUps = [
      'if_other_sector_what_job',
      'if_other_sector_what_business',
      'if_other_technical_skills_what_specific_skills_do_you_want_to_le',
    ]
    followUps.forEach((code, index) => {
      expect(rule(result, code)).toEqual({
        kind: 'FOLLOW_UP_OF',
        parentField: parents[index],
        whenValues: ['Iba pa'],
      })
    })
    expect(rule(result, parents[0])).toBeUndefined()
  })

  it('adds ID_FROM_INITIALS_AND_BIRTH_DATE on beneficiary_code', () => {
    expect(rule(fixture(), 'beneficiary_code')).toEqual({
      kind: 'ID_FROM_INITIALS_AND_BIRTH_DATE',
      firstNameField: 'first_name',
      lastNameField: 'last_name',
      birthField: 'birth_date',
    })
  })

  it('skips ID_FROM_INITIALS_AND_BIRTH_DATE when one code does not match', () => {
    const result = withColumn(COLUMN.code, (values) =>
      values.map((value, row) => (row === 0 ? 'XX01012000' : value)),
    )
    expect(rule(result, 'beneficiary_code')).toBeUndefined()
  })

  it('never proposes SAME_ANSWER_AS and flags every rule once', () => {
    const result = fixture()
    expect(result.fields.some((field) => field.rule?.kind === 'SAME_ANSWER_AS')).toBe(false)
    const ruled = result.fields.filter((field) => field.rule).map((field) => field.code)
    expect([...ruled].sort()).toEqual([...result.summary.rules].sort())
    for (const code of ruled)
      expect(result.summary.needsCheck).toContainEqual({ fieldCode: code, reason: 'RULE_PROPOSED' })
  })

  it('the resulting field list passes formIntakeDefinitionErrors with no errors', () => {
    expect(formIntakeDefinitionErrors(fixture().fields)).toEqual([])
  })

  it('keeps the added field codes in step with the field list', () => {
    const result = fixture()
    const codes = result.fields.map((field) => field.code)
    expect(new Set(codes).size).toBe(codes.length)
    expect(result.fields.slice(22).map((field) => field.code)).toEqual(result.summary.addedFields)
  })
})
