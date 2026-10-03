import { IMPORT_ENGINEERING_LIMITS } from './limits'

/**
 * Stored label for a source header: BOM and outer spaces removed, and a header over the
 * stored limit shortened to fit with a closing ellipsis. Columns stay keyed by position,
 * so shortening never changes which column a value belongs to.
 */
export function importHeaderLabel(raw: string): string {
  const header = raw.replace(/^﻿/, '').trim()
  const max = IMPORT_ENGINEERING_LIMITS.maxHeaderCharacters
  if (header.length <= max) return header
  let fitted = ''
  for (const point of header) {
    if (fitted.length + point.length >= max) break
    fitted += point
  }
  return `${fitted.trimEnd()}…`
}
