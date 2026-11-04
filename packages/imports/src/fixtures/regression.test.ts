import { Buffer } from 'node:buffer'
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'
import * as XLSX from 'xlsx'

import { readImportFile } from '../check/read-import-file'
import type { DraftColumn } from '../form-draft/draft-form'
import { REGISTRATION, draft } from '../form-draft/draft-test-support'
import { buildFuturemakersFixture } from '../form-draft/futuremakers-fixture'
import { stageFixtureSheet } from '../form-draft/futuremakers-stage-fixture'
import { matchColumns } from '../validation/match-columns'

const demo = (name: string) =>
  readFileSync(new URL(`../../../../apps/api/prisma/seeds/demo-fixtures/${name}`, import.meta.url))
const toArrayBuffer = (bytes: Uint8Array) =>
  bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
const xlsxBytes = (rows: unknown[][]) => {
  const book = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(rows), 'Data')
  return Buffer.from(XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }))
}

const fixture = buildFuturemakersFixture()
const inputs: Array<[string, () => ReturnType<typeof readImportFile>]> = [
  [
    'futuremakers fixture',
    () =>
      readImportFile(
        toArrayBuffer(
          xlsxBytes([fixture.headers, ...fixture.rows.map((row) => Object.values(row))]),
        ),
        'XLSX',
        null,
      ),
  ],
  [
    'stage fixture sheet',
    () => readImportFile(toArrayBuffer(xlsxBytes(stageFixtureSheet(12))), 'XLSX', null),
  ],
  [
    'beneficiary-registration-borongan.csv',
    () => readImportFile(toArrayBuffer(demo('beneficiary-registration-borongan.csv')), 'CSV', null),
  ],
  [
    'beneficiary-registration-borongan.xlsx',
    () =>
      readImportFile(toArrayBuffer(demo('beneficiary-registration-borongan.xlsx')), 'XLSX', null),
  ],
  [
    'household-profile-followup.csv',
    () => readImportFile(toArrayBuffer(demo('household-profile-followup.csv')), 'CSV', null),
  ],
  [
    'livelihood-followup-structure.csv',
    () => readImportFile(toArrayBuffer(demo('livelihood-followup-structure.csv')), 'CSV', null),
  ],
]

// A draft that refuses the file is snapshotted as its error code.
function drafted(columns: DraftColumn[]) {
  try {
    return draft(columns).summary
  } catch (error) {
    return { error: (error as { code?: string }).code ?? (error as Error).message }
  }
}

function regressionView(file: ReturnType<typeof readImportFile>) {
  const decisions = matchColumns(file.sourceColumns, file.rows, REGISTRATION)
  const columns: DraftColumn[] = file.sourceColumns.map((column) => ({
    key: column.key,
    columnIndex: column.columnIndex,
    header: column.header,
    sourceCode: column.sourceCode,
    values: file.rows.map((row) => row[column.key]),
  }))
  return {
    sourceColumns: file.sourceColumns.map(({ key, header, sourceCode }) => ({
      key,
      header,
      sourceCode,
    })),
    rowNumbers: file.rowNumbers,
    decisions: decisions.map(({ sourceKey, status, targetFieldId, reason, matchReason }) => ({
      sourceKey,
      status,
      targetFieldId,
      reason,
      matchReason,
    })),
    summary: drafted(columns),
  }
}

describe('regression baseline', () => {
  it.each(inputs)('%s reads, matches and drafts as before', (_name, read) => {
    expect(regressionView(read())).toMatchSnapshot()
  })
})
