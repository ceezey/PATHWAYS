import { describe, expect, it } from 'vitest'
import * as XLSX from 'xlsx'

import { parseWorkbook } from './xlsx'

describe('parseWorkbook', () => {
  it('preserves headers from a questionnaire template with no response rows', () => {
    const workbook = XLSX.utils.book_new()
    const worksheet = XLSX.utils.aoa_to_sheet([
      ['beneficiary_id', 'attendance_status', 'pre_test_score', 'post_test_score', 'activity_date'],
    ])
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Questionnaire')
    const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' })

    expect(parseWorkbook(buffer)).toMatchObject({
      headers: [
        'beneficiary_id',
        'attendance_status',
        'pre_test_score',
        'post_test_score',
        'activity_date',
      ],
      rows: [],
      sheetNames: ['Questionnaire'],
    })
  })

  it('derives trimmed headers and keyed rows from one grid read, skipping blank rows', () => {
    const workbook = XLSX.utils.book_new()
    const worksheet = XLSX.utils.aoa_to_sheet([
      [' code ', 'score', 'score', ''],
      ['BEN-001', 12, 'x', 'extra'],
      [],
      ['BEN-002', '', '', ''],
    ])
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Data')
    const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' })

    expect(parseWorkbook(buffer)).toEqual({
      headers: ['code', 'score', 'score_1', 'Column 4'],
      rows: [
        { code: 'BEN-001', score: 12, score_1: 'x', 'Column 4': 'extra' },
        { code: 'BEN-002', score: '', score_1: '', 'Column 4': '' },
      ],
      sheetNames: ['Data'],
    })
  })

  it('reads a coded file like the server: labels are the headers and data starts on row 3', () => {
    const workbook = XLSX.utils.book_new()
    const worksheet = XLSX.utils.aoa_to_sheet([
      ['VFXAUuYgXtm', 'L2doMQ7OtUB', 'orgUnit'],
      ['Consent given', 'Participant ID', ''],
      ['yes', 'S-1', 'OU1'],
    ])
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Data')
    const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' })

    // A label heads its column, and the code stands in where the label is blank.
    expect(parseWorkbook(buffer)).toEqual({
      headers: ['Consent given', 'Participant ID', 'orgUnit'],
      rows: [{ 'Consent given': 'yes', 'Participant ID': 'S-1', orgUnit: 'OU1' }],
      sheetNames: ['Data'],
    })
  })

  it('emits date-formatted numeric cells as ISO dates', () => {
    const worksheet = XLSX.utils.aoa_to_sheet([
      ['Date of Birth', 'Age'],
      [39677, 18],
    ])
    worksheet.A2.z = 'yy/mm/dd'
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Data')
    const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' })

    expect(parseWorkbook(buffer).rows).toEqual([{ 'Date of Birth': '2008-08-17', Age: 18 }])
  })
})
