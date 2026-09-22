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
})
