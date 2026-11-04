import { describe, expect, it } from 'vitest'

import { findHeaderRow } from './header-row'
import { normalizeMatrix } from './matrix'

describe('findHeaderRow', () => {
  it('skips a title row and a blank row', () =>
    expect(
      findHeaderRow(
        [['Beneficiary Masterlist 2026'], [], ['Name', 'Sex', 'Age'], ['Ana', 'F', 30]],
        [],
      ),
    ).toBe(2))
  it('skips a two-cell title above a wide header', () =>
    expect(
      findHeaderRow(
        [
          ['Masterlist', 'As of 2026-01-10'],
          ['Name', 'Sex', 'Age', 'Town', 'Brgy'],
          ['Ana', 'F', 30, 'X', 'Y'],
        ],
        [],
      ),
    ).toBe(1))
  it('keeps a two-column header over two-column data', () =>
    expect(
      findHeaderRow(
        [
          ['Name', 'Age'],
          ['Ana', 30],
        ],
        [],
      ),
    ).toBe(0))
  it('keeps a one-column header', () =>
    expect(findHeaderRow([['Name'], ['Ana'], ['Ben']], [])).toBe(0))
  it('skips a merged group row', () =>
    expect(
      findHeaderRow(
        [
          ['Personal', null, 'Address', null],
          ['Name', 'Sex', 'Brgy', 'Town'],
          ['Ana', 'F', 'X', 'Y'],
        ],
        [
          { firstRow: 0, lastRow: 0, firstColumn: 0, lastColumn: 1 },
          { firstRow: 0, lastRow: 0, firstColumn: 2, lastColumn: 3 },
        ],
      ),
    ).toBe(1))

  it('skips the group row a CSV keeps of merged group headers above a full header', () =>
    expect(
      findHeaderRow(
        [
          ['Personal', null, null, 'Address', null, 'Consent', null],
          ['ID', 'Name', 'Sex', 'Brgy', 'Town', 'Consent', 'Data consent'],
          ['P-1', 'Ana', 'F', 'X', 'Y', true, true],
        ],
        [],
      ),
    ).toBe(1))

  it('keeps a header with a blank cell over a full row of text', () =>
    expect(
      findHeaderRow(
        [
          ['Name', null, 'Brgy', 'Town'],
          ['Ana', 'Reyes', 'San Jose', 'Bayambang'],
        ],
        [],
      ),
    ).toBe(0))

  it('keeps a sparse header over a full data row', () =>
    expect(
      findHeaderRow(
        [
          ['Name', null, null, 'Age', null, 'Sex'],
          ['Ana', 'Reyes', 'Cruz', '30', 'X', 'F'],
        ],
        [],
      ),
    ).toBe(0))

  it('skips a row holding a merge across half the widest row', () =>
    expect(
      findHeaderRow(
        [
          ['Masterlist', null, null, 'Region IV'],
          ['Name', 'Sex', 'Age', 'Town'],
          ['Ana', 'F', 30, 'X'],
        ],
        [{ firstRow: 0, lastRow: 0, firstColumn: 0, lastColumn: 2 }],
      ),
    ).toBe(1))

  it('falls back to the first non-blank row when every searched row is skipped', () =>
    expect(
      findHeaderRow(
        [[], ['Title'], ['Group', null, null]],
        [{ firstRow: 2, lastRow: 2, firstColumn: 0, lastColumn: 2 }],
      ),
    ).toBe(1))
})

describe('normalizeMatrix', () => {
  it('reads the header below a title and numbers rows as in the file', () => {
    const parsed = normalizeMatrix([
      ['Beneficiary Masterlist 2026'],
      [],
      ['Name', 'Sex', 'Age'],
      ['Ana', 'F', 30],
    ])
    expect(parsed.sourceColumns.map((column) => column.header)).toEqual(['Name', 'Sex', 'Age'])
    expect(parsed.headerRowNumber).toBe(3)
    expect(parsed.rows.map((row) => row.sourceRowNumber)).toEqual([4])
    expect(parsed.filledMerges).toEqual([])
  })

  it('skips a blank data row and keeps the true number of the next', () => {
    const parsed = normalizeMatrix([['Name'], ['Ana'], [null], ['Ben']], { firstRowNumber: 2 })
    expect(parsed.headerRowNumber).toBe(2)
    expect(parsed.rows).toEqual([
      { sourceRowNumber: 3, values: { column_0001: 'Ana' } },
      { sourceRowNumber: 5, values: { column_0001: 'Ben' } },
    ])
  })

  it('fills a vertically merged data cell down its rows', () => {
    const parsed = normalizeMatrix(
      [
        ['Name', 'Brgy'],
        ['Ana', 'San Jose'],
        ['Ben', null],
        ['Cai', null],
        ['Dan', 'Poblacion'],
      ],
      { merges: [{ firstRow: 1, lastRow: 3, firstColumn: 1, lastColumn: 1 }] },
    )
    expect(parsed.rows.map((row) => row.values.column_0002)).toEqual([
      'San Jose',
      'San Jose',
      'San Jose',
      'Poblacion',
    ])
    expect(parsed.filledMerges).toEqual([{ columnIndex: 2, firstRowNumber: 2, lastRowNumber: 4 }])
  })

  it('never fills a merged value into a blank row, and lists only the filled runs', () => {
    const parsed = normalizeMatrix(
      [
        ['Name', 'Brgy'],
        ['Ana', 'San Jose'],
        ['Ben', null],
        [null, null],
        ['Cai', null],
        ['Dan', null],
        [null, null],
        [null, null],
      ],
      { merges: [{ firstRow: 1, lastRow: 7, firstColumn: 1, lastColumn: 1 }] },
    )
    expect(parsed.rows.map((row) => [row.sourceRowNumber, row.values.column_0002])).toEqual([
      [2, 'San Jose'],
      [3, 'San Jose'],
      [5, 'San Jose'],
      [6, 'San Jose'],
    ])
    expect(parsed.filledMerges).toEqual([
      { columnIndex: 2, firstRowNumber: 2, lastRowNumber: 3 },
      { columnIndex: 2, firstRowNumber: 5, lastRowNumber: 6 },
    ])
  })

  it('lists no fill when every row below the merged value is blank', () => {
    const parsed = normalizeMatrix(
      [
        ['Name', 'Brgy'],
        ['Ana', 'San Jose'],
        [null, null],
      ],
      { merges: [{ firstRow: 1, lastRow: 2, firstColumn: 1, lastColumn: 1 }] },
    )
    expect(parsed.rows.map((row) => row.sourceRowNumber)).toEqual([2])
    expect(parsed.filledMerges).toEqual([])
  })

  it('never copies a merged title or header cell into data rows', () => {
    const matrix = [
      ['Masterlist', null, null],
      ['Name', 'Sex', 'Age'],
      ['Ana', null, 30],
      ['Ben', 'M', 41],
    ]
    const parsed = normalizeMatrix(matrix, {
      merges: [
        { firstRow: 0, lastRow: 0, firstColumn: 0, lastColumn: 2 },
        { firstRow: 1, lastRow: 2, firstColumn: 1, lastColumn: 1 },
      ],
    })
    expect(parsed.headerRowNumber).toBe(2)
    expect(parsed.rows.map((row) => row.values)).toEqual([
      { column_0001: 'Ana', column_0002: null, column_0003: 30 },
      { column_0001: 'Ben', column_0002: 'M', column_0003: 41 },
    ])
    expect(parsed.filledMerges).toEqual([])
    expect(matrix[2]?.[1]).toBeNull()
  })

  it('refuses a file of blank rows as empty', () =>
    expect(() => normalizeMatrix([[''], [null, '  ']])).toThrow(
      expect.objectContaining({ code: 'FILE_EMPTY' }),
    ))
})
