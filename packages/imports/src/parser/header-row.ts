/** A merged cell range, by 0-based matrix row and column. */
export interface MatrixMerge {
  firstRow: number
  lastRow: number
  firstColumn: number
  lastColumn: number
}

const searchedRows = 20

const blank = (value: unknown) =>
  value === null || value === undefined || (typeof value === 'string' && value.trim() === '')

const filled = (row: unknown) =>
  Array.isArray(row) ? row.filter((cell) => !blank(cell)).length : 0

// A cell that names a column holds a letter and is no boolean, so dates, numbers and codes read as data.
const label = (cell: unknown) =>
  typeof cell === 'string' && /\p{L}/u.test(cell) && !/^(true|false)$/i.test(cell.trim())

/** The 0-based index of the header row: the first of the opening rows that is not blank, a title or a group row. */
export function findHeaderRow(matrix: unknown[][], merges: readonly MatrixMerge[]): number {
  // One row past the searched ones, so the last searched row still has a next row to compare with.
  const rows: number[] = []
  for (let index = 0; index < matrix.length && rows.length <= searchedRows; index += 1) {
    if (filled(matrix[index]) > 0) rows.push(index)
  }
  const searched = rows.slice(0, searchedRows)
  const widthOf = (row: unknown) =>
    Array.isArray(row)
      ? row.reduce<number>((last, cell, column) => (blank(cell) ? last : column + 1), 0)
      : 0
  const widest = Math.max(0, ...searched.map((index) => widthOf(matrix[index])))
  const allLabels = (row: unknown[]) => row.slice(0, widthOf(row)).every(label)
  // One pass over the merges: per searched row, the widest span and the columns where a merge of two or more cells starts.
  const spans = new Map<number, number>()
  const starts = new Map<number, Set<number>>()
  const searchedSet = new Set(searched)
  for (const merge of merges) {
    if (!searchedSet.has(merge.firstRow)) continue
    const span = merge.lastColumn - merge.firstColumn + 1
    spans.set(merge.firstRow, Math.max(spans.get(merge.firstRow) ?? span, span))
    if (merge.lastColumn > merge.firstColumn) {
      const columns = starts.get(merge.firstRow) ?? new Set<number>()
      columns.add(merge.firstColumn)
      starts.set(merge.firstRow, columns)
    }
  }
  const header = searched.find((index, at) => {
    const count = filled(matrix[index])
    const next = at + 1 < rows.length ? filled(matrix[rows[at + 1]]) : 0
    const merged = starts.get(index)
    const title = count <= 2 && next >= 2 * count + 1
    const span = spans.get(index)
    const wideMerge = span !== undefined && span * 2 >= widest
    const row = matrix[index] as unknown[]
    const below = at + 1 < rows.length ? (matrix[rows[at + 1]] as unknown[]) : []
    const after = at + 2 < rows.length ? (matrix[rows[at + 2]] as unknown[]) : null
    // A CSV keeps no merges, so its group row is a few labels over a full row of labels over data; an all-text block keeps its first row.
    const group =
      next > count &&
      (row.every((cell, column) => blank(cell) || merged?.has(column) === true) ||
        (count >= 2 &&
          next >= 2 * count &&
          allLabels(below) &&
          after !== null &&
          !allLabels(after)))
    return !title && !wideMerge && !group
  })
  return header ?? rows[0] ?? 0
}
