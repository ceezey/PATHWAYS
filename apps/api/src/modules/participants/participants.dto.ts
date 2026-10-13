export function normalizedCode(value: unknown) {
  if (typeof value !== 'string') return null
  const code = value.trim().toUpperCase()
  return /^[A-Z0-9][A-Z0-9_-]{1,39}$/.test(code) ? code : null
}

export function normalizedText(value: unknown, maximum = 2000) {
  if (value === null || value === undefined || value === '') return null
  if (typeof value !== 'string') return null
  const text = value.trim()
  return text.length >= 1 && text.length <= maximum ? text : null
}
