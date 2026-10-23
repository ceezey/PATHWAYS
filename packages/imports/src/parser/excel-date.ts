/**
 * Excel serial date to ISO `YYYY-MM-DD`, for date-formatted numeric spreadsheet cells.
 *
 * It runs INSIDE the sandbox parser worker: `secure.ts` embeds
 * `excelSerialToIsoDate.toString()` into the worker source, so it must stay
 * self-contained (no imports, no module-level values).
 *
 * Returns null outside 1900-01-01 to 2100-12-31, so the cell stays numeric and fails
 * validation as before. The time fraction is dropped.
 */
export function excelSerialToIsoDate(serial: number, date1904: boolean): string | null {
  if (!Number.isFinite(serial) || serial < 0) return null
  const epoch = date1904 ? Date.UTC(1904, 0, 1) : Date.UTC(1899, 11, 30)
  const iso = new Date(epoch + Math.floor(serial) * 86_400_000).toISOString().slice(0, 10)
  return iso >= '1900-01-01' && iso <= '2100-12-31' ? iso : null
}
