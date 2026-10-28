export interface WorkbookGrid {
  matrix: unknown[][]
  sheetNames: string[]
  formulaGap?: string
  links: boolean
  macros: boolean
  // The shown text of each date cell converted to ISO, keyed "<matrixRow>:<matrixColumn>".
  dateText: Record<string, string>
}

/**
 * Reads one worksheet into a matrix, the same way in the parser worker and the browser.
 *
 * It runs INSIDE the sandbox parser worker: `secure.ts` embeds `workbookGrid.toString()`
 * into the worker source, so it must stay self-contained (no imports, no module-level
 * values, no helpers, no TypeScript-only runtime constructs).
 */
export function workbookGrid(
  XLSX: typeof import('xlsx'),
  input: unknown,
  readType: 'buffer' | 'array',
  sheetName: string | null,
  toIsoDate: (serial: number, date1904: boolean) => string | null,
  // The server worker discards the shown date text, so only the browser check asks for it.
  wantDateText: boolean,
): WorkbookGrid {
  const workbook = XLSX.read(input, {
    type: readType,
    cellDates: false,
    cellFormula: true,
    cellHTML: false,
    cellStyles: false,
    cellNF: true,
    // Stubs keep a formula whose file saved no value, so the gap check below can see it.
    sheetStubs: true,
    bookVBA: true,
    WTF: false,
  })
  let links = false
  for (const name of workbook.SheetNames) {
    const sheet = workbook.Sheets[name]
    for (const key of Object.keys(sheet || {})) {
      if (key.startsWith('!')) continue
      const cell = sheet[key]
      if (cell?.l) links = true
    }
  }
  const first =
    sheetName === null
      ? workbook.SheetNames[0]
      : workbook.SheetNames.find((name) => name === sheetName)
  if (sheetName !== null && first === undefined) throw { code: 'WORKBOOK_SHEET_MISSING' }
  // A formula is never evaluated: its saved value is imported, and a formula without one refuses the file.
  // shortcut: a t="b" formula saved with no value reads as false; no major spreadsheet writer emits it, add a sheet XML pre-scan if one does.
  let formulaGap: string | undefined
  for (const key of Object.keys((first && workbook.Sheets[first]) || {})) {
    if (key.startsWith('!')) continue
    const cell = workbook.Sheets[first as string][key]
    if (
      cell &&
      typeof cell.f === 'string' &&
      (cell.t === 'z' || cell.t === 'e' || cell.v === undefined)
    ) {
      formulaGap = key
      break
    }
  }
  // Date-formatted numeric cells become ISO strings; out-of-range serials stay numeric.
  // The date format is dropped from every cell, text included, so sheet_to_json does not build Date objects.
  const date1904 = Boolean(workbook.Workbook?.WBProps?.date1904)
  const firstSheet = first ? workbook.Sheets[first] : null
  // Shown text of each converted cell, by its sheet row and column until the matrix rows are known.
  const shown: Array<[number, number, string]> = []
  for (const key of Object.keys(firstSheet || {})) {
    if (key.startsWith('!')) continue
    const cell = (firstSheet as import('xlsx').WorkSheet)[key]
    if (!cell?.z || !XLSX.SSF.is_date(cell.z)) continue
    // biome-ignore lint/performance/noDelete: the format must be absent, not undefined, as before.
    delete cell.z
    if (cell.t !== 'n') continue
    const iso = toIsoDate(cell.v, date1904)
    if (iso !== null) {
      cell.t = 's'
      cell.v = iso
      if (wantDateText && typeof cell.w === 'string') {
        const at = XLSX.utils.decode_cell(key)
        shown.push([at.r, at.c, cell.w])
      }
    }
  }
  const matrix: unknown[][] = firstSheet
    ? XLSX.utils.sheet_to_json(firstSheet, {
        header: 1,
        defval: null,
        blankrows: false,
        raw: true,
      })
    : []
  // sheet_to_json drops blank rows and starts at the range's first column, so re-key by matrix position.
  // A row is kept exactly when a cell in range holds a string, boolean or number value.
  const dateText: Record<string, string> = {}
  if (shown.length > 0 && firstSheet?.['!ref']) {
    const range = XLSX.utils.decode_range(firstSheet['!ref'])
    const kept: Record<number, boolean> = {}
    for (const key of Object.keys(firstSheet)) {
      if (key.startsWith('!')) continue
      const cell = firstSheet[key]
      if (!cell || cell.v == null || !'sbnd'.includes(cell.t)) continue
      const at = XLSX.utils.decode_cell(key)
      if (at.r >= range.s.r && at.r <= range.e.r && at.c >= range.s.c && at.c <= range.e.c) {
        kept[at.r] = true
      }
    }
    const sheetRows = Object.keys(kept)
      .map(Number)
      .sort((a, b) => a - b)
    if (sheetRows.length === matrix.length) {
      const rank: Record<number, number> = {}
      sheetRows.forEach((sheetRow, index) => {
        rank[sheetRow] = index
      })
      for (const [r, c, text] of shown) {
        if (rank[r] !== undefined) dateText[`${rank[r]}:${c - range.s.c}`] = text
      }
    }
  }
  return {
    matrix,
    sheetNames: workbook.SheetNames,
    formulaGap,
    links,
    macros: Boolean(workbook.vbaraw),
    dateText,
  }
}
