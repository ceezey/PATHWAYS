// A source code is a letter then letters, digits or underscores, 2 to 40 characters.
const sourceCodePattern = /^[A-Za-z][A-Za-z0-9_]{1,39}$/
const idPattern = /^[A-Za-z][A-Za-z0-9]{10}$/

const blank = (value: unknown) =>
  typeof value !== 'string' ? value === null || value === undefined : value.trim() === ''

// A DHIS2-style ID is 11 letters or digits, starts with a letter, and mixes cases.
const isDhis2Id = (code: string) => idPattern.test(code) && /[a-z]/.test(code) && /[A-Z]/.test(code)

/** True when `row` is a row of source codes sitting above `next`, a row of question labels. */
export function isCodeHeaderRow(row: unknown[], next: unknown[]): boolean {
  const cells = row.filter((cell) => !blank(cell))
  if (cells.length === 0) return false
  if (!cells.every((cell) => typeof cell === 'string' && sourceCodePattern.test(cell.trim()))) {
    return false
  }
  const ids = cells.filter((cell) => isDhis2Id((cell as string).trim())).length
  if (ids * 2 < cells.length) return false
  return next.some((cell) => typeof cell === 'string' && /\s/.test(cell.trim()))
}
