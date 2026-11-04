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
  const header = searched.find((index, at) => {
    const count = filled(matrix[index])
    const next = at + 1 < rows.length ? filled(matrix[rows[at + 1]]) : 0
    const starting = merges.filter((merge) => merge.firstRow === index)
    const title = count <= 2 && next >= 2 * count + 1
    const wideMerge = starting.some(
      (merge) => (merge.lastColumn - merge.firstColumn + 1) * 2 >= widest,
    )
    const row = matrix[index] as unknown[]
    const below = at + 1 < rows.length ? (matrix[rows[at + 1]] as unknown[]) : []
    // A CSV keeps no merges, so its group row is a few labels over a row of labels with no gap.
    const group =
      next > count &&
      (row.every(
        (cell, column) =>
          blank(cell) ||
          starting.some((merge) => merge.firstColumn === column && merge.lastColumn > column),
      ) ||
        (count >= 2 && next >= 2 * count && below.slice(0, widthOf(below)).every(label)))
    return !title && !wideMerge && !group
  })
  return header ?? rows[0] ?? 0
}
