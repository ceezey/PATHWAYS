/** Sentence-cases a server enum such as PARTIALLY_PROCESSED into "Partially processed". */
export function enumLabel(value: string) {
  const text = value.replaceAll('_', ' ').trim().toLowerCase()
  return text.charAt(0).toUpperCase() + text.slice(1)
}
