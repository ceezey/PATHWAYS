export function normalizedText(value: unknown, maximum = 2000) {
  if (value === null || value === undefined || value === '') return null
  if (typeof value !== 'string') return null
  const text = value.trim()
  return text.length >= 1 && text.length <= maximum ? text : null
}
