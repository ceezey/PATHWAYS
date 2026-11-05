/** Prefixes a quote so a spreadsheet never runs exported text as a formula (OWASP CSV injection). */
export const neutralizeCell = (value: string): string =>
  /^\s*[=+\-@\t\r]/.test(value) ? `'${value}` : value
