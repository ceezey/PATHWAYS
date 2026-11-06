import { describe, expect, it } from 'vitest'

import { parseCsv } from './csv'

describe('parseCsv', () => {
  it('reads every row of a file with mixed line endings', () => {
    const parsed = parseCsv('Name,Age\r\nAna,31\nBen,40')
    expect(parsed.data).toEqual([
      { Name: 'Ana', Age: '31' },
      { Name: 'Ben', Age: '40' },
    ])
  })
})
