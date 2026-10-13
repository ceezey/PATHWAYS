import { describe, expect, it } from 'vitest'
import { reportFileName } from './reports.utils'

describe('report file names', () => {
  it.each([
    ['Q3: North/South <draft>?', 'Q3 North South draft.pdf'],
    ['  ...  ', 'report-30000000-0000-4000-8000-000000000003.pdf'],
  ])('makes the report name %j a safe file name', (name, expected) => {
    expect(reportFileName(name, '30000000-0000-4000-8000-000000000003', 'pdf')).toBe(expected)
  })
})
