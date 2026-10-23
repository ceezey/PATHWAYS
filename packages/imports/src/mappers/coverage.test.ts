import { describe, expect, it } from 'vitest'

import { type CoverageField, importCoverage } from './coverage'
import type { SmartMatchDecision } from './smart-match'

const decision = (
  sourceKey: string,
  status: SmartMatchDecision['status'],
  targetFieldId: string | null = null,
): SmartMatchDecision => ({
  sourceKey,
  columnIndex: 1,
  status,
  targetFieldId,
  suggestedFieldId: null,
  score: null,
  matchReason: null,
  reason: status === 'MAPPED' ? 'AUTO_MATCH' : status === 'IGNORED' ? 'BLANK_COLUMN' : 'NO_MATCH',
})

const first: CoverageField = {
  id: 'f-first',
  code: 'first_name',
  label: 'First name',
  dataType: 'TEXT',
  required: true,
}
const sex: CoverageField = {
  id: 'f-sex',
  code: 'sex',
  label: 'Sex',
  dataType: 'SELECT',
  allowedValues: ['MALE', 'FEMALE'],
  valueAliases: [{ from: 'Lalaki', to: 'MALE' }],
  required: false,
}
const tags: CoverageField = {
  id: 'f-tags',
  code: 'tags',
  label: 'Tags',
  dataType: 'MULTIPLE_SELECT',
  allowedValues: ['A', 'B'],
  required: false,
}
const covered = [decision('c1', 'MAPPED', 'f-first'), decision('c2', 'MAPPED', 'f-sex')]

describe('importCoverage', () => {
  it('is COVERED when every column is mapped or ignored and every answer resolves', () => {
    expect(
      importCoverage({
        decisions: [...covered, decision('c3', 'IGNORED')],
        fields: [first, sex],
        distinctValues: { c2: ['MALE', 'a. female', 'Lalaki'] },
      }),
    ).toEqual({
      coverage: 'COVERED',
      uncoveredColumns: 0,
      unresolvedValues: 0,
      requiredUncovered: 0,
    })
  })

  it('is NOT_COVERED with uncoveredColumns 1 when a new column is added', () => {
    expect(
      importCoverage({
        decisions: [...covered, decision('c3', 'PENDING')],
        fields: [first, sex],
        distinctValues: { c2: ['MALE'] },
      }),
    ).toMatchObject({ coverage: 'NOT_COVERED', uncoveredColumns: 1, unresolvedValues: 0 })
  })

  it('counts unresolved distinct values once each, across SELECT and MULTIPLE_SELECT', () => {
    const result = importCoverage({
      decisions: [...covered, decision('c3', 'MAPPED', 'f-tags')],
      fields: [first, sex, tags],
      distinctValues: {
        c2: ['MALE', 'Unknown', 7, null, ''],
        c3: [['A', 'B'], '["A","Z"]', 'A;Q', '[bad'],
      },
    })
    // Unknown and 7 for sex plus the three failing tag values; blanks are skipped.
    expect(result).toMatchObject({ coverage: 'NOT_COVERED', unresolvedValues: 5 })
  })

  it('counts values that normalization would reject as unresolved', () => {
    const digits: CoverageField = { ...sex, id: 'f-digit', allowedValues: ['7'], valueAliases: [] }
    const result = importCoverage({
      decisions: [decision('c2', 'MAPPED', 'f-digit'), decision('c3', 'MAPPED', 'f-tags')],
      fields: [digits, tags],
      distinctValues: { c2: [7, '7'], c3: ['A;B', 'A,B', '["A","B"]'] },
    })
    // The number 7, "A;B" and "A,B" fail; the text "7" and the JSON array pass.
    expect(result.unresolvedValues).toBe(3)
  })

  it('resolves MULTIPLE_SELECT answers through aliases and letter prefixes', () => {
    const aliased: CoverageField = { ...tags, valueAliases: [{ from: 'Isa', to: 'A' }] }
    expect(
      importCoverage({
        decisions: [decision('c3', 'MAPPED', 'f-tags')],
        fields: [aliased],
        distinctValues: { c3: [['Isa', 'b. B'], '["isa"]'] },
      }),
    ).toMatchObject({ coverage: 'COVERED', unresolvedValues: 0 })
  })

  it('ignores distinct values of columns that are not mapped to a choice field', () => {
    expect(
      importCoverage({
        decisions: [decision('c1', 'MAPPED', 'f-first'), decision('c2', 'PENDING')],
        fields: [first, sex],
        distinctValues: { c1: ['anything'], c2: ['Unknown'] },
      }).unresolvedValues,
    ).toBe(0)
  })

  it('counts required fields with no mapped column, default or calculated rule', () => {
    const age: CoverageField = {
      id: 'f-age',
      code: 'age_at_registration',
      label: 'Age',
      dataType: 'INTEGER',
      required: true,
      rule: { kind: 'AGE_AT_DATE', birthField: 'birth_date', atField: 'enrollment_date' },
    }
    const run = (fields: CoverageField[]) =>
      importCoverage({ decisions: [decision('c2', 'MAPPED', 'f-sex')], fields, distinctValues: {} })
    expect(run([first, sex, age])).toMatchObject({ requiredUncovered: 1, coverage: 'NOT_COVERED' })
    expect(run([{ ...first, importDefault: 'Unknown' }, sex, age])).toMatchObject({
      requiredUncovered: 0,
      coverage: 'COVERED',
    })
    expect(run([{ ...first, importDefault: '' }, sex]).requiredUncovered).toBe(1)
  })
})
