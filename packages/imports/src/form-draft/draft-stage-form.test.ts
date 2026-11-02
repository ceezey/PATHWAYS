import { CONSENT_FIELD_CODES, formIntakeDefinitionErrors } from '@pathways/shared'
import { describe, expect, it } from 'vitest'

import { detectFileParts, selectPartColumns } from '../parser/file-parts'
import { normalizeMatrix } from '../parser/matrix'
import type { DraftColumn } from './draft-form'
import { draftStageForm } from './draft-stage-form'
import { stageFixtureSheet } from './futuremakers-stage-fixture'

const parsed = normalizeMatrix(stageFixtureSheet(12))
const parts = detectFileParts(parsed)

// The columns of one part as the service reads them back from the stored file.
function partColumns(index: number): DraftColumn[] {
  const narrowed = selectPartColumns(parsed, parts[index])
  return narrowed.sourceColumns.map((column) => ({
    key: column.key,
    columnIndex: column.columnIndex,
    header: column.header,
    sourceCode: column.sourceCode,
    values: narrowed.rows.map((row) => row.values[column.key]),
  }))
}
const run = (index: number, columns = partColumns(index)) =>
  draftStageForm({ part: parts[index], columns, uploadDate: '2026-10-23' })
const byCode = (result: ReturnType<typeof run>, code: string) =>
  result.definition.fields.find((field) => field.code === code)

describe('draftStageForm', () => {
  it('seeds the identity block from Filipino labels', () => {
    const result = run(0)
    expect(result.definition).toMatchObject({
      code: 'stage_y8678amm8o3',
      name: 'LST Survey',
      formType: 'TRAINING_SURVEY',
    })
    expect(result.definition.fields.map((field) => [field.code, field.dataType])).toEqual([
      ['stage_date', 'DATE'],
      ['stage_consent', 'BOOLEAN'],
      ['external_identifier_value', 'TEXT'],
      ['first_name', 'TEXT'],
      ['middle_name', 'TEXT'],
      ['last_name', 'TEXT'],
      ['total_score', 'INTEGER'],
    ])
    expect(byCode(result, 'stage_date')).toMatchObject({
      required: false,
      sourceNames: ['y8678aMM8o3'],
    })
    expect(byCode(result, 'first_name')?.sourceNames).toEqual(['dncN8wvE6yq'])
    expect(byCode(result, 'middle_name')?.sourceNames).toEqual(['nqDMsGh85wm'])
    expect(formIntakeDefinitionErrors(result.definition.fields)).toEqual([])
  })

  it('every column lands on a field', () => {
    for (const index of [0, 1, 2, 3]) {
      const columns = partColumns(index)
      expect(run(index, columns).definition.fields).toHaveLength(columns.length)
    }
  })

  it('total score with values is flagged for an answer key', () => {
    const result = run(0)
    expect(result.summary.needsCheck).toEqual([
      { fieldCode: 'total_score', reason: 'ANSWER_KEY_NEEDED' },
    ])
    expect(result.summary.addedFields).toContain('total_score')
    expect(byCode(result, 'total_score')?.rule).toBeUndefined()
  })

  it('empty total score column asks for nothing', () => {
    const columns = partColumns(0).map((column) =>
      column.header.startsWith('Total Score')
        ? { ...column, values: column.values.map(() => '') }
        : column,
    )
    const result = run(0, columns)
    expect(byCode(result, 'total_score')?.dataType).toBe('INTEGER')
    expect(result.summary.needsCheck).toEqual([])
  })

  it('no consent code is taken', () => {
    const codes = [0, 1, 2, 3].flatMap((index) => run(index).definition.fields.map((f) => f.code))
    expect(
      codes.filter((code) => (CONSENT_FIELD_CODES as readonly string[]).includes(code)),
    ).toEqual([])
  })

  it('66 columns stay under the field cap', () => {
    const questions: DraftColumn[] = Array.from({ length: 62 }, (_, n) => ({
      key: `column_${100 + n}`,
      columnIndex: 100 + n,
      header: `Question ${n + 1}`,
      sourceCode: `Qcode${n + 1}`,
      values: ['A. Oo', 'B. Hindi', 'A. Oo', 'B. Hindi'],
    }))
    const columns = [...partColumns(0).slice(0, 4), ...questions]
    const result = run(0, columns)
    expect(result.definition.fields).toHaveLength(66)
    expect(result.definition.fields.length).toBeLessThanOrEqual(100)
  })

  it('names never become options', () => {
    const columns = partColumns(1).map((column) =>
      column.sourceCode === 'dncN8wvE6yq'
        ? { ...column, values: column.values.map((value) => (value ? `A. ${value}` : value)) }
        : column,
    )
    const result = run(1, columns)
    expect(result.definition.fields.some((field) => field.allowedValues)).toBe(false)
    expect(byCode(result, 'first_name')?.dataType).toBe('TEXT')
    expect(JSON.stringify(result.summary)).not.toContain('S1R')
  })
})
